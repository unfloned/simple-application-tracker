import { Autocomplete, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostBtn } from '../primitives/GhostBtn';
import { SettingsHint, SettingsSection } from './SettingsSection';

interface Status {
    running: boolean;
    models: string[];
    error?: string;
}

interface RecommendedModel {
    name: string;
    family: string;
    note: string;
}

/**
 * Curated catalog shown in the model picker. Ollama has no official library
 * discovery API, so we keep a hand-picked list covering the main families and
 * a reasonable range of sizes. Users can still type any model name freely,
 * and the pull button downloads whatever name is entered.
 */
const RECOMMENDED_MODELS: RecommendedModel[] = [
    // Llama 3.x (Meta), solid general-purpose default
    { name: 'llama3.2:1b', family: 'Llama', note: '1B, 1.3 GB, winzig und schnell' },
    { name: 'llama3.2:3b', family: 'Llama', note: '3B, 2.0 GB, default für schnelles Scoring' },
    { name: 'llama3.1:8b', family: 'Llama', note: '8B, 4.7 GB, deutlich stärker bei JSON' },
    { name: 'llama3.3:70b', family: 'Llama', note: '70B, 43 GB, Top-Qualität, nur mit viel RAM' },

    // Qwen 2.5 (Alibaba), sehr gut bei strukturierten Antworten
    { name: 'qwen2.5:1.5b', family: 'Qwen', note: '1.5B, 986 MB, klein aber brauchbar' },
    { name: 'qwen2.5:3b', family: 'Qwen', note: '3B, 1.9 GB, guter Kompromiss' },
    { name: 'qwen2.5:7b', family: 'Qwen', note: '7B, 4.4 GB, sehr gut für JSON-Scoring' },
    { name: 'qwen2.5:14b', family: 'Qwen', note: '14B, 9.0 GB, hohe Qualität' },
    { name: 'qwen2.5:32b', family: 'Qwen', note: '32B, 20 GB, sehr hohe Qualität, langsam' },
    { name: 'qwen2.5-coder:7b', family: 'Qwen', note: '7B Code-Variante, 4.7 GB' },
    { name: 'qwen2.5-coder:14b', family: 'Qwen', note: '14B Code-Variante, 9.0 GB' },

    // Gemma (Google)
    { name: 'gemma2:2b', family: 'Gemma', note: '2B, 1.6 GB, sehr klein' },
    { name: 'gemma2:9b', family: 'Gemma', note: '9B, 5.4 GB, solider Allrounder' },
    { name: 'gemma2:27b', family: 'Gemma', note: '27B, 16 GB, höchste Qualität der Familie' },
    { name: 'gemma3:4b', family: 'Gemma', note: '4B, neuere Generation' },
    { name: 'gemma3:12b', family: 'Gemma', note: '12B, neuere Generation' },

    // Mistral
    { name: 'mistral:7b', family: 'Mistral', note: '7B, 4.1 GB, schnell und solide' },
    { name: 'mistral-nemo:12b', family: 'Mistral', note: '12B, 7.1 GB, längerer Kontext' },
    { name: 'mistral-small:22b', family: 'Mistral', note: '22B, 13 GB, hohe Qualität' },

    // Phi (Microsoft), sehr klein, brauchbar
    { name: 'phi3:mini', family: 'Phi', note: '3.8B, 2.3 GB, sehr klein' },
    { name: 'phi3.5:3.8b', family: 'Phi', note: '3.8B, aktuellere Version von phi3:mini' },
    { name: 'phi4:14b', family: 'Phi', note: '14B, 9.1 GB, neueste Generation' },

    // DeepSeek R1, reasoning-optimiert
    { name: 'deepseek-r1:1.5b', family: 'DeepSeek R1', note: '1.5B, reasoning, winzig' },
    { name: 'deepseek-r1:7b', family: 'DeepSeek R1', note: '7B, reasoning, 4.7 GB' },
    { name: 'deepseek-r1:8b', family: 'DeepSeek R1', note: '8B, reasoning, basiert auf Llama' },
    { name: 'deepseek-r1:14b', family: 'DeepSeek R1', note: '14B, reasoning, 9.0 GB' },
    { name: 'deepseek-r1:32b', family: 'DeepSeek R1', note: '32B, reasoning, 20 GB' },
];

function StatusDot({ status }: { status: Status | null }) {
    const { t } = useTranslation();
    let color = 'var(--ink-4)';
    let labelKey = 'settings.statusChecking';
    if (status) {
        color = status.running ? 'var(--moss)' : 'var(--rust)';
        labelKey = status.running ? 'settings.statusRunning' : 'settings.statusOffline';
    }
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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

    /** Combine installed + recommended into Autocomplete groups.
     *  Installed first, then one group per model family so the dropdown stays
     *  scannable when the catalog grows. */
    const modelOptions = useMemo(() => {
        const installed = status?.models ?? [];
        const groups: { group: string; items: { value: string; label?: string }[] }[] = [];

        if (installed.length > 0) {
            groups.push({
                group: t('settings.ollamaGroupInstalled'),
                items: installed.map((m) => ({ value: m })),
            });
        }

        const notInstalled = RECOMMENDED_MODELS.filter((r) => !installed.includes(r.name));
        const byFamily = new Map<string, RecommendedModel[]>();
        for (const m of notInstalled) {
            const arr = byFamily.get(m.family) ?? [];
            arr.push(m);
            byFamily.set(m.family, arr);
        }
        for (const [family, items] of byFamily) {
            groups.push({
                group: family,
                items: items.map((r) => ({ value: r.name })),
            });
        }

        return groups;
    }, [status, t]);

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
    const recommendedNote = RECOMMENDED_MODELS.find((r) => r.name === ollamaModel)?.note;

    return (
        <SettingsSection label={t('settings.ollamaSection')} right={<StatusDot status={status} />}>
            {status && !status.running && (
                <div style={{ marginBottom: 12 }}>
                    <SettingsHint tone="warn">
                        {t('settings.ollamaOfflineHint', { url: ollamaUrl })}
                    </SettingsHint>
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
                {status?.running && !hasModel && ollamaModel && (
                    <GhostBtn onClick={doPull} disabled={pulling}>
                        <span>
                            {pulling
                                ? t('common.working', 'Working…')
                                : `${t('settings.downloadModel')}: ${ollamaModel}`}
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
                <Autocomplete
                    label={t('settings.ollamaModel')}
                    placeholder="llama3.2:3b"
                    description={
                        recommendedNote
                            ? recommendedNote +
                              (hasModel
                                  ? t('settings.modelNoteSuffixInstalled')
                                  : t('settings.modelNoteSuffixNotInstalled'))
                            : hasModel
                              ? t('settings.modelInstalled')
                              : ollamaModel
                                ? t('settings.modelNotInstalled')
                                : t('settings.ollamaModelHint')
                    }
                    value={ollamaModel}
                    onChange={setOllamaModel}
                    data={modelOptions}
                    maxDropdownHeight={280}
                    comboboxProps={{ withinPortal: true }}
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
                    <span>{saving ? t('common.saving', 'Saving…') : t('settings.save')}</span>
                </GhostBtn>
            </div>
        </SettingsSection>
    );
}
