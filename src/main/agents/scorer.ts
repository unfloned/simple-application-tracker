import { getLlmConfig } from '../llm';

export interface ScoringProfile {
    stackKeywords: string;
    remotePreferred: boolean;
    minSalary: number;
    antiStack: string;
    /** Excludes: list of hard disqualifiers (natural language). Score=0 if any matches. */
    excludes: string[];
    /** Free-text instruction the user can give the LLM before scoring. */
    llmInstruction: string;
}

export interface ScoreResult {
    score: number;
    /** 1-sentence overall verdict ("fit"). */
    reason: string;
    /** Bullet list of the strongest positive signals. */
    keyFacts: string[];
    /** Bullet list of unclear / concerning aspects. */
    concerns: string[];
    /** Bullet list of hard disqualifiers that triggered a score cut. Empty = none. */
    redFlags: string[];
}

const SCORING_PROMPT = (profile: ScoringProfile) => {
    const excludesBlock = profile.excludes.length
        ? profile.excludes.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
        : '  (keine zusätzlichen)';
    const userInstruction = profile.llmInstruction?.trim()
        ? `\nZUSÄTZLICHE REGEL DES NUTZERS (höchste Priorität, strikt befolgen):\n${profile.llmInstruction.trim()}\n`
        : '';

    return `Du bist ein KRITISCHER Job-Matcher. Du analysierst Stellenanzeigen gegen das Profil eines deutschen Senior-TypeScript-Entwicklers. Sei skeptisch. Erfinde NICHTS. Zitiere nur was im Text der Stelle wirklich steht.

# PROFIL
- Stack (gewünscht): ${profile.stackKeywords || 'TypeScript, Next.js, React, Node.js, React Native, Postgres'}
- Remote: ${profile.remotePreferred ? 'stark bevorzugt (100% Remote > Hybrid > On-Site)' : 'egal'}
- Mindest-Gehalt: ${profile.minSalary > 0 ? profile.minSalary + '€/Jahr' : 'keine harte Grenze'}
- Stack-No-Gos: ${profile.antiStack || 'Java-only, C#-only, PHP-only, Vue-only, Angular-only'}

# HARTE AUSSCHLUSS-KRITERIEN
Wenn eines davon eindeutig zutrifft: score=0, in "redFlags" den konkreten Grund nennen.
${excludesBlock}
${userInstruction}
# REGELN FÜR DIE LISTEN (sehr wichtig, befolge sie strikt)

"keyFacts" = NUR positive Passungen, die WÖRTLICH oder sinngemäß im Stellentext stehen und dem Profil helfen.
  - NIEMALS Negatives oder Abwesendes als keyFact ("Kein TypeScript", "Kotlin-Stack" wenn Profil TypeScript ist = NICHT Stärke).
  - NIEMALS das Profil wiederholen ("Guter Stack" ohne Zitat = nutzlos).
  - NIEMALS etwas erfinden das nicht im Text steht (z.B. "Gute Bezahlung" wenn kein Gehalt genannt).
  - Format: Kurz, konkret, zitiert. Beispiel: "Next.js + Postgres explizit im Tech-Stack".

"concerns" = UNKLARHEITEN oder fehlende Infos im Stellentext, die eine Entscheidung erschweren.
  - Gehalt nicht genannt? → concern.
  - Seniority nicht klar? → concern.
  - Ort unklar / Remote-Status ambivalent? → concern.
  - Vages Anforderungsprofil? → concern.
  - Firma unbekannt / klein / Early-Stage ohne Info? → concern.

"redFlags" = HARTE Dealbreaker. Triggern → score=0.
  - Primäre Programmiersprache ist NICHT im gewünschten Stack (Kotlin, Java, Python, Go, Rust, PHP, C#, Ruby, Scala als Hauptsprache) → redFlag.
  - Ein Stack-No-Go ist klar die Hauptsprache.
  - Ein Ausschluss-Kriterium aus der Liste oben trifft zu.
  - Standort komplett unpassend (nur vor Ort in USA/Asien wenn Remote gewünscht).

"reason" = 1-2 Sätze präzises Fazit. Sage konkret WAS passt oder WARUM nicht. Keine Floskeln.

# ANTI-BEISPIELE (NIEMALS so antworten):
❌ keyFact: "Kotlin als primärer Stack" (wenn Profil TypeScript hat → das ist ein redFlag!)
❌ keyFact: "Gute Gehaltsangebot" (wenn Gehalt nicht im Text steht)
❌ keyFact: "Remote-Arbeit bevorzugt" (wiederholt nur das Profil)
❌ reason: "Die Stelle passt zum Stack und ist remote." (generisch, ohne Zitat)

# GUT-BEISPIELE:
✓ keyFact: "Next.js + Postgres explizit gefordert (laut JD)"
✓ keyFact: "70-90k EUR Gehaltsbereich genannt"
✓ concern: "Gehalt nicht genannt"
✓ concern: "Firmengröße / Stage unklar"
✓ redFlag: "Primäre Sprache: Kotlin - TypeScript kein Teil des Stacks"
✓ reason: "Stack-Match solide (Next.js, React, Postgres laut JD), aber Gehalt und Remote-Policy nicht erwähnt."

# SCORING
- 90-100: alle harten Anforderungen getroffen, klar Senior, Remote-fähig, Gehalt passt oder plausibel
- 70-89: guter Match, kleinere Unklarheiten
- 50-69: möglicher Fit, relevante Lücken
- 1-49: wenig Überschneidung
- 0: HARTER Ausschluss (redFlag gefüllt)

# AUSGABE
Antworte AUSSCHLIESSLICH mit JSON, kein Markdown, kein Vorspann:
{
  "score": number,
  "reason": "1-2 Sätze, präzise, mit Textbezug",
  "keyFacts": ["max 5, konkrete Zitate/Fakten aus dem Text"],
  "concerns": ["max 5, klare Lücken/Unklarheiten"],
  "redFlags": ["leer wenn kein Dealbreaker, sonst konkret nennen"]
}

# STELLENANZEIGE
`;
};

function toStringArray(raw: unknown, max = 6): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .slice(0, max)
        .map((v) => v.slice(0, 200));
}

export async function scoreJobListing(
    title: string,
    company: string,
    location: string,
    summary: string,
    profile: ScoringProfile,
): Promise<ScoreResult> {
    const { ollamaUrl, ollamaModel } = getLlmConfig();
    const text = `Titel: ${title}\nFirma: ${company}\nOrt: ${location}\n\nBeschreibung:\n${summary}`;

    const empty = (score: number, reason: string): ScoreResult => ({
        score,
        reason,
        keyFacts: [],
        concerns: [],
        redFlags: [],
    });

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: SCORING_PROMPT(profile) + text,
                stream: false,
                format: 'json',
                options: {
                    temperature: 0.2,
                    // Enough headroom for the structured JSON (score + reason
                    // + up to 3×5 string arrays). Ollama's default caps output
                    // at 128 tokens, which reliably truncates the response.
                    num_predict: 1024,
                    // Prompt + job description can exceed the 4k default for
                    // small models. 8k gives us safe margin.
                    num_ctx: 8192,
                },
            }),
            signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
            return empty(0, `LLM-Fehler HTTP ${response.status}`);
        }

        const json = (await response.json()) as { response: string };
        try {
            const parsed = JSON.parse(json.response.trim()) as Partial<ScoreResult>;
            const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
            const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : '';
            return {
                score,
                reason,
                keyFacts: toStringArray(parsed.keyFacts),
                concerns: toStringArray(parsed.concerns),
                redFlags: toStringArray(parsed.redFlags),
            };
        } catch {
            return empty(0, 'LLM-Antwort ungültig');
        }
    } catch (err) {
        return empty(0, `Ollama offline: ${(err as Error).message}`);
    }
}
