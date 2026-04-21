import {
    Alert,
    Box,
    Button,
    Card,
    Checkbox,
    Divider,
    Group,
    NumberInput,
    PasswordInput,
    SimpleGrid,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconCheck,
    IconFile,
    IconInfoCircle,
    IconLock,
    IconLockOpen,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserProfileDto } from '../../../preload/index';

export function ProfileCard() {
    const { t } = useTranslation();
    const [profile, setProfile] = useState<UserProfileDto | null>(null);
    const [savingProfile, setSavingProfile] = useState(false);
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [encAvailable, setEncAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        window.api.profile.get().then(setProfile);
        window.api.profile.encryptionAvailable().then(setEncAvailable);
    }, []);

    const updateProfile = <K extends keyof UserProfileDto>(key: K, value: UserProfileDto[K]) => {
        setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    const saveProfile = async () => {
        if (!profile) return;
        setSavingProfile(true);
        const next = await window.api.profile.set(profile);
        setProfile(next);
        setSavingProfile(false);
        notifications.show({
            color: 'green',
            icon: <IconCheck size={16} />,
            message: t('profilePage.saved'),
        });
    };

    const pickCv = async () => {
        const result = await window.api.profile.pickCv();
        if (result.canceled || !result.path || !profile) return;
        const next = await window.api.profile.set({ cvPath: result.path });
        setProfile(next);
    };

    const testSmtp = async () => {
        if (!profile) return;
        setSavingProfile(true);
        await window.api.profile.set(profile);
        setSavingProfile(false);
        setTestingSmtp(true);
        const result = await window.api.email.verify();
        setTestingSmtp(false);
        if (result.ok) {
            notifications.show({
                color: 'green',
                icon: <IconCheck size={16} />,
                message: t('profilePage.testOk'),
            });
        } else {
            notifications.show({
                color: 'red',
                icon: <IconX size={16} />,
                title: t('profilePage.testFailed'),
                message: result.error ?? 'Unknown error',
                autoClose: 10000,
            });
        }
    };

    return (
        <Card withBorder padding="lg">
            <Group gap="xs" mb="md">
                <IconUser size={18} />
                <Title order={5}>{t('profilePage.section')}</Title>
            </Group>
            {profile && (
                <Stack gap="md">
                    <SimpleGrid cols={2} spacing="sm">
                        <TextInput
                            label={t('profilePage.fullName')}
                            description={t('profilePage.fullNameHint')}
                            value={profile.fullName}
                            onChange={(e) => updateProfile('fullName', e.currentTarget.value)}
                        />
                        <TextInput
                            label={t('profilePage.email')}
                            value={profile.email}
                            onChange={(e) => updateProfile('email', e.currentTarget.value)}
                        />
                        <TextInput
                            label={t('profilePage.phone')}
                            value={profile.phone}
                            onChange={(e) => updateProfile('phone', e.currentTarget.value)}
                        />
                    </SimpleGrid>
                    <Textarea
                        label={t('profilePage.signature')}
                        placeholder={t('profilePage.signaturePlaceholder')}
                        autosize
                        minRows={2}
                        maxRows={6}
                        value={profile.signature}
                        onChange={(e) => updateProfile('signature', e.currentTarget.value)}
                    />
                    <Box>
                        <Text size="sm" fw={500} mb={4}>
                            {t('profilePage.cv')}
                        </Text>
                        <Group gap="sm">
                            <Button
                                variant="light"
                                leftSection={<IconFile size={16} />}
                                onClick={pickCv}
                            >
                                {t('profilePage.pickCv')}
                            </Button>
                            <Text size="sm" c={profile.cvPath ? undefined : 'dimmed'} truncate>
                                {profile.cvPath || t('profilePage.cvNone')}
                            </Text>
                        </Group>
                    </Box>

                    <Divider label={t('profilePage.smtpSection')} labelPosition="left" />
                    <Alert variant="light" icon={<IconInfoCircle size={16} />}>
                        {t('profilePage.smtpHint')}
                    </Alert>
                    {encAvailable === true && (
                        <Alert variant="light" color="green" icon={<IconLock size={16} />}>
                            {t('profilePage.encryptionOn')}
                        </Alert>
                    )}
                    {encAvailable === false && (
                        <Alert variant="light" color="yellow" icon={<IconLockOpen size={16} />}>
                            {t('profilePage.encryptionOff')}
                        </Alert>
                    )}
                    <SimpleGrid cols={2} spacing="sm">
                        <TextInput
                            label={t('profilePage.smtpHost')}
                            placeholder="smtp.gmail.com"
                            value={profile.smtpHost}
                            onChange={(e) => updateProfile('smtpHost', e.currentTarget.value)}
                        />
                        <NumberInput
                            label={t('profilePage.smtpPort')}
                            min={1}
                            max={65535}
                            value={profile.smtpPort}
                            onChange={(v) =>
                                updateProfile('smtpPort', typeof v === 'number' ? v : 587)
                            }
                        />
                        <TextInput
                            label={t('profilePage.smtpUser')}
                            value={profile.smtpUser}
                            onChange={(e) => updateProfile('smtpUser', e.currentTarget.value)}
                        />
                        <PasswordInput
                            label={t('profilePage.smtpPassword')}
                            value={profile.smtpPassword}
                            onChange={(e) => updateProfile('smtpPassword', e.currentTarget.value)}
                        />
                        <TextInput
                            label={t('profilePage.smtpFromName')}
                            value={profile.smtpFromName}
                            onChange={(e) => updateProfile('smtpFromName', e.currentTarget.value)}
                        />
                        <Checkbox
                            label={t('profilePage.smtpSecure')}
                            checked={profile.smtpSecure}
                            onChange={(e) => updateProfile('smtpSecure', e.currentTarget.checked)}
                            mt="xl"
                        />
                    </SimpleGrid>

                    <Group>
                        <Button onClick={saveProfile} loading={savingProfile}>
                            {t('profilePage.save')}
                        </Button>
                        <Button
                            variant="light"
                            onClick={testSmtp}
                            loading={testingSmtp}
                            disabled={!profile.smtpHost || !profile.smtpUser}
                        >
                            {t('profilePage.testSmtp')}
                        </Button>
                    </Group>
                </Stack>
            )}
        </Card>
    );
}
