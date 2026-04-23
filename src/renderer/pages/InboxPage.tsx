import { Center, Loader, Select, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconCheck,
    IconMailForward,
    IconRefresh,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    ApplicationRecord,
    InboundEmailDto,
    InboundReviewStatus,
} from '../../preload/index';
import type { ApplicationStatus } from '@shared/application';
import { GhostBtn } from '../components/primitives/GhostBtn';
import { Label } from '../components/primitives/Label';

type StatusOption = ApplicationStatus | 'other';

const STATUS_OPTIONS: StatusOption[] = [
    'in_review',
    'interview_scheduled',
    'interviewed',
    'offer_received',
    'rejected',
    'withdrawn',
    'other',
];

interface Props {
    applications: ApplicationRecord[];
    onApplicationUpdated: () => void;
}

export function InboxPage({ applications, onApplicationUpdated }: Props) {
    const { t } = useTranslation();
    const [emails, setEmails] = useState<InboundEmailDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [filter, setFilter] = useState<InboundReviewStatus>('pending');

    const refresh = useCallback(async () => {
        setLoading(true);
        const list = await window.api.inbox.list(filter);
        setEmails(list);
        setLoading(false);
    }, [filter]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const doSync = async () => {
        setSyncing(true);
        const result = await window.api.inbox.sync();
        setSyncing(false);
        if (result.error) {
            notifications.show({
                color: 'red',
                title: t('inbox.syncFailed'),
                message: result.error,
                autoClose: 10000,
            });
        } else {
            notifications.show({
                color: 'green',
                message: t('inbox.syncOk', {
                    fetched: result.fetched,
                    stored: result.stored,
                    classified: result.classified,
                }),
            });
        }
        await refresh();
    };

    return (
        <Stack gap="md">
            <div>
                <Label>{t('inbox.title')}</Label>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        marginTop: 4,
                    }}
                >
                    <span
                        className="serif"
                        style={{
                            fontSize: 28,
                            fontWeight: 500,
                            color: 'var(--ink)',
                            letterSpacing: '-0.02em',
                            lineHeight: 1,
                        }}
                    >
                        {t('inbox.title')}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {t('inbox.subtitle')}
                    </span>
                    <div style={{ flex: 1 }} />
                    <Select
                        size="xs"
                        data={[
                            { value: 'pending', label: t('inbox.filterPending') },
                            { value: 'applied', label: t('inbox.filterApplied') },
                            { value: 'dismissed', label: t('inbox.filterDismissed') },
                        ]}
                        value={filter}
                        onChange={(v) => v && setFilter(v as InboundReviewStatus)}
                        allowDeselect={false}
                    />
                    <GhostBtn onClick={doSync} disabled={syncing}>
                        <IconRefresh size={12} />
                        <span>
                            {syncing ? t('inbox.syncing') : t('inbox.syncNow')}
                        </span>
                    </GhostBtn>
                </div>
            </div>

            {loading ? (
                <Center mih={200}>
                    <Loader />
                </Center>
            ) : emails.length === 0 ? (
                <EmptyInbox filter={filter} />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {emails.map((email) => (
                        <InboundEmailCard
                            key={email.id}
                            email={email}
                            applications={applications}
                            onChanged={async () => {
                                await refresh();
                                onApplicationUpdated();
                            }}
                        />
                    ))}
                </div>
            )}
        </Stack>
    );
}

function EmptyInbox({ filter }: { filter: InboundReviewStatus }) {
    const { t } = useTranslation();
    return (
        <div
            style={{
                padding: 24,
                border: '1px dashed var(--rule-strong)',
                background: 'var(--paper-2)',
                textAlign: 'center',
                color: 'var(--ink-3)',
                fontSize: 13,
            }}
        >
            {filter === 'pending' ? t('inbox.emptyPending') : t('inbox.emptyOther')}
        </div>
    );
}

function InboundEmailCard({
    email,
    applications,
    onChanged,
}: {
    email: InboundEmailDto;
    applications: ApplicationRecord[];
    onChanged: () => void | Promise<void>;
}) {
    const { t } = useTranslation();
    const [applicationId, setApplicationId] = useState<string | null>(
        email.suggestedApplicationId,
    );
    const [status, setStatus] = useState<StatusOption | null>(
        email.suggestedStatus as StatusOption | null,
    );
    const [busy, setBusy] = useState(false);

    const canApply = Boolean(
        applicationId && status && status !== 'other' && email.reviewStatus === 'pending',
    );

    const apply = async () => {
        if (!applicationId || !status || status === 'other') return;
        setBusy(true);
        const result = await window.api.inbox.applySuggestion({
            inboundId: email.id,
            applicationId,
            status,
            note: email.suggestedNote,
        });
        setBusy(false);
        if (result.ok) {
            notifications.show({ color: 'green', message: t('inbox.applied') });
            await onChanged();
        } else {
            notifications.show({
                color: 'red',
                title: t('inbox.applyFailed'),
                message: result.error ?? 'Unknown error',
            });
        }
    };

    const dismiss = async () => {
        setBusy(true);
        await window.api.inbox.dismiss(email.id);
        setBusy(false);
        await onChanged();
    };

    const appOptions = useMemo(
        () =>
            applications.map((a) => ({
                value: a.id,
                label: `${a.companyName || '—'} · ${a.jobTitle || a.id.slice(0, 8)}`,
            })),
        [applications],
    );

    const statusOptions = useMemo(
        () =>
            STATUS_OPTIONS.map((s) => ({
                value: s,
                label:
                    s === 'other' ? t('inbox.statusOther') : t(`status.${s}`),
            })),
        [t],
    );

    return (
        <div
            style={{
                padding: '12px 14px',
                background: 'var(--card)',
                border: '1px solid var(--rule)',
                borderLeft: email.confidence >= 70
                    ? '3px solid var(--moss)'
                    : email.confidence >= 40
                      ? '3px solid var(--accent)'
                      : '3px solid var(--rule-strong)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: 'var(--ink-4)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                    }}
                >
                    {new Date(email.receivedAt).toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
                    {email.fromName || email.fromAddress}
                </span>
                <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--ink-4)' }}
                >
                    {email.fromAddress}
                </span>
                <div style={{ flex: 1 }} />
                <span
                    className="mono tnum"
                    style={{
                        fontSize: 10,
                        color: 'var(--ink-3)',
                    }}
                >
                    {t('inbox.confidence', { value: email.confidence })}
                </span>
            </div>

            <div
                style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    marginTop: 6,
                }}
            >
                {email.subject || '(no subject)'}
            </div>

            {email.suggestedNote && (
                <div
                    style={{
                        marginTop: 8,
                        padding: '8px 12px',
                        background: 'var(--paper-2)',
                        borderLeft: '2px solid var(--accent)',
                        fontSize: 12.5,
                        color: 'var(--ink-2)',
                        lineHeight: 1.45,
                    }}
                >
                    {email.suggestedNote}
                </div>
            )}

            <div
                style={{
                    marginTop: 10,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-end',
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ flex: 1, minWidth: 220 }}>
                    <Select
                        size="xs"
                        label={t('inbox.matchApplication')}
                        placeholder={t('inbox.matchApplicationPlaceholder')}
                        data={appOptions}
                        value={applicationId}
                        onChange={(v) => {
                            setApplicationId(v);
                            void window.api.inbox.reassign({
                                inboundId: email.id,
                                applicationId: v,
                                status,
                            });
                        }}
                        searchable
                        clearable
                    />
                </div>
                <div style={{ width: 200 }}>
                    <Select
                        size="xs"
                        label={t('inbox.statusLabel')}
                        data={statusOptions}
                        value={status}
                        onChange={(v) => {
                            const next = (v as StatusOption | null) ?? null;
                            setStatus(next);
                            void window.api.inbox.reassign({
                                inboundId: email.id,
                                applicationId,
                                status: next,
                            });
                        }}
                    />
                </div>
                <GhostBtn
                    active
                    onClick={apply}
                    disabled={!canApply || busy}
                    style={{
                        background: 'var(--ink)',
                        color: 'var(--paper)',
                        borderColor: 'var(--ink)',
                    }}
                >
                    <IconCheck size={12} />
                    <span>{t('inbox.applySuggestion')}</span>
                </GhostBtn>
                <GhostBtn onClick={dismiss} disabled={busy}>
                    <IconX size={12} />
                    <span>{t('inbox.dismiss')}</span>
                </GhostBtn>
                {email.reviewStatus !== 'pending' && (
                    <span
                        className="mono"
                        style={{
                            fontSize: 10,
                            color: 'var(--ink-4)',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                        }}
                    >
                        <IconMailForward size={10} style={{ verticalAlign: 'text-bottom' }} />
                        {' '}
                        {email.reviewStatus === 'applied'
                            ? t('inbox.reviewApplied')
                            : t('inbox.reviewDismissed')}
                    </span>
                )}
            </div>
        </div>
    );
}
