import { TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostBtn } from '../primitives/GhostBtn';
import { SettingsHint, SettingsSection } from './SettingsSection';

interface Status {
    running: boolean;
    models: string[];
    error?: string;
}

function StatusDot({ status }: { status: Status | null }) {
    const { t } = useTranslation();
    let color = 'var(--ink-4)';
    let labelKey = 'settings.statusChecking';
    if (status) {
        color = status.running ? 'var(--moss)' : 'var(--rust)';
        labelKey = status.running ? 'settings.statusRunning' : 'settings.statusOffline';
    }
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
            }}
        >
            <div
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: color,
                }}
            />
            <span
                className="mono"
                style={{
                    fontSize: 10.5,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                }}
            >
                {t(labelKey)}
            </span>
        </div>
    );
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
                message: t('settings.ollamaStartedRunning', { method }),
            });
        } else {
            notifications.show({
                color: 'red',
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
        <SettingsSection label={t('settings.ollamaSection')} right={<StatusDot status={status} />}>
            {status && !status.running && (
                <div style={{ marginBottom: 12 }}>
                    <SettingsHint tone="warn">
                        {t('settings.ollamaOfflineHint', { url: ollamaUrl })}
                    </SettingsHint>
                </div>
            )}

            {status?.running && status.models.length > 0 && (
                <div
                    className="mono"
                    style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        marginBottom: 12,
                        letterSpacing: '0.02em',
                    }}
                >
                    {t('settings.installedModels', { models: status.models.join(', ') })}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <GhostBtn onClick={refreshStatus}>
                    <span>{t('common.refresh')}</span>
                </GhostBtn>
                {!status?.running && (
                    <GhostBtn
                        active
                        onClick={doStart}
                        disabled={starting}
                        style={{
                            background: 'var(--ink)',
                            color: 'var(--paper)',
                            borderColor: 'var(--ink)',
                        }}
                    >
                        <span>
                            {starting
                                ? t('common.working', 'Working…')
                                : t('settings.startOllama')}
                        </span>
                    </GhostBtn>
                )}
                {status?.running && !hasModel && (
                    <GhostBtn onClick={doPull} disabled={pulling}>
                        <span>
                            {pulling
                                ? t('common.working', 'Working…')
                                : t('settings.downloadModel')}
                        </span>
                    </GhostBtn>
                )}
            </div>

            <div style={{ marginBottom: 12 }}>
                <SettingsHint>{t('settings.installHint')}</SettingsHint>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            </div>

            <div style={{ marginTop: 14 }}>
                <GhostBtn
                    active
                    onClick={save}
                    disabled={saving}
                    style={{
                        background: 'var(--ink)',
                        color: 'var(--paper)',
                        borderColor: 'var(--ink)',
                    }}
                >
                    <span>
                        {saving ? t('common.saving', 'Saving…') : t('settings.save')}
                    </span>
                </GhostBtn>
            </div>
        </SettingsSection>
    );
}
