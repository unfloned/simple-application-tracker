import { app } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type { ApplicationStatus } from '@shared/application';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized');
    return db;
}

/**
 * One-shot migration from older app-folder names used pre-rename. Only runs
 * when the target DB does not yet exist, copies sqlite + config files over
 * so first-launch of the renamed app preserves user data.
 */
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
                if (!existsSync(targetCvDir)) mkdirSync(targetCvDir, { recursive: true });
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

    createApplicationsTable(db);
    runApplicationsMigrations(db);
    createEventsTable(db);
    createEmailLogTable(db);
    createInboundEmailsTable(db);
    backfillSeedEvents(db);
}

function createApplicationsTable(db: Database.Database): void {
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
}

function runApplicationsMigrations(db: Database.Database): void {
    const cols = db.prepare('PRAGMA table_info(applications)').all() as { name: string }[];
    const set = new Set(cols.map((c) => c.name));
    const migrations: Array<[string, string]> = [
        ['requiredProfile', "ALTER TABLE applications ADD COLUMN requiredProfile TEXT NOT NULL DEFAULT ''"],
        ['benefits', "ALTER TABLE applications ADD COLUMN benefits TEXT NOT NULL DEFAULT ''"],
        ['interviews', "ALTER TABLE applications ADD COLUMN interviews TEXT NOT NULL DEFAULT ''"],
        ['matchScore', "ALTER TABLE applications ADD COLUMN matchScore INTEGER NOT NULL DEFAULT 0"],
        ['matchReason', "ALTER TABLE applications ADD COLUMN matchReason TEXT NOT NULL DEFAULT ''"],
    ];
    for (const [col, sql] of migrations) {
        if (!set.has(col)) db.exec(sql);
    }
}

function createEventsTable(db: Database.Database): void {
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
}

function createEmailLogTable(db: Database.Database): void {
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
}

function createInboundEmailsTable(db: Database.Database): void {
    // messageId is the RFC822 header, unique per email. We store the raw
    // fields plus the LLM classification result and a review status so the
    // user can approve, dismiss or reassign each suggestion.
    db.exec(`
        CREATE TABLE IF NOT EXISTS inbound_emails (
            id TEXT PRIMARY KEY,
            messageId TEXT NOT NULL UNIQUE,
            fromAddress TEXT NOT NULL DEFAULT '',
            fromName TEXT NOT NULL DEFAULT '',
            subject TEXT NOT NULL DEFAULT '',
            bodyText TEXT NOT NULL DEFAULT '',
            receivedAt TEXT NOT NULL,
            fetchedAt TEXT NOT NULL,
            suggestedApplicationId TEXT,
            suggestedStatus TEXT,
            suggestedNote TEXT NOT NULL DEFAULT '',
            confidence INTEGER NOT NULL DEFAULT 0,
            reviewStatus TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY (suggestedApplicationId) REFERENCES applications(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS inbound_emails_review_idx
            ON inbound_emails(reviewStatus, receivedAt);
        CREATE INDEX IF NOT EXISTS inbound_emails_app_idx
            ON inbound_emails(suggestedApplicationId);
    `);
}

/**
 * Seed-event backfill: every application without events gets one seed entry
 * at its createdAt so analytics has a starting point. Runs once — rows that
 * already have events are skipped.
 */
function backfillSeedEvents(db: Database.Database): void {
    const missing = db
        .prepare(
            `SELECT a.id, a.status, a.createdAt
             FROM applications a
             LEFT JOIN application_events e ON e.applicationId = a.id
             WHERE e.id IS NULL
             GROUP BY a.id`,
        )
        .all() as { id: string; status: ApplicationStatus; createdAt: string }[];
    if (missing.length === 0) return;

    const insert = db.prepare(
        'INSERT INTO application_events (id, applicationId, fromStatus, toStatus, changedAt) VALUES (?, ?, NULL, ?, ?)',
    );
    const tx = db.transaction((rows: typeof missing) => {
        for (const r of rows) insert.run(randomUUID(), r.id, r.status, r.createdAt);
    });
    tx(missing);
    console.log(`[events] Backfilled ${missing.length} application events`);
}
