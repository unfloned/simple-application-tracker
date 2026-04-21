import { Badge, Box, Group, Progress, Text, Tooltip } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RunProgress {
    searchId: string;
    searchLabel: string;
    source: string;
    current: number;
    total: number;
    phase: 'fetching' | 'scoring' | 'done';
}

interface Props {
    totalApplications: number;
    visibleApplications: number;
}

export function StatusFooter({ totalApplications, visibleApplications }: Props) {
    const { t } = useTranslation();
    const [progress, setProgress] = useState<RunProgress | null>(null);
    const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
    const labelsRef = useRef<Record<string, string>>({});

    useEffect(() => {
        const loadLabels = () => {
            window.api.agents.listSearches().then((searches) => {
                const map: Record<string, string> = {};
                for (const s of searches) map[s.id] = s.label;
                labelsRef.current = map;
            });
        };
        loadLabels();

        const offStart = window.api.on('agents:runStarted', (payload: { searchId: string }) => {
            loadLabels();
            setProgress({
                searchId: payload.searchId,
                searchLabel: labelsRef.current[payload.searchId] ?? 'Search',
                source: '',
                current: 0,
                total: 0,
                phase: 'fetching',
            });
        });

        const offProgress = window.api.on(
            'agents:runProgress',
            (payload: Omit<RunProgress, 'searchLabel'>) => {
                setProgress((prev) => ({
                    ...payload,
                    searchLabel:
                        prev?.searchLabel ?? labelsRef.current[payload.searchId] ?? 'Search',
                }));
            },
        );

        const offFinished = window.api.on('agents:runFinished', () => {
            setTimeout(() => setProgress(null), 1500);
        });

        const checkOllama = async () => {
            try {
                const status = await window.api.llm.status();
                setOllamaRunning(status.running);
            } catch {
                setOllamaRunning(false);
            }
        };
        checkOllama();
        const interval = setInterval(checkOllama, 30000);

        return () => {
            offStart();
            offProgress();
            offFinished();
            clearInterval(interval);
        };
    }, []);

    const visibleText =
        visibleApplications === totalApplications
            ? t('footer.applications', { count: totalApplications })
            : t('footer.showing', { visible: visibleApplications, total: totalApplications });

    const ollamaTooltip =
        ollamaRunning === null
            ? t('footer.ollamaChecking')
            : ollamaRunning
              ? t('footer.ollamaRunning')
              : t('footer.ollamaOffline');

    return (
        <Box
            px="md"
            h="100%"
            style={{
                borderTop:
                    '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                backgroundColor:
                    'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))',
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <Group justify="space-between" gap="md" w="100%" wrap="nowrap">
                <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {visibleText}
                </Text>

                <Group gap="sm" style={{ flex: 1, maxWidth: 600 }} wrap="nowrap">
                    {progress ? (
                        <>
                            <Badge color="blue" variant="light" size="sm">
                                {progress.searchLabel}
                            </Badge>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                {progress.source
                                    ? `${progress.source} · ${progress.phase}`
                                    : progress.phase}
                            </Text>
                            {progress.total > 0 && (
                                <>
                                    <Progress
                                        value={(progress.current / progress.total) * 100}
                                        size="sm"
                                        animated
                                        style={{ flex: 1, minWidth: 80 }}
                                    />
                                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                        {progress.current}/{progress.total}
                                    </Text>
                                </>
                            )}
                        </>
                    ) : null}
                </Group>

                <Group gap="xs" wrap="nowrap">
                    <Tooltip label={ollamaTooltip}>
                        <Badge
                            size="sm"
                            color={
                                ollamaRunning === null ? 'gray' : ollamaRunning ? 'green' : 'red'
                            }
                            variant="dot"
                            style={{ textTransform: 'none' }}
                        >
                            {t('footer.ollama')}
                        </Badge>
                    </Tooltip>
                    <Badge
                        size="sm"
                        color={progress ? 'blue' : 'gray'}
                        variant="dot"
                        style={{ textTransform: 'none' }}
                    >
                        {progress ? t('footer.working') : t('footer.idle')}
                    </Badge>
                </Group>
            </Group>
        </Box>
    );
}
