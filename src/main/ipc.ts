import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import {
    createApplication,
    deleteApplication,
    getApplication,
    listApplications,
    listApplicationEvents,
    listEmailsForApplication,
    listEventsForApplication,
    updateApplication,
    type ApplicationEventRow,
} from './db';
import { exportToExcel, type ExportLabels } from './export';
import {
    getUserProfile,
    isSmtpEncryptionAvailable,
    setUserProfile,
    type UserProfile,
} from './profile';
import { sendEmail, verifySmtp, type EmailSendRequest } from './email';
import { createBackup, restoreBackup } from './backup';
import { runChat, type ChatRequest } from './chat';
import {
    assessFit,
    checkLlmStatus,
    draftEmail,
    extractJobData,
    getLlmConfig,
    pullModel,
    setLlmConfig,
    startOllama,
} from './llm';
import {
    bulkUpdateCandidates,
    cancelSearchRun,
    createSearch,
    deleteSearch,
    getAgentProfile,
    isSearchRunning,
    listAgentRuns,
    listCandidates,
    listRunningSearches,
    listSearches,
    runSearchNow,
    setAgentProfile,
    updateCandidate,
    updateSearch,
} from './agents';
import type { ApplicationInput } from '@shared/application';

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
    const sendEvent = (channel: string, payload: unknown) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

    ipcMain.handle('applications:list', () => {
        return listApplications().map(serializeApplication);
    });
    ipcMain.handle('applications:get', (_evt, id: string) => {
        const row = getApplication(id);
        return row ? serializeApplication(row) : null;
    });
    ipcMain.handle('applications:create', (_evt, input: ApplicationInput) => {
        const parsed = { ...input, appliedAt: parseDate(input.appliedAt) };
        return serializeApplication(createApplication(parsed));
    });
    ipcMain.handle('applications:update', (_evt, id: string, input: ApplicationInput) => {
        const parsed = { ...input, appliedAt: parseDate(input.appliedAt) };
        return serializeApplication(updateApplication(id, parsed));
    });
    ipcMain.handle('applications:delete', (_evt, id: string) => {
        deleteApplication(id);
        return { ok: true };
    });
    ipcMain.handle('applications:events:list', () => {
        return listApplicationEvents().map(serializeEvent);
    });
    ipcMain.handle('applications:events:forApp', (_evt, id: string) => {
        return listEventsForApplication(id).map(serializeEvent);
    });

    ipcMain.handle('llm:extract', async (_evt, url: string) => extractJobData(url));
    ipcMain.handle('llm:assessFit', async (_evt, input: ApplicationInput) => assessFit(input));
    ipcMain.handle('llm:getConfig', async () => getLlmConfig());
    ipcMain.handle('llm:setConfig', async (_evt, config) => {
        setLlmConfig(config);
        return getLlmConfig();
    });
    ipcMain.handle('llm:status', async () => checkLlmStatus());
    ipcMain.handle('llm:start', async () => startOllama());
    ipcMain.handle('llm:pullModel', async (_evt, modelName: string) => pullModel(modelName));
    ipcMain.handle('llm:draftEmail', async (_evt, applicationId: string) => {
        const app = getApplication(applicationId);
        if (!app) throw new Error(`Application ${applicationId} not found`);
        return draftEmail({
            companyName: app.companyName,
            jobTitle: app.jobTitle,
            jobDescription: app.jobDescription,
            location: app.location,
            remote: app.remote,
            stack: app.stack,
            contactName: app.contactName,
        });
    });

    ipcMain.handle('agents:listSearches', () => listSearches());
    ipcMain.handle('agents:createSearch', (_evt, input) => createSearch(input));
    ipcMain.handle('agents:updateSearch', (_evt, id: string, input) => updateSearch(id, input));
    ipcMain.handle('agents:deleteSearch', (_evt, id: string) => {
        deleteSearch(id);
        return { ok: true };
    });
    ipcMain.handle('agents:runSearch', async (_evt, id: string) =>
        runSearchNow(id, { sendEvent }),
    );
    ipcMain.handle('agents:cancelRun', (_evt, id: string) => ({ canceled: cancelSearchRun(id) }));
    ipcMain.handle('agents:isRunning', (_evt, id: string) => isSearchRunning(id));
    ipcMain.handle('agents:runningSearches', () => listRunningSearches());

    ipcMain.handle('agents:listCandidates', (_evt, minScore?: number) =>
        listCandidates(minScore ?? 0),
    );
    ipcMain.handle('agents:updateCandidate', (_evt, id: string, input) =>
        updateCandidate(id, input),
    );
    ipcMain.handle('agents:bulkUpdateCandidates', (_evt, ids: string[], input) =>
        bulkUpdateCandidates(ids, input),
    );
    ipcMain.handle('agents:importCandidate', (_evt, candidateId: string) => {
        const candidates = listCandidates();
        const cand = candidates.find((c) => c.id === candidateId);
        if (!cand) throw new Error(`Candidate ${candidateId} not found`);
        const newApp = createApplication({
            companyName: cand.company,
            jobTitle: cand.title,
            jobUrl: cand.sourceUrl,
            jobDescription: cand.summary,
            location: cand.location,
            notes: `From agent suggestion. LLM score: ${cand.score}/100 - ${cand.scoreReason}`,
            matchScore: cand.score,
            matchReason: cand.scoreReason,
        });
        updateCandidate(candidateId, { status: 'imported', importedApplicationId: newApp.id });
        return serializeApplication(newApp);
    });

    ipcMain.handle('agents:listRuns', (_evt, limit?: number) => listAgentRuns(limit ?? 30));

    ipcMain.handle('agents:getProfile', () => getAgentProfile());
    ipcMain.handle('agents:setProfile', (_evt, profile) => setAgentProfile(profile));

    ipcMain.handle('export:excel', async (_evt, labels: ExportLabels, dialogTitle: string) => {
        const result = await dialog.showSaveDialog({
            title: dialogTitle,
            defaultPath: join(
                'Pitch-Tracker_' + new Date().toISOString().slice(0, 10) + '.xlsx',
            ),
            filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        const count = await exportToExcel(result.filePath, labels);
        return { canceled: false, filePath: result.filePath, count };
    });

    ipcMain.handle('shell:openExternal', async (_evt, url: string) => {
        await shell.openExternal(url);
        return { ok: true };
    });

    ipcMain.handle('profile:get', () => getUserProfile());
    ipcMain.handle('profile:set', (_evt, patch: Partial<UserProfile>) => setUserProfile(patch));
    ipcMain.handle('profile:encryptionAvailable', () => isSmtpEncryptionAvailable());
    ipcMain.handle('profile:pickCv', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Pick CV file',
            properties: ['openFile'],
            filters: [
                { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'] },
                { name: 'All files', extensions: ['*'] },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) return { canceled: true };
        const source = result.filePaths[0];
        try {
            const cvDir = join(app.getPath('userData'), 'cv');
            mkdirSync(cvDir, { recursive: true });
            const ext = extname(source) || '.pdf';
            const stored = join(cvDir, 'cv' + ext);
            copyFileSync(source, stored);
            setUserProfile({ cvPath: stored });
            return { canceled: false, path: stored };
        } catch (err) {
            return { canceled: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('email:verify', async () => verifySmtp());
    ipcMain.handle('email:send', async (_evt, req: EmailSendRequest) => sendEmail(req));
    ipcMain.handle('email:listForApp', async (_evt, applicationId: string) =>
        listEmailsForApplication(applicationId).map((r) => ({
            ...r,
            sentAt: r.sentAt.toISOString(),
        })),
    );

    ipcMain.handle('backup:create', async () => {
        const defaultName =
            'tracker-backup_' + new Date().toISOString().slice(0, 10) + '.zip';
        const result = await dialog.showSaveDialog({
            title: 'Export backup',
            defaultPath: defaultName,
            filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        return createBackup(result.filePath);
    });
    ipcMain.handle('chat:send', async (_evt, req: ChatRequest) => runChat(req, getWindow()));

    ipcMain.handle('backup:restore', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Restore backup',
            properties: ['openFile'],
            filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { ok: false, canceled: true };
        }
        return restoreBackup(result.filePaths[0]);
    });
}

function serializeApplication(row: any) {
    return {
        ...row,
        appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

function serializeEvent(row: ApplicationEventRow) {
    return {
        id: row.id,
        applicationId: row.applicationId,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        changedAt: row.changedAt.toISOString(),
    };
}

function parseDate(value: unknown): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') return value ? new Date(value) : null;
    return null;
}
