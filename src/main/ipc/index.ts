import { ipcMain, type BrowserWindow } from 'electron';
import { registerAgentsIpc } from './agents';
import { registerApplicationsIpc } from './applications';
import { registerBackupIpc } from './backup';
import { registerChatIpc } from './chat';
import { registerEmailIpc } from './email';
import { registerExportIpc } from './export';
import { registerInboxIpc } from './inbox';
import { registerLlmIpc } from './llm';
import { registerProfileIpc } from './profile';
import { registerShellIpc } from './shell';

/** Register every IPC handler on startup. One thin registry per domain. */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
    registerApplicationsIpc(ipcMain);
    registerLlmIpc(ipcMain);
    registerAgentsIpc(ipcMain, getWindow);
    registerEmailIpc(ipcMain);
    registerProfileIpc(ipcMain);
    registerBackupIpc(ipcMain);
    registerChatIpc(ipcMain, getWindow);
    registerShellIpc(ipcMain);
    registerExportIpc(ipcMain);
    registerInboxIpc(ipcMain);
}
