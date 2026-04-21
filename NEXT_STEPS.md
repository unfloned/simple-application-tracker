# Next steps for Simple Application Tracker

Roadmap and backlog picked up between sessions. This file stays local, not in the git repo.

## High priority: more job sources and higher result limits

Current scraper limits cap each source at roughly 20-30 results per run. With 2 active sources that's ~60 candidates, which Florian is hitting.

### Quick wins (one session)

1. **Raise per-source limits to 100** in `src/main/agents/scrapers.ts`:
   - `germantechjobs`: `if (results.length >= 30)` -> 100
   - `remotive`: API call `?limit=30` -> `?limit=100`
   - `arbeitnow`: inner cap 30 -> 100
   - `remoteok`: cap 30 -> 100
   - `weworkremotely`: cap 20 -> 80

2. **HackerNews "Who's Hiring"** as a new source:
   - Firebase API: `https://hacker-news.firebaseio.com/v0/user/whoishiring/submitted.json`
   - Fetch the latest submission, then get its kids (comments) via `/item/{id}.json`
   - Each comment is one job post. Filter by keyword + "REMOTE" + "(GER|DE|Germany)".
   - Monthly thread, high quality remote tech listings.

3. **stackoverflow.com/jobs RSS** if still live (the job board was partially shut down in 2022, check).

### Medium-term additions

4. **Personio/Recruitee/Teamtailor/Greenhouse/Lever templates** as "Custom Board" source type:
   - User enters company slug + provider
   - Scraper builds the URL (e.g. `https://{slug}.personio.de/xml` for Personio feed, `https://api.lever.co/v0/postings/{slug}?mode=json` for Lever)
   - Works for hundreds of company career pages without coding per firm

5. **berlinstartupjobs.com RSS** -- DE startup focused
6. **welovedevs.com** -- DE/FR
7. **freelance.de RSS** -- for freelance projects alongside permanent roles
8. **gulp.de API** -- premium freelance

### Hard / auth-locked sources (skip or postpone)

- LinkedIn Jobs: OAuth-only, serious work
- Xing: auth, scraping fragile
- Wellfound (ex AngelList): auth

## Lüfter-Problem: Ollama hält das Modell warm

Aus der letzten Session: Auch wenn kein Scan läuft, bleibt der Mac heiss.

Ursache: Ollama hält geladene Modelle 5 Minuten im RAM/VRAM als "keep_alive". Das Modell selbst rechnet nicht aktiv, aber bei Metal kann der MLX-Prozess idle polling machen.

Lösungsideen für die App:

1. **`keep_alive=0` in jedem Ollama-Request** senden -> Modell wird nach jedem Request sofort unloaded. Nachteil: nächster Request lädt neu (ein paar Sekunden Verzögerung).
2. **"Unload model" Button** in den Settings -> POST `/api/generate` mit `keep_alive=0` und dem aktuellen Modell.
3. **Automatisches unload** nach Agent-Run-Ende.

Empfehlung: Punkt 3 als default, plus Button in Settings als Override.

Beispiel:
```ts
// nach runSearchNow
await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ollamaModel, keep_alive: 0, prompt: '' }),
});
```

## Andere Backlog-Punkte

- **Mail-Agent ueber SMTP** der Bewerbungen automatisch verschickt wenn Passung stimmt -- Feature-Gap, siehe Roadmap in README
- **Browser-Extension** fuer Formular-Auto-Fill auf Job-Portalen
- **Kanban view** neben der Tabelle
- **Kalender-Integration** fuer Interviews
- **JSON import/export** fuer Backup

## Bugs / Cleanup

- Tray-Icon ist primitives selbst-gemaltes Design -- durch echtes Icon ersetzen
- App-Icon `.icns` statt PNG fuer bessere Aufloesung auf macOS
- macOS Code-Signing aktivieren wenn Florian die 5 GitHub Secrets gesetzt hat (siehe `docs/MACOS_SIGNING.md` falls noch da, sonst in Git-Historie von `v0.2.0` Release-Phase)
- Auf Windows die App testen -- bisher nur macOS im Dev getestet
