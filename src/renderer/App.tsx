import { AppShell, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { GhostBtn } from './components/primitives/GhostBtn';
import { Kbd } from './components/primitives/Kbd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { STATUS_ORDER } from '@shared/application';
import type { ApplicationRecord } from '../preload/index';
import { Sidebar } from './components/Sidebar';
import { CommandPalette, spotlight } from './components/CommandPalette';
import { ApplicationFormModal } from './components/ApplicationForm';
import { UpdateBanner } from './components/UpdateBanner';
import { StatusFooter } from './components/StatusFooter';
import { OnboardingWizard } from './components/OnboardingWizard';
import { DashboardPage } from './pages/DashboardPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { AgentsPage } from './pages/AgentsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { ChatPage } from './pages/ChatPage';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';
import { ROUTES } from './routes';

const ONBOARDING_KEY = 'simple-tracker-onboarded';

export function App() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [rows, setRows] = useState<ApplicationRecord[]>([]);
    const [visibleCount, setVisibleCount] = useState(0);
    const [newCandidatesCount, setNewCandidatesCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ApplicationRecord | null>(null);
    const [quickAddUrl, setQuickAddUrl] = useState<string | null>(null);
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const data = await window.api.applications.list();
        setRows(data);
        setLoading(false);
    }, []);

    const refreshCandidateCount = useCallback(async () => {
        try {
            const cands = await window.api.agents.listCandidates(0);
            const count = cands.filter((c) => c.status === 'new').length;
            setNewCandidatesCount(count);
        } catch {
            setNewCandidatesCount(0);
        }
    }, []);

    useEffect(() => {
        refresh();
        refreshCandidateCount();

        if (!localStorage.getItem(ONBOARDING_KEY)) {
            window.api.applications.list().then((list) => {
                if (list.length === 0) setOnboardingOpen(true);
            });
        }

        const unsubNav = window.api.on('navigate', (target: string) => {
            if (target === 'new') {
                navigate(ROUTES.applications);
                setEditing(null);
                setQuickAddUrl(null);
                setFormOpen(true);
            }
        });
        const unsubQuickAdd = window.api.on(
            'navigate:quickAdd',
            (payload: { url: string }) => {
                navigate(ROUTES.applications);
                setEditing(null);
                setQuickAddUrl(payload.url || '');
                setFormOpen(true);
            },
        );
        const unsubOpenApplication = window.api.on(
            'navigate:openApplication',
            (id: string) => {
                navigate(`${ROUTES.applications}?id=${encodeURIComponent(id)}`);
            },
        );
        const unsubAutoImport = window.api.on(
            'agents:autoImported',
            (payload: { candidate: string; score: number }) => {
                notifications.show({
                    color: 'teal',
                    title: t('notifications.autoImportedTitle', { score: payload.score }),
                    message: payload.candidate,
                });
                refresh();
                refreshCandidateCount();
            },
        );
        const unsubCandidateAdded = window.api.on('agents:candidateAdded', () => {
            refreshCandidateCount();
        });
        const unsubFinished = window.api.on(
            'agents:runFinished',
            (payload: { scanned: number; added: number; canceled: boolean; errors: string[] }) => {
                refreshCandidateCount();
                if (payload.canceled) {
                    notifications.show({ color: 'gray', message: t('notifications.agentRunCanceled') });
                    return;
                }
                const stats = t('notifications.agentRunFinishedStats', {
                    scanned: payload.scanned,
                    added: payload.added,
                });
                notifications.show({
                    color: payload.added > 0 ? 'green' : 'gray',
                    title: t('notifications.agentRunFinishedTitle'),
                    message:
                        payload.errors.length > 0
                            ? t('notifications.agentRunFinishedWithErrors', {
                                  stats,
                                  errors: payload.errors.join('; '),
                              })
                            : stats,
                    autoClose: 6000,
                });
            },
        );
        const unsubFollowUp = window.api.on(
            'reminders:followUp',
            (payload: { applicationId: string; companyName: string; daysSinceApplied: number }) => {
                notifications.show({
                    color: 'yellow',
                    title: t('notifications.followUpTitle', { days: payload.daysSinceApplied }),
                    message: payload.companyName,
                    autoClose: 10000,
                });
            },
        );
        return () => {
            unsubNav();
            unsubQuickAdd();
            unsubOpenApplication();
            unsubAutoImport();
            unsubCandidateAdded();
            unsubFinished();
            unsubFollowUp();
        };
    }, [refresh, refreshCandidateCount, t, navigate]);

    // Reset candidates badge when visiting the page
    useEffect(() => {
        if (location.pathname === ROUTES.candidates) {
            setNewCandidatesCount(0);
        }
    }, [location.pathname]);

    const openNew = () => {
        navigate(ROUTES.applications);
        setEditing(null);
        setQuickAddUrl(null);
        setFormOpen(true);
    };

    const openEdit = (row: ApplicationRecord) => {
        setEditing(row);
        setQuickAddUrl(null);
        setFormOpen(true);
    };

    // Navigate to the Applications split-view with a preselected row instead of
    // opening the edit drawer directly. Keeps inbox-clicks visually consistent
    // with clicking a row on the Applications page.
    const openDetail = (row: ApplicationRecord) => {
        navigate(`${ROUTES.applications}?id=${encodeURIComponent(row.id)}`);
    };

    const openQuickAdd = () => {
        navigate(ROUTES.applications);
        setEditing(null);
        setQuickAddUrl('');
        setFormOpen(true);
    };

    const doExport = async () => {
        const labels = {
            sheetName: t('excel.sheetName'),
            status: Object.fromEntries(STATUS_ORDER.map((s) => [s, t(`status.${s}`)])),
            remote: {
                onsite: t('remote.onsite'),
                hybrid: t('remote.hybrid'),
                remote: t('remote.remote'),
            },
            priority: {
                low: t('priority.low'),
                medium: t('priority.medium'),
                high: t('priority.high'),
            },
            headers: {
                status: t('excel.headers.status'),
                match: t('excel.headers.match'),
                company: t('excel.headers.company'),
                jobTitle: t('excel.headers.jobTitle'),
                location: t('excel.headers.location'),
                remote: t('excel.headers.remote'),
                stack: t('excel.headers.stack'),
                salaryMin: t('excel.headers.salaryMin'),
                salaryMax: t('excel.headers.salaryMax'),
                currency: t('excel.headers.currency'),
                priority: t('excel.headers.priority'),
                contactName: t('excel.headers.contactName'),
                contactEmail: t('excel.headers.contactEmail'),
                contactPhone: t('excel.headers.contactPhone'),
                tags: t('excel.headers.tags'),
                appliedAt: t('excel.headers.appliedAt'),
                source: t('excel.headers.source'),
                jobUrl: t('excel.headers.jobUrl'),
                companyWebsite: t('excel.headers.companyWebsite'),
                requiredProfile: t('excel.headers.requiredProfile'),
                benefits: t('excel.headers.benefits'),
                matchReason: t('excel.headers.matchReason'),
                notes: t('excel.headers.notes'),
                createdAt: t('excel.headers.createdAt'),
                updatedAt: t('excel.headers.updatedAt'),
            },
        };
        const result = await window.api.export.excel(labels, t('excel.dialogTitle'));
        if (!result.canceled && result.filePath) {
            notifications.show({
                color: 'green',
                message: t('notifications.exported', { count: result.count }),
            });
        }
    };

    useHotkeys([
        ['mod+n', () => openNew()],
        ['mod+f', () => searchInputRef.current?.focus()],
        ['mod+e', () => doExport()],
        ['mod+,', () => navigate(ROUTES.settings)],
        // Workspace navigation — matches the sidebar shortcuts.
        ['mod+1', () => navigate(ROUTES.dashboard)],
        ['mod+2', () => navigate(ROUTES.applications)],
        ['mod+3', () => navigate(ROUTES.candidates)],
        ['mod+4', () => navigate(ROUTES.inbox)],
        ['mod+5', () => navigate(ROUTES.agents)],
        ['mod+6', () => navigate(ROUTES.chat)],
        ['mod+7', () => navigate(ROUTES.analytics)],
        ['escape', () => {
            if (formOpen) setFormOpen(false);
        }],
    ]);

    const closeForm = () => {
        setFormOpen(false);
        setQuickAddUrl(null);
    };

    const deleteAndRefresh = async (id: string) => {
        await window.api.applications.delete(id);
        await refresh();
    };

    const savedDetail = async () => {
        setFormOpen(false);
        setQuickAddUrl(null);
        await refresh();
    };

    const onApplicationsRoute = location.pathname === ROUTES.applications;

    // Full-bleed routes manage their own chrome (header/body/padding).
    // Other routes get breathing room from Main padding so they don't sit flush left.
    const fullBleedRoutes: string[] = [
        ROUTES.applications,
        ROUTES.analytics,
        ROUTES.chat,
    ];
    const isFullBleed = fullBleedRoutes.includes(location.pathname);

    return (
        <AppShell
            navbar={{ width: 220, breakpoint: 'xs' }}
            header={{ height: 36 }}
            footer={{ height: 28 }}
            padding={0}
        >
            <AppShell.Header
                style={{
                    WebkitAppRegion: 'drag',
                    borderBottom: '1px solid var(--rule-strong)',
                    background: 'var(--paper-2)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        pointerEvents: 'none',
                    }}
                >
                    <span
                        className="mono"
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--ink)',
                            letterSpacing: '0.04em',
                        }}
                    >
                        ◆ Pitch Tracker
                    </span>
                </div>
                <div
                    style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        WebkitAppRegion: 'no-drag',
                    }}
                >
                    <Tooltip label={t('cmd.placeholder') + ' (⌘K)'}>
                        <GhostBtn onClick={() => spotlight.open()}>
                            <span>Search</span>
                            <Kbd>⌘K</Kbd>
                        </GhostBtn>
                    </Tooltip>
                    <Tooltip label={t('toolbar.export') + ' (⌘E)'}>
                        <GhostBtn onClick={doExport}>
                            <span>Export</span>
                        </GhostBtn>
                    </Tooltip>
                    <Tooltip label={t('toolbar.quickAdd')}>
                        <GhostBtn onClick={openQuickAdd}>
                            <span>⚡ Quick add</span>
                        </GhostBtn>
                    </Tooltip>
                    <Tooltip label={t('toolbar.newEntry') + ' (⌘N)'}>
                        <GhostBtn
                            active
                            onClick={openNew}
                            style={{
                                background: 'var(--ink)',
                                color: 'var(--paper)',
                                borderColor: 'var(--ink)',
                            }}
                        >
                            <span>＋ New</span>
                            <Kbd tone="dark">⌘N</Kbd>
                        </GhostBtn>
                    </Tooltip>
                </div>
            </AppShell.Header>

            <AppShell.Navbar>
                <Sidebar
                    applicationsCount={rows.length}
                    candidatesCount={newCandidatesCount}
                />
            </AppShell.Navbar>

            <AppShell.Main
                style={{
                    backgroundColor: 'var(--paper)',
                }}
            >
                <UpdateBanner />
                {/* Full-bleed pages fill the viewport minus chrome and manage
                    their own internal scroll. Padded pages flow naturally and
                    let the document scroll like a normal page. */}
                <div
                    style={
                        isFullBleed
                            ? {
                                  height: 'calc(100vh - var(--app-shell-header-height, 36px) - var(--app-shell-footer-height, 28px))',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  overflow: 'hidden',
                              }
                            : { padding: '20px 24px' }
                    }
                >
                <Routes>
                    <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />
                    <Route
                        path={ROUTES.dashboard}
                        element={
                            <DashboardPage
                                applications={rows}
                                onNavigate={(key) => {
                                    if (key === 'dashboard') navigate(ROUTES.dashboard);
                                    else if (key === 'applications') navigate(ROUTES.applications);
                                    else if (key === 'candidates') navigate(ROUTES.candidates);
                                    else if (key === 'agents') navigate(ROUTES.agents);
                                    else if (key === 'settings') navigate(ROUTES.settings);
                                }}
                                onNewEntry={openNew}
                                onQuickAdd={openQuickAdd}
                                onExport={doExport}
                                onOpenApplication={openDetail}
                            />
                        }
                    />
                    <Route
                        path={ROUTES.applications}
                        element={
                            <ApplicationsPage
                                rows={rows}
                                loading={loading}
                                onEdit={openEdit}
                                onDelete={deleteAndRefresh}
                                onStatusChange={async (id, status) => {
                                    await window.api.applications.update(id, { status });
                                    await refresh();
                                }}
                                onNew={openNew}
                                onVisibleCountChange={setVisibleCount}
                                searchInputRef={searchInputRef}
                                detailRecord={editing}
                                detailOpen={formOpen}
                                onCloseDetail={closeForm}
                                onSavedDetail={savedDetail}
                            />
                        }
                    />
                    <Route
                        path={ROUTES.candidates}
                        element={
                            <CandidatesPage
                                onCandidateImported={async () => {
                                    await refresh();
                                    await refreshCandidateCount();
                                    navigate(ROUTES.applications);
                                }}
                                onGoToAgents={() => navigate(ROUTES.agents)}
                            />
                        }
                    />
                    <Route
                        path={ROUTES.inbox}
                        element={
                            <InboxPage
                                applications={rows}
                                onApplicationUpdated={refresh}
                            />
                        }
                    />
                    <Route path={ROUTES.agents} element={<AgentsPage />} />
                    <Route path={ROUTES.chat} element={<ChatPage />} />
                    <Route
                        path={ROUTES.analytics}
                        element={<AnalyticsPage applications={rows} />}
                    />
                    <Route path={ROUTES.settings} element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
                </Routes>
                </div>
            </AppShell.Main>

            <AppShell.Footer>
                <StatusFooter
                    totalApplications={rows.length}
                    visibleApplications={
                        onApplicationsRoute && visibleCount > 0 ? visibleCount : rows.length
                    }
                />
            </AppShell.Footer>

            {!onApplicationsRoute && (
                <ApplicationFormModal
                    opened={formOpen}
                    onClose={closeForm}
                    initial={editing}
                    initialUrl={quickAddUrl}
                    onSaved={savedDetail}
                    onDelete={deleteAndRefresh}
                />
            )}

            <OnboardingWizard
                opened={onboardingOpen}
                onClose={() => {
                    localStorage.setItem(ONBOARDING_KEY, '1');
                    setOnboardingOpen(false);
                }}
            />

            <CommandPalette
                onNewEntry={openNew}
                onExport={doExport}
                onQuickAdd={openQuickAdd}
            />
        </AppShell>
    );
}
