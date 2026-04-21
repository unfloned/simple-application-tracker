export type JobSource =
    | 'germantechjobs'
    | 'remotive'
    | 'arbeitnow'
    | 'remoteok'
    | 'weworkremotely'
    | 'hackernews'
    | 'indeed'
    | 'url';

export const ALL_JOB_SOURCES: JobSource[] = [
    'germantechjobs',
    'remotive',
    'arbeitnow',
    'remoteok',
    'weworkremotely',
    'hackernews',
    'indeed',
    'url',
];

export const JOB_SOURCE_LABEL: Record<JobSource, string> = {
    germantechjobs: 'GermanTechJobs (DE)',
    remotive: 'Remotive (EN, Remote)',
    arbeitnow: 'Arbeitnow (DE/EN, Remote)',
    remoteok: 'RemoteOK (EN, Remote)',
    weworkremotely: 'We Work Remotely (EN)',
    hackernews: 'HackerNews Who is Hiring (EN)',
    indeed: 'Indeed DE (experimental)',
    url: 'Single URL',
};

export const JOB_SOURCE_DESCRIPTION: Record<JobSource, string> = {
    germantechjobs: 'Tech jobs in Germany with salary info, via RSS',
    remotive: 'Remote jobs worldwide, public API',
    arbeitnow: 'Remote/hybrid jobs in Germany, public API',
    remoteok: 'Remote jobs worldwide, public API',
    weworkremotely: 'Remote programming jobs, RSS feed',
    hackernews: 'Latest Who is Hiring thread on Hacker News',
    indeed: 'Indeed RSS feed - rate-limited, may return 0 results',
    url: 'Scrape a single job posting URL',
};

export type ScheduleInterval = 'manual' | 'hourly' | '3h' | '6h' | '12h' | 'daily';

export const INTERVAL_LABEL: Record<ScheduleInterval, string> = {
    manual: 'Manual only',
    hourly: 'Every hour',
    '3h': 'Every 3 hours',
    '6h': 'Every 6 hours',
    '12h': 'Every 12 hours',
    daily: 'Daily',
};

export const INTERVAL_MS: Record<ScheduleInterval, number> = {
    manual: 0,
    hourly: 60 * 60 * 1000,
    '3h': 3 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
};

export interface JobSearchInput {
    label?: string;
    keywords?: string;
    sources?: JobSource[];
    locationFilter?: string;
    remoteOnly?: boolean;
    minSalary?: number;
    enabled?: boolean;
    interval?: ScheduleInterval;
}

export type CandidateStatus = 'new' | 'interested' | 'ignored' | 'imported';

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
    new: 'New',
    interested: 'Interested',
    ignored: 'Dismissed',
    imported: 'Imported',
};

export interface JobCandidateInput {
    status?: CandidateStatus;
    importedApplicationId?: string | null;
    favorite?: boolean;
}

export interface SerializedJobSearch {
    id: string;
    label: string;
    keywords: string;
    sources: JobSource[];
    locationFilter: string;
    remoteOnly: boolean;
    minSalary: number;
    enabled: boolean;
    interval: ScheduleInterval;
    lastRunAt: string | null;
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SerializedJobCandidate {
    id: string;
    searchId: string;
    sourceUrl: string;
    sourceKey: string;
    dedupKey: string;
    title: string;
    company: string;
    location: string;
    summary: string;
    score: number;
    scoreReason: string;
    status: CandidateStatus;
    favorite: boolean;
    discoveredAt: string;
    importedApplicationId: string | null;
}

export interface AgentRunRecord {
    id: string;
    searchId: string;
    searchLabel: string;
    startedAt: string;
    finishedAt: string | null;
    sources: JobSource[];
    scanned: number;
    added: number;
    error: string | null;
    canceled: boolean;
}

export interface AgentRunProgress {
    searchId: string;
    source: JobSource;
    current: number;
    total: number;
    phase: 'fetching' | 'scoring' | 'done';
}

export interface AgentRunFinished {
    searchId: string;
    runId: string;
    scanned: number;
    added: number;
    errors: string[];
    canceled: boolean;
}
