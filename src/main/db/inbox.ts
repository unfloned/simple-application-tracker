import { randomUUID } from 'node:crypto';
import type { ApplicationStatus } from '@shared/application';
import { getDb } from './init';

export type InboundReviewStatus = 'pending' | 'applied' | 'dismissed';

export interface InboundEmailRow {
    id: string;
    messageId: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    bodyText: string;
    receivedAt: string;
    fetchedAt: string;
    suggestedApplicationId: string | null;
    suggestedStatus: ApplicationStatus | 'other' | null;
    suggestedNote: string;
    confidence: number;
    reviewStatus: InboundReviewStatus;
}

export interface InboundEmailInput {
    messageId: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    bodyText: string;
    receivedAt: string;
    suggestedApplicationId: string | null;
    suggestedStatus: ApplicationStatus | 'other' | null;
    suggestedNote: string;
    confidence: number;
}

export function insertInboundEmail(input: InboundEmailInput): InboundEmailRow | null {
    const db = getDb();
    const id = randomUUID();
    const fetchedAt = new Date().toISOString();
    // INSERT OR IGNORE by messageId so repeated fetches are idempotent.
    const result = db
        .prepare(
            `INSERT OR IGNORE INTO inbound_emails (
                id, messageId, fromAddress, fromName, subject, bodyText, receivedAt, fetchedAt,
                suggestedApplicationId, suggestedStatus, suggestedNote, confidence, reviewStatus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        )
        .run(
            id,
            input.messageId,
            input.fromAddress,
            input.fromName,
            input.subject,
            input.bodyText,
            input.receivedAt,
            fetchedAt,
            input.suggestedApplicationId,
            input.suggestedStatus,
            input.suggestedNote,
            input.confidence,
        );
    if (result.changes === 0) return null;
    return getInboundEmailByMessageId(input.messageId);
}

export function getInboundEmailByMessageId(messageId: string): InboundEmailRow | null {
    const db = getDb();
    const row = db
        .prepare('SELECT * FROM inbound_emails WHERE messageId = ?')
        .get(messageId) as InboundEmailRow | undefined;
    return row ?? null;
}

export function listInboundEmails(reviewStatus?: InboundReviewStatus): InboundEmailRow[] {
    const db = getDb();
    if (reviewStatus) {
        return db
            .prepare('SELECT * FROM inbound_emails WHERE reviewStatus = ? ORDER BY receivedAt DESC')
            .all(reviewStatus) as InboundEmailRow[];
    }
    return db
        .prepare('SELECT * FROM inbound_emails ORDER BY receivedAt DESC')
        .all() as InboundEmailRow[];
}

export function setInboundReviewStatus(id: string, status: InboundReviewStatus): void {
    getDb()
        .prepare('UPDATE inbound_emails SET reviewStatus = ? WHERE id = ?')
        .run(status, id);
}

export function updateInboundSuggestion(
    id: string,
    suggestedApplicationId: string | null,
    suggestedStatus: ApplicationStatus | 'other' | null,
): void {
    getDb()
        .prepare(
            'UPDATE inbound_emails SET suggestedApplicationId = ?, suggestedStatus = ? WHERE id = ?',
        )
        .run(suggestedApplicationId, suggestedStatus, id);
}

export function getLatestInboundReceivedAt(): string | null {
    const db = getDb();
    const row = db
        .prepare('SELECT MAX(receivedAt) as max FROM inbound_emails')
        .get() as { max: string | null } | undefined;
    return row?.max ?? null;
}
