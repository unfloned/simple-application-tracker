import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import type {
    JobCandidateInput,
    JobSearchInput,
    JobSource,
    SerializedJobCandidate,
    SerializedJobSearch,
} from '@shared/job-search';
import { ALL_JOB_SOURCES } from '@shared/job-search';
import { runScraper } from './scrapers';
import { scoreJobListing, ScoringProfile } from './scorer';

type AgentConfig = ScoringProfile;

const profileStore = new Store<AgentConfig>({
    name: 'agent-profile',
    defaults: {
        stackKeywords: 'TypeScript, Next.js, React, Node.js, React Native, Postgres',
        remotePreferred: true,
        minSalary: 60000,
        antiStack: 'Java-only, C#-only, PHP-only, Vue-only, Angular-only',
    },
});

export function getAgentProfile(): AgentConfig {
    return {
        stackKeywords: profileStore.get('stackKeywords'),
        remotePreferred: profileStore.get('remotePreferred'),
        minSalary: profileStore.get('minSalary'),
        antiStack: profileStore.get('antiStack'),
    };
}

export function setAgentProfile(profile: Partial<AgentConfig>): AgentConfig {
    for (const key of Object.keys(profile) as (keyof AgentConfig)[]) {
        const value = profile[key];
        if (value !== undefined) profileStore.set(key, value as never);
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
            lastRunAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS job_candidates (
            id TEXT PRIMARY KEY,
            searchId TEXT NOT NULL,
            sourceUrl TEXT NOT NULL,
            sourceKey TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            company TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            score INTEGER NOT NULL DEFAULT 0,
            scoreReason TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            discoveredAt TEXT NOT NULL,
            importedApplicationId TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_candidate_search ON job_candidates(searchId);
        CREATE INDEX IF NOT EXISTS idx_candidate_status ON job_candidates(status);
        CREATE INDEX IF NOT EXISTS idx_candidate_score ON job_candidates(score DESC);
    `);

    const columns = db
        .prepare('PRAGMA table_info(job_searches)')
        .all() as { name: string }[];
    const colNames = new Set(columns.map((c) => c.name));
    if (!colNames.has('sources')) {
        db.exec("ALTER TABLE job_searches ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");
    }
    if (colNames.has('source') && colNames.has('sources')) {
        const legacyRows = db
            .prepare("SELECT id, source FROM job_searches WHERE sources = '[]' OR sources IS NULL")
            .all() as Array<{ id: string; source: string }>;
        const update = db.prepare('UPDATE job_searches SET sources = ? WHERE id = ?');
        for (const row of legacyRows) {
            if (row.source) update.run(JSON.stringify([row.source]), row.id);
        }
    }
    return db;
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

export function listSearches(): SerializedJobSearch[] {
    const rows = getDb()
        .prepare('SELECT * FROM job_searches ORDER BY createdAt DESC')
        .all() as any[];
    return rows.map((r) => ({
        id: r.id,
        label: r.label,
        keywords: r.keywords,
        sources: parseSources(r.sources),
        locationFilter: r.locationFilter,
        remoteOnly: Boolean(r.remoteOnly),
        minSalary: r.minSalary,
        enabled: Boolean(r.enabled),
        lastRunAt: r.lastRunAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    }));
}

export function createSearch(input: JobSearchInput): SerializedJobSearch {
    const id = randomUUID();
    const now = nowIso();
    const sources = input.sources && input.sources.length > 0 ? input.sources : ['germantechjobs'];
    getDb()
        .prepare(`
            INSERT INTO job_searches
            (id, label, keywords, sources, locationFilter, remoteOnly, minSalary, enabled, createdAt, updatedAt)
            VALUES (@id, @label, @keywords, @sources, @locationFilter, @remoteOnly, @minSalary, @enabled, @createdAt, @updatedAt)
        `)
        .run({
            id,
            label: input.label || 'Unbenannte Suche',
            keywords: input.keywords || '',
            sources: JSON.stringify(sources),
            locationFilter: input.locationFilter || '',
            remoteOnly: input.remoteOnly ? 1 : 0,
            minSalary: input.minSalary ?? 0,
            enabled: input.enabled === false ? 0 : 1,
            createdAt: now,
            updatedAt: now,
        });
    return listSearches().find((s) => s.id === id)!;
}

export function updateSearch(id: string, input: JobSearchInput): SerializedJobSearch {
    const existing = listSearches().find((s) => s.id === id);
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
        updatedAt: nowIso(),
    };
    getDb()
        .prepare(`
            UPDATE job_searches SET
                label = @label, keywords = @keywords, sources = @sources,
                locationFilter = @locationFilter, remoteOnly = @remoteOnly,
                minSalary = @minSalary, enabled = @enabled, updatedAt = @updatedAt
            WHERE id = @id
        `)
        .run(merged);
    return listSearches().find((s) => s.id === id)!;
}

export function deleteSearch(id: string): void {
    getDb().prepare('DELETE FROM job_searches WHERE id = ?').run(id);
    getDb().prepare('DELETE FROM job_candidates WHERE searchId = ?').run(id);
}

export function listCandidates(minScore: number = 0): SerializedJobCandidate[] {
    const rows = getDb()
        .prepare(
            "SELECT * FROM job_candidates WHERE score >= ? AND status != 'ignored' ORDER BY score DESC, discoveredAt DESC LIMIT 500",
        )
        .all(minScore) as any[];
    return rows;
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
    if (sets.length > 0) {
        getDb()
            .prepare(`UPDATE job_candidates SET ${sets.join(', ')} WHERE id = @id`)
            .run(updates);
    }
    const row = getDb().prepare('SELECT * FROM job_candidates WHERE id = ?').get(id);
    return row as SerializedJobCandidate;
}

export async function runSearchNow(searchId: string): Promise<{ added: number; scored: number; errors: string[] }> {
    const search = listSearches().find((s) => s.id === searchId);
    if (!search) throw new Error(`Search ${searchId} not found`);

    const profile = getAgentProfile();
    let added = 0;
    let scored = 0;
    const errors: string[] = [];

    const insert = getDb().prepare(`
        INSERT OR IGNORE INTO job_candidates
        (id, searchId, sourceUrl, sourceKey, title, company, location, summary, score, scoreReason, status, discoveredAt)
        VALUES (@id, @searchId, @sourceUrl, @sourceKey, @title, @company, @location, @summary, @score, @scoreReason, 'new', @discoveredAt)
    `);

    const seenKeys = new Set<string>();

    for (const source of search.sources) {
        try {
            const listings = await runScraper(source, {
                keywords: search.keywords,
                locationFilter: search.locationFilter,
                remoteOnly: search.remoteOnly,
            });

            if (listings.length === 0) {
                errors.push(`${source}: 0 Ergebnisse`);
                continue;
            }

            for (const listing of listings) {
                if (seenKeys.has(listing.sourceKey)) continue;
                seenKeys.add(listing.sourceKey);

                const result = await scoreJobListing(
                    listing.title,
                    listing.company,
                    listing.location,
                    listing.summary,
                    profile,
                );
                scored += 1;

                const info = insert.run({
                    id: randomUUID(),
                    searchId,
                    sourceUrl: listing.sourceUrl,
                    sourceKey: listing.sourceKey,
                    title: listing.title,
                    company: listing.company,
                    location: listing.location,
                    summary: listing.summary,
                    score: result.score,
                    scoreReason: result.reason,
                    discoveredAt: nowIso(),
                });
                if (info.changes > 0) added += 1;
            }
        } catch (err) {
            errors.push(`${source}: ${(err as Error).message}`);
        }
    }

    getDb()
        .prepare('UPDATE job_searches SET lastRunAt = ? WHERE id = ?')
        .run(nowIso(), searchId);

    return { added, scored, errors };
}

export function startAgentScheduler(getWindow: () => BrowserWindow | null): void {
    const runOnce = async () => {
        const searches = listSearches().filter((s) => s.enabled);
        for (const search of searches) {
            try {
                const result = await runSearchNow(search.id);
                const win = getWindow();
                if (win && !win.isDestroyed() && result.added > 0) {
                    win.webContents.send('agents:newCandidates', {
                        searchId: search.id,
                        label: search.label,
                        added: result.added,
                    });
                }
            } catch (err) {
                console.error('[agents] Scheduler error:', (err as Error).message);
            }
        }
    };

    setTimeout(runOnce, 30000);
    setInterval(runOnce, 6 * 60 * 60 * 1000);
}
