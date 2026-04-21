import {
    Alert,
    Badge,
    Button,
    Code,
    Divider,
    Drawer,
    Group,
    ScrollArea,
    Stack,
    Text,
    TextInput,
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

interface Props {
    opened: boolean;
    onClose: () => void;
}

interface Status {
    running: boolean;
    models: string[];
    error?: string;
}

export function SettingsModal({ opened, onClose }: Props) {
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [ollamaModel, setOllamaModel] = useState('llama3.2:3b');
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<Status | null>(null);
    const [starting, setStarting] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [version, setVersion] = useState<string>('');

    const refreshStatus = useCallback(async () => {
        const s = await window.api.llm.status();
        setStatus(s);
    }, []);

    useEffect(() => {
        if (!opened) return;
        window.api.llm.getConfig().then((config) => {
            setOllamaUrl(config.ollamaUrl);
            setOllamaModel(config.ollamaModel);
        });
        window.api.updater.currentVersion().then((v) => setVersion(v.version));
        refreshStatus();
    }, [opened, refreshStatus]);

    const save = async () => {
        setSaving(true);
        await window.api.llm.setConfig({ ollamaUrl, ollamaModel });
        setSaving(false);
        notifications.show({ color: 'green', message: 'Settings saved.' });
        await refreshStatus();
    };

    const doStart = async () => {
        setStarting(true);
        const result = await window.api.llm.start();
        setStarting(false);
        await refreshStatus();
        if (result.started) {
            notifications.show({
                color: 'green',
                icon: <IconCheck size={16} />,
                message: `Ollama running (${
                    result.method === 'already-running'
                        ? 'already on'
                        : result.method === 'app'
                          ? 'desktop app'
                          : 'CLI'
                }).`,
            });
        } else {
            notifications.show({
                color: 'red',
                icon: <IconX size={16} />,
                title: 'Ollama could not start',
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
            title: `Downloading ${ollamaModel}`,
            message: 'Takes 2-10 minutes depending on model size.',
            autoClose: false,
            withCloseButton: false,
        });
        const result = await window.api.llm.pullModel(ollamaModel);
        setPulling(false);
        notifications.hide('pulling');
        if (result.ok) {
            notifications.show({ color: 'green', message: `${ollamaModel} downloaded.` });
            await refreshStatus();
        } else {
            notifications.show({
                color: 'red',
                title: 'Download failed',
                message: result.message ?? 'Unknown error',
            });
        }
    };

    const checkUpdate = async () => {
        const result = await window.api.updater.checkNow();
        if (result.dev) {
            notifications.show({ message: 'Dev mode: skipping update check.' });
        } else if (result.updateAvailable) {
            notifications.show({
                color: 'blue',
                message: `Update ${result.remoteVersion} available, downloading.`,
            });
        } else {
            notifications.show({ message: `You are on ${result.currentVersion} (latest).` });
        }
    };

    const hasModel = status?.models.includes(ollamaModel) ?? false;

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title="Settings"
            scrollAreaComponent={ScrollArea.Autosize}
        >
            <Stack gap="md">
                <Divider label="Ollama (Local LLM)" labelPosition="left" />

                <Group justify="space-between" align="center">
                    <Text fw={500}>Status</Text>
                    {status === null ? (
                        <Badge color="gray">Checking...</Badge>
                    ) : status.running ? (
                        <Badge color="green" leftSection={<IconCheck size={12} />}>
                            Running
                        </Badge>
                    ) : (
                        <Badge color="red" leftSection={<IconX size={12} />}>
                            Offline
                        </Badge>
                    )}
                </Group>

                {status && !status.running && (
                    <Alert variant="light" color="yellow" icon={<IconInfoCircle size={16} />}>
                        Ollama not responding on <Code>{ollamaUrl}</Code>. Click "Start" below or run{' '}
                        <Code>ollama serve</Code> in a terminal.
                    </Alert>
                )}

                {status?.running && status.models.length > 0 && (
                    <Text size="xs" c="dimmed">
                        Installed models: {status.models.join(', ')}
                    </Text>
                )}

                <Group>
                    <Button
                        variant="light"
                        leftSection={<IconRefresh size={16} />}
                        onClick={refreshStatus}
                    >
                        Refresh
                    </Button>
                    {!status?.running && (
                        <Button
                            leftSection={<IconPlayerPlay size={16} />}
                            onClick={doStart}
                            loading={starting}
                        >
                            Start Ollama
                        </Button>
                    )}
                    {status?.running && !hasModel && (
                        <Button
                            variant="light"
                            leftSection={<IconDownload size={16} />}
                            onClick={doPull}
                            loading={pulling}
                        >
                            Download model
                        </Button>
                    )}
                </Group>

                <Alert variant="light" icon={<IconInfoCircle size={16} />}>
                    Install: <Code>brew install ollama</Code> or the desktop app from{' '}
                    <Code>ollama.com</Code>.
                </Alert>

                <TextInput
                    label="Ollama API URL"
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.currentTarget.value)}
                />

                <TextInput
                    label="Ollama model"
                    placeholder="llama3.2:3b"
                    description="Recommended: llama3.2:3b (fast) or qwen2.5:7b-instruct (higher quality)"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.currentTarget.value)}
                />

                <Button onClick={save} loading={saving}>
                    Save
                </Button>

                <Divider label="App" labelPosition="left" />
                <Group justify="space-between">
                    <Text size="sm">Version</Text>
                    <Code>{version || '...'}</Code>
                </Group>
                <Button
                    variant="light"
                    leftSection={<IconRefresh size={16} />}
                    onClick={checkUpdate}
                >
                    Check for update
                </Button>
            </Stack>
        </Drawer>
    );
}
