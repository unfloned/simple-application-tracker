import { Accordion, Drawer, ScrollArea, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useHotkeys } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import type { ApplicationRecord } from '../../preload/index';
import { EmailSendDialog } from './EmailSendDialog';
import { DEFAULTS } from './application-form/constants';
import { FitBar } from './application-form/FitBar';
import { FormFooter } from './application-form/FormFooter';
import { FormHeader } from './application-form/FormHeader';
import { UrlExtractor } from './application-form/UrlExtractor';
import { ContactSection } from './application-form/sections/ContactSection';
import { CoreSection } from './application-form/sections/CoreSection';
import { InterviewsSection } from './application-form/sections/InterviewsSection';
import { NotesSection } from './application-form/sections/NotesSection';
import { RequirementsSection } from './application-form/sections/RequirementsSection';
import { SalaryStatusSection } from './application-form/sections/SalaryStatusSection';
import type { FormValues } from './application-form/types';

interface Props {
    opened: boolean;
    onClose: () => void;
    initial: ApplicationRecord | null;
    initialUrl?: string | null;
    onSaved: () => void;
    onDelete?: (id: string) => void;
}

/**
 * Edit / create drawer for applications. Body is a stack of Accordion
 * sections, each in its own file so this container stays thin. Auto-opens
 * sections that already have content so users don't have to hunt.
 */
export function ApplicationFormModal({
    opened,
    onClose,
    initial,
    initialUrl,
    onSaved,
    onDelete,
}: Props) {
    const form = useForm<FormValues>({ initialValues: DEFAULTS });
    const [emailOpened, setEmailOpened] = useState(false);

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
            form.setValues({ ...DEFAULTS, jobUrl: initialUrl || '' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, initial, initialUrl]);

    const submit = async (values: FormValues) => {
        if (initial) {
            await window.api.applications.update(initial.id, values);
        } else {
            await window.api.applications.create(values);
        }
        onSaved();
    };

    useHotkeys([
        [
            'mod+s',
            () => {
                if (opened) form.onSubmit(submit)();
            },
        ],
    ]);

    // Auto-expand sections that already have data so users land with context.
    const defaultOpenedSections = (() => {
        const open: string[] = ['core'];
        const v = form.values;
        if (v.requiredProfile.length || v.benefits.length) open.push('requirements');
        if (v.salaryMin || v.salaryMax) open.push('salary');
        if (v.contactName || v.contactEmail || v.contactPhone) open.push('contact');
        if (v.jobDescription || v.notes || v.tags) open.push('notes');
        if (v.interviews.length) open.push('interviews');
        return open;
    })();

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            withCloseButton={false}
            position="right"
            size="xl"
            padding={0}
            scrollAreaComponent={ScrollArea.Autosize}
            overlayProps={{ backgroundOpacity: 0.3, blur: 2 }}
            styles={{
                content: { display: 'flex', flexDirection: 'column' },
                body: {
                    padding: 0,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                },
            }}
        >
            <FormHeader initial={initial} form={form} onClose={onClose} />

            <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
                <form onSubmit={form.onSubmit(submit)}>
                    <Stack gap="md">
                        <FitBar form={form} />
                        <UrlExtractor form={form} />

                        <Accordion
                            multiple
                            defaultValue={defaultOpenedSections}
                            variant="separated"
                            styles={{ item: { borderRadius: 8 } }}
                        >
                            <CoreSection form={form} />
                            <RequirementsSection form={form} />
                            <SalaryStatusSection form={form} />
                            <ContactSection form={form} />
                            <InterviewsSection form={form} />
                            <NotesSection form={form} />
                        </Accordion>
                    </Stack>
                </form>
            </div>

            <FormFooter
                initial={initial}
                onDelete={onDelete}
                onEmail={initial ? () => setEmailOpened(true) : undefined}
                onCancel={onClose}
                onSubmit={() => form.onSubmit(submit)()}
                onClose={onClose}
            />

            {initial && (
                <EmailSendDialog
                    opened={emailOpened}
                    onClose={() => setEmailOpened(false)}
                    application={initial}
                />
            )}
        </Drawer>
    );
}
