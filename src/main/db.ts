import { app } from 'electron';
import { join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ApplicationInput, ApplicationStatus, Priority, RemoteType } from '@shared/application';

/** A single status change on an application. Written on create and on
 *  status update. Backfilled once per existing row so analytics can compute
 *  stage transitions over time even for data that predates this feature. */
export interface ApplicationEventRow {
    id: string;
    applicationId: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    changedAt: Date;
}

export interface ApplicationRow {
    id: string;
    companyName: string;
    companyWebsite: string;
    jobTitle: string;
    jobUrl: string;
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
    createdAt: Date;
    updatedAt: Date;
}

interface RawRow {
    id: string;
    companyName: string;
    companyWebsite: string;
    jobTitle: string;
    jobUrl: string;
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
    requiredProfile: string;
    benefits: string;
    interviews: string;
    matchScore: number;
    matchReason: string;
    source: string;
    appliedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

function parseList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
    } catch {
        return raw
            .split(/\n/)
            .map((line) => line.replace(/^[\s\-•]+/, '').trim())
            .filter((line) => line.length > 0);
    }
    return [];
}

function stringifyList(list: string[] | undefined): string {
    return JSON.stringify(list ?? []);
}

let db: Database.Database | null = null;

function migrateFromLegacyAppFolder(userDataPath: string): void {
    const legacyCandidates = [
        join(userDataPath, '..', 'Simple Application Tracker'),
        join(userDataPath, '..', 'simple-application-tracker'),
        join(userDataPath, '..', 'bewerbungen-tracker'),
        join(userDataPath, '..', 'Bewerbungen-Tracker'),
    ];

    const targetDb = join(userDataPath, 'tracker.sqlite');
    if (existsSync(targetDb)) return;

    const legacyFiles = [
        'tracker.sqlite',
        'tracker.sqlite-wal',
        'tracker.sqlite-shm',
        'agents.sqlite',
        'agents.sqlite-wal',
        'agents.sqlite-shm',
        'config.json',
        'agent-profile.json',
        'user-profile.json',
        'geocode-cache.json',
    ];

    for (const legacyDir of legacyCandidates) {
        if (!existsSync(legacyDir)) continue;
        let copied = 0;
        for (const file of legacyFiles) {
            const src = join(legacyDir, file);
            if (existsSync(src)) {
                try {
                    copyFileSync(src, join(userDataPath, file));
                    copied += 1;
                } catch (err) {
                    console.warn(`[migration] Copy ${file} failed:`, (err as Error).message);
                }
            }
        }
        const legacyCvDir = join(legacyDir, 'cv');
        if (existsSync(legacyCvDir)) {
            try {
                const targetCvDir = join(userDataPath, 'cv');
                if (!existsSync(targetCvDir)) {
                    mkdirSync(targetCvDir, { recursive: true });
                }
                for (const entry of readdirSync(legacyCvDir)) {
                    copyFileSync(join(legacyCvDir, entry), join(targetCvDir, entry));
                    copied += 1;
                }
            } catch (err) {
                console.warn('[migration] CV copy failed:', (err as Error).message);
            }
        }
        if (copied > 0) {
            console.log(`[migration] Restored ${copied} files from ${legacyDir}`);
            return;
        }
    }
}

export function initDatabase(): void {
    if (db) return;
    const userDataPath = app.getPath('userData');
    mkdirSync(userDataPath, { recursive: true });

    migrateFromLegacyAppFolder(userDataPath);

    const dbPath = join(userDataPath, 'tracker.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            companyName TEXT NOT NULL DEFAULT '',
            companyWebsite TEXT NOT NULL DEFAULT '',
            jobTitle TEXT NOT NULL DEFAULT '',
            jobUrl TEXT NOT NULL DEFAULT '',
            jobDescription TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            remote TEXT NOT NULL DEFAULT 'onsite',
            salaryMin INTEGER NOT NULL DEFAULT 0,
            salaryMax INTEGER NOT NULL DEFAULT 0,
            salaryCurrency TEXT NOT NULL DEFAULT 'EUR',
            stack TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            contactName TEXT NOT NULL DEFAULT '',
            contactEmail TEXT NOT NULL DEFAULT '',
            contactPhone TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'medium',
            requiredProfile TEXT NOT NULL DEFAULT '',
            benefits TEXT NOT NULL DEFAULT '',
            interviews TEXT NOT NULL DEFAULT '',
            matchScore INTEGER NOT NULL DEFAULT 0,
            matchReason TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT '',
            appliedAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );
    `);

    const columns = db.prepare('PRAGMA table_info(applications)').all() as { name: string }[];
    const existing = new Set(columns.map((c) => c.name));
    const migrations: Array<[string, string]> = [
        ['requiredProfile', "ALTER TABLE applications ADD COLUMN requiredProfile TEXT NOT NULL DEFAULT ''"],
        ['benefits', "ALTER TABLE applications ADD COLUMN benefits TEXT NOT NULL DEFAULT ''"],
        ['interviews', "ALTER TABLE applications ADD COLUMN interviews TEXT NOT NULL DEFAULT ''"],
        ['matchScore', "ALTER TABLE applications ADD COLUMN matchScore INTEGER NOT NULL DEFAULT 0"],
        ['matchReason', "ALTER TABLE applications ADD COLUMN matchReason TEXT NOT NULL DEFAULT ''"],
    ];
    for (const [col, sql] of migrations) {
        if (!existing.has(col)) db.exec(sql);
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS application_events (
            id TEXT PRIMARY KEY,
            applicationId TEXT NOT NULL,
            fromStatus TEXT,
            toStatus TEXT NOT NULL,
            changedAt TEXT NOT NULL,
            FOREIGN KEY (applicationId) REFERENCES applications(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS application_events_app_idx
            ON application_events(applicationId, changedAt);
        CREATE INDEX IF NOT EXISTS application_events_time_idx
            ON application_events(changedAt);
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS email_log (
            id TEXT PRIMARY KEY,
            applicationId TEXT NOT NULL,
            toAddress TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            sentAt TEXT NOT NULL,
            messageId TEXT,
            status TEXT NOT NULL DEFAULT 'ok',
            FOREIGN KEY (applicationId) REFERENCES applications(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS email_log_app_idx
            ON email_log(applicationId, sentAt);
    `);

    // Backfill: every existing application gets one seed event at createdAt
    // so the analytics history has a starting point. Only runs once — if any
    // event row already exists for the row, we skip it.
    const missing = db
        .prepare(
            `SELECT a.id, a.status, a.createdAt
             FROM applications a
             LEFT JOIN application_events e ON e.applicationId = a.id
             WHERE e.id IS NULL
             GROUP BY a.id`,
        )
        .all() as { id: string; status: ApplicationStatus; createdAt: string }[];
    if (missing.length > 0) {
        const insert = db.prepare(
            'INSERT INTO application_events (id, applicationId, fromStatus, toStatus, changedAt) VALUES (?, ?, NULL, ?, ?)',
        );
        const tx = db.transaction((rows: typeof missing) => {
            for (const r of rows) insert.run(randomUUID(), r.id, r.status, r.createdAt);
        });
        tx(missing);
        console.log(`[events] Backfilled ${missing.length} application events`);
    }
}

function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized');
    return db;
}

function fromRaw(raw: RawRow): ApplicationRow {
    return {
        ...raw,
        requiredProfile: parseList(raw.requiredProfile),
        benefits: parseList(raw.benefits),
        interviews: parseList(raw.interviews),
        appliedAt: raw.appliedAt ? new Date(raw.appliedAt) : null,
        createdAt: new Date(raw.createdAt),
        updatedAt: new Date(raw.updatedAt),
    };
}

function now(): string {
    return new Date().toISOString();
}

const FIELDS: (keyof ApplicationInput)[] = [
    'companyName',
    'companyWebsite',
    'jobTitle',
    'jobUrl',
    'jobDescription',
    'location',
    'remote',
    'salaryMin',
    'salaryMax',
    'salaryCurrency',
    'stack',
    'status',
    'contactName',
    'contactEmail',
    'contactPhone',
    'notes',
    'tags',
    'priority',
    'requiredProfile',
    'benefits',
    'interviews',
    'matchScore',
    'matchReason',
    'source',
];

export function listApplications(): ApplicationRow[] {
    const rows = getDb()
        .prepare('SELECT * FROM applications ORDER BY updatedAt DESC')
        .all() as RawRow[];
    return rows.map(fromRaw);
}

export function getApplication(id: string): ApplicationRow | null {
    const row = getDb()
        .prepare('SELECT * FROM applications WHERE id = ?')
        .get(id) as RawRow | undefined;
    return row ? fromRaw(row) : null;
}

function recordEvent(
    applicationId: string,
    fromStatus: ApplicationStatus | null,
    toStatus: ApplicationStatus,
    changedAt: string,
): void {
    getDb()
        .prepare(
            'INSERT INTO application_events (id, applicationId, fromStatus, toStatus, changedAt) VALUES (?, ?, ?, ?, ?)',
        )
        .run(randomUUID(), applicationId, fromStatus, toStatus, changedAt);
}

export function createApplication(input: ApplicationInput): ApplicationRow {
    const id = randomUUID();
    const nowIso = now();
    const values: Record<string, unknown> = {
        id,
        companyName: input.companyName ?? '',
        companyWebsite: input.companyWebsite ?? '',
        jobTitle: input.jobTitle ?? '',
        jobUrl: input.jobUrl ?? '',
        jobDescription: input.jobDescription ?? '',
        location: input.location ?? '',
        remote: input.remote ?? 'onsite',
        salaryMin: input.salaryMin ?? 0,
        salaryMax: input.salaryMax ?? 0,
        salaryCurrency: input.salaryCurrency || 'EUR',
        stack: input.stack ?? '',
        status: input.status ?? 'draft',
        contactName: input.contactName ?? '',
        contactEmail: input.contactEmail ?? '',
        contactPhone: input.contactPhone ?? '',
        notes: input.notes ?? '',
        tags: input.tags ?? '',
        priority: input.priority ?? 'medium',
        requiredProfile: stringifyList(input.requiredProfile),
        benefits: stringifyList(input.benefits),
        interviews: stringifyList(input.interviews),
        matchScore: input.matchScore ?? 0,
        matchReason: input.matchReason ?? '',
        source: input.source ?? '',
        appliedAt: input.appliedAt ? input.appliedAt.toISOString() : null,
        createdAt: nowIso,
        updatedAt: nowIso,
    };
    const columns = Object.keys(values);
    const placeholders = columns.map((c) => `@${c}`).join(', ');
    getDb()
        .prepare(`INSERT INTO applications (${columns.join(', ')}) VALUES (${placeholders})`)
        .run(values);
    // Seed event so the application shows up in history from its creation.
    recordEvent(id, null, values.status as ApplicationStatus, nowIso);
    return getApplication(id)!;
}

export function updateApplication(id: string, input: ApplicationInput): ApplicationRow {
    const existing = getApplication(id);
    if (!existing) throw new Error(`Application ${id} not found`);

    const nowIso = now();
    const updates: Record<string, unknown> = { updatedAt: nowIso };
    for (const field of FIELDS) {
        if (input[field] !== undefined) {
            if (field === 'requiredProfile' || field === 'benefits' || field === 'interviews') {
                updates[field] = stringifyList(input[field] as string[]);
            } else {
                updates[field] = input[field];
            }
        }
    }
    if (input.appliedAt !== undefined) {
        updates.appliedAt = input.appliedAt ? input.appliedAt.toISOString() : null;
    }

    const setClause = Object.keys(updates)
        .map((c) => `${c} = @${c}`)
        .join(', ');
    getDb()
        .prepare(`UPDATE applications SET ${setClause} WHERE id = @id`)
        .run({ ...updates, id });

    // Log the status transition only when status actually changed. Keeps the
    // event log honest (a field-only edit does not count as a stage change).
    if (input.status !== undefined && input.status !== existing.status) {
        recordEvent(id, existing.status, input.status, nowIso);
    }

    return getApplication(id)!;
}

export function deleteApplication(id: string): void {
    // Events cascade via ON DELETE CASCADE in the schema.
    getDb().prepare('DELETE FROM applications WHERE id = ?').run(id);
}

export function listApplicationEvents(): ApplicationEventRow[] {
    const rows = getDb()
        .prepare(
            'SELECT id, applicationId, fromStatus, toStatus, changedAt FROM application_events ORDER BY changedAt ASC',
        )
        .all() as {
            id: string;
            applicationId: string;
            fromStatus: ApplicationStatus | null;
            toStatus: ApplicationStatus;
            changedAt: string;
        }[];
    return rows.map((r) => ({
        id: r.id,
        applicationId: r.applicationId,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        changedAt: new Date(r.changedAt),
    }));
}

export interface EmailLogRow {
    id: string;
    applicationId: string;
    toAddress: string;
    subject: string;
    body: string;
    sentAt: Date;
    messageId: string | null;
    status: string;
}

export function logSentEmail(entry: {
    applicationId: string;
    toAddress: string;
    subject: string;
    body: string;
    messageId?: string;
    status?: 'ok' | 'failed';
}): EmailLogRow {
    const id = randomUUID();
    const sentAt = now();
    getDb()
        .prepare(
            `INSERT INTO email_log (id, applicationId, toAddress, subject, body, sentAt, messageId, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            id,
            entry.applicationId,
            entry.toAddress,
            entry.subject,
            entry.body,
            sentAt,
            entry.messageId ?? null,
            entry.status ?? 'ok',
        );
    return {
        id,
        applicationId: entry.applicationId,
        toAddress: entry.toAddress,
        subject: entry.subject,
        body: entry.body,
        sentAt: new Date(sentAt),
        messageId: entry.messageId ?? null,
        status: entry.status ?? 'ok',
    };
}

export function listEmailsForApplication(applicationId: string): EmailLogRow[] {
    const rows = getDb()
        .prepare(
            'SELECT id, applicationId, toAddress, subject, body, sentAt, messageId, status FROM email_log WHERE applicationId = ? ORDER BY sentAt DESC',
        )
        .all(applicationId) as {
            id: string;
            applicationId: string;
            toAddress: string;
            subject: string;
            body: string;
            sentAt: string;
            messageId: string | null;
            status: string;
        }[];
    return rows.map((r) => ({
        id: r.id,
        applicationId: r.applicationId,
        toAddress: r.toAddress,
        subject: r.subject,
        body: r.body,
        sentAt: new Date(r.sentAt),
        messageId: r.messageId,
        status: r.status,
    }));
}

export function listEventsForApplication(applicationId: string): ApplicationEventRow[] {
    const rows = getDb()
        .prepare(
            'SELECT id, applicationId, fromStatus, toStatus, changedAt FROM application_events WHERE applicationId = ? ORDER BY changedAt ASC',
        )
        .all(applicationId) as {
            id: string;
            applicationId: string;
            fromStatus: ApplicationStatus | null;
            toStatus: ApplicationStatus;
            changedAt: string;
        }[];
    return rows.map((r) => ({
        id: r.id,
        applicationId: r.applicationId,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        changedAt: new Date(r.changedAt),
    }));
}
