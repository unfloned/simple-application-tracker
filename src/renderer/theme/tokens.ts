/**
 * Pitch Tracker — Clean Terminal design tokens.
 *
 * Philosophy: neutral cool grays, near-black ink, Geist sans everywhere,
 * marigold as the single signal accent. No gradients, no neon.
 */

export const neutral = {
    paper:      '#f7f7f8',
    paper2:     '#efeff1',
    paper3:     '#e3e3e6',
    card:       '#fcfcfd',
    ink:        '#09090b',
    ink2:       '#1f1f23',
    ink3:       '#52525b',
    ink4:       '#8a8a92',
    rule:       '#d4d4d8',
    ruleStrong: '#a1a1aa',
    rowHover:   '#ebebed',
    windowBg:   '#dcdce0',
} as const;

export const signal = {
    marigold:  'oklch(0.78 0.15 72)',
    accentInk: 'oklch(0.36 0.10 60)',
    rust:      'oklch(0.55 0.15 30)',
    moss:      'oklch(0.58 0.09 148)',
    sky:       'oklch(0.62 0.10 230)',
} as const;

export const fonts = {
    display: '"Geist", -apple-system, system-ui, sans-serif',
    ui:      '"Geist", -apple-system, system-ui, sans-serif',
    mono:    '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
} as const;

/** CSS-var names. Use these in inline styles to ensure live-token updates. */
export const vars = {
    paper:      'var(--paper)',
    paper2:     'var(--paper-2)',
    paper3:     'var(--paper-3)',
    card:       'var(--card)',
    ink:        'var(--ink)',
    ink2:       'var(--ink-2)',
    ink3:       'var(--ink-3)',
    ink4:       'var(--ink-4)',
    rule:       'var(--rule)',
    ruleStrong: 'var(--rule-strong)',
    rowHover:   'var(--row-hover)',
    accent:     'var(--accent)',
    accentInk:  'var(--accent-ink)',
    rust:       'var(--rust)',
    moss:       'var(--moss)',
    sky:        'var(--sky)',
    fDisplay:   'var(--f-display)',
    fUi:        'var(--f-ui)',
    fMono:      'var(--f-mono)',
} as const;
