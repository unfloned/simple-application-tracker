import { contextBridge, ipcRenderer } from 'electron';
import type {
    ApplicationInput,
    ApplicationStatus,
    ExtractedJobData,
    FitAssessment,
    Priority,
    RemoteType,
} from '@shared/application';
import type {
    AgentRunRecord,
    JobSearchInput,
    SerializedJobCandidate,
    SerializedJobSearch,
    CandidateStatus,
} from '@shared/job-search';

export interface ApplicationRecord {
    id: string;
    companyName: string;
    companyWebsite: string;
    jobTitle: string;
    jobUrl: string;
    jobDescription: string;
    location: string;
    remote: RemoteType;
    salaryMin: number;
    salaryMax: number;
    salaryCurrency: string;
    stack: string;
    status: ApplicationStatus;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    notes: string;
    tags: string;
    priority: Priority;
    requiredProfile: string[];
    benefits: string[];
    interviews: string[];
    matchScore: number;
    matchReason: string;
    source: string;
    appliedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ApplicationEvent {
    id: string;
    applicationId: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    changedAt: string;
}

export interface SentEmailRecord {
    id: string;
    applicationId: string;
    toAddress: string;
    subject: string;
    body: string;
    sentAt: string;
    messageId: string | null;
    status: string;
}

export interface AgentProfile {
    stackKeywords: string;
    remotePreferred: boolean;
    minSalary: number;
    antiStack: string;
    autoImportThreshold: number;
}

export interface UserProfileDto {
    fullName: string;
    email: string;
    phone: string;
    signature: string;
    cvPath: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    smtpFromName: string;
    emailInstruction: string;
}

const api = {
    applications: {
        list: (): Promise<ApplicationRecord[]> => ipcRenderer.invoke('applications:list'),
        get: (id: string): Promise<ApplicationRecord | null> => ipcRenderer.invoke('applications:get', id),
        create: (input: ApplicationInput): Promise<ApplicationRecord> =>
            ipcRenderer.invoke('applications:create', input),
        update: (id: string, input: ApplicationInput): Promise<ApplicationRecord> =>
            ipcRenderer.invoke('applications:update', id, input),
        delete: (id: string): Promise<{ ok: true }> => ipcRenderer.invoke('applications:delete', id),
        events: {
            list: (): Promise<ApplicationEvent[]> => ipcRenderer.invoke('applications:events:list'),
            forApp: (id: string): Promise<ApplicationEvent[]> =>
                ipcRenderer.invoke('applications:events:forApp', id),
        },
    },
    llm: {
        extract: (url: string): Promise<ExtractedJobData> => ipcRenderer.invoke('llm:extract', url),
        assessFit: (input: ApplicationInput): Promise<FitAssessment> =>
            ipcRenderer.invoke('llm:assessFit', input),
        getConfig: (): Promise<{ ollamaUrl: string; ollamaModel: string }> =>
            ipcRenderer.invoke('llm:getConfig'),
        setConfig: (config: { ollamaUrl?: string; ollamaModel?: string }) =>
            ipcRenderer.invoke('llm:setConfig', config),
        status: (): Promise<{ running: boolean; models: string[]; error?: string }> =>
            ipcRenderer.invoke('llm:status'),
        start: (): Promise<{ started: boolean; method: string; message?: string }> =>
            ipcRenderer.invoke('llm:start'),
        pullModel: (modelName: string): Promise<{ ok: boolean; message?: string }> =>
            ipcRenderer.invoke('llm:pullModel', modelName),
        draftEmail: (applicationId: string): Promise<{ subject: string; body: string }> =>
            ipcRenderer.invoke('llm:draftEmail', applicationId),
    },
    agents: {
        listSearches: (): Promise<SerializedJobSearch[]> => ipcRenderer.invoke('agents:listSearches'),
        createSearch: (input: JobSearchInput): Promise<SerializedJobSearch> =>
            ipcRenderer.invoke('agents:createSearch', input),
        updateSearch: (id: string, input: JobSearchInput): Promise<SerializedJobSearch> =>
            ipcRenderer.invoke('agents:updateSearch', id, input),
        deleteSearch: (id: string): Promise<{ ok: true }> =>
            ipcRenderer.invoke('agents:deleteSearch', id),
        runSearch: (id: string): Promise<{ added: number; scanned: number; errors: string[]; canceled: boolean }> =>
            ipcRenderer.invoke('agents:runSearch', id),
        cancelRun: (id: string): Promise<{ canceled: boolean }> =>
            ipcRenderer.invoke('agents:cancelRun', id),
        isRunning: (id: string): Promise<boolean> => ipcRenderer.invoke('agents:isRunning', id),
        runningSearches: (): Promise<string[]> => ipcRenderer.invoke('agents:runningSearches'),
        listCandidates: (minScore?: number): Promise<SerializedJobCandidate[]> =>
            ipcRenderer.invoke('agents:listCandidates', minScore),
        updateCandidate: (
            id: string,
            input: { status?: CandidateStatus; importedApplicationId?: string | null; favorite?: boolean },
        ): Promise<SerializedJobCandidate> => ipcRenderer.invoke('agents:updateCandidate', id, input),
        bulkUpdateCandidates: (
            ids: string[],
            input: { status?: CandidateStatus; favorite?: boolean },
        ): Promise<number> => ipcRenderer.invoke('agents:bulkUpdateCandidates', ids, input),
        importCandidate: (id: string): Promise<ApplicationRecord> =>
            ipcRenderer.invoke('agents:importCandidate', id),
        listRuns: (limit?: number): Promise<AgentRunRecord[]> =>
            ipcRenderer.invoke('agents:listRuns', limit),
        getProfile: (): Promise<AgentProfile> => ipcRenderer.invoke('agents:getProfile'),
        setProfile: (profile: Partial<AgentProfile>): Promise<AgentProfile> =>
            ipcRenderer.invoke('agents:setProfile', profile),
    },
    export: {
        excel: (
            labels: unknown,
            dialogTitle: string,
        ): Promise<{ canceled: boolean; filePath?: string; count?: number }> =>
            ipcRenderer.invoke('export:excel', labels, dialogTitle),
    },
    updater: {
        checkNow: (): Promise<{
            dev?: boolean;
            currentVersion: string;
            updateAvailable?: boolean;
            remoteVersion?: string;
        }> => ipcRenderer.invoke('updater:checkNow'),
        installNow: () => ipcRenderer.invoke('updater:installNow'),
        currentVersion: (): Promise<{ version: string }> => ipcRenderer.invoke('updater:currentVersion'),
    },
    profile: {
        get: (): Promise<UserProfileDto> => ipcRenderer.invoke('profile:get'),
        set: (patch: Partial<UserProfileDto>): Promise<UserProfileDto> =>
            ipcRenderer.invoke('profile:set', patch),
        pickCv: (): Promise<{ canceled: boolean; path?: string }> =>
            ipcRenderer.invoke('profile:pickCv'),
        encryptionAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('profile:encryptionAvailable'),
    },
    email: {
        verify: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('email:verify'),
        send: (req: {
            to: string;
            subject: string;
            body: string;
            attachCv?: boolean;
            applicationId?: string;
        }): Promise<{ ok: boolean; messageId?: string; error?: string }> =>
            ipcRenderer.invoke('email:send', req),
        listForApp: (applicationId: string): Promise<SentEmailRecord[]> =>
            ipcRenderer.invoke('email:listForApp', applicationId),
    },
    backup: {
        create: (): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; size?: number; error?: string }> =>
            ipcRenderer.invoke('backup:create'),
        restore: (): Promise<{ ok: boolean; canceled?: boolean; restoredFiles?: number; error?: string }> =>
            ipcRenderer.invoke('backup:restore'),
    },
    chat: {
        send: (req: {
            messages: Array<{
                role: 'system' | 'user' | 'assistant' | 'tool';
                content: string;
                name?: string;
            }>;
        }): Promise<{
            messages: Array<{ role: string; content: string; name?: string }>;
            reply: string;
            toolsUsed: string[];
            error?: string;
        }> => ipcRenderer.invoke('chat:send', req),
    },
    shell: {
        openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    },
    on: (channel: string, handler: (...args: any[]) => void) => {
        const wrapped = (_evt: unknown, ...args: any[]) => handler(...args);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
