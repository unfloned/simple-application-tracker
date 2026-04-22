import { ReactNode } from 'react';
import { Label } from '../primitives/Label';

interface Props {
    label: string;
    subtitle?: string;
    right?: ReactNode;
    children: ReactNode;
}

/**
 * Shared section wrapper for the settings page. Header = mono uppercase Label
 * + optional dimmed subtitle + hairline rule. Keeps each section visually
 * consistent with the rest of the Clean Terminal layout.
 */
export function SettingsSection({ label, subtitle, right, children }: Props) {
    return (
        <section style={{ marginBottom: 28 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    paddingBottom: 8,
                    marginBottom: 16,
                    borderBottom: '1px solid var(--rule)',
                }}
            >
                <Label>{label}</Label>
                {subtitle && (
                    <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{subtitle}</span>
                )}
                <div style={{ flex: 1 }} />
                {right}
            </div>
            <div>{children}</div>
        </section>
    );
}

interface RowProps {
    label: string;
    description?: string;
    children: ReactNode;
}

/**
 * Key / value row used inside a SettingsSection — label on the left, control
 * on the right, optional helper text below the label.
 */
export function SettingsRow({ label, description, children }: RowProps) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(160px, 240px) 1fr',
                gap: 16,
                padding: '10px 0',
                borderBottom: '1px dashed var(--rule)',
                alignItems: 'center',
            }}
        >
            <div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{label}</div>
                {description && (
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--ink-4)',
                            marginTop: 2,
                            lineHeight: 1.35,
                        }}
                    >
                        {description}
                    </div>
                )}
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                {children}
            </div>
        </div>
    );
}

interface HintProps {
    tone?: 'info' | 'ok' | 'warn';
    children: ReactNode;
}

/** Inline hint block — border-left accent rule, no icons, no rounded alerts. */
export function SettingsHint({ tone = 'info', children }: HintProps) {
    const borderColor =
        tone === 'ok' ? 'var(--moss)' : tone === 'warn' ? 'var(--rust)' : 'var(--accent)';
    return (
        <div
            style={{
                padding: '10px 12px',
                background: 'var(--card)',
                border: '1px solid var(--rule)',
                borderLeft: `3px solid ${borderColor}`,
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--ink-2)',
            }}
        >
            {children}
        </div>
    );
}
