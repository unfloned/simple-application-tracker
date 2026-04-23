import { classifyInboundEmail } from './email-classifier';
import { fetchRecentUnread } from './imap';
import {
    getInboundEmailByMessageId,
    getLatestInboundReceivedAt,
    insertInboundEmail,
    listApplications,
    setInboundReviewStatus,
    updateApplication,
    updateInboundSuggestion,
    type InboundReviewStatus,
} from './db';
import type { ApplicationStatus } from '@shared/application';
import { serializeApplication } from './ipc/serializers';
import type { ApplicationRecord } from '../preload/index';

export interface SyncResult {
    fetched: number;
    stored: number;
    classified: number;
    skippedDuplicates: number;
    error?: string;
}

/**
 * Fetch → dedupe by messageId → classify with local LLM → store with
 * suggestion. Never modifies the mail on the server (no mark-as-seen), never
 * auto-applies status changes - the user reviews each suggestion in the UI.
 */
export async function syncInbox(): Promise<SyncResult> {
    const result: SyncResult = {
        fetched: 0,
        stored: 0,
        classified: 0,
        skippedDuplicates: 0,
    };
    try {
        // Only look back as far as our newest known record, with a 7-day
        // overlap to catch anything that slipped in since. First run falls
        // back to the 30-day default inside fetchRecentUnread.
        const latest = getLatestInboundReceivedAt();
        const since = latest
            ? new Date(new Date(latest).getTime() - 7 * 24 * 60 * 60 * 1000)
            : undefined;

        const messages = await fetchRecentUnread(since);
        result.fetched = messages.length;

        const apps = listApplications();

        for (const msg of messages) {
            if (getInboundEmailByMessageId(msg.messageId)) {
                result.skippedDuplicates += 1;
                continue;
            }
            // Classify via LLM. If Ollama is down or rejects, we still store
            // the message so the user can triage manually.
            const classification = await classifyInboundEmail(
                {
                    subject: msg.subject,
                    fromAddress: msg.fromAddress,
                    fromName: msg.fromName,
                    bodyText: msg.bodyText,
                },
                apps,
            );
            const inserted = insertInboundEmail({
                messageId: msg.messageId,
                fromAddress: msg.fromAddress,
                fromName: msg.fromName,
                subject: msg.subject,
                bodyText: msg.bodyText,
                receivedAt: msg.receivedAt,
                suggestedApplicationId: classification.applicationId,
                suggestedStatus: classification.status,
                suggestedNote: classification.note,
                confidence: classification.confidence,
            });
            if (inserted) {
                result.stored += 1;
                if (
                    classification.status &&
                    classification.status !== 'other' &&
                    classification.applicationId
                ) {
                    result.classified += 1;
                }
            } else {
                result.skippedDuplicates += 1;
            }
        }
    } catch (err) {
        result.error = (err as Error).message;
    }
    return result;
}

export interface ApplySuggestionResult {
    ok: boolean;
    application?: ApplicationRecord;
    error?: string;
}

/**
 * Accept a suggestion: apply the status change to the linked application and
 * prepend the LLM note to the application's notes, then mark the inbound
 * email as 'applied'. No-op if the suggestion has no status/application.
 */
export function applySuggestion(
    inboundId: string,
    applicationId: string,
    status: ApplicationStatus,
    note: string,
): ApplySuggestionResult {
    try {
        const apps = listApplications();
        const app = apps.find((a) => a.id === applicationId);
        if (!app) {
            return { ok: false, error: `Application ${applicationId} not found` };
        }
        const prefix =
            note && note.trim().length > 0
                ? `[${new Date().toISOString().slice(0, 10)}] ${note.trim()}\n\n`
                : '';
        const mergedNotes = prefix + (app.notes ?? '');
        const updated = updateApplication(applicationId, {
            status,
            notes: mergedNotes,
        });
        setInboundReviewStatus(inboundId, 'applied');
        return { ok: true, application: serializeApplication(updated) };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export function dismissSuggestion(inboundId: string): void {
    setInboundReviewStatus(inboundId, 'dismissed');
}

export function reassignSuggestion(
    inboundId: string,
    applicationId: string | null,
    status: ApplicationStatus | 'other' | null,
): void {
    updateInboundSuggestion(inboundId, applicationId, status);
}

export function setReviewStatus(
    inboundId: string,
    status: InboundReviewStatus,
): void {
    setInboundReviewStatus(inboundId, status);
}
