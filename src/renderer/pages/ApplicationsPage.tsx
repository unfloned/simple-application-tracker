import {
    Box,
    Center,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconBriefcase, IconSearch } from '@tabler/icons-react';
import { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { ApplicationRecord } from '../../preload/index';
import type { ApplicationStatus } from '@shared/application';
import { STATUS_ORDER } from '@shared/application';
import { ApplicationRow, ROW_GRID } from '../components/ApplicationRow';
import { ApplicationBoard } from '../components/ApplicationBoard';
import { ApplicationDetail } from '../components/ApplicationDetail';
import { ApplicationFormModal } from '../components/ApplicationForm';
import { GhostBtn } from '../components/primitives/GhostBtn';
import { Label } from '../components/primitives/Label';

type ViewMode = 'list' | 'board';

type GroupKey = 'draft' | 'active' | 'waiting' | 'interviewing' | 'decision' | 'closed';

const GROUP_ORDER: GroupKey[] = [
    'decision',
    'interviewing',
    'waiting',
    'active',
    'draft',
    'closed',
];

type StageBucket = 'active' | 'pipeline' | 'archive' | 'all';

const STAGE_BUCKETS: Record<StageBucket, ApplicationStatus[] | null> = {
    active:   ['applied', 'in_review', 'interview_scheduled', 'interviewed', 'offer_received'],
    pipeline: ['draft', 'applied', 'in_review'],
    archive:  ['accepted', 'rejected', 'withdrawn'],
    all:      null,
};

interface Props {
    rows: ApplicationRecord[];
    loading: boolean;
    onEdit: (row: ApplicationRecord) => void;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: ApplicationStatus) => void;
    onNew: () => void;
    onVisibleCountChange: (count: number) => void;
    searchInputRef: RefObject<HTMLInputElement | null>;
    detailRecord: ApplicationRecord | null;
    detailOpen: boolean;
    onCloseDetail: () => void;
    onSavedDetail: () => void;
}

export function ApplicationsPage({
    rows,
    loading,
    onEdit,
    onDelete,
    onStatusChange,
    onNew,
    onVisibleCountChange,
    searchInputRef,
    detailRecord,
    detailOpen,
    onCloseDetail,
    onSavedDetail,
}: Props) {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const urlId = searchParams.get('id');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [bucket, setBucket] = useState<StageBucket>('active');
    const [view, setView] = useState<ViewMode>('list');
    const [selectedId, setSelectedId] = useState<string | null>(urlId);

    // Pick up ?id=... on mount or when external navigation updates it.
    useEffect(() => {
        if (urlId && urlId !== selectedId) setSelectedId(urlId);
    }, [urlId, selectedId]);

    const handleSelect = useCallback(
        (row: ApplicationRecord) => {
            setSelectedId(row.id);
            setSearchParams({ id: row.id }, { replace: true });
        },
        [setSearchParams],
    );
    const closeDetail = useCallback(() => {
        setSelectedId(null);
        setSearchParams({}, { replace: true });
    }, [setSearchParams]);

    const bucketCounts = useMemo<Record<StageBucket, number>>(() => {
        const c: Record<StageBucket, number> = { active: 0, pipeline: 0, archive: 0, all: rows.length };
        for (const r of rows) {
            if (STAGE_BUCKETS.active!.includes(r.status)) c.active++;
            if (STAGE_BUCKETS.pipeline!.includes(r.status)) c.pipeline++;
            if (STAGE_BUCKETS.archive!.includes(r.status)) c.archive++;
        }
        return c;
    }, [rows]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        const bucketStatuses = STAGE_BUCKETS[bucket];
        return rows.filter((r) => {
            if (bucketStatuses && !bucketStatuses.includes(r.status)) return false;
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
    }, [rows, query, statusFilter, bucket]);

    useEffect(() => {
        onVisibleCountChange(filtered.length);
    }, [filtered.length, onVisibleCountChange]);

    const selectedRow = useMemo(
        () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
        [rows, selectedId],
    );

    // Clear selection if the row disappears (delete, filter change from outside).
    useEffect(() => {
        if (selectedId && !selectedRow) setSelectedId(null);
    }, [selectedId, selectedRow]);

    const grouped = useMemo(() => {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const groups: Record<GroupKey, ApplicationRecord[]> = {
            decision: [], interviewing: [], waiting: [], active: [], draft: [], closed: [],
        };
        for (const r of filtered) {
            if (r.status === 'offer_received') groups.decision.push(r);
            else if (r.status === 'interview_scheduled' || r.status === 'interviewed') groups.interviewing.push(r);
            else if (r.status === 'applied' && r.appliedAt && new Date(r.appliedAt).getTime() < sevenDaysAgo)
                groups.waiting.push(r);
            else if (r.status === 'applied' || r.status === 'in_review') groups.active.push(r);
            else if (r.status === 'draft') groups.draft.push(r);
            else groups.closed.push(r);
        }
        return groups;
    }, [filtered]);

    if (loading) {
        return (
            <Center mih={400}>
                <Loader />
            </Center>
        );
    }

    const statusOptions = STATUS_ORDER.map((s) => ({ value: s, label: t(`status.${s}`) }));

    if (rows.length === 0) {
        return (
            <Center mih={380}>
                <Stack align="center" gap="md" maw={380}>
                    <IconBriefcase size={48} style={{ opacity: 0.3, color: 'var(--ink-4)' }} />
                    <Stack align="center" gap={4}>
                        <Text size="lg" fw={500} className="serif" style={{ color: 'var(--ink)' }}>
                            {t('applications.emptyTitle')}
                        </Text>
                        <Text ta="center" size="sm" style={{ color: 'var(--ink-3)' }}>
                            {t('applications.emptySubtitle')}
                        </Text>
                    </Stack>
                    <GhostBtn active onClick={onNew}>
                        <span>＋ {t('toolbar.newEntry')}</span>
                    </GhostBtn>
                </Stack>
            </Center>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* secondary toolbar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--rule)',
                    flexShrink: 0,
                }}
            >
                {/* stage bucket filter */}
                <div
                    style={{
                        display: 'inline-flex',
                        border: '1px solid var(--rule-strong)',
                        borderRadius: 4,
                        overflow: 'hidden',
                    }}
                >
                    {(['active', 'pipeline', 'archive', 'all'] as StageBucket[]).map((k, i) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setBucket(k)}
                            style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: bucket === k ? 600 : 500,
                                fontFamily: 'var(--f-ui)',
                                color: bucket === k ? 'var(--ink)' : 'var(--ink-3)',
                                background: bucket === k ? 'var(--paper-2)' : 'var(--card)',
                                border: 'none',
                                borderRight: i < 3 ? '1px solid var(--rule-strong)' : 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <span style={{ textTransform: 'capitalize' }}>{t(`applications.bucket.${k}`, k)}</span>
                            <span
                                className="mono tnum"
                                style={{ fontSize: 10, color: 'var(--ink-4)' }}
                            >
                                {bucketCounts[k]}
                            </span>
                        </button>
                    ))}
                </div>

                <div style={{ width: 1, height: 20, background: 'var(--rule-strong)' }} />

                <TextInput
                    ref={searchInputRef as React.RefObject<HTMLInputElement>}
                    placeholder={t('applications.searchPlaceholder')}
                    leftSection={<IconSearch size={14} />}
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    size="xs"
                    style={{ flex: 1, maxWidth: 280 }}
                />

                <Select
                    placeholder={t('applications.allStatuses')}
                    clearable
                    size="xs"
                    data={statusOptions}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    w={160}
                />

                <div style={{ flex: 1 }} />

                <Label>View</Label>
                <div
                    style={{
                        display: 'inline-flex',
                        border: '1px solid var(--rule-strong)',
                        borderRadius: 4,
                        overflow: 'hidden',
                    }}
                >
                    {(['list', 'board'] as ViewMode[]).map((v, i) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            style={{
                                padding: '4px 10px',
                                fontSize: 11,
                                fontWeight: view === v ? 600 : 500,
                                fontFamily: 'var(--f-ui)',
                                color: view === v ? 'var(--ink)' : 'var(--ink-3)',
                                background: view === v ? 'var(--paper-2)' : 'var(--card)',
                                border: 'none',
                                borderRight: i < 1 ? '1px solid var(--rule-strong)' : 'none',
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                            }}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                <GhostBtn active onClick={onNew}>
                    <span>＋ New</span>
                    <span
                        className="mono"
                        style={{
                            fontSize: 10,
                            padding: '0 4px',
                            borderRadius: 2,
                            background: 'rgba(0,0,0,0.08)',
                            color: 'var(--ink-2)',
                        }}
                    >
                        ⌘N
                    </span>
                </GhostBtn>
            </div>

            {/* body — split: list (+ groups) on the left, detail pane on the right */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
                <div
                    style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'auto',
                        background: view === 'board' ? 'var(--paper)' : 'var(--card)',
                    }}
                >
                    {filtered.length === 0 ? (
                        <Center mih={240}>
                            <Stack align="center" gap={4}>
                                <Text fw={500} style={{ color: 'var(--ink-2)' }}>
                                    {t('applications.noMatch')}
                                </Text>
                                <Text size="sm" style={{ color: 'var(--ink-3)' }}>
                                    {t('applications.noMatchSub')}
                                </Text>
                            </Stack>
                        </Center>
                    ) : view === 'board' ? (
                        <Box p="md">
                            <ApplicationBoard
                                rows={filtered}
                                onEdit={onEdit}
                                onStatusChange={onStatusChange}
                            />
                        </Box>
                    ) : (
                        <>
                            {/* column header */}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: ROW_GRID,
                                    height: 26,
                                    alignItems: 'center',
                                    background: 'var(--paper-2)',
                                    borderBottom: '1px solid var(--rule-strong)',
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 3,
                                }}
                            >
                                <div />
                                {['ID', 'STAGE', 'ROLE', 'SALARY', 'LOCATION', 'MATCH', 'SRC', 'UPDATED'].map(
                                    (h, i) => (
                                        <div
                                            key={h}
                                            className="mono"
                                            style={{
                                                fontSize: 9.5,
                                                fontWeight: 600,
                                                color: 'var(--ink-3)',
                                                letterSpacing: '0.1em',
                                                paddingLeft: i === 0 ? 10 : 0,
                                            }}
                                        >
                                            {h}
                                        </div>
                                    ),
                                )}
                                <div
                                    className="mono"
                                    style={{
                                        fontSize: 9.5,
                                        fontWeight: 600,
                                        color: 'var(--ink-3)',
                                        letterSpacing: '0.1em',
                                        textAlign: 'center',
                                        position: 'sticky',
                                        right: 0,
                                        background: 'var(--paper-2)',
                                        borderLeft: '1px solid var(--rule)',
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 2,
                                    }}
                                >
                                    ACT
                                </div>
                            </div>

                            {/* grouped rows */}
                            {GROUP_ORDER.map((key) => {
                                const items = grouped[key];
                                if (items.length === 0) return null;
                                return (
                                    <div key={key}>
                                        <div
                                            style={{
                                                padding: '8px 16px 6px',
                                                background: 'var(--paper)',
                                                borderBottom: '1px solid var(--rule)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                            }}
                                        >
                                            <Label>
                                                {t(`applications.group${capitalize(key)}`)} · {items.length}
                                            </Label>
                                            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                                        </div>
                                        {items.map((r) => (
                                            <ApplicationRow
                                                key={r.id}
                                                row={r}
                                                selected={selectedId === r.id}
                                                onEdit={handleSelect}
                                                onDelete={onDelete}
                                                onStatusChange={onStatusChange}
                                            />
                                        ))}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {view === 'list' && selectedRow && (
                    <ApplicationDetail
                        app={selectedRow}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onClose={closeDetail}
                    />
                )}
            </div>

            <ApplicationFormModal
                opened={detailOpen}
                onClose={onCloseDetail}
                initial={detailRecord}
                onSaved={onSavedDetail}
                onDelete={onDelete}
            />
        </div>
    );
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
