import { Button, Card, Group, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconArchive,
    IconCheck,
    IconFolderOpen,
    IconUpload,
    IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
                icon: <IconCheck size={16} />,
                message: t('backup.exportOk', { size: Math.round((result.size ?? 0) / 1024) }),
            });
        } else {
            notifications.show({
                color: 'red',
                icon: <IconX size={16} />,
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
                icon: <IconCheck size={16} />,
                message: t('backup.restoreOk', { count: result.restoredFiles ?? 0 }),
                autoClose: 10000,
            });
        } else {
            notifications.show({
                color: 'red',
                icon: <IconX size={16} />,
                title: t('backup.restoreFailed'),
                message: result.error ?? 'Unknown error',
            });
        }
    };

    return (
        <Card withBorder padding="lg">
            <Group gap="xs" mb="md">
                <IconArchive size={18} />
                <Title order={5}>{t('backup.section')}</Title>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
                {t('backup.hint')}
            </Text>
            <Group>
                <Button
                    variant="light"
                    leftSection={<IconUpload size={16} />}
                    onClick={doBackup}
                    loading={backupBusy}
                >
                    {t('backup.export')}
                </Button>
                <Button
                    variant="light"
                    color="red"
                    leftSection={<IconFolderOpen size={16} />}
                    onClick={doRestore}
                    loading={restoreBusy}
                >
                    {t('backup.restore')}
                </Button>
            </Group>
        </Card>
    );
}
