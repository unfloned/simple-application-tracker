import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostBtn } from '../primitives/GhostBtn';
import { SettingsSection } from './SettingsSection';

export function BackupCard() {
    const { t } = useTranslation();
    const [backupBusy, setBackupBusy] = useState(false);
    const [restoreBusy, setRestoreBusy] = useState(false);

    const doBackup = async () => {
        setBackupBusy(true);
        const result = await window.api.backup.create();
        setBackupBusy(false);
        if (result.canceled) return;
        if (result.ok) {
            notifications.show({
                color: 'green',
                message: t('backup.exportOk', { size: Math.round((result.size ?? 0) / 1024) }),
            });
        } else {
            notifications.show({
                color: 'red',
                title: t('backup.exportFailed'),
                message: result.error ?? 'Unknown error',
            });
        }
    };

    const doRestore = async () => {
        if (!confirm(t('backup.confirmRestore'))) return;
        setRestoreBusy(true);
        const result = await window.api.backup.restore();
        setRestoreBusy(false);
        if (result.canceled) return;
        if (result.ok) {
            notifications.show({
                color: 'green',
                message: t('backup.restoreOk', { count: result.restoredFiles ?? 0 }),
                autoClose: 10000,
            });
        } else {
            notifications.show({
                color: 'red',
                title: t('backup.restoreFailed'),
                message: result.error ?? 'Unknown error',
            });
        }
    };

    return (
        <SettingsSection label={t('backup.section')}>
            <p
                style={{
                    fontSize: 12.5,
                    color: 'var(--ink-3)',
                    margin: '0 0 14px',
                    lineHeight: 1.5,
                }}
            >
                {t('backup.hint')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
                <GhostBtn onClick={doBackup} disabled={backupBusy}>
                    <span>
                        {backupBusy
                            ? t('common.working', 'Working…')
                            : t('backup.export')}
                    </span>
                </GhostBtn>
                <GhostBtn
                    onClick={doRestore}
                    disabled={restoreBusy}
                    style={{ color: 'var(--rust)', borderColor: 'var(--rust)' }}
                >
                    <span>
                        {restoreBusy
                            ? t('common.working', 'Working…')
                            : t('backup.restore')}
                    </span>
                </GhostBtn>
            </div>
        </SettingsSection>
    );
}
