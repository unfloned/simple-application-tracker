import {
    ActionIcon,
    Anchor,
    Badge,
    Button,
    Card,
    Center,
    Checkbox,
    Code,
    Drawer,
    Group,
    Loader,
    Menu,
    MultiSelect,
    NumberInput,
    ScrollArea,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
    IconArrowUpRight,
    IconDotsVertical,
    IconEyeOff,
    IconPlayerPlay,
    IconPlus,
    IconSettings,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentProfile, ApplicationRecord } from '../../preload/index';
import type {
    JobSource,
    SerializedJobCandidate,
    SerializedJobSearch,
} from '@shared/job-search';
import {
    ALL_JOB_SOURCES,
    JOB_SOURCE_DESCRIPTION,
    JOB_SOURCE_LABEL,
} from '@shared/job-search';

interface Props {
    onCandidateImported: (app: ApplicationRecord) => void;
}

function scoreColor(score: number): string {
    if (score >= 90) return 'teal';
    if (score >= 70) return 'green';
    if (score >= 50) return 'yellow';
    if (score > 0) return 'orange';
    return 'gray';
}

export function JobSearchesPage({ onCandidateImported }: Props) {
    const [searches, setSearches] = useState<SerializedJobSearch[]>([]);
    const [candidates, setCandidates] = useState<SerializedJobCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [minScore, setMinScore] = useState(50);
    const [formOpen, setFormOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [editing, setEditing] = useState<SerializedJobSearch | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [s, c] = await Promise.all([
            window.api.agents.listSearches(),
            window.api.agents.listCandidates(0),
        ]);
        setSearches(s);
        setCandidates(c);
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const runSearch = async (id: string) => {
        setRunningId(id);
        try {
            const result = await window.api.agents.runSearch(id);
            const msgParts: string[] = [`${result.scored} scanned`, `${result.added} new`];
            if (result.errors && result.errors.length > 0) {
                msgParts.push(`errors: ${result.errors.join('; ')}`);
            }
            notifications.show({
                color: result.added > 0 ? 'green' : 'gray',
                message: msgParts.join(', '),
                autoClose: 6000,
            });
            await refresh();
        } catch (err) {
            notifications.show({
                color: 'red',
                title: 'Agent run failed',
                message: (err as Error).message,
            });
        } finally {
            setRunningId(null);
        }
    };

    const filteredCandidates = useMemo(
        () => candidates.filter((c) => c.score >= minScore && c.status !== 'ignored'),
        [candidates, minScore],
    );

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="end">
                <div>
                    <Title order={3}>Candidates</Title>
                    <Text size="sm" c="dimmed">
                        Agents scan configured portals and score findings against your profile.
                    </Text>
                </div>
                <Group>
                    <Button
                        variant="subtle"
                        leftSection={<IconSettings size={16} />}
                        onClick={() => setProfileOpen(true)}
                    >
                        Profile
                    </Button>
                    <Button
                        leftSection={<IconPlus size={16} />}
                        onClick={() => {
                            setEditing(null);
                            setFormOpen(true);
                        }}
                    >
                        New search
                    </Button>
                </Group>
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                {searches.map((s) => (
                    <Card key={s.id} withBorder padding="md">
                        <Group justify="space-between" mb="xs">
                            <Text fw={600}>{s.label}</Text>
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
                                        Edit
                                    </Menu.Item>
                                    <Menu.Item
                                        color="red"
                                        leftSection={<IconTrash size={14} />}
                                        onClick={async () => {
                                            if (confirm(`Delete search "${s.label}"?`)) {
                                                await window.api.agents.deleteSearch(s.id);
                                                await refresh();
                                            }
                                        }}
                                    >
                                        Delete
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                        <Stack gap={4} mb="sm">
                            <Group gap={4}>
                                {s.sources.map((src) => (
                                    <Badge key={src} size="xs" variant="light">
                                        {JOB_SOURCE_LABEL[src].split(' (')[0]}
                                    </Badge>
                                ))}
                            </Group>
                            <Text size="xs" c="dimmed">
                                Keywords: <Code>{s.keywords || 'all'}</Code>
                            </Text>
                            {s.lastRunAt && (
                                <Text size="xs" c="dimmed">
                                    Last run: {new Date(s.lastRunAt).toLocaleString()}
                                </Text>
                            )}
                        </Stack>
                        <Group>
                            <Switch
                                size="xs"
                                label="Active"
                                checked={s.enabled}
                                onChange={async (e) => {
                                    await window.api.agents.updateSearch(s.id, {
                                        enabled: e.currentTarget.checked,
                                    });
                                    await refresh();
                                }}
                            />
                            <Button
                                size="xs"
                                variant="light"
                                leftSection={<IconPlayerPlay size={14} />}
                                loading={runningId === s.id}
                                onClick={() => runSearch(s.id)}
                                ml="auto"
                            >
                                Run now
                            </Button>
                        </Group>
                    </Card>
                ))}
                {searches.length === 0 && !loading && (
                    <Card withBorder padding="lg">
                        <Center py="md">
                            <Stack align="center" gap={4}>
                                <Text c="dimmed">No searches yet.</Text>
                                <Text size="xs" c="dimmed">
                                    Click "New search" above.
                                </Text>
                            </Stack>
                        </Center>
                    </Card>
                )}
            </SimpleGrid>

            <Group justify="space-between" align="end">
                <Title order={4}>Matches</Title>
                <NumberInput
                    label="Min match score"
                    value={minScore}
                    onChange={(v) => setMinScore(Number(v) || 0)}
                    min={0}
                    max={100}
                    w={180}
                />
            </Group>

            {loading ? (
                <Center py="md">
                    <Loader />
                </Center>
            ) : filteredCandidates.length === 0 ? (
                <Center py="xl">
                    <Stack align="center" gap={4}>
                        <Text c="dimmed">No candidates yet.</Text>
                        <Text size="xs" c="dimmed">
                            Run a search or lower the min score.
                        </Text>
                    </Stack>
                </Center>
            ) : (
                <Stack gap="sm">
                    {filteredCandidates.map((c) => (
                        <Card key={c.id} withBorder padding="sm">
                            <Group justify="space-between" wrap="nowrap" align="start">
                                <Stack gap={4} flex={1}>
                                    <Group gap="xs">
                                        <Badge color={scoreColor(c.score)} variant="filled">
                                            {c.score}
                                        </Badge>
                                        <Text fw={600}>{c.title}</Text>
                                        {c.company && (
                                            <Text size="sm" c="dimmed">
                                                . {c.company}
                                            </Text>
                                        )}
                                        {c.location && (
                                            <Text size="sm" c="dimmed">
                                                . {c.location}
                                            </Text>
                                        )}
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
                                <Group gap="xs" wrap="nowrap">
                                    {c.status === 'imported' ? (
                                        <Badge variant="light">imported</Badge>
                                    ) : (
                                        <>
                                            <Tooltip label="Add as application">
                                                <ActionIcon
                                                    variant="light"
                                                    color="accent"
                                                    onClick={async () => {
                                                        const appRec = await window.api.agents.importCandidate(c.id);
                                                        onCandidateImported(appRec);
                                                        notifications.show({
                                                            color: 'green',
                                                            message: `${c.company || c.title} added.`,
                                                        });
                                                        await refresh();
                                                    }}
                                                >
                                                    <IconPlus size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Dismiss">
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={async () => {
                                                        await window.api.agents.updateCandidate(c.id, {
                                                            status: 'ignored',
                                                        });
                                                        await refresh();
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
                    await refresh();
                }}
            />

            <AgentProfileDrawer opened={profileOpen} onClose={() => setProfileOpen(false)} />
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
    const form = useForm<FormValuesSearch>({
        initialValues: {
            label: '',
            keywords: '',
            sources: ['germantechjobs', 'arbeitnow'],
            locationFilter: '',
            remoteOnly: true,
            minSalary: 0,
            enabled: true,
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
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, initial]);

    const submit = async (values: FormValuesSearch) => {
        if (values.sources.length === 0) {
            notifications.show({ color: 'yellow', message: 'Select at least one source.' });
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
            title={initial ? 'Edit search' : 'New search'}
            scrollAreaComponent={ScrollArea.Autosize}
        >
            <form onSubmit={form.onSubmit(submit)}>
                <Stack gap="md">
                    <TextInput label="Name" required {...form.getInputProps('label')} />
                    <MultiSelect
                        label="Sources"
                        description="Pick any combination of portals; each runs separately."
                        data={ALL_JOB_SOURCES.map((s) => ({
                            value: s,
                            label: JOB_SOURCE_LABEL[s],
                        }))}
                        {...form.getInputProps('sources')}
                        searchable
                        clearable
                    />
                    <Stack gap={4}>
                        {form.values.sources.map((s) => (
                            <Text key={s} size="xs" c="dimmed">
                                <b>{JOB_SOURCE_LABEL[s]}:</b> {JOB_SOURCE_DESCRIPTION[s]}
                            </Text>
                        ))}
                    </Stack>
                    <TextInput
                        label={form.values.sources.includes('url') ? 'Keywords / URL' : 'Keywords'}
                        placeholder={
                            form.values.sources.includes('url')
                                ? 'TypeScript or https://...'
                                : 'TypeScript Senior Remote'
                        }
                        {...form.getInputProps('keywords')}
                    />
                    <Checkbox
                        label="Remote only (hint for scoring)"
                        {...form.getInputProps('remoteOnly', { type: 'checkbox' })}
                    />
                    <NumberInput
                        label="Min salary (EUR/year, 0 = any)"
                        min={0}
                        {...form.getInputProps('minSalary')}
                    />
                    <Checkbox
                        label="Active (runs every 6h in background)"
                        {...form.getInputProps('enabled', { type: 'checkbox' })}
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="subtle" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">{initial ? 'Save' : 'Create'}</Button>
                    </Group>
                </Stack>
            </form>
        </Drawer>
    );
}

function AgentProfileDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
    const [profile, setProfile] = useState<AgentProfile | null>(null);

    useEffect(() => {
        if (!opened) return;
        window.api.agents.getProfile().then(setProfile);
    }, [opened]);

    const save = async () => {
        if (!profile) return;
        await window.api.agents.setProfile(profile);
        notifications.show({ color: 'green', message: 'Profile saved.' });
        onClose();
    };

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title="Scoring profile"
            scrollAreaComponent={ScrollArea.Autosize}
        >
            {profile ? (
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        The LLM scores every found job from 0 to 100 using this profile.
                    </Text>
                    <TextInput
                        label="Desired stack"
                        placeholder="TypeScript, Next.js, React Native"
                        value={profile.stackKeywords}
                        onChange={(e) => setProfile({ ...profile, stackKeywords: e.currentTarget.value })}
                    />
                    <Checkbox
                        label="Prefer remote"
                        checked={profile.remotePreferred}
                        onChange={(e) =>
                            setProfile({ ...profile, remotePreferred: e.currentTarget.checked })
                        }
                    />
                    <NumberInput
                        label="Minimum salary (EUR/year)"
                        min={0}
                        value={profile.minSalary}
                        onChange={(v) => setProfile({ ...profile, minSalary: Number(v) || 0 })}
                    />
                    <TextInput
                        label="Anti-stack (deal-breakers)"
                        placeholder="Java-only, C#-only, PHP-only"
                        value={profile.antiStack}
                        onChange={(e) => setProfile({ ...profile, antiStack: e.currentTarget.value })}
                    />
                    <Group justify="flex-end">
                        <Button onClick={save}>Save</Button>
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
