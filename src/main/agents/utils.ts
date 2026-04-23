import type {
    JobSource,
    ScheduleInterval,
    SerializedJobCandidate,
    SerializedJobSearch,
} from '@shared/job-search';
import { ALL_JOB_SOURCES, INTERVAL_MS } from '@shared/job-search';
import type { JobCandidateRow, JobSearchRow } from './types';

export function nowIso(): string {
    return new Date().toISOString();
}

/** Parse the stored sources JSON string, fall back to a safe default. */
export function parseSources(raw: unknown): JobSource[] {
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

/** Lower-cased "company|title" key for candidate de-duplication. */
export function makeDedupKey(company: string, title: string): string {
    const combined = `${company || ''}|${title || ''}`.toLowerCase().trim();
    return combined.replace(/\s+/g, ' ');
}

/** Compute the next scheduled run timestamp; null for manual searches. */
export function computeNextRun(
    lastRunAt: string | null,
    interval: ScheduleInterval,
): string | null {
    if (interval === 'manual') return null;
    const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
    return new Date(base + INTERVAL_MS[interval]).toISOString();
}

export function toSerializedSearch(row: JobSearchRow): SerializedJobSearch {
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

function parseStringArray(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
        return [];
    }
}

export function toSerializedCandidate(row: JobCandidateRow): SerializedJobCandidate {
    const { keyFactsJson, concernsJson, redFlagsJson, ...rest } = row;
    return {
        ...rest,
        favorite: Boolean(row.favorite),
        keyFacts: parseStringArray(keyFactsJson),
        concerns: parseStringArray(concernsJson),
        redFlags: parseStringArray(redFlagsJson),
    } as SerializedJobCandidate;
}
