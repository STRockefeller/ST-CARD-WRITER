# SillyTavern Card Writer

A local-first writing tool for creating, editing, reviewing, translating, and exporting SillyTavern V2 character cards.

Traditional Chinese documentation: [README.zh-TW.md](./README.zh-TW.md)

## What This App Does

SillyTavern Card Writer helps you build a complete character-card project from idea to export:

- Write SillyTavern V2 character cards.
- Create and edit lorebooks.
- Export cards with an embedded `character_book`.
- Import SillyTavern V2 JSON files and PNG cards with `chara` metadata.
- Estimate permanent, dynamic, and lorebook token usage.
- Set token budgets and check over-budget sections.
- Collaborate with an LLM for brainstorming, drafting, rewriting, compression, review, translation, and MVU checks.
- Preserve SillyTavern-friendly structures such as `{{char}}`, `{{user}}`, macros, URLs, file paths, JSON-like fields, and MVU variable names during translation workflows.

The app stores data locally in SQLite at `data/app.sqlite`. There is no account system or cloud sync in this version.

## Tech Stack

- Frontend: Vite, React, TypeScript, TanStack Query, i18next
- Backend: Go, SQLite
- LLM provider: DeepSeek
- Default models: `deepseek-v4-flash`, with `deepseek-v4-pro` available in settings

## Requirements

- Go 1.22+
- Node.js 16+
- npm

This project is currently pinned to dependency versions that work with Node 16.13.1.

## Getting Started

Install dependencies:

```bash
npm install
go mod tidy
```

Run the local app:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The Go API runs at:

```text
http://127.0.0.1:8787/
```

## First-Time LLM API Key Setup

1. Open the app at `http://127.0.0.1:5173/`.
2. Create or import a project.
3. Click the `Settings` tab in the top workspace tabs.
4. Paste your DeepSeek API key into `DeepSeek API Key`.
5. Choose a model:
   - `deepseek-v4-flash` for the default fast workflow.
   - `deepseek-v4-pro` for higher-quality drafting/review.
6. Choose UI and prompt languages.
7. Click `Save`.

The API key is saved only in the local SQLite database. When settings are displayed again, the key is masked.

## Main Workflow

1. Create a new project or import an existing V2 JSON/PNG card.
2. Use `Brainstorm` to develop the character concept with the LLM.
3. Fill or refine fields in `Card`.
4. Add world, relationship, rule, or secret entries in `Lorebook`.
5. Check `Token Budget` for permanent, dynamic, and lorebook token usage.
6. Use `Review/Translate` for critique, translation, compression, or MVU checks.
7. Export a SillyTavern V2 JSON card.

## Validation

Run backend and frontend checks:

```bash
go test ./...
npm run typecheck
npm test
npm run build
```

## Current Limitations

- PNG import supports common uncompressed `tEXt` and `iTXt` `chara` metadata. PNG export is not implemented yet.
- Token counting is an approximation, not an official DeepSeek tokenizer.
- LLM responses are saved as history, but automatic field patch application is not implemented yet.
- MVU support currently focuses on review, protection, and consistency checks rather than full MVU card generation.
