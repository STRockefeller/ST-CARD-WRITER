# SillyTavern Card Writer

A local-first web app for creating, editing, reviewing, translating, and exporting SillyTavern character cards and lorebooks with LLM assistance.

[繁體中文文件](./README.zh-TW.md)

## Highlights

- Create and edit SillyTavern V2 character cards.
- Create standalone lorebooks or embed them as `data.character_book`.
- Import V2/V3/legacy SillyTavern JSON cards and PNG cards containing `chara` metadata.
- Attach PNG, JPEG, WebP, GIF, or BMP artwork, adjust the 2:3 crop, and export a PNG character card.
- Export JSON without an empty lorebook.
- Estimate permanent, dynamic, and lorebook token usage with configurable budgets.
- Brainstorm across multiple persistent discussion threads before manually generating content.
- Generate cards and lorebooks, revise whole cards, or discuss/rewrite individual fields.
- Review cards for clarity, redundancy, playability, missing details, lorebook triggers, token use, and MVU consistency.
- Translate while protecting macros, URLs, paths, JSON keys, fenced code, and MVU variable names.
- Convert Simplified and Traditional Chinese locally without an LLM.
- Generate a concise `{{user}}` persona and natural-language/booru cover prompts.
- Keep snapshots before AI-applied changes and restore or compare previous versions.
- Preserve unknown extension data where possible.
- Optionally design MVU initial variables and `_.set` update rules as portable embedded lorebook entries.

## Local-First Design

The app has no account system or cloud synchronization. Projects, settings, snapshots, and LLM history are stored in `data/app.sqlite`. LLM request diagnostics are written to `data/llm-interactions.log`.

API keys are stored in the local SQLite database and masked when returned to the UI. Card content is sent only to the LLM provider selected in Settings when an LLM action is triggered. Local Chinese script conversion does not call an LLM.

The complete `data/` directory, environment files, logs, build output, and local databases are excluded from Git.

## Architecture

```text
Browser (Vite + React + TypeScript)
        |
        | /api
        v
Go HTTP server (127.0.0.1:8787)
        |
        +-- SQLite project/settings store
        +-- LLM provider adapters
        +-- local Chinese conversion
```

### Frontend

- Vite 4
- React 18 and TypeScript
- TanStack Query
- i18next (`zh-TW` and `en`)
- Lucide icons

### Backend

- Go 1.22+
- Standard `net/http` server
- SQLite through `modernc.org/sqlite`
- `gocc` for local Simplified/Traditional Chinese conversion

### LLM Providers

- DeepSeek
- OpenAI
- OpenRouter
- Anthropic
- Google Gemini
- Custom OpenAI-compatible Chat Completions endpoint

Model IDs are editable because provider catalogs change over time.

## Requirements

- Go 1.22 or later
- Node.js 16.13 or later
- npm

## Getting Started

Install dependencies:

```bash
npm install
go mod download
```

Start the frontend and local API together:

```bash
npm run dev
```

Open <http://127.0.0.1:5173/>. The local API listens on <http://127.0.0.1:8787/>.

Stop both services with `Ctrl+C` in the terminal running `npm run dev`.

## Configure an LLM

1. Create or import a project.
2. Open the **Settings** tab.
3. Select an LLM provider.
4. Enter the provider API key and model ID.
5. For a custom OpenAI-compatible provider, enter the full Chat Completions API URL.
6. Select the UI and prompt languages.
7. Save the settings.

The model ID must be valid for the selected provider. The app does not create or validate provider accounts.

## Typical Workflow

1. Create a project or import a JSON/PNG character card.
2. Develop the concept in **Brainstorm** using one or more discussion threads.
3. Generate or edit fields in **Card** and **Lorebook**.
4. Attach and crop artwork in **Card** if PNG export is needed.
5. Review token usage in **Token Budget**.
6. Run critique, translation, compression, MVU checks, or local Chinese conversion in **Review/Translate**.
7. Save the project, then export JSON or PNG.

AI output is never assumed to be correct. The **Apply to card** action is shown only for JSON-like code blocks, and a snapshot is created before applicable content is applied.

## MVU variable design

The optional **MVU Variables** tab creates two ordinary, editable lorebook entries:

- `[initvar] Initial Variables (keep disabled)`: a JSON object loaded into MVU `stat_data`. MVU identifies this entry by its comment even though the lorebook entry is disabled.
- `[mvu_update] Variable Update Rules`: persistent instructions that ask the model to emit MagVarUpdate-compatible JSON Patch updates.

The editor provides a beginner-friendly variable table for paths, types, initial values, adding, and deletion, while retaining a collapsible raw JSON editor for advanced structures. Both the variable tree and update rules support the existing AI discuss/revise workflow. It validates the initial JSON and preserves both entries when MVU is disabled. Export safely merges a Tavern Helper script that loads the official MagVarUpdate runtime; existing card scripts are preserved. Custom status-bar UI is intentionally outside this initial implementation.

## Import and Export

### Import

- SillyTavern V2 JSON
- SillyTavern V3 JSON normalized into the editor model
- Legacy SillyTavern JSON fields
- PNG character cards with uncompressed `tEXt` or `iTXt` `chara` metadata

### Export

- SillyTavern-compatible V2 JSON
- PNG with base64-encoded V2 JSON in a `chara` text chunk
- Optional embedded `character_book`; omitted when there are no lorebook entries

PNG artwork is rendered to a 2:3 crop. Animated images use the browser-decoded frame during export.

## Development Commands

```bash
# Frontend type checking
npm run typecheck

# Frontend behavior test
npm test

# Production frontend build
npm run build

# Go tests
go test ./...
```

## Project Layout

```text
cmd/server/          Go server entry point
internal/api/        HTTP routes, import/export, LLM orchestration
internal/llm/        Prompt registry and provider clients
internal/model/      Card/project models and token estimation
internal/store/      SQLite persistence
internal/zhconvert/  Local Chinese script conversion
src/                 React application
test/                Frontend behavior tests
```

## Current Limitations

- Token counts are estimates, not provider-native tokenizer results.
- LLM output quality and structured-output compliance depend on the selected model.
- MVU support focuses on generation assistance, protection, translation safety, and consistency checks rather than a dedicated visual MVU builder.
- PNG `zTXt` and compressed `iTXt` card metadata are not currently imported.
- The app is intended for local single-user use and has no authentication layer.

## License

Released under the [MIT License](./LICENSE). Copyright (c) 2026 STRockefeller.
