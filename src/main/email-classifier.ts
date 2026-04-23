import type { ApplicationStatus } from '@shared/application';
import { getLlmConfig } from './llm';
import type { ApplicationRow } from './db/types';

export interface ClassifyInput {
    subject: string;
    fromAddress: string;
    fromName: string;
    bodyText: string;
}

export interface ClassifyOutput {
    applicationId: string | null;
    status: ApplicationStatus | 'other' | null;
    confidence: number;
    note: string;
}

const SYSTEM_PROMPT = `Du analysierst eine eingehende E-Mail zu einer laufenden Bewerbung und ordnest sie einer Bewerbung zu, falls möglich. Gib AUSSCHLIESSLICH JSON zurück, kein Markdown.

Zuordnung (Feld "applicationId"):
- Match nur wenn Absender-Domain oder Signatur klar zur Firma einer Bewerbung gehört, oder die Mail einen Jobtitel nennt der zur Bewerbung passt.
- Bei Unsicherheit: null. Nicht raten.

Status-Vorschlag (Feld "status"):
- "rejected": Absage ("wir haben uns leider für einen anderen Kandidaten entschieden", "Absage", "nicht weitergekommen").
- "interview_scheduled": Einladung zum Gespräch / Termin-Vorschlag / Telefoninterview-Zeit.
- "interviewed": Rückmeldung NACH einem geführten Gespräch.
- "offer_received": Angebot, Vertrag, Gehaltsrahmen genannt, "freuen uns dich anzubieten".
- "in_review": Eingangsbestätigung, "wir prüfen", "melden uns bald".
- "other": alles andere (Newsletter, Spam, Follow-Up ohne klare Statusänderung).

Feld "confidence" (0-100): wie sicher bist du beim Matching + Status-Vorschlag.
Feld "note" (max 280 Zeichen): die wichtigste Info aus der Mail für den Nutzer. Bei interview_scheduled unbedingt Datum/Uhrzeit zitieren falls vorhanden. Bei offer_received Gehaltsbereich oder Start-Datum wenn genannt. Keine Floskeln.

Gib exakt dieses JSON:
{
  "applicationId": "id-string-oder-null",
  "status": "rejected" | "interview_scheduled" | "interviewed" | "offer_received" | "in_review" | "other",
  "confidence": number,
  "note": "kurze Zusammenfassung"
}`;

export async function classifyInboundEmail(
    input: ClassifyInput,
    activeApplications: ApplicationRow[],
): Promise<ClassifyOutput> {
    const { ollamaUrl, ollamaModel } = getLlmConfig();

    const appsBlock =
        activeApplications.length === 0
            ? '(keine aktiven Bewerbungen)'
            : activeApplications
                  .map(
                      (a, i) =>
                          `${i + 1}. id="${a.id}" Firma="${a.companyName}" Titel="${a.jobTitle}" Kontakt="${a.contactEmail}"`,
                  )
                  .join('\n');

    const userBlock = `# Aktive Bewerbungen
${appsBlock}

# Eingehende Mail
Absender: ${input.fromName} <${input.fromAddress}>
Betreff: ${input.subject}

Body:
${input.bodyText.slice(0, 6000)}`;

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: SYSTEM_PROMPT + '\n\n' + userBlock,
                stream: false,
                format: 'json',
                options: {
                    temperature: 0.1,
                    num_predict: 512,
                    num_ctx: 8192,
                },
            }),
            signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) {
            return empty(`LLM-Fehler HTTP ${response.status}`);
        }
        const json = (await response.json()) as { response: string };
        return parseResponse(json.response.trim(), activeApplications);
    } catch (err) {
        return empty(`Ollama offline: ${(err as Error).message}`);
    }
}

function parseResponse(raw: string, apps: ApplicationRow[]): ClassifyOutput {
    try {
        const parsed = JSON.parse(raw) as Partial<ClassifyOutput>;
        const validIds = new Set(apps.map((a) => a.id));
        const applicationId =
            typeof parsed.applicationId === 'string' && validIds.has(parsed.applicationId)
                ? parsed.applicationId
                : null;
        const status = normalizeStatus(parsed.status);
        const confidence = Math.max(
            0,
            Math.min(100, Number(parsed.confidence) || 0),
        );
        const note = typeof parsed.note === 'string' ? parsed.note.slice(0, 280) : '';
        return { applicationId, status, confidence, note };
    } catch {
        return empty('LLM-Antwort ungültig');
    }
}

function normalizeStatus(s: unknown): ApplicationStatus | 'other' | null {
    if (typeof s !== 'string') return null;
    const allowed: (ApplicationStatus | 'other')[] = [
        'rejected',
        'interview_scheduled',
        'interviewed',
        'offer_received',
        'in_review',
        'other',
    ];
    return (allowed as string[]).includes(s)
        ? (s as ApplicationStatus | 'other')
        : null;
}

function empty(note: string): ClassifyOutput {
    return { applicationId: null, status: null, confidence: 0, note };
}
