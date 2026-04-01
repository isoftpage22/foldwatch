# FoldWatch — AI-Powered Web Intelligence Platform

FoldWatch monitors web sources, extracts first-fold content (headline, summary, hero image), detects publish/modified dates, and computes freshness scores using an AI agent. The agent supports **multiple LLM backends** — switch with one environment variable.

## Architecture

- **Backend**: NestJS (TypeScript), MySQL + TypeORM, Redis + BullMQ
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **AI agent**: Pluggable provider — **Google Gemini** (default), **Anthropic Claude**, or **OpenAI** (function / tool calling)
- **Package Manager**: pnpm (monorepo)

```
foldwatch/
├── apps/
│   ├── backend/     # NestJS API server (port 3001)
│   └── frontend/    # Next.js dashboard (port 3000)
├── pnpm-workspace.yaml
└── README.md
```

## Prerequisites

- Node.js >= 22
- pnpm >= 9
- MySQL 8+
- Redis 7+
- At least one LLM API key for your chosen `AI_PROVIDER`

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
# Backend
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env — set AI_PROVIDER and the matching API key

# Frontend
cp apps/frontend/.env.example apps/frontend/.env
```

### 3. Create MySQL database

```sql
CREATE DATABASE foldwatch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Start Redis

```bash
redis-server
```

### 5. Run the application

```bash
# Both backend and frontend
pnpm dev

# Or individually
pnpm dev:backend   # http://localhost:3001
pnpm dev:frontend  # http://localhost:3000
```

TypeORM will auto-create tables on first run (`synchronize: true`).

## AI providers

Set **`AI_PROVIDER`** to one of: `gemini` (default), `claude`, or `openai`. Only the credentials for the active provider are required.

| Provider | Env vars | Notes |
|----------|----------|--------|
| **gemini** | `GEMINI_API_KEY`, optional `GEMINI_MODEL` | Default model: `gemini-2.0-flash` |
| **claude** | `ANTHROPIC_API_KEY`, optional `CLAUDE_MODEL` | Default: `claude-sonnet-4-20250514` |
| **openai** | `OPENAI_API_KEY`, optional `OPENAI_MODEL` | Default: `gpt-4o` |

Example for Gemini only:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
```

Example for Claude:

```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

Example for OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

The dashboard stats API returns `ai_provider` so the UI can label runs and approximate token cost.

## Seed Sources

Add these via the Sources page UI or via API:

```bash
curl -X POST http://localhost:3001/api/sources \
  -H "Content-Type: application/json" \
  -d '{"name":"BBC News","url":"https://www.bbc.com"}'

curl -X POST http://localhost:3001/api/sources \
  -H "Content-Type: application/json" \
  -d '{"name":"TechCrunch","url":"https://techcrunch.com"}'

curl -X POST http://localhost:3001/api/sources \
  -H "Content-Type: application/json" \
  -d '{"name":"The Verge","url":"https://www.theverge.com"}'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/sources | List all sources with latest snapshot |
| POST | /api/sources | Add new source |
| DELETE | /api/sources/:id | Remove source |
| PATCH | /api/sources/:id/pause | Toggle pause/resume |
| POST | /api/sources/:id/crawl-now | Trigger immediate crawl |
| GET | /api/snapshots/compare | Latest snapshot per source (sorted by freshness) |
| GET | /api/snapshots/:sourceId/history | Paginated snapshot history |
| GET | /api/runs | List recent agent runs |
| GET | /api/runs/:id | Run detail with steps |
| GET | /api/runs/:id/steps | Paginated steps for a run |
| GET | /api/dashboard/stats | Dashboard statistics (includes `ai_provider`) |

## How the Agent Works

1. The scheduler triggers every 30 minutes (or via manual "Crawl Now")
2. Active sources are passed to the Agent Gateway
3. The configured LLM runs a tool-calling loop:
   - **crawl_url**: Fetch and parse first-fold content (Playwright for JS sites, Cheerio for static)
   - **parse_date**: Extract the best date signal (schema.org, OG tags, time elements, HTTP headers)
   - **save_snapshot**: Persist extracted data with freshness score
   - **flag_source_error**: Mark failed sources for review
4. Every agent step (think, tool_call, tool_result) is logged for full traceability
5. Freshness scores are recomputed at read time: `1 / (1 + hours_since_modified)`

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_HOST | MySQL host | localhost |
| DATABASE_PORT | MySQL port | 3306 |
| DATABASE_NAME | Database name | foldwatch |
| DATABASE_USER | MySQL user | root |
| DATABASE_PASS | MySQL password | (empty) |
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| AI_PROVIDER | `gemini` \| `claude` \| `openai` | gemini |
| GEMINI_API_KEY | Google AI key | (when provider=gemini) |
| GEMINI_MODEL | Gemini model id | gemini-2.0-flash |
| ANTHROPIC_API_KEY | Anthropic key | (when provider=claude) |
| CLAUDE_MODEL | Claude model id | claude-sonnet-4-20250514 |
| OPENAI_API_KEY | OpenAI key | (when provider=openai) |
| OPENAI_MODEL | OpenAI model id | gpt-4o |
| CRAWL_CONCURRENCY | Concurrent crawls | 3 |
| MAX_AGENT_STEPS | Max agent loop iterations | 15 |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| NEXT_PUBLIC_API_URL | Backend API URL | http://localhost:3001 |
