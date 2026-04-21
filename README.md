# Simple Application Tracker

Offline desktop app for tracking job applications. No cloud, no login, all data stays local. Includes local LLM integration for auto-fill from URLs, fit scoring against your profile, and background search agents across job portals.

![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)
![electron](https://img.shields.io/badge/electron-33-47848f)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- Track applications with status flow (draft, applied, in review, interview, offer, accepted, rejected)
- Store company, title, salary range, stack, contacts, notes, tags, priority
- Required profile and benefits as multi-tag lists per application
- Auto-fill from a job URL using local Ollama (extracts company, title, stack, profile, benefits as JSON)
- Fit check button that scores the role against your profile (0 to 100 plus reason)
- Agent system with configurable searches across multiple portals (GermanTechJobs RSS, Remotive API, Arbeitnow API, RemoteOK API, and single URL), runs every 6 hours in the background, scores new finds via LLM
- Excel export of all applications
- Tray icon with quick-add
- Right-side drawer UI instead of modals
- Auto-updates via GitHub Releases (electron-updater)
- 100% offline storage: SQLite in platform user-data folder

## Install

### Download prebuilt binaries

Releases: https://github.com/unfloned/simple-application-tracker/releases

- macOS: download the `.dmg`, open, drag the app into Applications
- Windows: download the `.exe` installer and run it

### Build from source

```bash
git clone https://github.com/unfloned/simple-application-tracker.git
cd simple-application-tracker
npm install
npm run dev
```

## LLM setup (for auto-fill and scoring)

The app is fully usable without an LLM. Auto-fill, fit check and agent scoring need Ollama.

```bash
brew install ollama           # macOS
# or download the desktop app from https://ollama.com/download
ollama pull llama3.2:3b       # recommended for speed
```

In the app settings: check status, optionally click "Start Ollama" and "Download model".

## Stack

- Electron 33 with electron-vite
- React 18 with Mantine 7 for UI
- better-sqlite3 for local storage
- @deepkit/type for type definitions
- exceljs for Excel export
- electron-updater against GitHub Releases
- Ollama HTTP API for local LLM

## Architecture

```
src/
  shared/               Type definitions (Application, JobSearch, JobCandidate)
  main/                 Electron main process
    index.ts            Window and tray
    db.ts               SQLite CRUD
    llm.ts              Ollama client (extract, assessFit, status, start)
    agents/             Scrapers, scorer, scheduler
    updater.ts          electron-updater wiring against GitHub
    ipc.ts              IPC handlers
    export.ts           Excel export
  preload/              contextBridge API
  renderer/             React UI with Mantine
    App.tsx             AppShell with tabs
    pages/              Candidates page
    components/         Drawer, List, Settings, UpdateBanner
```

## Build

```bash
npm run build               # code build
npm run package:mac         # .dmg (unsigned)
npm run package:win         # .exe (unsigned)
npm run package:linux       # .AppImage
```

Release via git tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions builds the macOS and Windows artifacts in parallel and publishes them as a release.

## Data location

SQLite databases and config live in the platform user-data folder. On macOS this is `~/Library/Application Support/simple-application-tracker/`.

## Roadmap

- Multi-language UI (DE and EN) via i18next
- Mail agent over SMTP that sends applications when a job matches the profile
- Form auto-fill on job portals via a browser extension
- Kanban view in addition to the table
- Calendar integration for interviews
- JSON import/export for backup

## License

MIT, see `LICENSE`.
