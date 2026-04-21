import {
    Alert,
    Badge,
    Button,
    Card,
    Group,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconCheck,
    IconDownload,
    IconInfoCircle,
    IconPlayerPlay,
    IconRefresh,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Status {
    running: boolean;
    models: string[];
    error?: string;
}

export function OllamaCard() {
    const { t } = useTranslation();
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [ollamaModel, setOllamaModel] = useState('llama3.2:3b');
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<Status | null>(null);
    const [starting, setStarting] = useState(false);
    const [pulling, setPulling] = useState(false);

    const refreshStatus = useCallback(async () => {
        const s = await window.api.llm.status();
        setStatus(s);
    }, []);

    useEffect(() => {
        window.api.llm.getConfig().then((config) => {
            setOllamaUrl(config.ollamaUrl);
            setOllamaModel(config.ollamaModel);
        });
        refreshStatus();
    }, [refreshStatus]);

    const save = async () => {
        setSaving(true);
        await window.api.llm.setConfig({ ollamaUrl, ollamaModel });
        setSaving(false);
        notifications.show({ color: 'green', message: t('settings.settingsSaved') });
        await refreshStatus();
    };

    const doStart = async () => {
        setStarting(true);
        const result = await window.api.llm.start();
        setStarting(false);
        await refreshStatus();
        if (result.started) {
            const method =
                result.method === 'already-running'
                    ? t('settings.ollamaAlreadyRunning')
                    : result.method === 'app'
                      ? t('settings.ollamaStartedApp')
                      : t('settings.ollamaStartedCli');
            notifications.show({
                color: 'green',
                icon: <IconCheck size={16} />,
                message: t('settings.ollamaStartedRunning', { method }),
            });
        } else {
            notifications.show({
                color: 'red',
                icon: <IconX size={16} />,
                title: t('settings.ollamaStartFailed'),
                message: result.message ?? 'Unknown error',
                autoClose: 10000,
            });
        }
    };

    const doPull = async () => {
        setPulling(true);
        notifications.show({
            id: 'pulling',
            loading: true,
            title: t('settings.downloadingTitle', { model: ollamaModel }),
            message: t('settings.downloadingHint'),
            autoClose: false,
            withCloseButton: false,
        });
        const result = await window.api.llm.pullModel(ollamaModel);
        setPulling(false);
        notifications.hide('pulling');
        if (result.ok) {
            notifications.show({
                color: 'green',
                message: t('settings.modelDownloaded', { model: ollamaModel }),
            });
            await refreshStatus();
        } else {
            notifications.show({
                color: 'red',
                title: t('settings.downloadFailed'),
                message: result.message ?? 'Unknown error',
            });
        }
    };

    const hasModel = status?.models.includes(ollamaModel) ?? false;

    return (
        <Card withBorder padding="lg">
            <Group justify="space-between" mb="md">
                <Title order={5}>{t('settings.ollamaSection')}</Title>
                {status === null ? (
                    <Badge color="gray">{t('settings.statusChecking')}</Badge>
                ) : status.running ? (
                    <Badge color="green" leftSection={<IconCheck size={12} />}>
                        {t('settings.statusRunning')}
                    </Badge>
                ) : (
                    <Badge color="red" leftSection={<IconX size={12} />}>
                        {t('settings.statusOffline')}
                    </Badge>
                )}
            </Group>

            {status && !status.running && (
                <Alert variant="light" color="yellow" icon={<IconInfoCircle size={16} />} mb="md">
                    {t('settings.ollamaOfflineHint', { url: ollamaUrl })}
                </Alert>
            )}

            {status?.running && status.models.length > 0 && (
                <Text size="xs" c="dimmed" mb="md">
                    {t('settings.installedModels', { models: status.models.join(', ') })}
                </Text>
            )}

            <Group mb="md">
                <Button
                    variant="light"
                    leftSection={<IconRefresh size={16} />}
                    onClick={refreshStatus}
                >
                    {t('common.refresh')}
                </Button>
                {!status?.running && (
                    <Button
                        leftSection={<IconPlayerPlay size={16} />}
                        onClick={doStart}
                        loading={starting}
                    >
                        {t('settings.startOllama')}
                    </Button>
                )}
                {status?.running && !hasModel && (
                    <Button
                        variant="light"
                        leftSection={<IconDownload size={16} />}
                        onClick={doPull}
                        loading={pulling}
                    >
                        {t('settings.downloadModel')}
                    </Button>
                )}
            </Group>

            <Alert variant="light" icon={<IconInfoCircle size={16} />} mb="md">
                {t('settings.installHint')}
            </Alert>

            <Stack gap="sm">
                <TextInput
                    label={t('settings.ollamaUrl')}
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.currentTarget.value)}
                />

                <TextInput
                    label={t('settings.ollamaModel')}
                    placeholder="llama3.2:3b"
                    description={t('settings.ollamaModelHint')}
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.currentTarget.value)}
                />

                <Group>
                    <Button onClick={save} loading={saving}>
                        {t('settings.save')}
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
}
