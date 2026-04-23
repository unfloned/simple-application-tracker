import { app } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'node:path';

let db: Database.Database | null = null;

/**
 * Singleton accessor. First call creates the DB + runs the inline migrations;
 * every further call returns the cached handle.
 */
export function getDb(): Database.Database {
    if (db) return db;

    const userDataPath = app.getPath('userData');
    const dbPath = join(userDataPath, 'agents.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS job_searches (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            keywords TEXT NOT NULL DEFAULT '',
            sources TEXT NOT NULL DEFAULT '[]',
            locationFilter TEXT NOT NULL DEFAULT '',
            remoteOnly INTEGER NOT NULL DEFAULT 0,
            minSalary INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            interval TEXT NOT NULL DEFAULT '6h',
            lastRunAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS job_candidates (
            id TEXT PRIMARY KEY,
            searchId TEXT NOT NULL,
            sourceUrl TEXT NOT NULL,
            sourceKey TEXT NOT NULL UNIQUE,
            dedupKey TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            company TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            score INTEGER NOT NULL DEFAULT 0,
            scoreReason TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            favorite INTEGER NOT NULL DEFAULT 0,
            discoveredAt TEXT NOT NULL,
            importedApplicationId TEXT
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            searchId TEXT NOT NULL,
            searchLabel TEXT NOT NULL,
            startedAt TEXT NOT NULL,
            finishedAt TEXT,
            sources TEXT NOT NULL DEFAULT '[]',
            scanned INTEGER NOT NULL DEFAULT 0,
            added INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            canceled INTEGER NOT NULL DEFAULT 0
        );
    `);

    runSearchMigrations(db);
    runCandidateMigrations(db);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_candidate_search ON job_candidates(searchId);
        CREATE INDEX IF NOT EXISTS idx_candidate_status ON job_candidates(status);
        CREATE INDEX IF NOT EXISTS idx_candidate_score ON job_candidates(score DESC);
        CREATE INDEX IF NOT EXISTS idx_candidate_dedup ON job_candidates(dedupKey);
        CREATE INDEX IF NOT EXISTS idx_runs_started ON agent_runs(startedAt DESC);
    `);

    return db;
}

export function initAgentsDatabase(): void {
    getDb();
}

function runSearchMigrations(db: Database.Database): void {
    const cols = db.prepare('PRAGMA table_info(job_searches)').all() as { name: string }[];
    const set = new Set(cols.map((c) => c.name));
    if (!set.has('sources')) {
        db.exec("ALTER TABLE job_searches ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");
    }
    if (!set.has('interval')) {
        db.exec("ALTER TABLE job_searches ADD COLUMN interval TEXT NOT NULL DEFAULT '6h'");
    }
    // Back-fill legacy single-source rows into the new JSON-array column.
    if (set.has('source') && set.has('sources')) {
        const legacy = db
            .prepare("SELECT id, source FROM job_searches WHERE sources = '[]' OR sources IS NULL")
            .all() as Array<{ id: string; source: string }>;
        const update = db.prepare('UPDATE job_searches SET sources = ? WHERE id = ?');
        for (const row of legacy) {
            if (row.source) update.run(JSON.stringify([row.source]), row.id);
        }
    }
}

function runCandidateMigrations(db: Database.Database): void {
    const cols = db.prepare('PRAGMA table_info(job_candidates)').all() as { name: string }[];
    const set = new Set(cols.map((c) => c.name));
    if (!set.has('dedupKey')) {
        db.exec("ALTER TABLE job_candidates ADD COLUMN dedupKey TEXT NOT NULL DEFAULT ''");
        db.exec(
            "UPDATE job_candidates SET dedupKey = lower(company || '|' || title) WHERE dedupKey = ''",
        );
    }
    if (!set.has('favorite')) {
        db.exec('ALTER TABLE job_candidates ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
    }
    if (!set.has('keyFactsJson')) {
        db.exec("ALTER TABLE job_candidates ADD COLUMN keyFactsJson TEXT NOT NULL DEFAULT '[]'");
    }
    if (!set.has('concernsJson')) {
        db.exec("ALTER TABLE job_candidates ADD COLUMN concernsJson TEXT NOT NULL DEFAULT '[]'");
    }
    if (!set.has('redFlagsJson')) {
        db.exec("ALTER TABLE job_candidates ADD COLUMN redFlagsJson TEXT NOT NULL DEFAULT '[]'");
    }
}
