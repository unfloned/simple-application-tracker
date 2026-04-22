import { Checkbox, Drawer, ScrollArea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RichTextNotes } from './RichTextNotes';
import { GhostBtn } from './primitives/GhostBtn';
import { Kbd } from './primitives/Kbd';
import { Label } from './primitives/Label';
import type { ApplicationRecord } from '../../preload/index';

interface Props {
    opened: boolean;
    onClose: () => void;
    application: ApplicationRecord | null;
    /** When true: after successful send, set application status to 'applied'. */
    autoMarkApplied?: boolean;
    /** When true: auto-trigger the LLM draft once on open. */
    autoDraft?: boolean;
    /** Called after send succeeds — parent can refresh, clear selection, etc. */
    onSent?: () => void;
}

function renderTemplate(raw: string, vars: Record<string, string>): string {
    return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

const DEFAULT_TEMPLATE = `<p>Guten Tag{{greeting}},</p>
<p>ich möchte mich auf die Position <b>{{jobTitle}}</b> bei <b>{{company}}</b> bewerben.</p>
<p>Im Anhang finden Sie meinen Lebenslauf. Ich freue mich auf Ihre Rückmeldung.</p>
<p>Mit freundlichen Grüßen<br/>{{name}}</p>
{{signature}}`;

type Mode = 'edit' | 'preview';

export function EmailSendDialog({
    opened,
    onClose,
    application,
    autoMarkApplied = false,
    autoDraft = false,
    onSent,
}: Props) {
    const { t } = useTranslation();
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachCv, setAttachCv] = useState(true);
    const [sending, setSending] = useState(false);
    const [drafting, setDrafting] = useState(false);
    const [smtpOk, setSmtpOk] = useState<boolean | null>(null);
    const [profileSet, setProfileSet] = useState<boolean | null>(null);
    const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
    const [mode, setMode] = useState<Mode>('edit');
    const [fromAddress, setFromAddress] = useState('');
    const [fromName, setFromName] = useState('');
    const [autoDraftDone, setAutoDraftDone] = useState(false);

    useEffect(() => {
        if (!opened || !application) return;
        setMode('edit');
        setAutoDraftDone(false);
        window.api.profile.get().then((p) => {
            const configured = Boolean(p.smtpHost && p.smtpUser);
            setProfileSet(configured);
            setFromAddress(p.smtpUser || p.email || '');
            setFromName(p.smtpFromName || p.fullName || '');

            const vars: Record<string, string> = {
                company: application.companyName || '',
                jobTitle: application.jobTitle || '',
                contactName: application.contactName || '',
                greeting: application.contactName ? ` ${application.contactName}` : '',
                name: p.fullName || '',
                signature: p.signature ? `<p>${p.signature.replace(/\n/g, '<br/>')}</p>` : '',
            };

            setTo(application.contactEmail || '');
            setSubject(
                `Bewerbung: ${application.jobTitle || ''}${
                    application.companyName ? ' - ' + application.companyName : ''
                }`.trim(),
            );
            setBody(renderTemplate(DEFAULT_TEMPLATE, vars));
            setAttachCv(Boolean(p.cvPath));
        });
        window.api.email
            .verify()
            .then((r) => setSmtpOk(r.ok))
            .catch(() => setSmtpOk(false));
        window.api.llm
            .status()
            .then((s) => setOllamaRunning(s.running))
            .catch(() => setOllamaRunning(false));
    }, [opened, application]);

    // Kick off an LLM draft automatically once Ollama is confirmed running.
    useEffect(() => {
        if (!opened || !autoDraft || autoDraftDone) return;
        if (ollamaRunning !== true) return;
        setAutoDraftDone(true);
        draft();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, autoDraft, autoDraftDone, ollamaRunning]);

    const draft = async () => {
        if (!application) return;
        setDrafting(true);
        try {
            const result = await window.api.llm.draftEmail(application.id);
            if (result.subject) setSubject(result.subject);
            if (result.body) setBody(result.body);
            notifications.show({ color: 'green', message: t('email.draftOk', 'Entwurf erstellt') });
            setMode('preview');
        } catch (err) {
            notifications.show({
                color: 'red',
                title: t('email.draftFailed', 'Entwurf fehlgeschlagen'),
                message: (err as Error).message,
                autoClose: 10000,
            });
        } finally {
            setDrafting(false);
        }
    };

    const send = async () => {
        if (!application) return;
        setSending(true);
        const result = await window.api.email.send({
            to,
            subject,
            body,
            attachCv,
            applicationId: application.id,
        });
        if (!result.ok) {
            setSending(false);
            notifications.show({
                color: 'red',
                title: t('email.sendFailed'),
                message: result.error ?? 'Unknown error',
                autoClose: 10000,
            });
            return;
        }

        if (autoMarkApplied && application.status !== 'applied') {
            try {
                await window.api.applications.update(application.id, {
                    status: 'applied',
                    appliedAt: new Date(),
                });
            } catch {
                // non-fatal, email is out
            }
        }

        setSending(false);
        notifications.show({ color: 'green', message: t('email.sentOk') });
        onSent?.();
        onClose();
    };

    const canSend = Boolean(to && subject && profileSet && smtpOk !== false);

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            withCloseButton={false}
            position="right"
            size="lg"
            padding={0}
            scrollAreaComponent={ScrollArea.Autosize}
            overlayProps={{ backgroundOpacity: 0.3, blur: 2 }}
            styles={{
                content: { display: 'flex', flexDirection: 'column' },
                body: {
                    padding: 0,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                },
            }}
        >
            {/* header */}
            <div
                style={{
                    padding: '18px 22px 14px',
                    borderBottom: '1px solid var(--rule)',
                    background: 'var(--paper)',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                    }}
                >
                    <Label>{t('email.title', 'Email entwerfen')}</Label>
                    <div style={{ flex: 1 }} />
                    {/* mode toggle */}
                    <div
                        style={{
                            display: 'inline-flex',
                            border: '1px solid var(--rule-strong)',
                            borderRadius: 4,
                            overflow: 'hidden',
                        }}
                    >
                        {(['edit', 'preview'] as Mode[]).map((m, i) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: 11,
                                    fontWeight: mode === m ? 600 : 500,
                                    fontFamily: 'var(--f-ui)',
                                    color: mode === m ? 'var(--ink)' : 'var(--ink-3)',
                                    background: mode === m ? 'var(--paper-2)' : 'var(--card)',
                                    border: 'none',
                                    borderRight:
                                        i < 1 ? '1px solid var(--rule-strong)' : 'none',
                                    cursor: 'pointer',
                                    textTransform: 'capitalize',
                                }}
                            >
                                {m === 'edit'
                                    ? t('email.modeEdit', 'Entwurf')
                                    : t('email.modePreview', 'Vorschau')}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: 22,
                            height: 22,
                            border: '1px solid var(--rule)',
                            background: 'var(--card)',
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            cursor: 'pointer',
                            borderRadius: 3,
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div
                    className="serif"
                    style={{
                        fontSize: 22,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        letterSpacing: '-0.015em',
                        lineHeight: 1.15,
                    }}
                >
                    {application?.jobTitle || t('email.genericSubject', 'Bewerbung')}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>
                    {application?.companyName || '—'}
                </div>

                {/* status hints */}
                {profileSet === false && (
                    <div
                        style={{
                            marginTop: 12,
                            padding: '8px 12px',
                            background: 'var(--card)',
                            border: '1px solid var(--rule)',
                            borderLeft: '3px solid var(--rust)',
                            fontSize: 12,
                            color: 'var(--ink-2)',
                        }}
                    >
                        {t('email.smtpNotConfigured')}
                    </div>
                )}
                {profileSet === true && smtpOk === false && (
                    <div
                        style={{
                            marginTop: 12,
                            padding: '8px 12px',
                            background: 'var(--card)',
                            border: '1px solid var(--rule)',
                            borderLeft: '3px solid var(--rust)',
                            fontSize: 12,
                            color: 'var(--ink-2)',
                        }}
                    >
                        {t('email.smtpVerifyFailed')}
                    </div>
                )}
            </div>

            {/* body: edit vs preview */}
            <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
                {mode === 'edit' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <TextInput
                            label={t('email.to')}
                            placeholder="contact@company.com"
                            value={to}
                            onChange={(e) => setTo(e.currentTarget.value)}
                        />
                        <TextInput
                            label={t('email.subject')}
                            value={subject}
                            onChange={(e) => setSubject(e.currentTarget.value)}
                        />
                        <div>
                            <Label>{t('email.body')}</Label>
                            <div style={{ marginTop: 6 }}>
                                <RichTextNotes
                                    value={body}
                                    onChange={setBody}
                                    minHeight={260}
                                    placeholder={t('email.bodyPlaceholder')}
                                />
                            </div>
                        </div>
                        <Checkbox
                            label={t('email.attachCv')}
                            checked={attachCv}
                            onChange={(e) => setAttachCv(e.currentTarget.checked)}
                        />
                    </div>
                ) : (
                    <EmailPreview
                        fromAddress={fromAddress}
                        fromName={fromName}
                        to={to}
                        subject={subject}
                        body={body}
                        attachCv={attachCv}
                    />
                )}
            </div>

            {/* footer */}
            <div
                style={{
                    display: 'flex',
                    gap: 6,
                    padding: 12,
                    borderTop: '1px solid var(--rule)',
                    background: 'var(--paper-2)',
                    flexShrink: 0,
                }}
            >
                {ollamaRunning && (
                    <GhostBtn onClick={draft} disabled={drafting}>
                        <span>
                            {drafting
                                ? t('email.drafting', 'Entwurf läuft…')
                                : t('email.draft', 'LLM-Entwurf')}
                        </span>
                        <Kbd>⌘D</Kbd>
                    </GhostBtn>
                )}
                <div style={{ flex: 1 }} />
                <GhostBtn onClick={onClose} disabled={sending}>
                    <span>{t('common.cancel')}</span>
                </GhostBtn>
                <GhostBtn
                    active
                    onClick={send}
                    disabled={!canSend || sending}
                    style={{
                        background: canSend ? 'var(--ink)' : 'var(--paper-2)',
                        color: canSend ? 'var(--paper)' : 'var(--ink-4)',
                        borderColor: canSend ? 'var(--ink)' : 'var(--rule)',
                    }}
                >
                    <span>{sending ? t('email.sending', 'Sendet…') : t('email.send')}</span>
                    <Kbd tone={canSend ? 'dark' : 'light'}>⇧⌘↵</Kbd>
                </GhostBtn>
            </div>
        </Drawer>
    );
}

interface PreviewProps {
    fromAddress: string;
    fromName: string;
    to: string;
    subject: string;
    body: string;
    attachCv: boolean;
}

function EmailPreview({ fromAddress, fromName, to, subject, body, attachCv }: PreviewProps) {
    const { t } = useTranslation();
    return (
        <div
            style={{
                border: '1px solid var(--rule-strong)',
                background: 'var(--card)',
            }}
        >
            {/* envelope header */}
            <div
                style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--rule)',
                    background: 'var(--paper-2)',
                    display: 'grid',
                    gridTemplateColumns: '70px 1fr',
                    columnGap: 12,
                    rowGap: 6,
                    fontSize: 12,
                }}
            >
                <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.1em' }}>
                    FROM
                </span>
                <span style={{ color: 'var(--ink-2)' }}>
                    {fromName ? `${fromName} <${fromAddress}>` : fromAddress || '—'}
                </span>
                <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.1em' }}>
                    TO
                </span>
                <span style={{ color: 'var(--ink-2)' }}>{to || '—'}</span>
                <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.1em' }}>
                    SUBJECT
                </span>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{subject || '—'}</span>
                {attachCv && (
                    <>
                        <span
                            className="mono"
                            style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.1em' }}
                        >
                            ATTACH
                        </span>
                        <span
                            className="mono"
                            style={{ color: 'var(--ink-3)', fontSize: 11 }}
                        >
                            {t('email.attachCv')} (CV)
                        </span>
                    </>
                )}
            </div>
            {/* rendered body */}
            <div
                style={{
                    padding: '18px 22px',
                    fontFamily: 'var(--f-ui)',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--ink)',
                    minHeight: 200,
                }}
                dangerouslySetInnerHTML={{ __html: body || '<p>—</p>' }}
            />
        </div>
    );
}
