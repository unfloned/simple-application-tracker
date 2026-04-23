import type { ScoringProfile } from './scorer';

/** job_searches row shape as returned from better-sqlite3. */
export interface JobSearchRow {
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

export interface JobCandidateRow {
    id: string;
    searchId: string;
    source: string;
    sourceUrl: string;
    sourceKey: string;
    title: string;
    company: string;
    location: string;
    summary: string;
    score: number;
    scoreReason: string;
    /** JSON-encoded string[] of positive signals. */
    keyFactsJson: string;
    /** JSON-encoded string[] of concerns. */
    concernsJson: string;
    /** JSON-encoded string[] of triggered hard disqualifiers. */
    redFlagsJson: string;
    status: string;
    favorite: number;
    importedApplicationId: string | null;
    discoveredAt: string;
    dedupKey: string;
}

export interface AgentRunRow {
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

export interface AgentConfig extends ScoringProfile {
    /** Candidates scoring ≥ this threshold are imported as applications automatically. 0 disables. */
    autoImportThreshold: number;
}

/** External callbacks passed into runSearchNow so runs can emit progress. */
export interface RunDeps {
    sendEvent: (channel: string, payload: unknown) => void;
}
