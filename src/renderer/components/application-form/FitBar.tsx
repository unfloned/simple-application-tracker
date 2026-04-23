import { ActionIcon, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh, IconTargetArrow } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MatchScore } from '../primitives/MatchScore';
import type { ApplicationForm } from './types';
import { scoreColor } from './utils';

const REASON_COLLAPSED_LEN = 160;

/**
 * Compact fit indicator at the top of the form drawer. Mirrors the candidate
 * drawer's treatment: match bar + short verdict, with expand-on-demand for the
 * full reason and a single icon button to re-run the check. Stays visible at
 * the top so the match context never gets hidden behind an accordion.
 */
export function FitBar({ form }: { form: ApplicationForm }) {
    const { t } = useTranslation();
    const [assessing, setAssessing] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const doAssessFit = async () => {
        setAssessing(true);
        try {
            const result = await window.api.llm.assessFit(form.values);
            form.setFieldValue('matchScore', result.score);
            form.setFieldValue('matchReason', result.reason);
            notifications.show({
                color: scoreColor(result.score),
                title: t('form.fitCheckTitle', { score: result.score }),
                message: result.reason,
                icon: <IconTargetArrow size={16} />,
                autoClose: 8000,
            });
        } catch (err) {
            notifications.show({
                color: 'red',
                title: t('notifications.fitCheckFailed'),
                message: (err as Error).message,
                autoClose: 8000,
            });
        } finally {
            setAssessing(false);
        }
    };

    const hasScore = form.values.matchScore > 0;
    const reason = form.values.matchReason || '';
    const reasonNeedsToggle = reason.length > REASON_COLLAPSED_LEN;
    const reasonShown = expanded || !reasonNeedsToggle
        ? reason
        : reason.slice(0, REASON_COLLAPSED_LEN).trimEnd() + '…';
    const disabled = !form.values.companyName && !form.values.jobTitle;

    return (
        <div
            style={{
                padding: '8px 14px',
                background: 'var(--paper-2)',
                border: '1px solid var(--rule)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    flex: 1,
                    minWidth: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                        className="mono"
                        style={{
                            fontSize: 10,
                            color: 'var(--ink-4)',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                        }}
                    >
                        {t('form.fitCheck')}
                    </span>
                    {hasScore ? (
                        <MatchScore value={form.values.matchScore} width={60} showValue />
                    ) : (
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                            {t('form.fitCheckPending')}
                        </span>
                    )}
                </div>
                {hasScore && reason && (
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                        {reasonShown}
                        {reasonNeedsToggle && (
                            <button
                                type="button"
                                onClick={() => setExpanded((v) => !v)}
                                style={{
                                    marginLeft: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    fontSize: 11,
                                    color: 'var(--accent-ink)',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--f-ui)',
                                }}
                            >
                                {expanded
                                    ? t('candidates.showLess')
                                    : t('candidates.showMore')}
                            </button>
                        )}
                    </div>
                )}
            </div>
            <Tooltip
                label={hasScore ? t('form.fitCheckRerun') : t('form.runFitCheck')}
            >
                <ActionIcon
                    variant="subtle"
                    size="md"
                    onClick={doAssessFit}
                    loading={assessing}
                    disabled={disabled}
                    aria-label={t('form.runFitCheck')}
                >
                    {hasScore ? (
                        <IconRefresh size={16} />
                    ) : (
                        <IconTargetArrow size={16} />
                    )}
                </ActionIcon>
            </Tooltip>
        </div>
    );
}
