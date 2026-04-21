import { ActionIcon, AppShell, Group, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconBolt, IconDownload, IconPlus, IconSearch } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
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
            async (id: string) => {
                navigate(ROUTES.applications);
                const found = await window.api.applications.get(id);
                if (found) {
                    setEditing(found);
                    setFormOpen(true);
                }
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

    return (
        <AppShell
            navbar={{ width: 220, breakpoint: 'xs' }}
            header={{ height: 48 }}
            footer={{ height: 40 }}
            padding="lg"
        >
            <AppShell.Header
                style={{ WebkitAppRegion: 'drag', borderBottom: 'none' }}
            >
                <Group h="100%" px="md" pl={80} justify="space-between">
                    <div />
                    <div style={{ WebkitAppRegion: 'no-drag' }}>
                        <Group gap="xs">
                            <Tooltip label={t('cmd.placeholder') + ' (Cmd+K)'}>
                                <ActionIcon
                                    variant="subtle"
                                    size="md"
                                    onClick={() => spotlight.open()}
                                >
                                    <IconSearch size={16} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('toolbar.export') + ' (Cmd+E)'}>
                                <ActionIcon variant="subtle" size="md" onClick={doExport}>
                                    <IconDownload size={16} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('toolbar.quickAdd')}>
                                <ActionIcon variant="subtle" size="md" onClick={openQuickAdd}>
                                    <IconBolt size={16} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('toolbar.newEntry') + ' (Cmd+N)'}>
                                <ActionIcon
                                    variant="filled"
                                    color="accent"
                                    size="md"
                                    onClick={openNew}
                                >
                                    <IconPlus size={16} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </div>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar>
                <Sidebar
                    applicationsCount={rows.length}
                    candidatesCount={newCandidatesCount}
                />
            </AppShell.Navbar>

            <AppShell.Main
                style={{
                    backgroundColor:
                        'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
                }}
            >
                <UpdateBanner />
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
                                onOpenApplication={openEdit}
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
                    <Route path={ROUTES.agents} element={<AgentsPage />} />
                    <Route path={ROUTES.chat} element={<ChatPage />} />
                    <Route
                        path={ROUTES.analytics}
                        element={<AnalyticsPage applications={rows} />}
                    />
                    <Route path={ROUTES.settings} element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
                </Routes>
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
