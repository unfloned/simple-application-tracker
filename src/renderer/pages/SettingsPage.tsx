import { SegmentedControl, useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '../i18n';
import { BackupCard } from '../components/settings/BackupCard';
import { OllamaCard } from '../components/settings/OllamaCard';
import { ProfileCard } from '../components/settings/ProfileCard';
import { SettingsRow, SettingsSection } from '../components/settings/SettingsSection';
import { GhostBtn } from '../components/primitives/GhostBtn';

export function SettingsPage() {
    const { t, i18n } = useTranslation();
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    const [version, setVersion] = useState<string>('');

    useEffect(() => {
        window.api.updater.currentVersion().then((v) => setVersion(v.version));
    }, []);

    const checkUpdate = async () => {
        const result = await window.api.updater.checkNow();
        if (result.dev) {
            notifications.show({ message: t('settings.devSkip') });
        } else if (result.updateAvailable) {
            notifications.show({
                color: 'blue',
                message: t('settings.updateAvailableNotify', { version: result.remoteVersion }),
            });
        } else {
            notifications.show({
                message: t('settings.onLatest', { version: result.currentVersion }),
            });
        }
    };

    return (
        <div style={{ maxWidth: 1200 }}>
            {/* page header — full width above the grid */}
            <div style={{ marginBottom: 32 }}>
                <h1
                    className="serif"
                    style={{
                        fontSize: 32,
                        margin: 0,
                        color: 'var(--ink)',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1,
                    }}
                >
                    {t('settings.title')}
                </h1>
                <div
                    className="mono"
                    style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        marginTop: 6,
                        letterSpacing: '0.04em',
                    }}
                >
                    v{version || '0.0.0'} · local · {t('settings.subtitle', 'configure once, forget')}
                </div>
            </div>

            {/* sections masonry — CSS columns balance section heights automatically */}
            <div className="settings-masonry">
                <SettingsSection label={t('settings.appearance')}>
                    <SettingsRow label={t('settings.theme')}>
                        <SegmentedControl
                            value={colorScheme}
                            onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
                            data={[
                                { value: 'light', label: t('settings.themeLight') },
                                { value: 'dark', label: t('settings.themeDark') },
                                { value: 'auto', label: t('settings.themeSystem') },
                            ]}
                            size="xs"
                        />
                    </SettingsRow>
                    <SettingsRow label={t('settings.language')}>
                        <SegmentedControl
                            value={i18n.language.startsWith('de') ? 'de' : 'en'}
                            onChange={(v) => setLanguage(v as Language)}
                            data={[
                                { value: 'de', label: t('settings.languageGerman') },
                                { value: 'en', label: t('settings.languageEnglish') },
                            ]}
                            size="xs"
                        />
                    </SettingsRow>
                </SettingsSection>

                <ProfileCard />

                <BackupCard />

                <OllamaCard />

                <SettingsSection label={t('settings.app')}>
                    <SettingsRow label={t('settings.version')}>
                        <span
                            className="mono tnum"
                            style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}
                        >
                            {version || '...'}
                        </span>
                    </SettingsRow>
                    <SettingsRow
                        label={t('settings.checkForUpdate')}
                        description={t('settings.checkForUpdateHint', 'Fetch latest release manifest')}
                    >
                        <GhostBtn onClick={checkUpdate}>
                            <span>{t('settings.checkForUpdate')}</span>
                        </GhostBtn>
                    </SettingsRow>
                </SettingsSection>
            </div>
        </div>
    );
}
