import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Center,
    Group,
    Loader,
    Menu,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconBuildingStore,
    IconChevronDown,
    IconChevronUp,
    IconDotsVertical,
    IconExternalLink,
    IconMapPin,
    IconPlus,
    IconSearch,
    IconSelector,
    IconTargetArrow,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApplicationStatus, STATUS_ORDER } from '@shared/application';
import type { ApplicationRecord } from '../../preload/index';
import { StatusSelector } from './StatusSelector';

interface Props {
    rows: ApplicationRecord[];
    loading: boolean;
    onEdit: (row: ApplicationRecord) => void;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: ApplicationStatus) => void;
    onVisibleCountChange?: (count: number) => void;
    onNew: () => void;
    searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const STATUS_COLOR: Record<ApplicationStatus, string> = {
    draft: 'gray',
    applied: 'blue',
    in_review: 'cyan',
    interview_scheduled: 'grape',
    interviewed: 'violet',
    offer_received: 'teal',
    accepted: 'green',
    rejected: 'red',
    withdrawn: 'dark',
};

type SortField = 'status' | 'matchScore' | 'companyName' | 'location' | 'salaryMax' | 'updatedAt';
type SortDir = 'asc' | 'desc';

function scoreColor(score: number): string {
    if (score >= 90) return 'teal';
    if (score >= 70) return 'green';
    if (score >= 50) return 'yellow';
    if (score > 0) return 'orange';
    return 'gray';
}

function formatSalary(min: number, max: number, currency: string): string {
    if (!min && !max) return '';
    const c = currency || 'EUR';
    if (min && max) return `${(min / 1000).toFixed(0)}-${(max / 1000).toFixed(0)}k ${c}`;
    return `${((min || max) / 1000).toFixed(0)}k ${c}`;
}

function SortableHeader({
    field,
    active,
    direction,
    onToggle,
    children,
    style,
}: {
    field: SortField;
    active: boolean;
    direction: SortDir;
    onToggle: (field: SortField) => void;
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    const Icon = !active ? IconSelector : direction === 'asc' ? IconChevronUp : IconChevronDown;
    return (
        <Table.Th style={style}>
            <UnstyledButton
                onClick={() => onToggle(field)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
            >
                {children}
                <Icon
                    size={14}
                    style={{ opacity: active ? 1 : 0.35 }}
                />
            </UnstyledButton>
        </Table.Th>
    );
}

export function ApplicationList({
    rows,
    loading,
    onEdit,
    onDelete,
    onStatusChange,
    onVisibleCountChange,
    onNew,
    searchInputRef,
}: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('updatedAt');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const toggleSort = (field: SortField) => {
        if (field === sortField) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir(field === 'matchScore' || field === 'updatedAt' || field === 'salaryMax' ? 'desc' : 'asc');
        }
    };

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        let list = rows.filter((r) => {
            if (statusFilter && r.status !== statusFilter) return false;
            if (!q) return true;
            return (
                r.companyName.toLowerCase().includes(q) ||
                r.jobTitle.toLowerCase().includes(q) ||
                r.location.toLowerCase().includes(q) ||
                r.stack.toLowerCase().includes(q) ||
                r.tags.toLowerCase().includes(q)
            );
        });
        list = [...list].sort((a, b) => {
            const dir = sortDir === 'asc' ? 1 : -1;
            if (sortField === 'status') {
                return dir * STATUS_ORDER.indexOf(a.status) - dir * STATUS_ORDER.indexOf(b.status);
            }
            if (sortField === 'matchScore') return dir * (a.matchScore - b.matchScore);
            if (sortField === 'companyName')
                return dir * a.companyName.localeCompare(b.companyName);
            if (sortField === 'location') return dir * a.location.localeCompare(b.location);
            if (sortField === 'salaryMax') return dir * (a.salaryMax - b.salaryMax);
            if (sortField === 'updatedAt')
                return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
            return 0;
        });
        return list;
    }, [rows, query, statusFilter, sortField, sortDir]);

    useEffect(() => {
        onVisibleCountChange?.(filtered.length);
    }, [filtered.length, onVisibleCountChange]);

    if (loading) {
        return (
            <Center h={300}>
                <Loader />
            </Center>
        );
    }

    const statusOptions = STATUS_ORDER.map((s) => ({ value: s, label: t(`status.${s}`) }));

    return (
        <Stack gap="md">
            <Group>
                <TextInput
                    ref={searchInputRef as React.RefObject<HTMLInputElement>}
                    placeholder={t('applications.searchPlaceholder')}
                    leftSection={<IconSearch size={16} />}
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    flex={1}
                />
                <Select
                    placeholder={t('applications.allStatuses')}
                    clearable
                    data={statusOptions}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    w={220}
                />
            </Group>

            {rows.length === 0 ? (
                <Center h={320}>
                    <Stack align="center" gap="md">
                        <IconBuildingStore size={56} style={{ opacity: 0.3 }} />
                        <Stack align="center" gap={4}>
                            <Text c="dimmed" fw={500}>
                                {t('applications.emptyTitle')}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {t('applications.emptySubtitle')}
                            </Text>
                        </Stack>
                        <Button leftSection={<IconPlus size={16} />} onClick={onNew}>
                            {t('toolbar.newEntry')}
                        </Button>
                    </Stack>
                </Center>
            ) : filtered.length === 0 ? (
                <Center h={200}>
                    <Stack align="center" gap={6}>
                        <Text c="dimmed" fw={500}>
                            {t('applications.emptyTitle')}
                        </Text>
                        <Text size="sm" c="dimmed">
                            {t('applications.showing', { filtered: 0, total: rows.length })}
                        </Text>
                    </Stack>
                </Center>
            ) : (
                <Box
                    style={{
                        borderRadius: 8,
                        overflow: 'hidden',
                        border:
                            '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                    }}
                >
                    <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover>
                        <Table.Thead
                            style={{
                                backgroundColor:
                                    'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))',
                                borderBottom:
                                    '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                            }}
                        >
                            <Table.Tr>
                                <SortableHeader
                                    field="status"
                                    active={sortField === 'status'}
                                    direction={sortDir}
                                    onToggle={toggleSort}
                                    style={{ width: 180 }}
                                >
                                    {t('applications.table.status')}
                                </SortableHeader>
                                <SortableHeader
                                    field="matchScore"
                                    active={sortField === 'matchScore'}
                                    direction={sortDir}
                                    onToggle={toggleSort}
                                    style={{ width: 70 }}
                                >
                                    {t('applications.table.match')}
                                </SortableHeader>
                                <SortableHeader
                                    field="companyName"
                                    active={sortField === 'companyName'}
                                    direction={sortDir}
                                    onToggle={toggleSort}
                                >
                                    {t('applications.table.companyJob')}
                                </SortableHeader>
                                <SortableHeader
                                    field="location"
                                    active={sortField === 'location'}
                                    direction={sortDir}
                                    onToggle={toggleSort}
                                    style={{ width: 160 }}
                                >
                                    {t('applications.table.location')}
                                </SortableHeader>
                                <SortableHeader
                                    field="salaryMax"
                                    active={sortField === 'salaryMax'}
                                    direction={sortDir}
                                    onToggle={toggleSort}
                                    style={{ width: 140 }}
                                >
                                    {t('applications.table.salary')}
                                </SortableHeader>
                                <Table.Th>{t('applications.table.stack')}</Table.Th>
                                <Table.Th style={{ width: 60 }}></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filtered.map((r) => (
                                <Table.Tr
                                    key={r.id}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => onEdit(r)}
                                >
                                    <Table.Td onClick={(e) => e.stopPropagation()}>
                                        <StatusSelector
                                            value={r.status}
                                            onChange={(status) => onStatusChange(r.id, status)}
                                            compact
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        {r.matchScore > 0 ? (
                                            <Tooltip
                                                label={r.matchReason || 'LLM score'}
                                                multiline
                                                w={280}
                                            >
                                                <Badge
                                                    color={scoreColor(r.matchScore)}
                                                    variant="filled"
                                                    size="md"
                                                    leftSection={<IconTargetArrow size={10} />}
                                                >
                                                    {r.matchScore}
                                                </Badge>
                                            </Tooltip>
                                        ) : (
                                            <Text size="xs" c="dimmed">
                                                -
                                            </Text>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Stack gap={2}>
                                            <Group gap={6} wrap="nowrap">
                                                <Text fw={600} size="sm" lineClamp={1}>
                                                    {r.companyName || t('applications.table.noCompany')}
                                                </Text>
                                                {r.jobUrl && (
                                                    <ActionIcon
                                                        variant="subtle"
                                                        size="xs"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.api.shell.openExternal(r.jobUrl);
                                                        }}
                                                    >
                                                        <IconExternalLink size={12} />
                                                    </ActionIcon>
                                                )}
                                            </Group>
                                            <Text size="xs" c="dimmed" lineClamp={1}>
                                                {r.jobTitle || t('applications.table.noTitle')}
                                            </Text>
                                        </Stack>
                                    </Table.Td>
                                    <Table.Td>
                                        <Stack gap={2}>
                                            {r.location && (
                                                <Group gap={4} wrap="nowrap">
                                                    <IconMapPin size={12} style={{ opacity: 0.5 }} />
                                                    <Text size="xs" lineClamp={1}>
                                                        {r.location}
                                                    </Text>
                                                </Group>
                                            )}
                                            <Badge
                                                color={
                                                    r.remote === 'remote'
                                                        ? 'green'
                                                        : r.remote === 'hybrid'
                                                          ? 'yellow'
                                                          : 'gray'
                                                }
                                                variant="light"
                                                size="xs"
                                                style={{ width: 'fit-content' }}
                                            >
                                                {t(`remote.${r.remote}`)}
                                            </Badge>
                                        </Stack>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="xs" c={r.salaryMax > 0 ? undefined : 'dimmed'}>
                                            {formatSalary(
                                                r.salaryMin,
                                                r.salaryMax,
                                                r.salaryCurrency,
                                            ) || '-'}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="xs" c="dimmed" lineClamp={2}>
                                            {r.stack || '-'}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td onClick={(e) => e.stopPropagation()}>
                                        <Menu position="bottom-end" withArrow>
                                            <Menu.Target>
                                                <ActionIcon variant="subtle">
                                                    <IconDotsVertical size={16} />
                                                </ActionIcon>
                                            </Menu.Target>
                                            <Menu.Dropdown>
                                                <Menu.Item
                                                    color="red"
                                                    leftSection={<IconTrash size={14} />}
                                                    onClick={() => {
                                                        if (
                                                            confirm(
                                                                t('confirm.deleteApplication', {
                                                                    name: r.companyName,
                                                                }),
                                                            )
                                                        )
                                                            onDelete(r.id);
                                                    }}
                                                >
                                                    {t('common.delete')}
                                                </Menu.Item>
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Box>
            )}

            {filtered.length > 0 && rows.length > filtered.length && (
                <Text size="xs" c="dimmed" ta="center">
                    {t('applications.showing', { filtered: filtered.length, total: rows.length })}
                </Text>
            )}
        </Stack>
    );
}
