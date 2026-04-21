import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import Store from 'electron-store';
import type { ApplicationInput, ExtractedJobData, FitAssessment } from '@shared/application';
import { stripHtmlPage } from '@shared/html';
import { getAgentProfile } from './agents';
import {
    FIT_SCORE_MAX,
    FIT_SCORE_MIN,
    LLM_PAGE_CHAR_LIMIT,
    OLLAMA_FETCH_TIMEOUT_MS,
    OLLAMA_START_POLL_APP_ATTEMPTS,
    OLLAMA_START_POLL_CLI_ATTEMPTS,
    OLLAMA_START_POLL_MS,
} from './constants';

interface Config {
    ollamaUrl: string;
    ollamaModel: string;
}

const configStore = new Store<Config>({
    defaults: {
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2:3b',
    },
});

export function getLlmConfig(): Config {
    return {
        ollamaUrl: configStore.get('ollamaUrl'),
        ollamaModel: configStore.get('ollamaModel'),
    };
}

export function setLlmConfig(config: Partial<Config>): void {
    if (config.ollamaUrl !== undefined) configStore.set('ollamaUrl', config.ollamaUrl);
    if (config.ollamaModel !== undefined) configStore.set('ollamaModel', config.ollamaModel);
}

export interface LlmStatus {
    running: boolean;
    models: string[];
    error?: string;
}

export async function checkLlmStatus(): Promise<LlmStatus> {
    const { ollamaUrl } = getLlmConfig();
    try {
        const response = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) return { running: false, models: [], error: `HTTP ${response.status}` };
        const json = (await response.json()) as { models?: { name: string }[] };
        return { running: true, models: (json.models ?? []).map((m) => m.name) };
    } catch (err) {
        return { running: false, models: [], error: (err as Error).message };
    }
}

const OLLAMA_CLI_CANDIDATES = [
    '/opt/homebrew/bin/ollama',
    '/usr/local/bin/ollama',
    '/usr/bin/ollama',
];

function findOllamaCli(): string | null {
    for (const path of OLLAMA_CLI_CANDIDATES) {
        if (existsSync(path)) return path;
    }
    return null;
}

export interface StartResult {
    started: boolean;
    method: 'app' | 'cli' | 'already-running' | 'none';
    message?: string;
}

export async function startOllama(): Promise<StartResult> {
    const pre = await checkLlmStatus();
    if (pre.running) return { started: true, method: 'already-running' };

    if (existsSync('/Applications/Ollama.app')) {
        spawn('open', ['-a', 'Ollama'], { detached: true, stdio: 'ignore' }).unref();
        for (let i = 0; i < OLLAMA_START_POLL_APP_ATTEMPTS; i++) {
            await new Promise((r) => setTimeout(r, OLLAMA_START_POLL_MS));
            const status = await checkLlmStatus();
            if (status.running) return { started: true, method: 'app' };
        }
        return {
            started: false,
            method: 'app',
            message: `Ollama app launched but did not respond within ${OLLAMA_START_POLL_APP_ATTEMPTS}s.`,
        };
    }

    const cli = findOllamaCli();
    if (!cli) {
        return {
            started: false,
            method: 'none',
            message:
                'Ollama not found. Install via `brew install ollama` or the desktop app from https://ollama.com/download.',
        };
    }

    spawn(cli, ['serve'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < OLLAMA_START_POLL_CLI_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, OLLAMA_START_POLL_MS));
        const status = await checkLlmStatus();
        if (status.running) return { started: true, method: 'cli' };
    }
    return {
        started: false,
        method: 'cli',
        message: `\`ollama serve\` launched but did not respond within ${OLLAMA_START_POLL_CLI_ATTEMPTS}s.`,
    };
}

export async function unloadModel(): Promise<{ ok: boolean }> {
    const { ollamaUrl, ollamaModel } = getLlmConfig();
    try {
        await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: ollamaModel, keep_alive: 0, prompt: '' }),
            signal: AbortSignal.timeout(5000),
        });
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

export async function pullModel(modelName: string): Promise<{ ok: boolean; message?: string }> {
    const { ollamaUrl } = getLlmConfig();
    try {
        const response = await fetch(`${ollamaUrl}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: modelName, stream: false }),
            signal: AbortSignal.timeout(600000),
        });
        if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, message: (err as Error).message };
    }
}

async function fetchJobPage(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching URL`);
    const html = await response.text();
    return stripHtmlPage(html).slice(0, LLM_PAGE_CHAR_LIMIT);
}

const EXTRACTION_PROMPT = `Du analysierst eine deutsche Stellenanzeige und lieferst eine JSON-Zusammenfassung.

Gib exakt dieses JSON-Schema zurück, ohne Markdown-Codeblöcke und ohne weiteren Text:
{
  "companyName": "string",
  "jobTitle": "string",
  "location": "Stadt oder leer wenn nur remote",
  "remote": "onsite" | "hybrid" | "remote",
  "salaryMin": number (0 wenn nicht genannt),
  "salaryMax": number (0 wenn nicht genannt, EUR/Jahr),
  "stack": "Komma-separierte Tech-Stack-Stichworte",
  "jobDescription": "kurze 1-2 Satz Beschreibung auf Deutsch",
  "requiredProfile": ["Anforderung 1 an den Bewerber", "Anforderung 2", "..."],
  "benefits": ["Benefit 1", "Benefit 2", "..."],
  "source": "Job-Portal-Name wenn erkennbar (stepstone, join, personio, indeed, etc.)"
}

Stellenanzeigentext:
`;

export async function extractJobData(url: string): Promise<ExtractedJobData> {
    const config = getLlmConfig();
    const pageText = await fetchJobPage(url);

    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: config.ollamaModel,
            prompt: EXTRACTION_PROMPT + pageText,
            stream: false,
            format: 'json',
            options: { temperature: 0.1 },
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Ollama unreachable (${response.status}). Is \`ollama serve\` running? Is the model \`${config.ollamaModel}\` installed?`,
        );
    }

    const json = (await response.json()) as { response: string };
    const raw = json.response.trim();

    try {
        const parsed = JSON.parse(raw) as Partial<ExtractedJobData>;
        return {
            companyName: parsed.companyName ?? '',
            jobTitle: parsed.jobTitle ?? '',
            location: parsed.location ?? '',
            remote: (parsed.remote as ExtractedJobData['remote']) ?? 'onsite',
            salaryMin: parsed.salaryMin ?? 0,
            salaryMax: parsed.salaryMax ?? 0,
            stack: parsed.stack ?? '',
            jobDescription: parsed.jobDescription ?? '',
            requiredProfile: normalizeList(parsed.requiredProfile),
            benefits: normalizeList(parsed.benefits),
            source: parsed.source ?? '',
        };
    } catch (err) {
        throw new Error(`LLM response could not be parsed as JSON: ${raw.slice(0, 200)}`);
    }
}

function normalizeList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(/\n|;/)
            .map((line) => line.replace(/^[\s\-•]+/, '').trim())
            .filter((line) => line.length > 0);
    }
    return [];
}

const FIT_PROMPT = `Bewerte die Passung dieser Stelle zum Profil des Bewerbers.

Profil des Bewerbers:
{PROFILE}

Stelle:
{JOB}

Gib ein JSON zurück ohne Markdown-Codeblöcke:
{
  "score": number zwischen 0 und 100 (90+ perfekte Passung, 70-89 gut, 50-69 möglich, < 50 kein Fit),
  "reason": "Begründung auf Deutsch in 1-2 Sätzen, konkret mit Nennung von Match- und Mismatch-Punkten"
}
`;

export async function assessFit(input: ApplicationInput): Promise<FitAssessment> {
    const { ollamaUrl, ollamaModel } = getLlmConfig();
    const profile = getAgentProfile();

    const profileText = `- Gewünschter Stack: ${profile.stackKeywords}
- Remote bevorzugt: ${profile.remotePreferred ? 'ja' : 'egal'}
- Minimum-Gehalt: ${profile.minSalary} EUR/Jahr
- No-Gos: ${profile.antiStack}`;

    const jobText = `Firma: ${input.companyName || ''}
Titel: ${input.jobTitle || ''}
Ort: ${input.location || ''}
Remote: ${input.remote || 'onsite'}
Gehalt: ${input.salaryMin || 0}-${input.salaryMax || 0} ${input.salaryCurrency || 'EUR'}
Stack: ${input.stack || ''}
Anforderungen:
${(input.requiredProfile ?? []).map((item) => `- ${item}`).join('\n')}
Benefits:
${(input.benefits ?? []).map((item) => `- ${item}`).join('\n')}
Beschreibung:
${input.jobDescription || ''}`;

    const prompt = FIT_PROMPT.replace('{PROFILE}', profileText).replace('{JOB}', jobText);

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt,
                stream: false,
                format: 'json',
                options: { temperature: 0.2 },
            }),
            signal: AbortSignal.timeout(OLLAMA_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`Ollama HTTP ${response.status}`);
        }
        const json = (await response.json()) as { response: string };
        const parsed = JSON.parse(json.response.trim()) as FitAssessment;
        return {
            score: Math.max(FIT_SCORE_MIN, Math.min(FIT_SCORE_MAX, Number(parsed.score) || 0)),
            reason: String(parsed.reason || '').slice(0, 500),
        };
    } catch (err) {
        throw new Error(`Fit check failed: ${(err as Error).message}`);
    }
}
