import {
    Checkbox,
    NumberInput,
    PasswordInput,
    SimpleGrid,
    Textarea,
    TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserProfileDto } from '../../../preload/index';
import { GhostBtn } from '../primitives/GhostBtn';
import { SettingsHint, SettingsSection } from './SettingsSection';

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
        notifications.show({ color: 'green', message: t('profilePage.saved') });
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
            notifications.show({ color: 'green', message: t('profilePage.testOk') });
        } else {
            notifications.show({
                color: 'red',
                title: t('profilePage.testFailed'),
                message: result.error ?? 'Unknown error',
                autoClose: 10000,
            });
        }
    };

    if (!profile) return null;

    return (
        <>
            <SettingsSection label={t('profilePage.section')}>
                <SimpleGrid cols={2} spacing="sm">
                    <TextInput
                        label={t('profilePage.fullName')}
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
                <div style={{ marginTop: 12 }}>
                    <Textarea
                        label={t('profilePage.signature')}
                        placeholder={t('profilePage.signaturePlaceholder')}
                        autosize
                        minRows={2}
                        maxRows={6}
                        value={profile.signature}
                        onChange={(e) => updateProfile('signature', e.currentTarget.value)}
                    />
                </div>
                <div style={{ marginTop: 16 }}>
                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'var(--ink)',
                            marginBottom: 6,
                        }}
                    >
                        {t('profilePage.cv')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <GhostBtn onClick={pickCv}>
                            <span>{t('profilePage.pickCv')}</span>
                        </GhostBtn>
                        <span
                            className="mono"
                            style={{
                                fontSize: 11,
                                color: profile.cvPath ? 'var(--ink-3)' : 'var(--ink-4)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            {profile.cvPath || t('profilePage.cvNone')}
                        </span>
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection label={t('profilePage.smtpSection')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SettingsHint>{t('profilePage.smtpHint')}</SettingsHint>
                    {encAvailable === true && (
                        <SettingsHint tone="ok">{t('profilePage.encryptionOn')}</SettingsHint>
                    )}
                    {encAvailable === false && (
                        <SettingsHint tone="warn">{t('profilePage.encryptionOff')}</SettingsHint>
                    )}
                </div>

                <div style={{ marginTop: 14 }}>
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
                            onChange={(e) =>
                                updateProfile('smtpPassword', e.currentTarget.value)
                            }
                        />
                        <TextInput
                            label={t('profilePage.smtpFromName')}
                            value={profile.smtpFromName}
                            onChange={(e) =>
                                updateProfile('smtpFromName', e.currentTarget.value)
                            }
                        />
                        <Checkbox
                            label={t('profilePage.smtpSecure')}
                            checked={profile.smtpSecure}
                            onChange={(e) =>
                                updateProfile('smtpSecure', e.currentTarget.checked)
                            }
                            mt="xl"
                        />
                    </SimpleGrid>
                </div>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <GhostBtn
                        active
                        onClick={saveProfile}
                        style={{
                            background: 'var(--ink)',
                            color: 'var(--paper)',
                            borderColor: 'var(--ink)',
                        }}
                    >
                        <span>
                            {savingProfile ? t('common.saving', 'Saving…') : t('profilePage.save')}
                        </span>
                    </GhostBtn>
                    <GhostBtn
                        onClick={testSmtp}
                        disabled={!profile.smtpHost || !profile.smtpUser}
                    >
                        <span>
                            {testingSmtp
                                ? t('common.testing', 'Testing…')
                                : t('profilePage.testSmtp')}
                        </span>
                    </GhostBtn>
                </div>
            </SettingsSection>
        </>
    );
}
