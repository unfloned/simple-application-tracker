import type { IpcMain } from 'electron';
import type { ApplicationStatus } from '@shared/application';
import { listInboundEmails, type InboundReviewStatus } from '../db';
import {
    applySuggestion,
    dismissSuggestion,
    reassignSuggestion,
    setReviewStatus,
    syncInbox,
} from '../inbox';
import { testImapConnection } from '../imap';

export function registerInboxIpc(ipcMain: IpcMain): void {
    ipcMain.handle('inbox:testImap', () => testImapConnection());
    ipcMain.handle('inbox:sync', () => syncInbox());
    ipcMain.handle('inbox:list', (_evt, reviewStatus?: InboundReviewStatus) =>
        listInboundEmails(reviewStatus),
    );
    ipcMain.handle(
        'inbox:applySuggestion',
        (
            _evt,
            payload: {
                inboundId: string;
                applicationId: string;
                status: ApplicationStatus;
                note: string;
            },
        ) =>
            applySuggestion(
                payload.inboundId,
                payload.applicationId,
                payload.status,
                payload.note,
            ),
    );
    ipcMain.handle('inbox:dismiss', (_evt, inboundId: string) => {
        dismissSuggestion(inboundId);
    });
    ipcMain.handle(
        'inbox:reassign',
        (
            _evt,
            payload: {
                inboundId: string;
                applicationId: string | null;
                status: ApplicationStatus | 'other' | null;
            },
        ) => {
            reassignSuggestion(payload.inboundId, payload.applicationId, payload.status);
        },
    );
    ipcMain.handle(
        'inbox:setReviewStatus',
        (_evt, inboundId: string, status: InboundReviewStatus) => {
            setReviewStatus(inboundId, status);
        },
    );
}
