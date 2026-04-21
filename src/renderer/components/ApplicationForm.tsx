import {
    Accordion,
    Alert,
    Badge,
    Button,
    Divider,
    Drawer,
    Group,
    NumberInput,
    ScrollArea,
    Select,
    SimpleGrid,
    Stack,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import '@mantine/dates/styles.css';
import { useForm } from '@mantine/form';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
    IconAlertCircle,
    IconSparkles,
    IconTargetArrow,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ApplicationStatus,
    Priority,
    RemoteType,
    STATUS_ORDER,
} from '@shared/application';
import type { ApplicationRecord } from '../../preload/index';
import { StatusSelector } from './StatusSelector';

interface Props {
    opened: boolean;
    onClose: () => void;
    initial: ApplicationRecord | null;
    initialUrl?: string | null;
    onSaved: () => void;
    onDelete?: (id: string) => void;
}

interface FormValues {
    jobUrl: string;
    companyName: string;
    companyWebsite: string;
    jobTitle: string;
    jobDescription: string;
    location: string;
    remote: RemoteType;
    salaryMin: number;
    salaryMax: number;
    salaryCurrency: string;
    stack: string;
    status: ApplicationStatus;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    notes: string;
    tags: string;
    priority: Priority;
    requiredProfile: string[];
    benefits: string[];
    interviews: string[];
    matchScore: number;
    matchReason: string;
    source: string;
    appliedAt: Date | null;
}

const DEFAULTS: FormValues = {
    jobUrl: '',
    companyName: '',
    companyWebsite: '',
    jobTitle: '',
    jobDescription: '',
    location: '',
    remote: 'onsite',
    salaryMin: 0,
    salaryMax: 0,
    salaryCurrency: 'EUR',
    stack: '',
    status: 'draft',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
    tags: '',
    priority: 'medium',
    requiredProfile: [],
    benefits: [],
    interviews: [],
    matchScore: 0,
    matchReason: '',
    source: '',
    appliedAt: null,
};

function scoreColor(score: number): string {
    if (score >= 90) return 'teal';
    if (score >= 70) return 'green';
    if (score >= 50) return 'yellow';
    if (score > 0) return 'orange';
    return 'gray';
}

export function ApplicationFormModal({
    opened,
    onClose,
    initial,
    initialUrl,
    onSaved,
    onDelete,
}: Props) {
    const { t } = useTranslation();
    const form = useForm<FormValues>({ initialValues: DEFAULTS });
    const [extracting, setExtracting] = useState(false);
    const [assessing, setAssessing] = useState(false);

    useEffect(() => {
        if (!opened) return;
        if (initial) {
            form.setValues({
                ...DEFAULTS,
                ...initial,
                requiredProfile: initial.requiredProfile ?? [],
                benefits: initial.benefits ?? [],
                interviews: initial.interviews ?? [],
                appliedAt: initial.appliedAt ? new Date(initial.appliedAt) : null,
            });
        } else {
            form.setValues({
                ...DEFAULTS,
                jobUrl: initialUrl || '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, initial, initialUrl]);

    const doExtract = async () => {
        const url = form.values.jobUrl.trim();
        if (!url) {
            notifications.show({ color: 'yellow', message: t('notifications.enterUrlFirst') });
            return;
        }
        setExtracting(true);
        try {
            const data = await window.api.llm.extract(url);
            form.setValues((v) => ({
                ...v,
                companyName: data.companyName || v.companyName,
                jobTitle: data.jobTitle || v.jobTitle,
                location: data.location || v.location,
                remote: data.remote || v.remote,
                salaryMin: data.salaryMin || v.salaryMin,
                salaryMax: data.salaryMax || v.salaryMax,
                stack: data.stack || v.stack,
                jobDescription: data.jobDescription || v.jobDescription,
                requiredProfile: data.requiredProfile.length
                    ? data.requiredProfile
                    : v.requiredProfile,
                benefits: data.benefits.length ? data.benefits : v.benefits,
                source: data.source || v.source,
            }));
            notifications.show({ color: 'green', message: t('notifications.dataExtracted') });
        } catch (err) {
            notifications.show({
                color: 'red',
                title: t('notifications.extractFailed'),
                message: (err as Error).message,
                icon: <IconAlertCircle size={16} />,
                autoClose: 8000,
            });
        } finally {
            setExtracting(false);
        }
    };

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

    const submit = async (values: FormValues) => {
        if (initial) {
            await window.api.applications.update(initial.id, values);
        } else {
            await window.api.applications.create(values);
        }
        onSaved();
    };

    useHotkeys([
        ['mod+s', () => {
            if (opened) {
                form.onSubmit(submit)();
            }
        }],
    ]);

    const defaultOpenedSections = (() => {
        const open: string[] = ['core'];
        const v = form.values;
        if (v.requiredProfile.length || v.benefits.length) open.push('requirements');
        if (v.salaryMin || v.salaryMax) open.push('salary');
        if (v.contactName || v.contactEmail || v.contactPhone) open.push('contact');
        if (v.jobDescription || v.notes || v.tags) open.push('notes');
        if (v.interviews.length) open.push('interviews');
        if (v.matchScore > 0) open.push('fit');
        return open;
    })();

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <Text fw={600}>{initial ? t('form.editTitle') : t('form.newTitle')}</Text>
                    {form.values.matchScore > 0 && (
                        <Badge color={scoreColor(form.values.matchScore)} variant="light">
                            {form.values.matchScore}/100
                        </Badge>
                    )}
                </Group>
            }
            position="right"
            size="xl"
            scrollAreaComponent={ScrollArea.Autosize}
            overlayProps={{ backgroundOpacity: 0.3, blur: 2 }}
        >
            <form onSubmit={form.onSubmit(submit)}>
                <Stack gap="md">
                    <Alert variant="light" color="accent" icon={<IconSparkles size={16} />}>
                        {t('form.autoFillHint')}
                    </Alert>

                    <Group align="end">
                        <TextInput
                            label={t('form.jobUrl')}
                            placeholder="https://..."
                            flex={1}
                            {...form.getInputProps('jobUrl')}
                        />
                        <Tooltip label={t('form.autoFillTooltip')}>
                            <Button
                                loading={extracting}
                                onClick={doExtract}
                                leftSection={<IconSparkles size={16} />}
                                variant="light"
                            >
                                {t('form.autoFill')}
                            </Button>
                        </Tooltip>
                    </Group>

                    <Accordion
                        multiple
                        defaultValue={defaultOpenedSections}
                        variant="separated"
                        styles={{ item: { borderRadius: 8 } }}
                    >
                        <Accordion.Item value="core">
                            <Accordion.Control>{t('form.companyAndJob')}</Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="sm">
                                    <SimpleGrid cols={2} spacing="sm">
                                        <TextInput
                                            label={t('form.company')}
                                            {...form.getInputProps('companyName')}
                                        />
                                        <TextInput
                                            label={t('form.companyWebsite')}
                                            placeholder="https://..."
                                            {...form.getInputProps('companyWebsite')}
                                        />
                                        <TextInput
                                            label={t('form.jobTitle')}
                                            {...form.getInputProps('jobTitle')}
                                        />
                                        <TextInput
                                            label={t('form.location')}
                                            placeholder={t('form.locationPlaceholder')}
                                            {...form.getInputProps('location')}
                                        />
                                        <Select
                                            label={t('form.remoteType')}
                                            data={(['onsite', 'hybrid', 'remote'] as RemoteType[]).map(
                                                (v) => ({ value: v, label: t(`remote.${v}`) }),
                                            )}
                                            {...form.getInputProps('remote')}
                                        />
                                        <TextInput
                                            label={t('form.source')}
                                            {...form.getInputProps('source')}
                                        />
                                    </SimpleGrid>
                                    <TextInput
                                        label={t('form.stack')}
                                        placeholder={t('form.stackPlaceholder')}
                                        {...form.getInputProps('stack')}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="requirements">
                            <Accordion.Control>
                                {t('form.requirementsAndBenefits')}
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="sm">
                                    <TagsInput
                                        label={t('form.requiredProfile')}
                                        description={t('form.requiredProfileHint')}
                                        placeholder={t('form.requiredProfilePlaceholder')}
                                        {...form.getInputProps('requiredProfile')}
                                        clearable
                                        splitChars={[',', ';']}
                                    />
                                    <TagsInput
                                        label={t('form.benefits')}
                                        description={t('form.benefitsHint')}
                                        placeholder={t('form.benefitsPlaceholder')}
                                        {...form.getInputProps('benefits')}
                                        clearable
                                        splitChars={[',', ';']}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="salary">
                            <Accordion.Control>{t('form.salaryAndStatus')}</Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="sm">
                                    <SimpleGrid cols={4} spacing="sm">
                                        <NumberInput
                                            label={t('form.salaryMin')}
                                            min={0}
                                            {...form.getInputProps('salaryMin')}
                                        />
                                        <NumberInput
                                            label={t('form.salaryMax')}
                                            min={0}
                                            {...form.getInputProps('salaryMax')}
                                        />
                                        <TextInput
                                            label={t('form.currency')}
                                            maxLength={3}
                                            {...form.getInputProps('salaryCurrency')}
                                        />
                                        <Select
                                            label={t('form.priority')}
                                            data={(['low', 'medium', 'high'] as Priority[]).map(
                                                (v) => ({ value: v, label: t(`priority.${v}`) }),
                                            )}
                                            {...form.getInputProps('priority')}
                                        />
                                    </SimpleGrid>
                                    <SimpleGrid cols={2} spacing="sm">
                                        <Stack gap={4}>
                                            <Text size="sm" fw={500}>
                                                {t('form.statusLabel')}
                                            </Text>
                                            <div>
                                                <StatusSelector
                                                    value={form.values.status}
                                                    onChange={(s) => form.setFieldValue('status', s)}
                                                />
                                            </div>
                                        </Stack>
                                        <DateInput
                                            label={t('form.appliedAt')}
                                            clearable
                                            valueFormat="DD.MM.YYYY"
                                            {...form.getInputProps('appliedAt')}
                                        />
                                    </SimpleGrid>
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="contact">
                            <Accordion.Control>{t('form.contact')}</Accordion.Control>
                            <Accordion.Panel>
                                <SimpleGrid cols={3} spacing="sm">
                                    <TextInput
                                        label={t('form.contactName')}
                                        {...form.getInputProps('contactName')}
                                    />
                                    <TextInput
                                        label={t('form.contactEmail')}
                                        {...form.getInputProps('contactEmail')}
                                    />
                                    <TextInput
                                        label={t('form.contactPhone')}
                                        {...form.getInputProps('contactPhone')}
                                    />
                                </SimpleGrid>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="interviews">
                            <Accordion.Control>
                                <Group gap="xs">
                                    <Text>{t('form.interviews')}</Text>
                                    {form.values.interviews.length > 0 && (
                                        <Badge size="xs" variant="light">
                                            {form.values.interviews.length}
                                        </Badge>
                                    )}
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <TagsInput
                                    label={t('form.interviews')}
                                    description={t('form.interviewsHint')}
                                    placeholder={t('form.interviewsPlaceholder')}
                                    {...form.getInputProps('interviews')}
                                    clearable
                                    splitChars={[';']}
                                />
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="notes">
                            <Accordion.Control>
                                {t('form.descriptionAndNotes')}
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="sm">
                                    <Textarea
                                        label={t('form.jobDescription')}
                                        autosize
                                        minRows={2}
                                        maxRows={8}
                                        {...form.getInputProps('jobDescription')}
                                    />
                                    <Textarea
                                        label={t('form.notes')}
                                        autosize
                                        minRows={2}
                                        maxRows={8}
                                        {...form.getInputProps('notes')}
                                    />
                                    <TextInput
                                        label={t('form.tags')}
                                        placeholder={t('form.tagsPlaceholder')}
                                        {...form.getInputProps('tags')}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="fit">
                            <Accordion.Control>{t('form.fitCheck')}</Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="sm">
                                    {form.values.matchScore > 0 ? (
                                        <Alert
                                            variant="light"
                                            color={scoreColor(form.values.matchScore)}
                                            icon={<IconTargetArrow size={16} />}
                                            title={t('form.fitCheckTitle', {
                                                score: form.values.matchScore,
                                            })}
                                        >
                                            {form.values.matchReason || t('form.fitCheckNoReason')}
                                        </Alert>
                                    ) : (
                                        <Text size="sm" c="dimmed">
                                            {t('form.fitCheckPending')}
                                        </Text>
                                    )}
                                    <Button
                                        variant="light"
                                        onClick={doAssessFit}
                                        loading={assessing}
                                        leftSection={<IconTargetArrow size={16} />}
                                        disabled={
                                            !form.values.companyName && !form.values.jobTitle
                                        }
                                    >
                                        {t('form.runFitCheck')}
                                    </Button>
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>

                    <Divider />

                    <Group justify="space-between" pb="md">
                        <div>
                            {initial && onDelete && (
                                <Button
                                    variant="subtle"
                                    color="red"
                                    leftSection={<IconTrash size={16} />}
                                    onClick={() => {
                                        if (
                                            confirm(
                                                t('confirm.deleteApplication', {
                                                    name: initial.companyName,
                                                }),
                                            )
                                        ) {
                                            onDelete(initial.id);
                                            onClose();
                                        }
                                    }}
                                >
                                    {t('common.delete')}
                                </Button>
                            )}
                        </div>
                        <Group>
                            <Button variant="subtle" onClick={onClose}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit">
                                {initial ? t('common.save') : t('common.create')}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Drawer>
    );
}
