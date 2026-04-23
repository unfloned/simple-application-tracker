import type { JobCandidateInput, SerializedJobCandidate } from '@shared/job-search';
import { CANDIDATE_SEARCH_LIMIT } from '../constants';
import { getDb } from './db';
import { getAgentProfile } from './profile';
import { scoreJobListing } from './scorer';
import type { JobCandidateRow } from './types';
import { toSerializedCandidate } from './utils';

export function listCandidates(minScore: number = 0): SerializedJobCandidate[] {
    const rows = getDb()
        .prepare(
            "SELECT * FROM job_candidates WHERE score >= ? AND status != 'ignored' ORDER BY favorite DESC, score DESC, discoveredAt DESC LIMIT ?",
        )
        .all(minScore, CANDIDATE_SEARCH_LIMIT) as JobCandidateRow[];
    return rows.map(toSerializedCandidate);
}

export function listIgnoredCandidates(): SerializedJobCandidate[] {
    const rows = getDb()
        .prepare(
            "SELECT * FROM job_candidates WHERE status = 'ignored' ORDER BY discoveredAt DESC LIMIT ?",
        )
        .all(CANDIDATE_SEARCH_LIMIT) as JobCandidateRow[];
    return rows.map(toSerializedCandidate);
}

export function updateCandidate(id: string, input: JobCandidateInput): SerializedJobCandidate {
    const updates: Record<string, unknown> = { id };
    const sets: string[] = [];
    if (input.status !== undefined) {
        sets.push('status = @status');
        updates.status = input.status;
    }
    if (input.importedApplicationId !== undefined) {
        sets.push('importedApplicationId = @importedApplicationId');
        updates.importedApplicationId = input.importedApplicationId;
    }
    if (input.favorite !== undefined) {
        sets.push('favorite = @favorite');
        updates.favorite = input.favorite ? 1 : 0;
    }
    if (sets.length > 0) {
        getDb()
            .prepare(`UPDATE job_candidates SET ${sets.join(', ')} WHERE id = @id`)
            .run(updates);
    }
    const row = getDb()
        .prepare('SELECT * FROM job_candidates WHERE id = ?')
        .get(id) as JobCandidateRow;
    return toSerializedCandidate(row);
}

export function bulkUpdateCandidates(ids: string[], input: JobCandidateInput): number {
    if (ids.length === 0) return 0;
    const sets: string[] = [];
    const params: Record<string, unknown> = {};
    if (input.status !== undefined) {
        sets.push('status = @status');
        params.status = input.status;
    }
    if (input.favorite !== undefined) {
        sets.push('favorite = @favorite');
        params.favorite = input.favorite ? 1 : 0;
    }
    if (sets.length === 0) return 0;
    const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
    ids.forEach((id, i) => (params[`id${i}`] = id));
    const result = getDb()
        .prepare(`UPDATE job_candidates SET ${sets.join(', ')} WHERE id IN (${placeholders})`)
        .run(params);
    return result.changes;
}

/** Hard delete: removes rows from the DB. Protects imported candidates. */
export function deleteCandidates(ids: string[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
    const params: Record<string, unknown> = {};
    ids.forEach((id, i) => (params[`id${i}`] = id));
    const result = getDb()
        .prepare(
            `DELETE FROM job_candidates WHERE id IN (${placeholders}) AND status != 'imported'`,
        )
        .run(params);
    return result.changes;
}

/** Hard delete all non-imported candidates below a score threshold. */
export function deleteCandidatesBelowScore(threshold: number): number {
    const result = getDb()
        .prepare("DELETE FROM job_candidates WHERE score < ? AND status != 'imported'")
        .run(threshold);
    return result.changes;
}

export interface CandidateCounts {
    /** non-ignored, non-imported. */
    active: number;
    ignored: number;
    imported: number;
    /** non-ignored, non-imported AND score < 50. */
    lowScore: number;
    total: number;
}

/** Re-run the LLM scorer against an existing candidate and persist the result. */
export async function rescoreCandidate(id: string): Promise<SerializedJobCandidate> {
    const row = getDb().prepare('SELECT * FROM job_candidates WHERE id = ?').get(id) as
        | JobCandidateRow
        | undefined;
    if (!row) throw new Error(`Candidate ${id} not found`);

    const profile = getAgentProfile();
    const result = await scoreJobListing(
        row.title,
        row.company,
        row.location,
        row.summary,
        profile,
    );

    getDb()
        .prepare(
            `UPDATE job_candidates
             SET score = @score,
                 scoreReason = @scoreReason,
                 keyFactsJson = @keyFactsJson,
                 concernsJson = @concernsJson,
                 redFlagsJson = @redFlagsJson
             WHERE id = @id`,
        )
        .run({
            id,
            score: result.score,
            scoreReason: result.reason,
            keyFactsJson: JSON.stringify(result.keyFacts ?? []),
            concernsJson: JSON.stringify(result.concerns ?? []),
            redFlagsJson: JSON.stringify(result.redFlags ?? []),
        });

    const updated = getDb()
        .prepare('SELECT * FROM job_candidates WHERE id = ?')
        .get(id) as JobCandidateRow;
    return toSerializedCandidate(updated);
}

export interface RescoreResult {
    scored: number;
    errors: number;
}

/** Re-score many candidates sequentially. Errors are counted, not thrown. */
export async function rescoreCandidates(ids: string[]): Promise<RescoreResult> {
    let scored = 0;
    let errors = 0;
    for (const id of ids) {
        try {
            await rescoreCandidate(id);
            scored += 1;
        } catch {
            errors += 1;
        }
    }
    return { scored, errors };
}

export function countCandidates(): CandidateCounts {
    const db = getDb();
    const row = db
        .prepare(
            `SELECT
                SUM(CASE WHEN status NOT IN ('ignored','imported') THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) AS ignored,
                SUM(CASE WHEN status = 'imported' THEN 1 ELSE 0 END) AS imported,
                SUM(CASE WHEN status NOT IN ('ignored','imported') AND score < 50 THEN 1 ELSE 0 END) AS lowScore,
                COUNT(*) AS total
             FROM job_candidates`,
        )
        .get() as Record<string, number | null>;
    return {
        active: Number(row.active) || 0,
        ignored: Number(row.ignored) || 0,
        imported: Number(row.imported) || 0,
        lowScore: Number(row.lowScore) || 0,
        total: Number(row.total) || 0,
    };
}
