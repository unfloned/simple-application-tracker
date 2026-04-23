import type { BrowserWindow, IpcMain } from 'electron';
import {
    bulkUpdateCandidates,
    cancelSearchRun,
    countCandidates,
    createSearch,
    deleteCandidates,
    deleteCandidatesBelowScore,
    deleteSearch,
    getAgentProfile,
    isSearchRunning,
    listAgentRuns,
    listCandidates,
    listIgnoredCandidates,
    listRunningSearches,
    listSearches,
    rescoreCandidate,
    rescoreCandidates,
    runSearchNow,
    setAgentProfile,
    updateCandidate,
    updateSearch,
} from '../agents';
import { createApplication } from '../db';
import { serializeApplication } from './serializers';

export function registerAgentsIpc(
    ipcMain: IpcMain,
    getWindow: () => BrowserWindow | null,
): void {
    const sendEvent = (channel: string, payload: unknown) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

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
    ipcMain.handle('agents:deleteCandidates', (_evt, ids: string[]) =>
        deleteCandidates(ids),
    );
    ipcMain.handle('agents:deleteCandidatesBelowScore', (_evt, threshold: number) =>
        deleteCandidatesBelowScore(threshold),
    );
    ipcMain.handle('agents:countCandidates', () => countCandidates());
    ipcMain.handle('agents:listIgnoredCandidates', () => listIgnoredCandidates());
    ipcMain.handle('agents:rescoreCandidate', (_evt, id: string) => rescoreCandidate(id));
    ipcMain.handle('agents:rescoreCandidates', (_evt, ids: string[]) => rescoreCandidates(ids));
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
}
