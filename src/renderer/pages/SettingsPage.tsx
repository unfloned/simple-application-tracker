import {
    Button,
    Card,
    Code,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Title,
    useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMoon, IconRefresh, IconSun } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '../i18n';
import { BackupCard } from '../components/settings/BackupCard';
import { OllamaCard } from '../components/settings/OllamaCard';
import { ProfileCard } from '../components/settings/ProfileCard';

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
        <Stack gap="xl">
            <Stack gap={2}>
                <Title order={2}>{t('settings.title')}</Title>
                <Text c="dimmed" size="sm">
                    {t('settings.version')} {version || '-'}
                </Text>
            </Stack>

            <Card withBorder padding="lg">
                <Title order={5} mb="md">
                    {t('settings.appearance')}
                </Title>
                <Stack gap="md">
                    <Group justify="space-between">
                        <Text size="sm" fw={500}>
                            {t('settings.theme')}
                        </Text>
                        <SegmentedControl
                            value={colorScheme}
                            onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
                            data={[
                                {
                                    value: 'light',
                                    label: (
                                        <span style={INLINE_LABEL}>
                                            <IconSun size={14} /> {t('settings.themeLight')}
                                        </span>
                                    ),
                                },
                                {
                                    value: 'dark',
                                    label: (
                                        <span style={INLINE_LABEL}>
                                            <IconMoon size={14} /> {t('settings.themeDark')}
                                        </span>
                                    ),
                                },
                                {
                                    value: 'auto',
                                    label: (
                                        <span style={{ whiteSpace: 'nowrap' }}>
                                            {t('settings.themeSystem')}
                                        </span>
                                    ),
                                },
                            ]}
                            size="xs"
                        />
                    </Group>

                    <Group justify="space-between">
                        <Text size="sm" fw={500}>
                            {t('settings.language')}
                        </Text>
                        <SegmentedControl
                            value={i18n.language.startsWith('de') ? 'de' : 'en'}
                            onChange={(v) => setLanguage(v as Language)}
                            data={[
                                { value: 'de', label: t('settings.languageGerman') },
                                { value: 'en', label: t('settings.languageEnglish') },
                            ]}
                            size="xs"
                        />
                    </Group>
                </Stack>
            </Card>

            <ProfileCard />

            <BackupCard />

            <OllamaCard />

            <Card withBorder padding="lg">
                <Title order={5} mb="md">
                    {t('settings.app')}
                </Title>
                <Group justify="space-between" mb="sm">
                    <Text size="sm">{t('settings.version')}</Text>
                    <Code>{version || '...'}</Code>
                </Group>
                <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={checkUpdate}>
                    {t('settings.checkForUpdate')}
                </Button>
            </Card>
        </Stack>
    );
}

const INLINE_LABEL: React.CSSProperties = {
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
};
