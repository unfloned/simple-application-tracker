export type JobSource =
    | 'germantechjobs'
    | 'remotive'
    | 'arbeitnow'
    | 'remoteok'
    | 'weworkremotely'
    | 'url';

export const ALL_JOB_SOURCES: JobSource[] = [
    'germantechjobs',
    'remotive',
    'arbeitnow',
    'remoteok',
    'weworkremotely',
    'url',
];

export const JOB_SOURCE_LABEL: Record<JobSource, string> = {
    germantechjobs: 'GermanTechJobs (DE)',
    remotive: 'Remotive (EN, Remote)',
    arbeitnow: 'Arbeitnow (DE/EN, Remote)',
    remoteok: 'RemoteOK (EN, Remote)',
    weworkremotely: 'We Work Remotely (EN)',
    url: 'Single URL',
};

export const JOB_SOURCE_DESCRIPTION: Record<JobSource, string> = {
    germantechjobs: 'Tech jobs in Germany with salary info, via RSS',
    remotive: 'Remote jobs worldwide, public API',
    arbeitnow: 'Remote/hybrid jobs in Germany, public API',
    remoteok: 'Remote jobs worldwide, public API',
    weworkremotely: 'Remote programming jobs, RSS feed',
    url: 'Scrape a single job posting URL',
};

export interface JobSearch {
    id: string;
    label: string;
    keywords: string;
    sources: JobSource[];
    locationFilter: string;
    remoteOnly: boolean;
    minSalary: number;
    enabled: boolean;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface JobSearchInput {
    label?: string;
    keywords?: string;
    sources?: JobSource[];
    locationFilter?: string;
    remoteOnly?: boolean;
    minSalary?: number;
    enabled?: boolean;
}

export type CandidateStatus = 'new' | 'interested' | 'ignored' | 'imported';

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
    new: 'Neu',
    interested: 'Interessant',
    ignored: 'Verworfen',
    imported: 'Übernommen',
};

export interface JobCandidate {
    id: string;
    searchId: string;
    sourceUrl: string;
    sourceKey: string;
    title: string;
    company: string;
    location: string;
    summary: string;
    score: number;
    scoreReason: string;
    status: CandidateStatus;
    discoveredAt: Date;
    importedApplicationId: string | null;
}

export interface JobCandidateInput {
    status?: CandidateStatus;
    importedApplicationId?: string | null;
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
    lastRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SerializedJobCandidate extends Omit<JobCandidate, 'discoveredAt'> {
    discoveredAt: string;
}
