import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import type {
    AgentRunRecord,
    JobCandidateInput,
    JobSearchInput,
    JobSource,
    ScheduleInterval,
    SerializedJobCandidate,
    SerializedJobSearch,
} from '@shared/job-search';
import { ALL_JOB_SOURCES, INTERVAL_MS } from '@shared/job-search';
import { runScraper } from './scrapers';
import { scoreJobListing, ScoringProfile } from './scorer';
import { createApplication } from '../db';
import { unloadModel } from '../llm';
import { CANDIDATE_SEARCH_LIMIT } from '../constants';

interface JobSearchRow {
    id: string;
    label: string;
    keywords: string;
    sources: string;
    locationFilter: string;
    remoteOnly: number;
    minSalary: number;
    enabled: number;
    interval: string;
    lastRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface JobCandidateRow {
    id: string;
    searchId: string;
    source: string;
    sourceUrl: string;
    title: string;
    company: string;
    location: string;
    summary: string;
    score: number;
    scoreReason: string;
    status: string;
    favorite: number;
    importedApplicationId: string | null;
    discoveredAt: string;
    dedupKey: string;
}

interface AgentRunRow {
    id: string;
    searchId: string;
    searchLabel: string;
    startedAt: string;
    finishedAt: string | null;
    sources: string;
    scanned: number;
    added: number;
    error: string | null;
    canceled: number;
}

interface AgentConfig extends ScoringProfile {
    autoImportThreshold: number;
}

const profileStore = new Store<AgentConfig>({
    name: 'agent-profile',
    defaults: {
        stackKeywords: 'TypeScript, Next.js, React, Node.js, React Native, Postgres',
        remotePreferred: true,
        minSalary: 60000,
        antiStack: 'Java-only, C#-only, PHP-only, Vue-only, Angular-only',
        autoImportThreshold: 0,
    },
});

export function getAgentProfile(): AgentConfig {
    return {
        stackKeywords: profileStore.get('stackKeywords'),
        remotePreferred: profileStore.get('remotePreferred'),
        minSalary: profileStore.get('minSalary'),
        antiStack: profileStore.get('antiStack'),
        autoImportThreshold: profileStore.get('autoImportThreshold') ?? 0,
    };
}

export function setAgentProfile(profile: Partial<AgentConfig>): AgentConfig {
    for (const [key, value] of Object.entries(profile)) {
        if (value === undefined) continue;
        const k = key as keyof AgentConfig;
        profileStore.set(k, value as AgentConfig[typeof k]);
    }
    return getAgentProfile();
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
    if (db) return db;
    const userDataPath = app.getPath('userData');
    const dbPath = join(userDataPath, 'agents.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS job_searches (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            keywords TEXT NOT NULL DEFAULT '',
            sources TEXT NOT NULL DEFAULT '[]',
            locationFilter TEXT NOT NULL DEFAULT '',
            remoteOnly INTEGER NOT NULL DEFAULT 0,
            minSalary INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            interval TEXT NOT NULL DEFAULT '6h',
            lastRunAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS job_candidates (
            id TEXT PRIMARY KEY,
            searchId TEXT NOT NULL,
            sourceUrl TEXT NOT NULL,
            sourceKey TEXT NOT NULL UNIQUE,
            dedupKey TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            company TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            score INTEGER NOT NULL DEFAULT 0,
            scoreReason TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            favorite INTEGER NOT NULL DEFAULT 0,
            discoveredAt TEXT NOT NULL,
            importedApplicationId TEXT
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            searchId TEXT NOT NULL,
            searchLabel TEXT NOT NULL,
            startedAt TEXT NOT NULL,
            finishedAt TEXT,
            sources TEXT NOT NULL DEFAULT '[]',
            scanned INTEGER NOT NULL DEFAULT 0,
            added INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            canceled INTEGER NOT NULL DEFAULT 0
        );
    `);

    const searchCols = db.prepare('PRAGMA table_info(job_searches)').all() as { name: string }[];
    const searchColSet = new Set(searchCols.map((c) => c.name));
    if (!searchColSet.has('sources')) {
        db.exec("ALTER TABLE job_searches ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");
    }
    if (!searchColSet.has('interval')) {
        db.exec("ALTER TABLE job_searches ADD COLUMN interval TEXT NOT NULL DEFAULT '6h'");
    }
    if (searchColSet.has('source') && searchColSet.has('sources')) {
        const legacyRows = db
            .prepare("SELECT id, source FROM job_searches WHERE sources = '[]' OR sources IS NULL")
            .all() as Array<{ id: string; source: string }>;
        const update = db.prepare('UPDATE job_searches SET sources = ? WHERE id = ?');
        for (const row of legacyRows) {
            if (row.source) update.run(JSON.stringify([row.source]), row.id);
        }
    }

    const candCols = db.prepare('PRAGMA table_info(job_candidates)').all() as { name: string }[];
    const candColSet = new Set(candCols.map((c) => c.name));
    if (!candColSet.has('dedupKey')) {
        db.exec("ALTER TABLE job_candidates ADD COLUMN dedupKey TEXT NOT NULL DEFAULT ''");
        db.exec(
            "UPDATE job_candidates SET dedupKey = lower(company || '|' || title) WHERE dedupKey = ''",
        );
    }
    if (!candColSet.has('favorite')) {
        db.exec('ALTER TABLE job_candidates ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
    }

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_candidate_search ON job_candidates(searchId);
        CREATE INDEX IF NOT EXISTS idx_candidate_status ON job_candidates(status);
        CREATE INDEX IF NOT EXISTS idx_candidate_score ON job_candidates(score DESC);
        CREATE INDEX IF NOT EXISTS idx_candidate_dedup ON job_candidates(dedupKey);
        CREATE INDEX IF NOT EXISTS idx_runs_started ON agent_runs(startedAt DESC);
    `);

    return db;
}

export function initAgentsDatabase(): void {
    getDb();
}

function nowIso(): string {
    return new Date().toISOString();
}

function parseSources(raw: unknown): JobSource[] {
    if (typeof raw !== 'string' || !raw) return ['germantechjobs'];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const valid = parsed.filter((s): s is JobSource =>
                ALL_JOB_SOURCES.includes(s as JobSource),
            );
            return valid.length > 0 ? valid : ['germantechjobs'];
        }
    } catch {
        if (ALL_JOB_SOURCES.includes(raw as JobSource)) return [raw as JobSource];
    }
    return ['germantechjobs'];
}

function makeDedupKey(company: string, title: string): string {
    const combined = `${company || ''}|${title || ''}`.toLowerCase().trim();
    return combined.replace(/\s+/g, ' ');
}

function computeNextRun(lastRunAt: string | null, interval: ScheduleInterval): string | null {
    if (interval === 'manual') return null;
    const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
    return new Date(base + INTERVAL_MS[interval]).toISOString();
}

function toSerializedSearch(row: JobSearchRow): SerializedJobSearch {
    const interval = (row.interval as ScheduleInterval) ?? '6h';
    return {
        id: row.id,
        label: row.label,
        keywords: row.keywords,
        sources: parseSources(row.sources),
        locationFilter: row.locationFilter,
        remoteOnly: Boolean(row.remoteOnly),
        minSalary: row.minSalary,
        enabled: Boolean(row.enabled),
        interval,
        lastRunAt: row.lastRunAt,
        nextRunAt: computeNextRun(row.lastRunAt, interval),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export function listSearches(): SerializedJobSearch[] {
    const rows = getDb()
        .prepare('SELECT * FROM job_searches ORDER BY createdAt DESC')
        .all() as JobSearchRow[];
    return rows.map(toSerializedSearch);
}

function getSearchRow(id: string): JobSearchRow | null {
    const row = getDb()
        .prepare('SELECT * FROM job_searches WHERE id = ?')
        .get(id) as JobSearchRow | undefined;
    return row ?? null;
}

export function getSearch(id: string): SerializedJobSearch | null {
    const row = getSearchRow(id);
    return row ? toSerializedSearch(row) : null;
}

export function createSearch(input: JobSearchInput): SerializedJobSearch {
    const id = randomUUID();
    const now = nowIso();
    const sources = input.sources && input.sources.length > 0 ? input.sources : ['germantechjobs'];
    getDb()
        .prepare(
            `INSERT INTO job_searches
            (id, label, keywords, sources, locationFilter, remoteOnly, minSalary, enabled, interval, createdAt, updatedAt)
            VALUES (@id, @label, @keywords, @sources, @locationFilter, @remoteOnly, @minSalary, @enabled, @interval, @createdAt, @updatedAt)`,
        )
        .run({
            id,
            label: input.label || 'Unnamed search',
            keywords: input.keywords || '',
            sources: JSON.stringify(sources),
            locationFilter: input.locationFilter || '',
            remoteOnly: input.remoteOnly ? 1 : 0,
            minSalary: input.minSalary ?? 0,
            enabled: input.enabled === false ? 0 : 1,
            interval: input.interval ?? '6h',
            createdAt: now,
            updatedAt: now,
        });
    return getSearch(id)!;
}

export function updateSearch(id: string, input: JobSearchInput): SerializedJobSearch {
    const existing = getSearch(id);
    if (!existing) throw new Error(`Search ${id} not found`);
    const sources =
        input.sources !== undefined && input.sources.length > 0
            ? input.sources
            : existing.sources;
    const merged: Record<string, unknown> = {
        id,
        label: input.label ?? existing.label,
        keywords: input.keywords ?? existing.keywords,
        sources: JSON.stringify(sources),
        locationFilter: input.locationFilter ?? existing.locationFilter,
        remoteOnly: (input.remoteOnly ?? existing.remoteOnly) ? 1 : 0,
        minSalary: input.minSalary ?? existing.minSalary,
        enabled: (input.enabled ?? existing.enabled) ? 1 : 0,
        interval: input.interval ?? existing.interval,
        updatedAt: nowIso(),
    };
    getDb()
        .prepare(
            `UPDATE job_searches SET
                label = @label, keywords = @keywords, sources = @sources,
                locationFilter = @locationFilter, remoteOnly = @remoteOnly,
                minSalary = @minSalary, enabled = @enabled, interval = @interval,
                updatedAt = @updatedAt
            WHERE id = @id`,
        )
        .run(merged);
    return getSearch(id)!;
}

export function deleteSearch(id: string): void {
    getDb().prepare('DELETE FROM job_searches WHERE id = ?').run(id);
    getDb().prepare('DELETE FROM job_candidates WHERE searchId = ?').run(id);
}

function toSerializedCandidate(row: JobCandidateRow): SerializedJobCandidate {
    return {
        ...row,
        favorite: Boolean(row.favorite),
    } as SerializedJobCandidate;
}

export function listCandidates(minScore: number = 0): SerializedJobCandidate[] {
    const rows = getDb()
        .prepare(
            "SELECT * FROM job_candidates WHERE score >= ? AND status != 'ignored' ORDER BY favorite DESC, score DESC, discoveredAt DESC LIMIT ?",
        )
        .all(minScore, CANDIDATE_SEARCH_LIMIT) as JobCandidateRow[];
    return rows.map(toSerializedCandidate);
}

export function updateCandidate(id: string, input: JobCandidateInput): SerializedJobCandidate {
    const updates: Record<string, unknown> = { id };
    const sets: string[] = [];
    if (input.status !== undefined) {
        sets.push('status = @status');
        updates.status = input.status;
    }
    if (input.importedApplicationId !== undefined) {
        sets.push('importedApplicationId = @importedApplicationId');
        updates.importedApplicationId = input.importedApplicationId;
    }
    if (input.favorite !== undefined) {
        sets.push('favorite = @favorite');
        updates.favorite = input.favorite ? 1 : 0;
    }
    if (sets.length > 0) {
        getDb()
            .prepare(`UPDATE job_candidates SET ${sets.join(', ')} WHERE id = @id`)
            .run(updates);
    }
    const row = getDb()
        .prepare('SELECT * FROM job_candidates WHERE id = ?')
        .get(id) as JobCandidateRow;
    return toSerializedCandidate(row);
}

export function bulkUpdateCandidates(ids: string[], input: JobCandidateInput): number {
    if (ids.length === 0) return 0;
    const sets: string[] = [];
    const params: Record<string, unknown> = {};
    if (input.status !== undefined) {
        sets.push('status = @status');
        params.status = input.status;
    }
    if (input.favorite !== undefined) {
        sets.push('favorite = @favorite');
        params.favorite = input.favorite ? 1 : 0;
    }
    if (sets.length === 0) return 0;
    const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
    ids.forEach((id, i) => (params[`id${i}`] = id));
    const result = getDb()
        .prepare(`UPDATE job_candidates SET ${sets.join(', ')} WHERE id IN (${placeholders})`)
        .run(params);
    return result.changes;
}

export function listAgentRuns(limit: number = 30): AgentRunRecord[] {
    const rows = getDb()
        .prepare('SELECT * FROM agent_runs ORDER BY startedAt DESC LIMIT ?')
        .all(limit) as AgentRunRow[];
    return rows.map((r) => ({
        id: r.id,
        searchId: r.searchId,
        searchLabel: r.searchLabel,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        sources: parseSources(r.sources),
        scanned: r.scanned,
        added: r.added,
        error: r.error,
        canceled: Boolean(r.canceled),
    }));
}

const activeRuns = new Map<string, AbortController>();

export function isSearchRunning(searchId: string): boolean {
    return activeRuns.has(searchId);
}

export function listRunningSearches(): string[] {
    return Array.from(activeRuns.keys());
}

export function cancelSearchRun(searchId: string): boolean {
    const controller = activeRuns.get(searchId);
    if (!controller) return false;
    controller.abort();
    return true;
}

interface RunDeps {
    sendEvent: (channel: string, payload: unknown) => void;
}

export async function runSearchNow(
    searchId: string,
    deps: RunDeps,
): Promise<{ added: number; scanned: number; errors: string[]; canceled: boolean }> {
    if (activeRuns.has(searchId)) {
        return { added: 0, scanned: 0, errors: ['Already running'], canceled: false };
    }

    const search = getSearch(searchId);
    if (!search) throw new Error(`Search ${searchId} not found`);

    const controller = new AbortController();
    activeRuns.set(searchId, controller);

    const profile = getAgentProfile();
    const runId = randomUUID();
    const startedAt = nowIso();
    let added = 0;
    let scanned = 0;
    const errors: string[] = [];
    let canceled = false;

    getDb()
        .prepare(
            'INSERT INTO agent_runs (id, searchId, searchLabel, startedAt, sources, scanned, added, canceled) VALUES (?, ?, ?, ?, ?, 0, 0, 0)',
        )
        .run(runId, searchId, search.label, startedAt, JSON.stringify(search.sources));

    deps.sendEvent('agents:runStarted', { searchId, runId, sources: search.sources });

    const insert = getDb().prepare(`
        INSERT OR IGNORE INTO job_candidates
        (id, searchId, sourceUrl, sourceKey, dedupKey, title, company, location, summary, score, scoreReason, status, discoveredAt)
        VALUES (@id, @searchId, @sourceUrl, @sourceKey, @dedupKey, @title, @company, @location, @summary, @score, @scoreReason, 'new', @discoveredAt)
    `);
    const dedupCheck = getDb().prepare(
        'SELECT id FROM job_candidates WHERE dedupKey = ? AND status != \'ignored\' LIMIT 1',
    );

    try {
        for (const source of search.sources) {
            if (controller.signal.aborted) {
                canceled = true;
                break;
            }

            deps.sendEvent('agents:runProgress', {
                searchId,
                source,
                current: 0,
                total: 0,
                phase: 'fetching',
            });

            let listings;
            try {
                listings = await runScraper(source, {
                    keywords: search.keywords,
                    locationFilter: search.locationFilter,
                    remoteOnly: search.remoteOnly,
                });
            } catch (err) {
                errors.push(`${source}: ${(err as Error).message}`);
                continue;
            }

            if (listings.length === 0) {
                errors.push(`${source}: 0 results`);
                continue;
            }

            deps.sendEvent('agents:runProgress', {
                searchId,
                source,
                current: 0,
                total: listings.length,
                phase: 'scoring',
            });

            for (let i = 0; i < listings.length; i++) {
                if (controller.signal.aborted) {
                    canceled = true;
                    break;
                }

                const listing = listings[i];
                const dedupKey = makeDedupKey(listing.company, listing.title);
                if (dedupKey && dedupCheck.get(dedupKey)) {
                    scanned += 1;
                    deps.sendEvent('agents:runProgress', {
                        searchId,
                        source,
                        current: i + 1,
                        total: listings.length,
                        phase: 'scoring',
                    });
                    continue;
                }

                const result = await scoreJobListing(
                    listing.title,
                    listing.company,
                    listing.location,
                    listing.summary,
                    profile,
                );
                scanned += 1;

                const info = insert.run({
                    id: randomUUID(),
                    searchId,
                    sourceUrl: listing.sourceUrl,
                    sourceKey: listing.sourceKey,
                    dedupKey,
                    title: listing.title,
                    company: listing.company,
                    location: listing.location,
                    summary: listing.summary,
                    score: result.score,
                    scoreReason: result.reason,
                    discoveredAt: nowIso(),
                });
                if (info.changes > 0) {
                    added += 1;
                    deps.sendEvent('agents:candidateAdded', { searchId });

                    if (profile.autoImportThreshold > 0 && result.score >= profile.autoImportThreshold) {
                        try {
                            const imported = createApplication({
                                companyName: listing.company,
                                jobTitle: listing.title,
                                jobUrl: listing.sourceUrl,
                                jobDescription: listing.summary,
                                location: listing.location,
                                source: source,
                                matchScore: result.score,
                                matchReason: result.reason,
                                notes: `Auto-imported by agent (score ${result.score}): ${result.reason}`,
                            });
                            getDb()
                                .prepare(
                                    "UPDATE job_candidates SET status = 'imported', importedApplicationId = ? WHERE sourceKey = ?",
                                )
                                .run(imported.id, listing.sourceKey);
                            deps.sendEvent('agents:autoImported', {
                                candidate: listing.title,
                                score: result.score,
                            });
                        } catch (err) {
                            errors.push(`autoImport: ${(err as Error).message}`);
                        }
                    }
                }

                deps.sendEvent('agents:runProgress', {
                    searchId,
                    source,
                    current: i + 1,
                    total: listings.length,
                    phase: 'scoring',
                });
            }
        }
    } finally {
        activeRuns.delete(searchId);
    }

    const finishedAt = nowIso();
    getDb()
        .prepare(
            'UPDATE agent_runs SET finishedAt = ?, scanned = ?, added = ?, error = ?, canceled = ? WHERE id = ?',
        )
        .run(
            finishedAt,
            scanned,
            added,
            errors.length > 0 ? errors.join('; ') : null,
            canceled ? 1 : 0,
            runId,
        );

    getDb().prepare('UPDATE job_searches SET lastRunAt = ? WHERE id = ?').run(finishedAt, searchId);

    // Free the LLM so CPU/VRAM comes down once the run is done.
    unloadModel().catch(() => { });

    deps.sendEvent('agents:runFinished', {
        searchId,
        runId,
        scanned,
        added,
        errors,
        canceled,
    });

    return { added, scanned, errors, canceled };
}

export function startAgentScheduler(getWindow: () => BrowserWindow | null): void {
    const send = (channel: string, payload: unknown) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

    const runDue = async () => {
        const now = Date.now();
        const searches = listSearches().filter((s) => s.enabled && s.interval !== 'manual');
        for (const search of searches) {
            if (activeRuns.has(search.id)) continue;
            const nextDue = search.lastRunAt
                ? new Date(search.lastRunAt).getTime() + INTERVAL_MS[search.interval]
                : 0;
            if (nextDue > now) continue;
            try {
                await runSearchNow(search.id, { sendEvent: send });
            } catch (err) {
                console.error('[agents] Scheduled run error:', (err as Error).message);
            }
        }
    };

    setTimeout(runDue, 15000);
    setInterval(runDue, 60 * 1000);
}
