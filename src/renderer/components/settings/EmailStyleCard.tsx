import { Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserProfileDto } from '../../../preload/index';
import { GhostBtn } from '../primitives/GhostBtn';
import { SettingsHint, SettingsSection } from './SettingsSection';

/**
 * Writing instructions that are passed to the LLM when drafting cover emails.
 * Kept separate from the SMTP section so it's discoverable even when SMTP is
 * collapsed into "already configured".
 */
export function EmailStyleCard() {
    const { t } = useTranslation();
    const [profile, setProfile] = useState<UserProfileDto | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        window.api.profile.get().then(setProfile);
    }, []);

    const update = (value: string) =>
        setProfile((prev) => (prev ? { ...prev, emailInstruction: value } : prev));

    const save = async () => {
        if (!profile) return;
        setSaving(true);
        const next = await window.api.profile.set({ emailInstruction: profile.emailInstruction });
        setProfile(next);
        setSaving(false);
        notifications.show({ color: 'green', message: t('profilePage.saved') });
    };

    if (!profile) return null;

    return (
        <SettingsSection label={t('emailStyle.section', 'Email-Stil')}>
            <div style={{ marginBottom: 12 }}>
                <SettingsHint>
                    {t(
                        'emailStyle.hint',
                        'Zusatzanweisung für den LLM-Entwurf. Tonfall, Länge, Do/Don\'ts. Wird bei jedem Entwurf mitgeschickt.',
                    )}
                </SettingsHint>
            </div>
            <Textarea
                label={t('emailStyle.label', 'Instruktion')}
                placeholder={t(
                    'emailStyle.placeholder',
                    'z.B. "Locker, nicht förmlich. Kein Buzzword-Bingo. Max. 4 Sätze im Hauptteil. Ich habe 6 Jahre Fullstack-Erfahrung."',
                )}
                autosize
                minRows={4}
                maxRows={10}
                value={profile.emailInstruction}
                onChange={(e) => update(e.currentTarget.value)}
            />
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
                    <span>{saving ? t('common.saving', 'Saving…') : t('profilePage.save')}</span>
                </GhostBtn>
            </div>
        </SettingsSection>
    );
}
