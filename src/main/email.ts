import nodemailer from 'nodemailer';
import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { getUserProfile } from './profile';
import { logSentEmail } from './db';

export interface EmailSendRequest {
    to: string;
    subject: string;
    body: string;
    attachCv?: boolean;
    /** If set, the send is recorded in email_log for the given application. */
    applicationId?: string;
}

export interface EmailSendResult {
    ok: boolean;
    messageId?: string;
    error?: string;
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
    const profile = getUserProfile();
    if (!profile.smtpHost || !profile.smtpUser) {
        return { ok: false, error: 'SMTP is not configured' };
    }
    try {
        const transporter = nodemailer.createTransport({
            host: profile.smtpHost,
            port: profile.smtpPort || 587,
            secure: profile.smtpSecure,
            auth: {
                user: profile.smtpUser,
                pass: profile.smtpPassword,
            },
        });
        await transporter.verify();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function sendEmail(req: EmailSendRequest): Promise<EmailSendResult> {
    const profile = getUserProfile();
    if (!profile.smtpHost || !profile.smtpUser) {
        return { ok: false, error: 'SMTP is not configured. Open Settings -> Profile.' };
    }
    if (!req.to) {
        return { ok: false, error: 'Recipient is empty.' };
    }

    const transporter = nodemailer.createTransport({
        host: profile.smtpHost,
        port: profile.smtpPort || 587,
        secure: profile.smtpSecure,
        auth: {
            user: profile.smtpUser,
            pass: profile.smtpPassword,
        },
    });

    const fromAddress = profile.smtpUser || profile.email;
    const fromName = profile.smtpFromName || profile.fullName || '';
    const from = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;

    const attachments: Array<{ filename: string; path: string }> = [];
    if (req.attachCv && profile.cvPath && existsSync(profile.cvPath)) {
        try {
            statSync(profile.cvPath);
            attachments.push({
                filename: basename(profile.cvPath),
                path: profile.cvPath,
            });
        } catch {
            // ignore
        }
    }

    try {
        const info = await transporter.sendMail({
            from,
            to: req.to,
            subject: req.subject,
            html: req.body,
            attachments,
        });
        if (req.applicationId) {
            try {
                logSentEmail({
                    applicationId: req.applicationId,
                    toAddress: req.to,
                    subject: req.subject,
                    body: req.body,
                    messageId: info.messageId,
                    status: 'ok',
                });
            } catch (err) {
                console.warn('[email] log insert failed:', (err as Error).message);
            }
        }
        return { ok: true, messageId: info.messageId };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}
