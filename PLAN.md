# Gmail Task Extractor — Extension + AI Service Plan

> Architecture follows `system-architecture.md` (Bun + Hono + TypeScript).
> The `db/` folder in this repo is reference-only — schemas from CubeHQ-Dashboard, not touched.

---

## What This Does

A Chrome Extension that sits inside Gmail. When a user opens a client email, they click the extension icon, pick a client and task table (SEO / Email / Paid Ads), hit "Analyze Email", and the extension:
1. Extracts the visible email body from the Gmail DOM
2. Sends it to a dedicated Hono/Bun AI microservice
3. Gets back a list of suggested task titles
4. Lets the user review/remove tasks and set minimal config (Status, Priority, ETA)
5. Posts each task directly to the existing CubeHQ Dashboard API

Tasks appear on the dashboard instantly — no copy-pasting, no manual entry.

---

## Architecture Overview

```
Gmail (Chrome Tab)
  └─ content.js (injected)
       └─ reads expanded email body from DOM (.a3s.aiL)
            └─ returns { subject, body, sender } to popup

Chrome Extension Popup
  ├─ Step 1: GET http://localhost:3000/api/clients?lite=1   → populate client dropdown
  ├─ Step 2: User picks Client + Table (SEO / Email / Paid Ads)
  ├─ Step 3: "Analyze Email" clicked
  │    └─ POST http://localhost:8787/extract-tasks
  │         └─ Hono/Bun AI Service calls OpenAI → returns [{ title }]
  ├─ Step 4: Shows task titles — user can remove any
  ├─ Step 5: User sets Status + Priority + ETA (applies to all tasks)
  └─ Step 6: "Add Tasks" clicked
       └─ POSTs each task individually (one POST per task):
            SEO      → POST http://localhost:3000/api/tasks
            Email    → POST http://localhost:3000/api/email-tasks
            Paid Ads → POST http://localhost:3000/api/paid-tasks
```

---

## Two Things Being Built

### 1. `email-extractor/` — Hono/Bun AI Microservice
Standalone TypeScript service. Only job: receive an email body + table type, call OpenAI, return task titles. **No DB. No workers. No auth. Stateless.**

### 2. `chrome-extension/` — The Chrome Extension
Vanilla JS (no framework, no build step). Popup UI + Gmail content script.

---

## Tech Stack

### AI Microservice (`email-extractor/`) — per `system-architecture.md`

| Layer | Technology | Version |
|---|---|---|
| Runtime | Bun | 1.x |
| Framework | Hono | ^4.x |
| Language | TypeScript | ~5.x |
| Validation | Zod | ^4.x |
| Route validation | @hono/zod-validator | ^0.7.x |
| AI — OpenAI | openai | ^6.x |
| Linter/Formatter | Biome | ^2.x |
| Error handling | HttpError class | custom |

> No Drizzle, no BullMQ, no Redis — this service is stateless, no DB or workers needed.

### Chrome Extension (`chrome-extension/`)

| Layer | Choice |
|---|---|
| Language | Vanilla JS |
| Manifest | V3 |
| Styling | Plain CSS |

---

## Folder Structure

```
Dashboard_extension/
├── PLAN.md
│
├── email-extractor/                        ← Hono/Bun AI service
│   ├── index.ts                            ← Hono app entry: CORS, error handler, route registration
│   ├── biome.json                          ← Biome linter/formatter config
│   ├── tsconfig.json                       ← TypeScript config with @/ path alias
│   ├── package.json
│   ├── .env
│   ├── .env.example
│   │
│   ├── common/
│   │   ├── clients/
│   │   │   └── ai/
│   │   │       ├── iAIClient.ts            ← AIProvider interface
│   │   │       ├── openAIClient.ts         ← OpenAI implementation
│   │   │       └── factory.ts              ← createAIClient("openai" | "anthropic")
│   │   ├── config/
│   │   │   └── settings.ts                 ← all env vars — never use process.env directly
│   │   ├── errors/
│   │   │   └── index.ts                    ← HttpError class
│   │   └── response/
│   │       ├── types.ts                    ← ApiSuccessResponse<T>, ApiErrorResponse<E>
│   │       └── helpers.ts                  ← successResponse(), errResponse()
│   │
│   ├── controllers/
│   │   └── extract/
│   │       ├── controller.ts               ← business logic: call AI, parse response
│   │       └── types.ts                    ← TypeScript types for this controller
│   │
│   └── routers/
│       └── extract/
│           ├── router.ts                   ← thin Hono route, zValidator, calls controller
│           ├── types.ts                    ← Zod input/output schemas
│           └── index.ts                    ← barrel export
│
└── chrome-extension/                       ← Chrome Extension
    ├── manifest.json
    ├── content/
    │   └── content.js                      ← injected into Gmail, reads DOM
    ├── popup/
    │   ├── popup.html
    │   ├── popup.js
    │   └── popup.css
    └── icons/
        └── icon.png
```

---

## AI Client Pattern — per `system-architecture.md §2.8 / §6.8`

```typescript
// common/clients/ai/iAIClient.ts
export interface IAIClient {
  extractTasks(emailBody: string, table: string): Promise<string[]>
}

// common/clients/ai/openAIClient.ts
export class OpenAIClient implements IAIClient {
  async extractTasks(emailBody: string, table: string): Promise<string[]> { ... }
}

// common/clients/ai/factory.ts — call sites never import concrete class
export const createAIClient = (provider: "openai" | "anthropic" = "openai"): IAIClient => {
  if (provider === "openai") return new OpenAIClient()
  // if (provider === "anthropic") return new AnthropicClient()
  throw new HttpError(`Unknown AI provider: ${provider}`, 400)
}
```

Swap provider in one line — zero changes to router or controller.

---

## Router → Controller Pattern — per `system-architecture.md §6.2`

```typescript
// routers/extract/router.ts — thin layer only
router.post("/", zValidator("json", ExtractSchema), async (c) => {
  const data = c.req.valid("json")
  const result = await extractTasks(data)
  return successResponse(c, { tasks: result })
})

// controllers/extract/controller.ts — all business logic here
export async function extractTasks(data: ExtractInput): Promise<{ title: string }[]> {
  const client = createAIClient("openai")
  const titles = await client.extractTasks(data.email_body, data.table)
  return titles.map(title => ({ title }))
}
```

---

## Settings Pattern — per `system-architecture.md §6.5`

```typescript
// common/config/settings.ts — never use process.env directly anywhere else
function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required config: ${key}`)
  return v
}

export const settings = {
  openai: {
    apiKey: required("OPENAI_API_KEY"),
    model:  process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
  },
  server: {
    port: Number(process.env["PORT"]) || 8787,
  },
}
```

---

## Error Handling — per `system-architecture.md §6.4`

```typescript
// common/errors/index.ts
export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

// index.ts — global handler
app.onError((err, c) => {
  if (err instanceof HttpError)
    return errResponse(c, { message: err.message }, err.status)
  return errResponse(c, { message: "Internal server error" }, 500)
})
```

---

## Response Envelope — per `system-architecture.md §6.3`

Every response uses the same wrapper:

```typescript
successResponse(c, { tasks: [...] }, 200)
// → { "success": true, "data": { "tasks": [...] } }

errResponse(c, { message: "email_body is required" }, 400)
// → { "success": false, "data": { "message": "..." } }
```

---

## Hono Entry Point — per `system-architecture.md §2.3`

```typescript
// index.ts
const app = new Hono()

app.use(requestId())
app.use(cors({
  origin: "*",   // extension origin is chrome-extension://* — wildcard for dev/internal tool
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  credentials: false,
}))

app.onError((err, c) => {
  if (err instanceof HttpError)
    return errResponse(c, { message: err.message }, err.status)
  return errResponse(c, { message: "Internal server error" }, 500)
})

app.route("/extract-tasks", extractRoute)
app.route("/health", healthRoute)

export default { port: settings.server.port, fetch: app.fetch }
```

---

## AI Microservice API Contract

```
POST http://localhost:8787/extract-tasks
Content-Type: application/json

Request:
{
  "email_body": "Hi team, please update the meta descriptions...",
  "table": "seo"   // "seo" | "email" | "paid"
}

Response 200:
{
  "success": true,
  "data": {
    "tasks": [
      { "title": "Update meta descriptions for homepage" },
      { "title": "Review keyword rankings for Q2" }
    ]
  }
}

Response 400:
{
  "success": false,
  "data": { "message": "email_body is required" }
}
```

---

## Gmail DOM Extraction (content.js)

```js
// Get only EXPANDED (visible) email bodies in the current thread
const parts = [...document.querySelectorAll('.a3s.aiL')]
  .filter(el => el.offsetParent !== null)  // collapsed emails return null

const body    = parts.map(el => el.innerText.trim()).join('\n\n---\n\n')
const subject = document.querySelector('.hP')?.innerText ?? ''
const sender  = document.querySelector('.gD')?.getAttribute('email') ?? ''
```

- Single email → extracts that one
- Thread with one email expanded → extracts only that one
- Thread with multiple expanded → concatenates all (more context = better AI output)
- No email open → popup shows "Please open an email first"

---

## Extension Popup — User Flow

```
┌──────────────────────────────────────┐
│  Gmail Task Extractor                │
│                                      │
│  Client   [ Select client...    ▼ ]  │  ← GET /api/clients?lite=1
│  Table    [ SEO / Email / Paid  ▼ ]  │  ← static
│                                      │
│           [ Analyze Email ]          │
│                                      │
│  ── Suggested Tasks ──               │
│  ✕  Fix meta descriptions for HP     │
│  ✕  Update backlink report           │
│  ✕  Review keyword rankings          │
│                                      │
│  Status   [ No status         ▼ ]    │
│  Priority [ No priority       ▼ ]    │
│  ETA      [ dd/mm/yyyy         ]     │
│                                      │
│  [ Cancel ]        [ Add Tasks ]     │
└──────────────────────────────────────┘
```

- AI fills **title only** — everything else is user-selected
- One set of Status/Priority/ETA applies to all tasks in the batch
- User can remove individual tasks with ✕
- Category field not shown — not present in Email/Paid schemas, optional on SEO

---

## Dashboard API Endpoints Used (Existing — Zero Changes to Dashboard)

### Fetch Clients
```
GET  http://localhost:3000/api/clients?lite=1
Headers: (cookie auto-sent by browser — user is logged in)
Returns: [{ id: "uuid", name: "Client Name", ... }]
```

### Create SEO Task
```
POST http://localhost:3000/api/tasks
credentials: include
Body: {
  title:     string,           // required — AI generated
  client_id: string,           // required — uuid from picker
  status?:   "To Be Started" | "In Progress" | "Pending Review" | "Completed" | "Implemented" | "Blocked",
  priority?: "P0" | "P1" | "P2" | "P3",   // defaults to P2
  eta_end?:  string,           // ISO date string e.g. "2026-06-01"
}
```

### Create Email Task
```
POST http://localhost:3000/api/email-tasks
credentials: include
Body: { title, client_id, status?, priority?, eta_end? }
```

### Create Paid Ads Task
```
POST http://localhost:3000/api/paid-tasks
credentials: include
Body: { title, client_id, status?, priority?, eta_end? }
```

> Each task is one individual POST — goes through the full lifecycle engine, validation,
> and notifications identical to manually adding from the dashboard.

---

## Authentication — How It Works

Dashboard uses JWT in an **httpOnly cookie** named `token`.

Extension does NOT need its own login:
- User is logged into `localhost:3000` in Chrome
- Extension uses `credentials: 'include'` on every fetch → browser sends cookie automatically
- `withAuth()` on the dashboard reads the cookie, verifies JWT, request goes through

```js
// popup.js
fetch('http://localhost:3000/api/tasks', {
  method: 'POST',
  credentials: 'include',       // ← sends the dashboard session cookie
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title, client_id, status, priority, eta_end })
})
```

---

## Environment Variables

### `email-extractor/.env`
```env
OPENAI_API_KEY=sk-...        # Required
PORT=8787                    # Hono server port (default 8787)
OPENAI_MODEL=gpt-4o-mini     # Model (cheap + fast for task extraction)
```

### `email-extractor/.env.example`
```env
OPENAI_API_KEY=
PORT=8787
OPENAI_MODEL=gpt-4o-mini
```

### `CubeHQ-Dashboard/.env` — one addition for CORS
```env
# Add chrome-extension://* to existing CORS_ORIGINS
CORS_ORIGINS=http://localhost:3000,chrome-extension://*
```

---

## Prerequisites Checklist

- [ ] **Bun installed** — `curl -fsSL https://bun.sh/install | bash`
- [ ] **OpenAI API key** — already have it, goes in `email-extractor/.env`
- [ ] **Dashboard running locally** — `npm run dev` in `CubeHQ-Dashboard/`
- [ ] **Logged into dashboard in Chrome** — session cookie must exist
- [ ] **Chrome Developer Mode** — `chrome://extensions` → enable Developer Mode
- [ ] **CORS_ORIGINS updated** in `CubeHQ-Dashboard/.env` to include `chrome-extension://*`

---

## Build Order

### Phase 1 — `email-extractor/` (Hono/Bun AI service)
1. `package.json` + `tsconfig.json` + `biome.json`
2. `common/config/settings.ts` — env var access
3. `common/errors/index.ts` — HttpError
4. `common/response/types.ts` + `helpers.ts` — response envelope
5. `common/clients/ai/iAIClient.ts` — interface
6. `common/clients/ai/openAIClient.ts` — OpenAI implementation + prompt
7. `common/clients/ai/factory.ts` — createAIClient()
8. `controllers/extract/types.ts` + `controller.ts` — business logic
9. `routers/extract/types.ts` + `router.ts` + `index.ts` — Hono route
10. `index.ts` — app entry, CORS, error handler, route registration

### Phase 2 — `chrome-extension/`
11. `manifest.json`
12. `content/content.js` — Gmail DOM reader
13. `popup/popup.html` — UI structure
14. `popup/popup.css` — styling
15. `popup/popup.js` — orchestration: fetch clients → analyze → show tasks → post

### Phase 3 — End-to-end test
16. `bun run dev` in `email-extractor/`
17. `npm run dev` in `CubeHQ-Dashboard/`
18. Load extension: `chrome://extensions` → Load unpacked → select `chrome-extension/`
19. Open Gmail → open a client email → click extension icon → test full flow

---

## What Is NOT Being Built

- No new routes on the CubeHQ Dashboard — reusing existing ones entirely
- No separate auth system — reusing existing JWT cookie session
- No database in the AI service — stateless, ephemeral
- No UI framework in the extension — plain HTML/CSS/JS, no build step
- No BullMQ workers — request is fast enough to be synchronous
- No Drizzle ORM — no DB in this service
- No publishing to Chrome Web Store — loaded unpacked for internal use
