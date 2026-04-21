import { app } from 'electron';
import { join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ApplicationInput, ApplicationStatus, Priority, RemoteType } from '@shared/application';

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
        join(userDataPath, '..', 'bewerbungen-tracker'),
        join(userDataPath, '..', 'Bewerbungen-Tracker'),
    ];

    const targetDb = join(userDataPath, 'tracker.sqlite');
    if (existsSync(targetDb)) return;

    for (const legacyDir of legacyCandidates) {
        if (!existsSync(legacyDir)) continue;
        const legacyFiles = ['tracker.sqlite', 'tracker.sqlite-wal', 'tracker.sqlite-shm', 'agents.sqlite', 'config.json', 'agent-profile.json'];
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
        ['matchScore', "ALTER TABLE applications ADD COLUMN matchScore INTEGER NOT NULL DEFAULT 0"],
        ['matchReason', "ALTER TABLE applications ADD COLUMN matchReason TEXT NOT NULL DEFAULT ''"],
    ];
    for (const [col, sql] of migrations) {
        if (!existing.has(col)) db.exec(sql);
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
    return getApplication(id)!;
}

export function updateApplication(id: string, input: ApplicationInput): ApplicationRow {
    const existing = getApplication(id);
    if (!existing) throw new Error(`Application ${id} not found`);

    const updates: Record<string, unknown> = { updatedAt: now() };
    for (const field of FIELDS) {
        if (input[field] !== undefined) {
            if (field === 'requiredProfile' || field === 'benefits') {
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

    return getApplication(id)!;
}

export function deleteApplication(id: string): void {
    getDb().prepare('DELETE FROM applications WHERE id = ?').run(id);
}
