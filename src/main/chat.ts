import type { BrowserWindow } from 'electron';
import { getLlmConfig } from './llm';
import { listApplications } from './db';
import { listCandidates } from './agents';
import type { ApplicationStatus } from '@shared/application';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    name?: string;
}

interface ToolCall {
    id?: string;
    function: {
        name: string;
        arguments: Record<string, unknown> | string;
    };
}

interface OllamaChatResponse {
    message: {
        role: string;
        content: string;
        tool_calls?: ToolCall[];
    };
    done: boolean;
}

const SYSTEM_PROMPT = `Du bist der Assistent des lokalen Bewerbungs-Trackers "Pitch Tracker". Du hilfst dem Nutzer dabei, einen Überblick über seine Bewerbungen zu bekommen.

Du hast Zugriff auf folgende Werkzeuge (Tools):
- list_applications: listet alle Bewerbungen (kann optional nach Status gefiltert werden)
- count_by_status: liefert Zählungen pro Status
- stats: Gesamtstatistiken (Total, durchschnittlicher Match-Score, Top-Firmen)
- list_candidates: listet Kandidaten aus Agent-Suchen (optional mit Mindest-Score)
- search_applications: Volltextsuche in Firma/Titel/Notes

Regeln:
- Nutze Tools wenn der Nutzer konkrete Daten erfragt.
- Antworte auf Deutsch, kompakt, ohne Markdown-Codeblöcke.
- Wenn eine Frage ohne Tool beantwortet werden kann (Smalltalk, Erklärung), antworte direkt.
- Bei Datenfragen: erst das Tool nutzen, dann eine kurze, menschliche Zusammenfassung formulieren.`;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'list_applications',
            description: 'Listet Bewerbungen, optional gefiltert nach Status.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: [
                            'draft',
                            'applied',
                            'in_review',
                            'interview_scheduled',
                            'interviewed',
                            'offer_received',
                            'accepted',
                            'rejected',
                            'withdrawn',
                        ],
                        description: 'Optionaler Status-Filter',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximale Anzahl (Standard 20)',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'count_by_status',
            description: 'Zählt Bewerbungen pro Status.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'stats',
            description:
                'Liefert Gesamtstatistiken: Total, durchschnittlicher Match-Score, häufigste Firmen, durchschnittliche Bearbeitungsdauer.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_candidates',
            description: 'Listet Agent-Kandidaten, optional mit Mindest-Score.',
            parameters: {
                type: 'object',
                properties: {
                    minScore: {
                        type: 'number',
                        description: 'Mindest-Score (0-100)',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximale Anzahl (Standard 20)',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_applications',
            description:
                'Sucht in Firma, Job-Titel, Notes und Tags (Substring-Suche, case-insensitive).',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Suchtext' },
                },
                required: ['query'],
            },
        },
    },
];

function runTool(name: string, argsRaw: Record<string, unknown> | string): unknown {
    const args: Record<string, unknown> =
        typeof argsRaw === 'string' ? safeJson(argsRaw) : argsRaw || {};

    if (name === 'list_applications') {
        const status = args.status as ApplicationStatus | undefined;
        const limit = clampNum(args.limit, 1, 100, 20);
        let rows = listApplications();
        if (status) rows = rows.filter((r) => r.status === status);
        return {
            total: rows.length,
            items: rows.slice(0, limit).map((r) => ({
                company: r.companyName,
                title: r.jobTitle,
                status: r.status,
                matchScore: r.matchScore,
                appliedAt: r.appliedAt?.toISOString().slice(0, 10) ?? null,
                updatedAt: r.updatedAt.toISOString().slice(0, 10),
            })),
        };
    }

    if (name === 'count_by_status') {
        const rows = listApplications();
        const counts: Record<string, number> = {};
        for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
        return { total: rows.length, counts };
    }

    if (name === 'stats') {
        const rows = listApplications();
        const scored = rows.filter((r) => r.matchScore > 0);
        const avgMatchScore = scored.length
            ? Math.round(scored.reduce((s, r) => s + r.matchScore, 0) / scored.length)
            : 0;
        const companyCounts: Record<string, number> = {};
        for (const r of rows) {
            if (!r.companyName) continue;
            companyCounts[r.companyName] = (companyCounts[r.companyName] ?? 0) + 1;
        }
        const topCompanies = Object.entries(companyCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        const now = Date.now();
        const recent = rows.filter((r) => {
            if (!r.appliedAt) return false;
            return now - r.appliedAt.getTime() < 30 * 24 * 3600 * 1000;
        }).length;

        return {
            total: rows.length,
            avgMatchScore,
            scoredCount: scored.length,
            topCompanies,
            appliedLast30Days: recent,
        };
    }

    if (name === 'list_candidates') {
        const minScore = clampNum(args.minScore, 0, 100, 0);
        const limit = clampNum(args.limit, 1, 100, 20);
        const cands = listCandidates(minScore);
        return {
            total: cands.length,
            items: cands.slice(0, limit).map((c) => ({
                company: c.company,
                title: c.title,
                score: c.score,
                source: c.sourceKey?.split(':')[0] ?? '',
                status: c.status,
                location: c.location,
            })),
        };
    }

    if (name === 'search_applications') {
        const query = String(args.query ?? '').toLowerCase().trim();
        if (!query) return { total: 0, items: [] };
        const rows = listApplications().filter((r) => {
            const hay = [
                r.companyName,
                r.jobTitle,
                r.notes,
                r.tags,
                r.stack,
                r.location,
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(query);
        });
        return {
            total: rows.length,
            items: rows.slice(0, 20).map((r) => ({
                company: r.companyName,
                title: r.jobTitle,
                status: r.status,
                matchScore: r.matchScore,
            })),
        };
    }

    return { error: `Unknown tool: ${name}` };
}

function safeJson(raw: string): Record<string, unknown> {
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

export interface ChatRequest {
    messages: ChatMessage[];
}

export interface ChatResponse {
    messages: ChatMessage[];
    reply: string;
    toolsUsed: string[];
    error?: string;
}

const MAX_TOOL_HOPS = 4;

export async function runChat(
    req: ChatRequest,
    win: BrowserWindow | null,
): Promise<ChatResponse> {
    const { ollamaUrl, ollamaModel } = getLlmConfig();
    const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...req.messages,
    ];
    const toolsUsed: string[] = [];

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
        const payload = {
            model: ollamaModel,
            messages,
            tools: TOOLS,
            stream: false,
            options: { temperature: 0.3 },
        };

        let response: Response;
        try {
            response = await fetch(`${ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(120000),
            });
        } catch (err) {
            return {
                messages,
                reply: '',
                toolsUsed,
                error: `Ollama nicht erreichbar: ${(err as Error).message}`,
            };
        }

        if (!response.ok) {
            const text = await response.text();
            return {
                messages,
                reply: '',
                toolsUsed,
                error: `Ollama HTTP ${response.status}: ${text.slice(0, 200)}`,
            };
        }

        const json = (await response.json()) as OllamaChatResponse;
        const msg = json.message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
            messages.push({
                role: 'assistant',
                content: msg.content ?? '',
                tool_calls: msg.tool_calls,
            });

            for (const call of msg.tool_calls) {
                const fnName = call.function.name;
                const fnArgs = call.function.arguments;
                toolsUsed.push(fnName);
                if (win && !win.isDestroyed()) {
                    win.webContents.send('chat:toolCall', { name: fnName, args: fnArgs });
                }
                const result = runTool(fnName, fnArgs);
                messages.push({
                    role: 'tool',
                    name: fnName,
                    content: JSON.stringify(result),
                });
            }
            continue;
        }

        messages.push({ role: 'assistant', content: msg.content ?? '' });
        return {
            messages,
            reply: msg.content ?? '',
            toolsUsed,
        };
    }

    return {
        messages,
        reply: '',
        toolsUsed,
        error: `Maximale Tool-Aufrufe (${MAX_TOOL_HOPS}) erreicht.`,
    };
}
