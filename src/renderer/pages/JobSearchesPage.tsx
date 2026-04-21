import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Center,
    Checkbox,
    Code,
    Divider,
    Drawer,
    Group,
    Loader,
    Menu,
    MultiSelect,
    NumberInput,
    ScrollArea,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    TagsInput,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
    IconArrowUpRight,
    IconCalendar,
    IconCheck,
    IconClock,
    IconDotsVertical,
    IconEyeOff,
    IconHistory,
    IconPlayerPlay,
    IconPlayerStop,
    IconPlus,
    IconSearch,
    IconSettings,
    IconStar,
    IconStarFilled,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentProfile, ApplicationRecord } from '../../preload/index';
import type {
    AgentRunRecord,
    JobSource,
    ScheduleInterval,
    SerializedJobCandidate,
    SerializedJobSearch,
} from '@shared/job-search';
import { ALL_JOB_SOURCES } from '@shared/job-search';
import { SourceGrid } from '../components/SourceGrid';

interface Props {
    onCandidateImported: (appRec: ApplicationRecord) => void;
}

function scoreColor(score: number): string {
    if (score >= 90) return 'teal';
    if (score >= 70) return 'green';
    if (score >= 50) return 'yellow';
    if (score > 0) return 'orange';
    return 'gray';
}

function timeAgo(iso: string, t: (key: string) => string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return t('common.loading') === 'Loading' ? 'just now' : 'gerade eben';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString();
}

function timeUntil(iso: string | null, t: (key: string) => string): string {
    if (!iso) return t('interval.manual');
    const diffMs = new Date(iso).getTime() - Date.now();
    if (diffMs <= 0) return 'now';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

export function JobSearchesPage({ onCandidateImported }: Props) {
    const { t } = useTranslation();
    const [searches, setSearches] = useState<SerializedJobSearch[]>([]);
    const [candidates, setCandidates] = useState<SerializedJobCandidate[]>([]);
    const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [minScore, setMinScore] = useState(50);
    const [formOpen, setFormOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    const [editing, setEditing] = useState<SerializedJobSearch | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sourceFilter, setSourceFilter] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'favorite' | 'imported'>('all');
    const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'company_asc'>(
        'score_desc',
    );
    const [searchText, setSearchText] = useState('');

    const refreshSearches = useCallback(async () => {
        const s = await window.api.agents.listSearches();
        setSearches(s);
    }, []);

    const refreshCandidates = useCallback(async () => {
        const c = await window.api.agents.listCandidates(0);
        setCandidates(c);
    }, []);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([refreshSearches(), refreshCandidates()]);
            const running = await window.api.agents.runningSearches();
            setRunningIds(new Set(running));
        } catch (err) {
            notifications.show({
                color: 'red',
                title: t('notifications.loadFailed'),
                message: (err as Error).message,
            });
        } finally {
            setLoading(false);
        }
    }, [refreshSearches, refreshCandidates, t]);

    useEffect(() => {
        refreshAll();

        const offStarted = window.api.on('agents:runStarted', (payload: { searchId: string }) => {
            setRunningIds((prev) => new Set(prev).add(payload.searchId));
        });
        const offFinished = window.api.on(
            'agents:runFinished',
            (payload: { searchId: string }) => {
                setRunningIds((prev) => {
                    const next = new Set(prev);
                    next.delete(payload.searchId);
                    return next;
                });
                refreshSearches();
                refreshCandidates();
            },
        );
        const offCandidateAdded = window.api.on('agents:candidateAdded', () => {
            refreshCandidates();
        });

        return () => {
            offStarted();
            offFinished();
            offCandidateAdded();
        };
    }, [refreshAll, refreshSearches, refreshCandidates]);

    const runSearch = async (id: string) => {
        try {
            await window.api.agents.runSearch(id);
        } catch (err) {
            notifications.show({
                color: 'red',
                title: t('notifications.agentRunFailed'),
                message: (err as Error).message,
            });
        }
    };

    const cancelRun = async (id: string) => {
        await window.api.agents.cancelRun(id);
    };

    const filteredCandidates = useMemo(() => {
        const q = searchText.toLowerCase().trim();
        let list = candidates.filter((c) => {
            if (c.score < minScore) return false;
            if (statusFilter === 'new' && c.status !== 'new') return false;
            if (statusFilter === 'favorite' && !c.favorite) return false;
            if (statusFilter === 'imported' && c.status !== 'imported') return false;
            if (statusFilter === 'all' && c.status === 'ignored') return false;
            if (sourceFilter.length > 0) {
                const matches = sourceFilter.some((src) => c.sourceKey.startsWith(src + ':'));
                if (!matches) return false;
            }
            if (q) {
                const blob = `${c.company} ${c.title} ${c.location}`.toLowerCase();
                if (!blob.includes(q)) return false;
            }
            return true;
        });
        list = [...list].sort((a, b) => {
            if (sortBy === 'score_desc') return b.score - a.score;
            if (sortBy === 'score_asc') return a.score - b.score;
            if (sortBy === 'date_desc')
                return new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
            if (sortBy === 'company_asc') return (a.company || '').localeCompare(b.company || '');
            return 0;
        });
        return list;
    }, [candidates, minScore, statusFilter, sourceFilter, sortBy, searchText]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allVisibleSelected =
        filteredCandidates.length > 0 &&
        filteredCandidates.every((c) => selectedIds.has(c.id));

    const toggleSelectAll = () => {
        setSelectedIds(
            allVisibleSelected ? new Set() : new Set(filteredCandidates.map((c) => c.id)),
        );
    };

    const bulkIgnore = async () => {
        await window.api.agents.bulkUpdateCandidates([...selectedIds], { status: 'ignored' });
        setSelectedIds(new Set());
        await refreshCandidates();
    };

    const bulkFavorite = async () => {
        await window.api.agents.bulkUpdateCandidates([...selectedIds], { favorite: true });
        setSelectedIds(new Set());
        await refreshCandidates();
    };

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="end">
                <div>
                    <Title order={3}>{t('candidates.title')}</Title>
                    <Text size="sm" c="dimmed">
                        {t('candidates.subtitle')}
                    </Text>
                </div>
                <Group>
                    <Button
                        variant="subtle"
                        leftSection={<IconHistory size={16} />}
                        onClick={() => setLogOpen(true)}
                    >
                        {t('candidates.runLog')}
                    </Button>
                    <Button
                        variant="subtle"
                        leftSection={<IconSettings size={16} />}
                        onClick={() => setProfileOpen(true)}
                    >
                        {t('candidates.profile')}
                    </Button>
                    <Button
                        leftSection={<IconPlus size={16} />}
                        onClick={() => {
                            setEditing(null);
                            setFormOpen(true);
                        }}
                    >
                        {t('candidates.newSearch')}
                    </Button>
                </Group>
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                {searches.map((s) => {
                    const isRunning = runningIds.has(s.id);
                    return (
                        <Card key={s.id} withBorder padding="md">
                            <Group justify="space-between" mb="xs">
                                <Group gap={6}>
                                    <Text fw={600}>{s.label}</Text>
                                    {isRunning && (
                                        <Badge color="blue" variant="filled" size="xs">
                                            {t('candidates.running')}
                                        </Badge>
                                    )}
                                </Group>
                                <Menu position="bottom-end">
                                    <Menu.Target>
                                        <ActionIcon variant="subtle">
                                            <IconDotsVertical size={16} />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item
                                            onClick={() => {
                                                setEditing(s);
                                                setFormOpen(true);
                                            }}
                                        >
                                            {t('common.edit')}
                                        </Menu.Item>
                                        <Menu.Item
                                            color="red"
                                            leftSection={<IconTrash size={14} />}
                                            onClick={async () => {
                                                if (
                                                    confirm(
                                                        t('confirm.deleteSearch', { label: s.label }),
                                                    )
                                                ) {
                                                    await window.api.agents.deleteSearch(s.id);
                                                    await refreshAll();
                                                }
                                            }}
                                        >
                                            {t('common.delete')}
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Group>
                            <Stack gap={4} mb="sm">
                                <Group gap={4}>
                                    {s.sources.map((src) => (
                                        <Badge key={src} size="xs" variant="light">
                                            {t(`source.${src}`).split(' (')[0]}
                                        </Badge>
                                    ))}
                                </Group>
                                <Text size="xs" c="dimmed">
                                    {t('candidates.keywords')}:{' '}
                                    <Code>{s.keywords || t('candidates.any')}</Code>
                                </Text>
                                <Group gap={12}>
                                    <Tooltip label={t('candidates.interval')}>
                                        <Group gap={4}>
                                            <IconClock size={12} style={{ opacity: 0.5 }} />
                                            <Text size="xs" c="dimmed">
                                                {t(`interval.${s.interval}`)}
                                            </Text>
                                        </Group>
                                    </Tooltip>
                                    {s.enabled && s.interval !== 'manual' && (
                                        <Tooltip label={t('candidates.nextRun')}>
                                            <Group gap={4}>
                                                <IconCalendar size={12} style={{ opacity: 0.5 }} />
                                                <Text size="xs" c="dimmed">
                                                    {timeUntil(s.nextRunAt, t)}
                                                </Text>
                                            </Group>
                                        </Tooltip>
                                    )}
                                </Group>
                                {s.lastRunAt && (
                                    <Text size="xs" c="dimmed">
                                        {t('candidates.lastRun', { time: timeAgo(s.lastRunAt, t) })}
                                    </Text>
                                )}
                            </Stack>
                            <Group>
                                <Switch
                                    size="xs"
                                    label={t('candidates.active')}
                                    checked={s.enabled}
                                    onChange={async (e) => {
                                        await window.api.agents.updateSearch(s.id, {
                                            enabled: e.currentTarget.checked,
                                        });
                                        await refreshSearches();
                                    }}
                                />
                                {isRunning ? (
                                    <Button
                                        size="xs"
                                        variant="light"
                                        color="red"
                                        leftSection={<IconPlayerStop size={14} />}
                                        onClick={() => cancelRun(s.id)}
                                        ml="auto"
                                    >
                                        {t('candidates.cancelRun')}
                                    </Button>
                                ) : (
                                    <Button
                                        size="xs"
                                        variant="light"
                                        leftSection={<IconPlayerPlay size={14} />}
                                        onClick={() => runSearch(s.id)}
                                        ml="auto"
                                    >
                                        {t('candidates.runNow')}
                                    </Button>
                                )}
                            </Group>
                        </Card>
                    );
                })}
                {searches.length === 0 && !loading && (
                    <Card withBorder padding="lg">
                        <Center py="md">
                            <Stack align="center" gap={4}>
                                <Text c="dimmed">{t('candidates.noSearchesTitle')}</Text>
                                <Text size="xs" c="dimmed">
                                    {t('candidates.noSearchesSubtitle')}
                                </Text>
                            </Stack>
                        </Center>
                    </Card>
                )}
            </SimpleGrid>

            <Title order={4}>{t('candidates.matchesTitle')}</Title>

            <Group gap="sm" wrap="wrap">
                <TextInput
                    leftSection={<IconSearch size={14} />}
                    placeholder={t('candidates.filterSearchPlaceholder')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.currentTarget.value)}
                    style={{ flex: 1, minWidth: 200 }}
                />
                <MultiSelect
                    placeholder={t('candidates.filterSource')}
                    data={ALL_JOB_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    clearable
                    w={220}
                    hidePickedOptions
                />
                <Select
                    placeholder={t('candidates.filterStatus')}
                    data={[
                        { value: 'all', label: t('candidates.filterStatusAll') },
                        { value: 'new', label: t('candidates.filterStatusNew') },
                        { value: 'favorite', label: t('candidates.filterStatusFavorite') },
                        { value: 'imported', label: t('candidates.filterStatusImported') },
                    ]}
                    value={statusFilter}
                    onChange={(v) => v && setStatusFilter(v as typeof statusFilter)}
                    w={150}
                    allowDeselect={false}
                />
                <Select
                    placeholder={t('candidates.sortBy')}
                    data={[
                        { value: 'score_desc', label: t('candidates.sortByScore') },
                        { value: 'score_asc', label: t('candidates.sortByScoreAsc') },
                        { value: 'date_desc', label: t('candidates.sortByDate') },
                        { value: 'company_asc', label: t('candidates.sortByCompany') },
                    ]}
                    value={sortBy}
                    onChange={(v) => v && setSortBy(v as typeof sortBy)}
                    w={200}
                    allowDeselect={false}
                />
                <NumberInput
                    value={minScore}
                    onChange={(v) => setMinScore(Number(v) || 0)}
                    min={0}
                    max={100}
                    w={110}
                    placeholder={t('candidates.minScore')}
                />
            </Group>

            {selectedIds.size > 0 && (
                <Group justify="flex-end">
                    <Text size="xs" c="dimmed">
                        {t('candidates.selected', { count: selectedIds.size })}
                    </Text>
                    <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconStar size={14} />}
                        onClick={bulkFavorite}
                    >
                        {t('candidates.star')}
                    </Button>
                    <Button
                        size="xs"
                        variant="light"
                        color="gray"
                        leftSection={<IconEyeOff size={14} />}
                        onClick={bulkIgnore}
                    >
                        {t('candidates.dismiss')}
                    </Button>
                </Group>
            )}

            {loading ? (
                <Center py="md">
                    <Loader />
                </Center>
            ) : filteredCandidates.length === 0 ? (
                <Center py="xl">
                    <Stack align="center" gap={6}>
                        <IconArrowUpRight size={40} style={{ opacity: 0.3 }} />
                        <Text c="dimmed" fw={500}>
                            {t('candidates.emptyTitle')}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {t('candidates.emptySubtitle')}
                        </Text>
                    </Stack>
                </Center>
            ) : (
                <Stack gap="sm">
                    <Group justify="space-between" px="xs">
                        <Checkbox
                            label={
                                allVisibleSelected
                                    ? t('candidates.deselectAll')
                                    : t('candidates.selectAll')
                            }
                            checked={allVisibleSelected}
                            indeterminate={!allVisibleSelected && selectedIds.size > 0}
                            onChange={toggleSelectAll}
                            size="xs"
                        />
                    </Group>
                    {filteredCandidates.map((c) => (
                        <Card key={c.id} withBorder padding="sm">
                            <Group justify="space-between" wrap="nowrap" align="start">
                                <Group align="start" gap="sm" wrap="nowrap" flex={1}>
                                    <Checkbox
                                        checked={selectedIds.has(c.id)}
                                        onChange={() => toggleSelect(c.id)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <Stack gap={4} flex={1}>
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge color={scoreColor(c.score)} variant="filled" size="md">
                                                {c.score}
                                            </Badge>
                                            <Text fw={600}>{c.title}</Text>
                                            {c.favorite && (
                                                <IconStarFilled
                                                    size={14}
                                                    color="var(--mantine-color-yellow-5)"
                                                />
                                            )}
                                        </Group>
                                        <Group gap="xs">
                                            {c.company && (
                                                <Text size="sm" c="dimmed">
                                                    {c.company}
                                                </Text>
                                            )}
                                            {c.location && (
                                                <Text size="sm" c="dimmed">
                                                    · {c.location}
                                                </Text>
                                            )}
                                            <Text size="xs" c="dimmed">
                                                · {t('candidates.foundAgo', {
                                                    time: timeAgo(c.discoveredAt, t),
                                                })}
                                            </Text>
                                        </Group>
                                        {c.scoreReason && (
                                            <Text size="xs" c="dimmed">
                                                {c.scoreReason}
                                            </Text>
                                        )}
                                        <Anchor
                                            size="xs"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                window.api.shell.openExternal(c.sourceUrl);
                                            }}
                                            href={c.sourceUrl}
                                        >
                                            <Group gap={4}>
                                                <IconArrowUpRight size={12} />
                                                {c.sourceUrl.replace(/^https?:\/\//, '').slice(0, 60)}
                                            </Group>
                                        </Anchor>
                                    </Stack>
                                </Group>
                                <Group gap="xs" wrap="nowrap">
                                    <Tooltip
                                        label={
                                            c.favorite
                                                ? t('candidates.removeStar')
                                                : t('candidates.star')
                                        }
                                    >
                                        <ActionIcon
                                            variant="subtle"
                                            color={c.favorite ? 'yellow' : 'gray'}
                                            onClick={async () => {
                                                await window.api.agents.updateCandidate(c.id, {
                                                    favorite: !c.favorite,
                                                });
                                                await refreshCandidates();
                                            }}
                                        >
                                            {c.favorite ? (
                                                <IconStarFilled size={16} />
                                            ) : (
                                                <IconStar size={16} />
                                            )}
                                        </ActionIcon>
                                    </Tooltip>
                                    {c.status === 'imported' ? (
                                        <Badge variant="light" leftSection={<IconCheck size={10} />}>
                                            {t('candidates.imported')}
                                        </Badge>
                                    ) : (
                                        <>
                                            <Tooltip label={t('candidates.addAsApplication')}>
                                                <ActionIcon
                                                    variant="light"
                                                    color="accent"
                                                    onClick={async () => {
                                                        const appRec =
                                                            await window.api.agents.importCandidate(c.id);
                                                        onCandidateImported(appRec);
                                                        notifications.show({
                                                            color: 'green',
                                                            message: t('candidates.candidateAdded', {
                                                                name: c.company || c.title,
                                                            }),
                                                        });
                                                        await refreshCandidates();
                                                    }}
                                                >
                                                    <IconPlus size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label={t('candidates.dismiss')}>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={async () => {
                                                        await window.api.agents.updateCandidate(c.id, {
                                                            status: 'ignored',
                                                        });
                                                        await refreshCandidates();
                                                    }}
                                                >
                                                    <IconEyeOff size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </>
                                    )}
                                </Group>
                            </Group>
                        </Card>
                    ))}
                </Stack>
            )}

            <SearchFormDrawer
                opened={formOpen}
                onClose={() => setFormOpen(false)}
                initial={editing}
                onSaved={async () => {
                    setFormOpen(false);
                    await refreshSearches();
                }}
            />

            <AgentProfileDrawer opened={profileOpen} onClose={() => setProfileOpen(false)} />
            <AgentRunLogDrawer opened={logOpen} onClose={() => setLogOpen(false)} />
        </Stack>
    );
}

interface FormValuesSearch {
    label: string;
    keywords: string;
    sources: JobSource[];
    locationFilter: string;
    remoteOnly: boolean;
    minSalary: number;
    enabled: boolean;
    interval: ScheduleInterval;
}

function SearchFormDrawer({
    opened,
    onClose,
    initial,
    onSaved,
}: {
    opened: boolean;
    onClose: () => void;
    initial: SerializedJobSearch | null;
    onSaved: () => void;
}) {
    const { t } = useTranslation();
    const form = useForm<FormValuesSearch>({
        initialValues: {
            label: '',
            keywords: '',
            sources: ['germantechjobs', 'arbeitnow'],
            locationFilter: '',
            remoteOnly: true,
            minSalary: 0,
            enabled: true,
            interval: '6h',
        },
    });

    useEffect(() => {
        if (!opened) return;
        if (initial) {
            form.setValues({
                label: initial.label,
                keywords: initial.keywords,
                sources: initial.sources,
                locationFilter: initial.locationFilter,
                remoteOnly: initial.remoteOnly,
                minSalary: initial.minSalary,
                enabled: initial.enabled,
                interval: initial.interval,
            });
        } else {
            form.setValues({
                label: 'TypeScript Remote',
                keywords: 'TypeScript',
                sources: ['germantechjobs', 'arbeitnow', 'remotive'],
                locationFilter: '',
                remoteOnly: true,
                minSalary: 0,
                enabled: true,
                interval: '6h',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, initial]);

    const submit = async (values: FormValuesSearch) => {
        if (values.sources.length === 0) {
            notifications.show({ color: 'yellow', message: t('searchForm.pickSourceHint') });
            return;
        }
        if (initial) {
            await window.api.agents.updateSearch(initial.id, values);
        } else {
            await window.api.agents.createSearch(values);
        }
        onSaved();
    };

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title={initial ? t('searchForm.editTitle') : t('searchForm.newTitle')}
            scrollAreaComponent={ScrollArea.Autosize}
        >
            <form onSubmit={form.onSubmit(submit)}>
                <Stack gap="md">
                    <TextInput label={t('searchForm.name')} required {...form.getInputProps('label')} />
                    <Stack gap={6}>
                        <Text size="sm" fw={500}>
                            {t('searchForm.sources')}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {t('searchForm.sourcesHint')}
                        </Text>
                        <SourceGrid
                            value={form.values.sources}
                            onChange={(v) => form.setFieldValue('sources', v)}
                        />
                    </Stack>
                    <TextInput
                        label={
                            form.values.sources.includes('url')
                                ? t('searchForm.keywordsOrUrl')
                                : t('searchForm.keywords')
                        }
                        placeholder={
                            form.values.sources.includes('url')
                                ? t('searchForm.keywordsUrlPlaceholder')
                                : t('searchForm.keywordsPlaceholder')
                        }
                        {...form.getInputProps('keywords')}
                    />
                    <Select
                        label={t('searchForm.intervalLabel')}
                        description={t('searchForm.intervalHint')}
                        data={[
                            { value: 'manual', label: t('interval.manual') },
                            { value: 'hourly', label: t('interval.hourly') },
                            { value: '3h', label: t('interval.3h') },
                            { value: '6h', label: t('interval.6h') },
                            { value: '12h', label: t('interval.12h') },
                            { value: 'daily', label: t('interval.daily') },
                        ]}
                        {...form.getInputProps('interval')}
                        allowDeselect={false}
                    />
                    <Checkbox
                        label={t('searchForm.remoteOnly')}
                        {...form.getInputProps('remoteOnly', { type: 'checkbox' })}
                    />
                    <NumberInput
                        label={t('searchForm.minSalary')}
                        min={0}
                        {...form.getInputProps('minSalary')}
                    />
                    <Checkbox
                        label={t('searchForm.activeLabel')}
                        {...form.getInputProps('enabled', { type: 'checkbox' })}
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="subtle" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">
                            {initial ? t('common.save') : t('common.create')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Drawer>
    );
}

function splitToList(raw: string): string[] {
    return raw
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function AgentProfileDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const [profile, setProfile] = useState<AgentProfile | null>(null);
    const [stackTags, setStackTags] = useState<string[]>([]);
    const [antiTags, setAntiTags] = useState<string[]>([]);
    const [salaryEnabled, setSalaryEnabled] = useState(false);
    const [autoImportEnabled, setAutoImportEnabled] = useState(false);
    const [salaryValue, setSalaryValue] = useState(60000);
    const [autoImportValue, setAutoImportValue] = useState(85);

    useEffect(() => {
        if (!opened) return;
        window.api.agents.getProfile().then((p) => {
            setProfile(p);
            setStackTags(splitToList(p.stackKeywords));
            setAntiTags(splitToList(p.antiStack));
            setSalaryEnabled(p.minSalary > 0);
            setSalaryValue(p.minSalary > 0 ? p.minSalary : 60000);
            setAutoImportEnabled(p.autoImportThreshold > 0);
            setAutoImportValue(p.autoImportThreshold > 0 ? p.autoImportThreshold : 85);
        });
    }, [opened]);

    const save = async () => {
        if (!profile) return;
        await window.api.agents.setProfile({
            ...profile,
            stackKeywords: stackTags.join(', '),
            antiStack: antiTags.join(', '),
            minSalary: salaryEnabled ? salaryValue : 0,
            autoImportThreshold: autoImportEnabled ? autoImportValue : 0,
        });
        notifications.show({ color: 'green', message: t('notifications.profileSaved') });
        onClose();
    };

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title={t('profileDrawer.title')}
            scrollAreaComponent={ScrollArea.Autosize}
        >
            {profile ? (
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {t('profileDrawer.intro')}
                    </Text>

                    <Divider label={t('profileDrawer.techPreferences')} labelPosition="left" />
                    <TagsInput
                        label={t('profileDrawer.desiredStack')}
                        description={t('profileDrawer.desiredStackHint')}
                        placeholder={t('profileDrawer.desiredStackPlaceholder')}
                        value={stackTags}
                        onChange={setStackTags}
                        splitChars={[',', ';']}
                        clearable
                    />
                    <TagsInput
                        label={t('profileDrawer.antiStack')}
                        description={t('profileDrawer.antiStackHint')}
                        placeholder={t('profileDrawer.antiStackPlaceholder')}
                        value={antiTags}
                        onChange={setAntiTags}
                        splitChars={[',', ';']}
                        clearable
                    />

                    <Divider label={t('profileDrawer.workPreferences')} labelPosition="left" />
                    <Checkbox
                        label={t('profileDrawer.preferRemote')}
                        description={t('profileDrawer.preferRemoteHint')}
                        checked={profile.remotePreferred}
                        onChange={(e) =>
                            setProfile({ ...profile, remotePreferred: e.currentTarget.checked })
                        }
                    />
                    <Group justify="space-between" align="center">
                        <div style={{ flex: 1 }}>
                            <Text size="sm" fw={500}>
                                {t('profileDrawer.minSalaryToggle')}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {t('profileDrawer.minSalaryToggleHint')}
                            </Text>
                        </div>
                        <Switch
                            checked={salaryEnabled}
                            onChange={(e) => setSalaryEnabled(e.currentTarget.checked)}
                        />
                    </Group>
                    {salaryEnabled && (
                        <NumberInput
                            label={t('profileDrawer.minSalary')}
                            min={0}
                            step={5000}
                            value={salaryValue}
                            onChange={(v) => setSalaryValue(Number(v) || 0)}
                        />
                    )}

                    <Divider label={t('profileDrawer.automation')} labelPosition="left" />
                    <Group justify="space-between" align="center">
                        <div style={{ flex: 1 }}>
                            <Text size="sm" fw={500}>
                                {t('profileDrawer.autoImportToggle')}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {t('profileDrawer.autoImportToggleHint')}
                            </Text>
                        </div>
                        <Switch
                            checked={autoImportEnabled}
                            onChange={(e) => setAutoImportEnabled(e.currentTarget.checked)}
                        />
                    </Group>
                    {autoImportEnabled && (
                        <NumberInput
                            label={t('profileDrawer.autoImportThreshold')}
                            description={t('profileDrawer.autoImportHint')}
                            min={1}
                            max={100}
                            step={5}
                            value={autoImportValue}
                            onChange={(v) => setAutoImportValue(Number(v) || 1)}
                        />
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button variant="subtle" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={save}>{t('profileDrawer.saveProfile')}</Button>
                    </Group>
                </Stack>
            ) : (
                <Center py="xl">
                    <Loader />
                </Center>
            )}
        </Drawer>
    );
}

function AgentRunLogDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const [runs, setRuns] = useState<AgentRunRecord[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!opened) return;
        setLoading(true);
        window.api.agents
            .listRuns(50)
            .then((r) => {
                setRuns(r);
            })
            .catch((err) => {
                notifications.show({
                    color: 'red',
                    title: t('notifications.loadFailed'),
                    message: (err as Error).message,
                });
            })
            .finally(() => setLoading(false));
    }, [opened, t]);

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="lg"
            title={t('runLog.title')}
            scrollAreaComponent={ScrollArea.Autosize}
        >
            {loading ? (
                <Center py="xl">
                    <Loader />
                </Center>
            ) : runs.length === 0 ? (
                <Center py="xl">
                    <Text c="dimmed">{t('runLog.empty')}</Text>
                </Center>
            ) : (
                <Stack gap="sm">
                    {runs.map((r) => (
                        <Card key={r.id} withBorder padding="sm">
                            <Group justify="space-between" mb={4}>
                                <Text fw={600} size="sm">
                                    {r.searchLabel}
                                </Text>
                                <Group gap={4}>
                                    {r.canceled && (
                                        <Badge color="gray" size="xs">
                                            {t('runLog.canceled')}
                                        </Badge>
                                    )}
                                    {r.error && !r.canceled && (
                                        <Badge color="red" size="xs">
                                            {t('runLog.errors')}
                                        </Badge>
                                    )}
                                    {!r.canceled && !r.error && r.finishedAt && (
                                        <Badge color="green" size="xs">
                                            {t('runLog.ok')}
                                        </Badge>
                                    )}
                                </Group>
                            </Group>
                            <Text size="xs" c="dimmed">
                                {new Date(r.startedAt).toLocaleString()} · {t('runLog.sources')}:{' '}
                                {r.sources.join(', ')}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {t('runLog.stats', { scanned: r.scanned, added: r.added })}
                            </Text>
                            {r.error && (
                                <Box mt={4}>
                                    <Text size="xs" c="red">
                                        {r.error}
                                    </Text>
                                </Box>
                            )}
                        </Card>
                    ))}
                </Stack>
            )}
        </Drawer>
    );
}
