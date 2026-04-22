import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApplicationRecord, ApplicationEvent, SentEmailRecord } from '../../preload/index';
import type { ApplicationStatus } from '@shared/application';
import { STATUS_LABEL } from '@shared/application';
import { EmailSendDialog } from './EmailSendDialog';
import { GhostBtn } from './primitives/GhostBtn';
import { Kbd } from './primitives/Kbd';
import { Label } from './primitives/Label';
import { StageGlyph } from './primitives/StageGlyph';

const PROGRESS_STAGES: ApplicationStatus[] = [
    'draft',
    'applied',
    'in_review',
    'interview_scheduled',
    'offer_received',
];

const STAGE_SHORT_LABEL: Record<ApplicationStatus, string> = {
    draft: 'Draft',
    applied: 'Applied',
    in_review: 'Review',
    interview_scheduled: 'Interview',
    interviewed: 'Interview',
    offer_received: 'Offer',
    accepted: 'Accepted',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
};

function stageIndex(status: ApplicationStatus): number {
    const map: Partial<Record<ApplicationStatus, number>> = {
        draft: 0,
        applied: 1,
        in_review: 2,
        interview_scheduled: 3,
        interviewed: 3,
        offer_received: 4,
        accepted: 4,
    };
    return map[status] ?? -1;
}

function initialsFor(name: string): string {
    if (!name) return '?';
    const clean = name.replace(/\s+(GmbH|AG|SE|Ltd|LLC|Inc\.?)$/i, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function formatSalary(min: number, max: number, currency: string): string {
    if (!min && !max) return '—';
    const c = currency || 'EUR';
    const sym = c === 'EUR' ? '€' : c + ' ';
    if (min && max) return `${sym}${(min / 1000).toFixed(0)}–${(max / 1000).toFixed(0)}k`;
    return `${sym}${((min || max) / 1000).toFixed(0)}k`;
}

function formatDateShort(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
}

function formatEventTime(iso: string): string {
    const d = new Date(iso);
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${days[d.getDay()]} · ${hh}:${mm}`;
}

function stripHtmlSnippet(html: string, max = 140): string {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max).trim() + '…' : text;
}

function splitStack(stack: string): string[] {
    if (!stack) return [];
    return stack
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function priorityLabel(p: string, t: (k: string) => string): string {
    return t(`priority.${p}`) || p.toUpperCase();
}

function remoteLabel(r: string, t: (k: string) => string): string {
    return t(`remote.${r}`) || r;
}

interface StageProgressProps {
    status: ApplicationStatus;
}

function StageProgress({ status }: StageProgressProps) {
    const idx = stageIndex(status);

    // Terminal states get a single-row summary instead of the 5-step bar.
    if (status === 'rejected' || status === 'withdrawn') {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: 'var(--paper-2)',
                    border: '1px solid var(--rule)',
                }}
            >
                <StageGlyph status={status} size={12} />
                <span
                    className="mono"
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--ink-2)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                    }}
                >
                    {STAGE_SHORT_LABEL[status]}
                </span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 2, width: '100%' }}>
            {PROGRESS_STAGES.map((s, i) => {
                const done = i < idx;
                const active = i === idx;
                return (
                    <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div
                            style={{
                                height: 4,
                                background: done
                                    ? 'var(--ink-2)'
                                    : active
                                      ? 'var(--accent)'
                                      : 'var(--paper-3)',
                            }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StageGlyph status={s} size={9} />
                            <span
                                className="mono"
                                style={{
                                    fontSize: 9.5,
                                    fontWeight: active ? 700 : 500,
                                    color: active
                                        ? 'var(--ink)'
                                        : done
                                          ? 'var(--ink-3)'
                                          : 'var(--ink-4)',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {STAGE_SHORT_LABEL[s]}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface TimelineProps {
    events: ApplicationEvent[];
    createdAt: string;
}

function Timeline({ events, createdAt }: TimelineProps) {
    const { t } = useTranslation();

    // Show newest first. If no events stored, at least show "created" as a point.
    const rows =
        events.length > 0
            ? [...events].sort((a, b) =>
                  new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
              )
            : [];

    if (rows.length === 0) {
        return (
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '64px 16px 1fr',
                    gap: 8,
                    padding: '10px 0',
                    alignItems: 'flex-start',
                }}
            >
                <div
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        lineHeight: 1.3,
                        textAlign: 'right',
                        paddingRight: 4,
                    }}
                >
                    <div style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
                        {formatDateShort(createdAt)}
                    </div>
                    <div style={{ fontSize: 9, marginTop: 1 }}>{formatEventTime(createdAt)}</div>
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        paddingTop: 4,
                    }}
                >
                    <div
                        style={{
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            background: 'var(--card)',
                            border: '1.5px solid var(--ink-3)',
                        }}
                    />
                </div>
                <div
                    style={{
                        fontSize: 12.5,
                        color: 'var(--ink-2)',
                        fontWeight: 400,
                        lineHeight: 1.4,
                    }}
                >
                    {t('detail.timeline.created', 'Created')}
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative' }}>
            <div
                style={{
                    position: 'absolute',
                    left: 68,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: 'var(--rule)',
                }}
            />
            {rows.map((e, i) => {
                const isLatest = i === 0;
                return (
                    <div
                        key={e.id}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '64px 16px 1fr',
                            gap: 8,
                            padding: '10px 0',
                            alignItems: 'flex-start',
                            position: 'relative',
                        }}
                    >
                        <div
                            className="mono"
                            style={{
                                fontSize: 10,
                                color: 'var(--ink-3)',
                                lineHeight: 1.3,
                                textAlign: 'right',
                                paddingRight: 4,
                            }}
                        >
                            <div
                                style={{
                                    color: isLatest ? 'var(--accent-ink)' : 'var(--ink-2)',
                                    fontWeight: 600,
                                }}
                            >
                                {formatDateShort(e.changedAt)}
                            </div>
                            <div style={{ fontSize: 9, marginTop: 1 }}>
                                {formatEventTime(e.changedAt)}
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                paddingTop: 4,
                                position: 'relative',
                                zIndex: 1,
                            }}
                        >
                            <div
                                style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: isLatest ? 0 : '50%',
                                    background: isLatest ? 'var(--accent)' : 'var(--card)',
                                    border:
                                        '1.5px solid ' +
                                        (isLatest ? 'var(--accent)' : 'var(--ink-3)'),
                                    transform: isLatest ? 'rotate(45deg)' : 'none',
                                }}
                            />
                        </div>
                        <div
                            style={{
                                fontSize: 12.5,
                                color: isLatest ? 'var(--ink)' : 'var(--ink-2)',
                                fontWeight: isLatest ? 600 : 400,
                                lineHeight: 1.4,
                                paddingBottom: 2,
                            }}
                        >
                            {e.fromStatus
                                ? t('detail.timeline.transition', {
                                      from: STATUS_LABEL[e.fromStatus],
                                      to: STATUS_LABEL[e.toStatus],
                                      defaultValue: `${STATUS_LABEL[e.fromStatus]} → ${STATUS_LABEL[e.toStatus]}`,
                                  })
                                : STATUS_LABEL[e.toStatus]}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function EmailHistoryRow({
    email,
    isLast,
    expanded,
    onToggle,
}: {
    email: SentEmailRecord;
    isLast: boolean;
    expanded: boolean;
    onToggle: () => void;
}) {
    const date = new Date(email.sentAt);
    const stamp = `${formatDateShort(email.sentAt)} · ${formatEventTime(email.sentAt)}`;
    const failed = email.status !== 'ok';
    return (
        <div
            style={{
                borderBottom: isLast ? 'none' : '1px solid var(--rule)',
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '10px 130px 1fr 16px',
                    columnGap: 12,
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                }}
            >
                <div
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: failed ? 'var(--rust)' : 'var(--moss)',
                    }}
                />
                <span
                    className="mono"
                    style={{
                        fontSize: 10.5,
                        color: 'var(--ink-3)',
                        letterSpacing: '0.04em',
                    }}
                >
                    {stamp}
                </span>
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 13,
                            color: 'var(--ink)',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {email.subject || '—'}
                    </div>
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: 2,
                        }}
                    >
                        {email.toAddress} · {stripHtmlSnippet(email.body, 80)}
                    </div>
                </div>
                <span
                    style={{
                        color: 'var(--ink-4)',
                        fontSize: 11,
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 120ms',
                    }}
                >
                    ›
                </span>
            </button>
            {expanded && (
                <div
                    style={{
                        padding: '12px 20px 18px',
                        borderTop: '1px dashed var(--rule)',
                        background: 'var(--paper)',
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--ink-4)',
                            marginBottom: 8,
                            fontFamily: 'var(--f-mono)',
                            letterSpacing: '0.04em',
                        }}
                    >
                        {date.toLocaleString()}
                    </div>
                    <div
                        style={{
                            fontSize: 13.5,
                            color: 'var(--ink)',
                            lineHeight: 1.55,
                        }}
                        dangerouslySetInnerHTML={{ __html: email.body }}
                    />
                </div>
            )}
        </div>
    );
}

interface Props {
    app: ApplicationRecord;
    onEdit: (app: ApplicationRecord) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

export function ApplicationDetail({ app, onEdit, onDelete, onClose }: Props) {
    const { t } = useTranslation();
    const [events, setEvents] = useState<ApplicationEvent[]>([]);
    const [emails, setEmails] = useState<SentEmailRecord[]>([]);
    const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [autoApplyMode, setAutoApplyMode] = useState(false);

    const reloadEmails = () => {
        window.api.email
            .listForApp(app.id)
            .then((list) => setEmails(list))
            .catch(() => setEmails([]));
    };

    useEffect(() => {
        let cancelled = false;
        window.api.applications.events
            .forApp(app.id)
            .then((list) => {
                if (!cancelled) setEvents(list);
            })
            .catch(() => {
                if (!cancelled) setEvents([]);
            });
        window.api.email
            .listForApp(app.id)
            .then((list) => {
                if (!cancelled) setEmails(list);
            })
            .catch(() => {
                if (!cancelled) setEmails([]);
            });
        return () => {
            cancelled = true;
        };
    }, [app.id]);

    const idShort = (app.id?.slice(0, 8) || '').toUpperCase();
    const initials = initialsFor(app.companyName || app.jobTitle || 'X');
    const stackItems = splitStack(app.stack).slice(0, 3);

    const showNextStep = app.status === 'offer_received' || app.status === 'draft';
    const nextStepText =
        app.status === 'offer_received'
            ? t('detail.next.offer', 'Review offer and respond')
            : t('detail.next.draft', 'Finish draft and submit');
    const nextStepKbd = app.status === 'offer_received' ? '⇧⌘A' : '⌘L';

    const hasMatch = app.matchScore > 0;
    const hasExcerpt = (app.jobDescription || '').trim().length > 0;

    return (
        <div
            style={{
                width: 520,
                minWidth: 520,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--paper)',
                borderLeft: '1px solid var(--rule-strong)',
                minHeight: 0,
            }}
        >
            {/* header */}
            <div
                style={{
                    padding: '18px 22px 14px',
                    borderBottom: '1px solid var(--rule)',
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
                    <span
                        className="mono"
                        style={{
                            fontSize: 10.5,
                            color: 'var(--ink-3)',
                            letterSpacing: '0.08em',
                        }}
                    >
                        {idShort || '—'}
                    </span>
                    <div style={{ width: 1, height: 10, background: 'var(--rule-strong)' }} />
                    <span
                        className="mono"
                        style={{
                            fontSize: 10,
                            color: 'var(--ink-4)',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                        }}
                    >
                        {app.source || 'direct'}
                    </span>
                    <div style={{ flex: 1 }} />
                    <GhostBtn onClick={() => onEdit(app)}>
                        <span>{t('common.edit', 'Edit')}</span>
                        <Kbd>⌘.</Kbd>
                    </GhostBtn>
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
                        aria-label={t('common.close', 'Close')}
                    >
                        ✕
                    </button>
                </div>

                <div
                    className="serif"
                    style={{
                        fontSize: 26,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        letterSpacing: '-0.015em',
                        lineHeight: 1.1,
                    }}
                >
                    {app.jobTitle || t('applications.table.noTitle', 'Untitled role')}
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 6,
                    }}
                >
                    <div
                        style={{
                            width: 20,
                            height: 20,
                            background: 'var(--card)',
                            border: '1px solid var(--rule-strong)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <span className="mono" style={{ fontSize: 9, fontWeight: 600 }}>
                            {initials}
                        </span>
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: 500 }}>
                        {app.companyName || t('applications.table.noCompany', '—')}
                    </span>
                    {app.remote && (
                        <>
                            <span style={{ color: 'var(--ink-4)' }}>·</span>
                            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                                {remoteLabel(app.remote, t)}
                                {app.location ? ` · ${app.location}` : ''}
                            </span>
                        </>
                    )}
                </div>

                <div style={{ marginTop: 18 }}>
                    <StageProgress status={app.status} />
                </div>

                {showNextStep && (
                    <div
                        style={{
                            marginTop: 16,
                            padding: '10px 12px',
                            background: 'var(--accent)',
                            color: 'var(--ink)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                        }}
                    >
                        <span style={{ fontSize: 14 }}>◆</span>
                        <div style={{ flex: 1 }}>
                            <Label color="var(--accent-ink)">{t('detail.next.label', 'Next')}</Label>
                            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 1 }}>
                                {nextStepText}
                            </div>
                        </div>
                        <Kbd tone="dark">{nextStepKbd}</Kbd>
                    </div>
                )}
            </div>

            {/* body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
                {/* facts grid */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 0,
                        background: 'var(--card)',
                        border: '1px solid var(--rule)',
                    }}
                >
                    {[
                        {
                            label: t('detail.facts.salary', 'Salary'),
                            value: formatSalary(app.salaryMin, app.salaryMax, app.salaryCurrency),
                            mono: true,
                        },
                        {
                            label: t('detail.facts.match', 'Match'),
                            value: hasMatch ? `${app.matchScore} / 100` : '—',
                            mono: true,
                        },
                        {
                            label: t('detail.facts.applied', 'Applied'),
                            value: formatDateShort(app.appliedAt),
                            mono: true,
                        },
                        {
                            label: t('detail.facts.stack', 'Stack'),
                            value: stackItems.length > 0 ? stackItems.join(' · ') : '—',
                            mono: false,
                        },
                        {
                            label: t('detail.facts.contact', 'Contact'),
                            value: app.contactName || '—',
                            mono: false,
                        },
                        {
                            label: t('detail.facts.priority', 'Priority'),
                            value: priorityLabel(app.priority, t),
                            mono: false,
                        },
                    ].map((f, i) => (
                        <div
                            key={f.label}
                            style={{
                                padding: '10px 14px',
                                borderRight: i % 2 === 0 ? '1px solid var(--rule)' : 'none',
                                borderBottom: i < 4 ? '1px solid var(--rule)' : 'none',
                            }}
                        >
                            <Label>{f.label}</Label>
                            <div
                                className={f.mono ? 'mono tnum' : ''}
                                style={{
                                    fontSize: 13,
                                    color: 'var(--ink)',
                                    fontWeight: 500,
                                    marginTop: 3,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {f.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* match reason / why */}
                {app.matchReason && (
                    <div
                        style={{
                            marginTop: 22,
                            paddingLeft: 16,
                            borderLeft: '3px solid var(--accent)',
                        }}
                    >
                        <Label>{t('detail.why.label', 'Why this one')}</Label>
                        <p
                            className="serif"
                            style={{
                                fontSize: 15,
                                fontStyle: 'italic',
                                color: 'var(--ink-2)',
                                marginTop: 6,
                                lineHeight: 1.4,
                                marginBottom: 4,
                            }}
                        >
                            {app.matchReason}
                        </p>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                            {t('detail.why.source', '— local fit score')}
                        </span>
                    </div>
                )}

                {/* excerpt from job description */}
                {hasExcerpt && !app.matchReason && (
                    <div
                        style={{
                            marginTop: 22,
                            paddingLeft: 16,
                            borderLeft: '3px solid var(--rule-strong)',
                        }}
                    >
                        <Label>{t('detail.excerpt.label', 'From the posting')}</Label>
                        <p
                            className="serif"
                            style={{
                                fontSize: 14,
                                color: 'var(--ink-2)',
                                marginTop: 6,
                                lineHeight: 1.45,
                                marginBottom: 0,
                                display: '-webkit-box',
                                WebkitLineClamp: 4,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            {app.jobDescription}
                        </p>
                    </div>
                )}

                {/* required profile / benefits when available */}
                {(app.requiredProfile.length > 0 || app.benefits.length > 0) && (
                    <div style={{ marginTop: 22 }}>
                        <Label>{t('detail.profile.label', 'Profile & benefits')}</Label>
                        <div
                            style={{
                                marginTop: 8,
                                display: 'grid',
                                gridTemplateColumns:
                                    app.requiredProfile.length > 0 && app.benefits.length > 0
                                        ? '1fr 1fr'
                                        : '1fr',
                                gap: 12,
                            }}
                        >
                            {app.requiredProfile.length > 0 && (
                                <div
                                    style={{
                                        padding: 10,
                                        background: 'var(--card)',
                                        border: '1px solid var(--rule)',
                                    }}
                                >
                                    <span
                                        className="mono"
                                        style={{
                                            fontSize: 9.5,
                                            color: 'var(--ink-3)',
                                            letterSpacing: '0.1em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {t('detail.profile.required', 'Required')}
                                    </span>
                                    <ul
                                        style={{
                                            margin: '6px 0 0',
                                            padding: 0,
                                            listStyle: 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 3,
                                        }}
                                    >
                                        {app.requiredProfile.slice(0, 6).map((r, i) => (
                                            <li
                                                key={i}
                                                style={{
                                                    fontSize: 12,
                                                    color: 'var(--ink-2)',
                                                    lineHeight: 1.35,
                                                }}
                                            >
                                                · {r}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {app.benefits.length > 0 && (
                                <div
                                    style={{
                                        padding: 10,
                                        background: 'var(--card)',
                                        border: '1px solid var(--rule)',
                                    }}
                                >
                                    <span
                                        className="mono"
                                        style={{
                                            fontSize: 9.5,
                                            color: 'var(--ink-3)',
                                            letterSpacing: '0.1em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {t('detail.profile.benefits', 'Benefits')}
                                    </span>
                                    <ul
                                        style={{
                                            margin: '6px 0 0',
                                            padding: 0,
                                            listStyle: 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 3,
                                        }}
                                    >
                                        {app.benefits.slice(0, 6).map((b, i) => (
                                            <li
                                                key={i}
                                                style={{
                                                    fontSize: 12,
                                                    color: 'var(--ink-2)',
                                                    lineHeight: 1.35,
                                                }}
                                            >
                                                · {b}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* timeline */}
                <div style={{ marginTop: 28 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 6,
                        }}
                    >
                        <Label>{t('detail.timeline.label', 'Timeline')}</Label>
                        <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                    </div>
                    <Timeline events={events} createdAt={app.createdAt} />
                </div>

                {/* sent emails history */}
                {emails.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginBottom: 10,
                            }}
                        >
                            <Label>
                                {t('detail.emails.label', 'Versendet')} · {emails.length}
                            </Label>
                            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                        </div>
                        <div
                            style={{
                                border: '1px solid var(--rule)',
                                background: 'var(--card)',
                            }}
                        >
                            {emails.map((e, i) => (
                                <EmailHistoryRow
                                    key={e.id}
                                    email={e}
                                    isLast={i === emails.length - 1}
                                    expanded={expandedEmailId === e.id}
                                    onToggle={() =>
                                        setExpandedEmailId((prev) =>
                                            prev === e.id ? null : e.id,
                                        )
                                    }
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* notes */}
                {app.notes && app.notes.trim().length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <Label>{t('detail.notes.label', 'Notes')}</Label>
                        <div
                            style={{
                                marginTop: 8,
                                padding: 14,
                                background: 'var(--card)',
                                border: '1px solid var(--rule)',
                                backgroundImage:
                                    'repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.04) 23px, rgba(0,0,0,0.04) 24px)',
                                backgroundPosition: '0 6px',
                                fontFamily: 'var(--f-display)',
                                fontSize: 14,
                                lineHeight: '24px',
                                color: 'var(--ink)',
                            }}
                            // Notes are rich-text HTML from Tiptap; sanitized on entry.
                            dangerouslySetInnerHTML={{ __html: app.notes }}
                        />
                    </div>
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
                    flexWrap: 'wrap',
                }}
            >
                <GhostBtn onClick={() => onEdit(app)}>
                    <span>{t('detail.actions.edit', 'Edit')}</span>
                    <Kbd>⌘.</Kbd>
                </GhostBtn>
                {app.jobUrl && (
                    <GhostBtn onClick={() => window.api.shell.openExternal(app.jobUrl)}>
                        <span>{t('detail.actions.openPosting', 'Open posting')}</span>
                    </GhostBtn>
                )}
                {app.contactEmail && (
                    <GhostBtn
                        active={app.status === 'draft'}
                        onClick={() => {
                            setAutoApplyMode(app.status === 'draft');
                            setEmailDialogOpen(true);
                        }}
                        title={app.contactEmail}
                        style={
                            app.status === 'draft'
                                ? {
                                      background: 'var(--ink)',
                                      color: 'var(--paper)',
                                      borderColor: 'var(--ink)',
                                  }
                                : undefined
                        }
                    >
                        <span>
                            {app.status === 'draft'
                                ? t('detail.actions.apply', 'Bewerben')
                                : t('detail.actions.email', 'Email')}
                        </span>
                        <Kbd tone={app.status === 'draft' ? 'dark' : 'light'}>⌘E</Kbd>
                    </GhostBtn>
                )}
                <div style={{ flex: 1 }} />
                <GhostBtn
                    onClick={() => {
                        if (
                            confirm(
                                t('confirm.deleteApplication', {
                                    name: app.companyName || app.jobTitle || '',
                                }),
                            )
                        ) {
                            onDelete(app.id);
                        }
                    }}
                >
                    <span>{t('common.delete', 'Delete')}</span>
                </GhostBtn>
            </div>

            <EmailSendDialog
                opened={emailDialogOpen}
                onClose={() => setEmailDialogOpen(false)}
                application={app}
                autoMarkApplied={autoApplyMode}
                autoDraft
                onSent={reloadEmails}
            />
        </div>
    );
}
