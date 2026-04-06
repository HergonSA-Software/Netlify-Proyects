# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HG Catalog AI is an AI tool catalog manager for Obras Hergon S.A. (a Peruvian construction company). It consists of:
- A **public catalog** (`index.html`) for browsing categorized AI tools
- An **admin panel** (`admin/index.html`) with Firebase Auth for managing tools and areas
- A **chatbot assistant** for natural language catalog queries
- **Netlify Functions** as the backend API

## Development Commands

```bash
# Install dependencies
npm install

# Local development (requires Netlify CLI)
netlify dev        # Serves on http://localhost:8888

# Deploy
netlify deploy     # Preview deploy
netlify deploy --prod  # Production deploy
```

The build command (run by Netlify on deploy) is: `npm install && node scripts/generate-env.js`

`scripts/generate-env.js` generates `assets/js/env.js` from environment variables, injecting `FIREBASE_API_KEY` for the frontend.

## Architecture

### Stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework), SPA routing via `netlify.toml` redirects
- **Backend**: Netlify Functions (Node.js 18+, esbuild bundler)
- **Database**: Firestore — collections `tools` and `areas`
- **Auth**: Firebase Auth (client-side JWT) + Firebase Admin SDK (server-side JWT verification)
- **AI**: Anthropic Claude, OpenAI, Google Gemini, or OpenRouter — auto-detected by which API key is present, or forced via `AI_PROVIDER` env var

### API Routes
All `/api/*` requests proxy to `netlify/functions/*`:

| Route | Auth | Description |
|-------|------|-------------|
| `GET /api/areas` | Public | List areas (auto-seeds 10 default areas on first run) |
| `POST/PUT/DELETE /api/areas` | Firebase JWT | Manage areas |
| `POST /api/chat-tool` | Public (rate-limited: 10/min/IP) | Chatbot |
| `POST /api/generate-tool` | Firebase JWT | AI tool generation |
| `POST/PUT /api/save-tool` | Firebase JWT | Create/update tools |
| `DELETE /api/delete-tool?id=` | Firebase JWT | Delete tools |

### Frontend Data Flow
- **Public reads**: Firestore REST API directly (`https://firestore.googleapis.com/v1/projects/hergon-catalog-ai/...`) — no SDK needed
- **Authenticated writes**: Via Netlify Functions with `Authorization: Bearer {JWT}` header
- `firebase-init.js` provides Firestore REST helpers (`fetchAllTools`, `fetchTool`, `fsDocToObj`, `fsValueToJs`)

### AI Integration
All AI calls use native `fetch` with a **9-second timeout** (Netlify free tier limit is 10s).

Provider auto-detection priority: `OpenRouter → Anthropic → OpenAI → Gemini`

- **`generate-tool.js`**: Takes free-form text + existing tool codes → returns structured tool JSON. System prompt enforces tool code format (`AREA-NNN`), required fields, and JSON structure.
- **`chat-tool.js`**: Public chatbot. Client-side (`chat.js`) filters relevant tools using 4-priority strategy before sending to backend (exact code match → area keywords → keyword scoring → light index fallback).

### Security
- XSS prevention: `escHtml()` in `catalog.js` sanitizes Firestore data before DOM insertion
- Injection guards in `chat.js`: regex patterns block jailbreak attempts client-side
- Server-side: output guardrail in `chat-tool.js` truncates replies >900 chars if no tool codes are cited

## Environment Variables

**Frontend** (injected at build time via `generate-env.js`):
- `FIREBASE_API_KEY` — Public Firebase API key

**Backend** (Netlify environment):
- `FIREBASE_SA_KEY` — Firebase service account JSON (for Admin SDK)
- `AI_PROVIDER` — `anthropic | openai | gemini | openrouter` (optional, auto-detected)
- `AI_MODEL` — Model name override (e.g., `claude-haiku-4-5-20251001`)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
- `URL` — Deployed site URL (used for CORS and OpenRouter referer headers)

See `.env.example` for the full list.

## Tool Data Model

Tools in Firestore have: `code` (e.g., `GP-001`), `title`, `area` (primary), `area2/3/4` (secondary), `desc`, `prompt` (system prompt), `reqs` (requirements array), `flow` (workflow stages), `steps` (setup steps), `resources` (links), `costNotes`.

Areas have: `key` (immutable), `label`, `icon` (emoji), `color` (hex), `codePrefix`, `keywords[]` (for chatbot relevance), `order`.

## Seeding / Scripts

- `scripts/seed-firestore.js` — Seeds the database with initial tools data
- `scripts/tools-data.js` — Tool definitions used for seeding
- `scripts/prompts-data.js` — Prompt templates
- Areas auto-seed when the `areas` collection is empty (handled in `areas.js`)
