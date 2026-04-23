import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES, type RoutePath } from '../routes';
import { Kbd } from './primitives/Kbd';
import { Label } from './primitives/Label';

interface NavItem {
    path: RoutePath;
    /** 3-5 char mono icon text in place of vector icons. */
    tag: string;
    labelKey: string;
    count?: number;
    shortcut?: string;
}

interface Props {
    applicationsCount: number;
    candidatesCount: number;
}

function SidebarItem({
    tag,
    label,
    count,
    active,
    shortcut,
    onClick,
}: {
    tag: string;
    label: string;
    count?: number;
    active: boolean;
    shortcut?: string;
    onClick: () => void;
}) {
    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 26,
                padding: '0 10px',
                marginInline: 6,
                borderRadius: 3,
                background: active ? 'var(--paper-3)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
                cursor: 'pointer',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                paddingLeft: active ? 8 : 10,
                transition: 'background 80ms',
            }}
            onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
            }}
        >
            <span
                className="mono"
                style={{
                    width: 38,
                    fontSize: 9.5,
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: active ? 'var(--ink-2)' : 'var(--ink-4)',
                }}
            >
                {tag}
            </span>
            <span
                style={{
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    flex: 1,
                }}
            >
                {label}
            </span>
            {count !== undefined && count > 0 && (
                <span
                    className="mono tnum"
                    style={{
                        fontSize: 10,
                        color: active ? 'var(--ink-2)' : 'var(--ink-3)',
                        fontWeight: 500,
                    }}
                >
                    {count}
                </span>
            )}
            {shortcut && <Kbd>{shortcut}</Kbd>}
        </div>
    );
}

function SidebarGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ padding: '0 14px 4px' }}>
                <Label>{label}</Label>
            </div>
            {children}
        </div>
    );
}

export function Sidebar({ applicationsCount, candidatesCount }: Props) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;
    const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);

    useEffect(() => {
        const check = async () => {
            try {
                const status = await window.api.llm.status();
                setOllamaRunning(status.running);
            } catch {
                setOllamaRunning(false);
            }
        };
        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, []);

    const items: NavItem[] = [
        { path: ROUTES.dashboard,    tag: 'INBOX',  labelKey: 'nav.inbox',           shortcut: '⌘1' },
        { path: ROUTES.applications, tag: 'APPS',   labelKey: 'tabs.applications',   count: applicationsCount,          shortcut: '⌘2' },
        { path: ROUTES.candidates,   tag: 'CAND',   labelKey: 'tabs.candidates',     count: candidatesCount,            shortcut: '⌘3' },
        { path: ROUTES.inbox,        tag: 'MAIL',   labelKey: 'nav.mail',            shortcut: '⌘4' },
        { path: ROUTES.agents,       tag: 'AGENT',  labelKey: 'nav.agents',          shortcut: '⌘5' },
        { path: ROUTES.chat,         tag: 'ASSIST', labelKey: 'nav.chat',            shortcut: '⌘6' },
        { path: ROUTES.analytics,    tag: 'ANLY',   labelKey: 'nav.analytics',       shortcut: '⌘7' },
    ];

    const isActive = (path: string) =>
        currentPath === path || (path === ROUTES.dashboard && currentPath === '/');

    return (
        <div
            style={{
                height: '100%',
                background: 'var(--paper)',
                borderRight: '1px solid var(--rule-strong)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    padding: '14px 16px 10px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span
                        className="serif"
                        style={{
                            fontSize: 20,
                            fontWeight: 600,
                            color: 'var(--ink)',
                            letterSpacing: '-0.01em',
                        }}
                    >
                        {t('app.titleShort')}
                        <span style={{ color: 'var(--accent-ink)' }}>.</span>
                    </span>
                </div>
                <div
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        marginTop: 2,
                        letterSpacing: '0.04em',
                    }}
                >
                    local · offline · yours
                </div>
            </div>

            <SidebarGroup label={t('nav.section.main')}>
                {items.map((item) => (
                    <SidebarItem
                        key={item.path}
                        tag={item.tag}
                        label={t(item.labelKey)}
                        count={item.count}
                        shortcut={item.shortcut}
                        active={isActive(item.path)}
                        onClick={() => navigate(item.path)}
                    />
                ))}
            </SidebarGroup>

            <div style={{ flex: 1 }} />

            <SidebarItem
                tag="SET"
                label={t('toolbar.settings')}
                active={isActive(ROUTES.settings)}
                shortcut="⌘,"
                onClick={() => navigate(ROUTES.settings)}
            />

            <div
                style={{
                    margin: 10,
                    padding: '8px 10px',
                    background: 'var(--card)',
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 4,
                    }}
                >
                    <div
                        style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background:
                                ollamaRunning === null
                                    ? 'var(--ink-4)'
                                    : ollamaRunning
                                      ? 'var(--moss)'
                                      : 'var(--rust)',
                        }}
                    />
                    <span
                        className="mono"
                        style={{
                            fontSize: 10,
                            color: 'var(--ink-2)',
                            letterSpacing: '0.05em',
                            fontWeight: 600,
                        }}
                    >
                        OLLAMA ·{' '}
                        {ollamaRunning === null
                            ? '...'
                            : ollamaRunning
                              ? 'READY'
                              : 'OFFLINE'}
                    </span>
                </div>
                <div
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        letterSpacing: '0.02em',
                    }}
                >
                    {ollamaRunning ? 'local LLM idle' : 'run ollama serve'}
                </div>
            </div>
        </div>
    );
}
