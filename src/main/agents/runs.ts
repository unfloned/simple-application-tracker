import { randomUUID } from 'node:crypto';
import type { AgentRunRecord } from '@shared/job-search';
import { createApplication } from '../db';
import { unloadModel } from '../llm';
import { getDb } from './db';
import { getAgentProfile } from './profile';
import { getSearch, touchSearchLastRun } from './searches';
import { scoreJobListing } from './scorer';
import { runScraper } from './scrapers';
import type { AgentRunRow, RunDeps } from './types';
import { makeDedupKey, nowIso, parseSources } from './utils';

/** Currently running searches, keyed by search id. Shared state for cancel + scheduler. */
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

/**
 * Run every source of one search, scoring each listing through the LLM and
 * writing new candidates. Emits progress events via deps.sendEvent so the
 * renderer can show live counters + phase labels. Aborts cleanly when the
 * user cancels via cancelSearchRun.
 */
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
        (id, searchId, sourceUrl, sourceKey, dedupKey, title, company, location, summary, score, scoreReason, keyFactsJson, concernsJson, redFlagsJson, status, discoveredAt)
        VALUES (@id, @searchId, @sourceUrl, @sourceKey, @dedupKey, @title, @company, @location, @summary, @score, @scoreReason, @keyFactsJson, @concernsJson, @redFlagsJson, 'new', @discoveredAt)
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
                    keyFactsJson: JSON.stringify(result.keyFacts ?? []),
                    concernsJson: JSON.stringify(result.concerns ?? []),
                    redFlagsJson: JSON.stringify(result.redFlags ?? []),
                    discoveredAt: nowIso(),
                });
                if (info.changes > 0) {
                    added += 1;
                    deps.sendEvent('agents:candidateAdded', { searchId });

                    if (
                        profile.autoImportThreshold > 0 &&
                        result.score >= profile.autoImportThreshold
                    ) {
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

    touchSearchLastRun(searchId, finishedAt);

    // Free the LLM so CPU/VRAM comes down once the run is done.
    unloadModel().catch(() => {});

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
