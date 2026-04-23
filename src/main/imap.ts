import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getUserProfile } from './profile';

export interface RawInboundMessage {
    messageId: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    bodyText: string;
    receivedAt: string;
}

export interface ImapTestResult {
    ok: boolean;
    error?: string;
    inboxMessages?: number;
}

function clientFromProfile(): ImapFlow | null {
    const p = getUserProfile();
    if (!p.imapHost || !p.imapUser || !p.imapPassword) return null;
    return new ImapFlow({
        host: p.imapHost,
        port: p.imapPort || 993,
        secure: p.imapSecure !== false,
        auth: { user: p.imapUser, pass: p.imapPassword },
        logger: false,
    });
}

export async function testImapConnection(): Promise<ImapTestResult> {
    const client = clientFromProfile();
    if (!client) return { ok: false, error: 'IMAP is not configured' };
    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const mbox = client.mailbox;
            const count = typeof mbox === 'object' ? mbox.exists : 0;
            return { ok: true, inboxMessages: count };
        } finally {
            lock.release();
        }
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore
        }
    }
}

/**
 * Fetch unread messages from INBOX received since `since` (default: last 30
 * days). Does NOT mark messages as seen on the server - the user's own mail
 * client should still show them as new. We deduplicate against our own DB by
 * RFC822 messageId on the caller side, not here.
 */
export async function fetchRecentUnread(
    since: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
): Promise<RawInboundMessage[]> {
    const client = clientFromProfile();
    if (!client) throw new Error('IMAP is not configured');

    await client.connect();
    const results: RawInboundMessage[] = [];

    try {
        const lock = await client.getMailboxLock('INBOX');
        try {
            const search = await client.search({ since, seen: false });
            if (!search || search.length === 0) return [];

            for await (const msg of client.fetch(search, {
                source: true,
                envelope: true,
                internalDate: true,
            })) {
                if (!msg.source) continue;
                const parsed = await simpleParser(msg.source as Buffer);
                const fromAddr = parsed.from?.value?.[0];
                const messageId =
                    parsed.messageId ?? `imap:${msg.uid}@${msg.emailId ?? msg.seq}`;
                const receivedAtDate =
                    parsed.date ?? (msg.internalDate as Date | undefined) ?? new Date();
                const receivedAt =
                    receivedAtDate instanceof Date
                        ? receivedAtDate.toISOString()
                        : new Date(receivedAtDate).toISOString();

                results.push({
                    messageId,
                    fromAddress: fromAddr?.address ?? '',
                    fromName: fromAddr?.name ?? '',
                    subject: parsed.subject ?? '',
                    bodyText: (parsed.text ?? stripHtmlFallback(parsed.html)).slice(0, 20000),
                    receivedAt,
                });
            }
        } finally {
            lock.release();
        }
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore
        }
    }

    return results;
}

function stripHtmlFallback(html: string | false | undefined): string {
    if (!html) return '';
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
