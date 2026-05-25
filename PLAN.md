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

## The Three Pieces of Code

```
┌─────────────────────────────────────────────────────────────────────┐
│  PIECE 1: Chrome Extension  (runs inside Chrome)                    │
│  PIECE 2: email-extractor   (Hono/Bun server, runs on your Mac)     │
│  PIECE 3: CubeHQ Dashboard  (Next.js, already exists — not touched) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How the Extension Works Inside Chrome

Chrome extensions cannot directly touch any webpage's content — they run in their own isolated world. So the extension has two distinct parts that work together:

```
┌──────────────────────────────────────────────────────────────┐
│  GMAIL TAB (mail.google.com)                                 │
│                                                              │
│  content.js ← Chrome injects this into every Gmail tab      │
│                                                              │
│  It sits silently doing NOTHING until popup.js wakes it up  │
│  It can READ the Gmail DOM (email body, subject, sender)     │
│  It cannot make API calls directly                           │
└───────────────────────┬──────────────────────────────────────┘
                        │  chrome.runtime.sendMessage()
                        │  (only fires when user clicks Analyze Email)
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  EXTENSION POPUP (the small window when you click the icon)  │
│                                                              │
│  popup.html + popup.js + popup.css                           │
│  This is the full UI — dropdowns, task list, buttons         │
│  It CAN make fetch() calls to external servers               │
│  It sends messages to content.js to get the email body       │
└──────────────────────────────────────────────────────────────┘
```

`manifest.json` is the config file that wires everything together — it tells Chrome:
- Which script to inject into Gmail (`content.js`)
- What the popup HTML file is
- Which domains the extension is allowed to talk to

### content.js — What It Is

content.js is declared in `manifest.json` like this:
```json
{
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": ["content/content.js"]
    }
  ]
}
```

This tells Chrome: *"Every time the user opens a tab matching mail.google.com, inject content.js into that page."*

content.js is completely passive — it just sits as a listener:
```js
// content.js — the entire file is basically this
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getEmailBody") {
    const parts = [...document.querySelectorAll('.a3s.aiL')]
      .filter(el => el.offsetParent !== null)  // only expanded emails
    const body    = parts.map(el => el.innerText.trim()).join('\n\n---\n\n')
    const subject = document.querySelector('.hP')?.innerText ?? ''
    const sender  = document.querySelector('.gD')?.getAttribute('email') ?? ''
    sendResponse({ body, subject, sender })
  }
})
```

It only wakes up when popup.js sends it a message. No DOM reading happens until "Analyze Email" is clicked.

### Why content.js has to exist at all

```
popup.js                          Gmail tab DOM
(extension popup)                 (the actual page)
      │                                 │
      │  popup.js CANNOT reach          │
      │  across into the tab's DOM ✗    │
      │                                 │
      │   content.js bridges them       │
      │         │                       │
      └────────►│◄──────────────────────┘
            content.js
         (lives inside the tab,
          can read the DOM,
          can talk back to popup.js)
```

### Does it inject into ALL Gmail tabs?

Yes — Chrome injects content.js into every Gmail tab. But it does nothing on its own.
When the user clicks the extension icon, popup.js sends a message **only to the active tab** the user is currently on. Other Gmail tabs are never touched.

```
Tab 1: Gmail inbox          ← content.js injected, doing nothing
Tab 2: Gmail email open     ← content.js injected, doing nothing
Tab 3: Gmail email open     ← content.js injected, doing nothing

User clicks extension icon while on Tab 2
  → popup.js asks ONLY Tab 2 for the email body
  → Tab 1 and Tab 3 are never touched
```

If user clicks the icon on the inbox (no email open) → `querySelector('.a3s.aiL')` returns nothing → popup shows **"Please open an email first"**.

---

## Complete End-to-End Flow

```
USER OPENS GMAIL AND OPENS A CLIENT EMAIL
         │
         ▼
content.js (already injected silently into the Gmail tab)
  just a listener — doing nothing, waiting
         │
USER CLICKS THE EXTENSION ICON
         │
         ▼
popup.html opens (the small window)
popup.js runs:

  ── ON POPUP OPEN ──────────────────────────────────────────
  GET http://localhost:3000/api/clients?lite=1
  credentials: include  ← browser auto-attaches dashboard cookie
  → returns [{ id: "uuid", name: "Client Name" }, ...]
  → populates the Client dropdown

  User selects:  Client  → "Acme Corp"
                 Table   → "SEO" / "Email" / "Paid Ads"

  ── USER CLICKS "Analyze Email" ────────────────────────────
  popup.js  →  chrome.tabs.sendMessage(tabId, { action: "getEmailBody" })
                         │
                         ▼
               content.js wakes up, reads Gmail DOM:
                 .a3s.aiL  → email body (only expanded ones)
                 .hP       → subject
                 .gD       → sender
                         │
                         │ sends back { body, subject, sender }
                         ▼
  popup.js receives email data

  popup.js  →  POST http://localhost:8787/extract-tasks
               Body: { email_body: "...", table: "seo" }
                         │
                         ▼
               email-extractor (Hono/Bun on your Mac)
                 router.ts     → receives + validates request
                 controller.ts → calls createAIClient("openai")
                 openAIClient  → sends prompt to OpenAI API
                 OpenAI returns → ["Fix meta descriptions", "Update backlinks", ...]
                 successResponse → { success: true, data: { tasks: [...] } }
                         │
                         ▼
  popup.js renders task list:
    ✕ Fix meta descriptions for homepage
    ✕ Update backlink report for Q2
    ✕ Review keyword rankings

  User removes any unwanted tasks
  User sets: Status, Priority (SEO only), ETA (SEO only)

  ── USER CLICKS "Add Tasks" ────────────────────────────────
  popup.js loops through remaining tasks, one POST per task:

  SEO:
    POST http://localhost:3000/api/tasks
    credentials: include
    { title, client_id, status, priority, eta_end }

  Email:
    POST http://localhost:3000/api/email-tasks
    credentials: include
    { title, client_id, status }          ← no priority/eta_end (strict schema)

  Paid:
    POST http://localhost:3000/api/paid-tasks
    credentials: include
    { title, client_id, status }          ← no priority/eta_end (strict schema)

  Each POST → withAuth() verifies cookie → lifecycle engine →
  insertOne into MongoDB → task appears on dashboard ✓

  popup.js shows: "3 tasks added successfully ✓"
```

---

## Why Cookies — The Auth Story

The dashboard login sets an **httpOnly cookie** named `token` in Chrome when you log in at `localhost:3000`. httpOnly means JavaScript can't read it — but Chrome still **automatically sends it** with every fetch request to that domain.

```
Extension popup.js:
  fetch("http://localhost:3000/api/tasks", { credentials: "include" })
                                                    ▲
                        this one line tells Chrome: │
                        "attach any cookies you have for this domain"

Chrome sees: I have cookie `token` for localhost:3000
Chrome attaches it automatically

Dashboard: withAuth() reads cookie → verifies JWT → authorized ✓
```

**No separate login. No API keys in the extension. User just has to be logged into the dashboard in the same Chrome browser.**

### Who can access the API?

| Who tries | Cookie exists? | CORS passes? | Gets data? |
|---|---|---|---|
| You (logged in, using extension) | ✓ | ✓ | ✓ |
| Random person on the internet | ✗ | ✗ | ✗ |
| Malicious website | ✓ (if you're logged in) | ✗ (origin blocked) | ✗ |
| Another Chrome extension | ✗ | ✗ | ✗ |

Protected by two independent layers — JWT cookie auth AND CORS origin checking. Both must pass.

---

## What Runs Where (Local Dev)

```
Your Mac
├── Terminal 1: cd CubeHQ-Dashboard && npm run dev   → localhost:3000
├── Terminal 2: cd email-extractor && bun run dev    → localhost:8787
└── Chrome
    ├── Tab: localhost:3000/dashboard  (must be logged in)
    ├── Tab: mail.google.com           (Gmail)
    └── Extension: loaded unpacked from chrome-extension/ folder
```

---

## Publishing the Extension

**During development (what you use now):**
- `chrome://extensions` → enable Developer Mode → Load unpacked → select `chrome-extension/` folder
- Extension appears instantly, no review, no publishing
- Code change → hit refresh icon on the extension card in `chrome://extensions`

**When ready to share with your team:**

| Option | What it means | Best for |
|---|---|---|
| Keep as unpacked | Everyone loads it manually | Just you |
| Chrome Web Store — Unlisted | Published, accessible via direct link only | Small internal team ✓ |
| Chrome Web Store — Private | Restricted to your Google Workspace domain | Company-wide rollout |
| Chrome Web Store — Public | Anyone can find and install it | Public tools |

**Recommended: Unlisted.** Publish once, share the link, team installs it, Chrome auto-updates everyone silently when you push updates. No manual reloading.

Publishing requires: Chrome Web Store developer account ($5 one-time), a zip of `chrome-extension/`, screenshots + description. Google reviews take 1-3 days first time, hours for updates.

---

## Architecture Overview

```
Gmail (Chrome Tab)
  └─ content.js (injected by Chrome, passive listener)
       └─ wakes up only when popup.js sends "getEmailBody" message
            └─ reads DOM, returns { subject, body, sender }

Chrome Extension Popup (popup.js)
  ├─ ON OPEN:  GET  localhost:3000/api/clients?lite=1  → client dropdown
  ├─ ON ANALYZE EMAIL CLICK:
  │    ├─ message → content.js → get email body
  │    └─ POST localhost:8787/extract-tasks → AI task titles
  └─ ON ADD TASKS CLICK:
       ├─ SEO      → POST localhost:3000/api/tasks
       ├─ Email    → POST localhost:3000/api/email-tasks
       └─ Paid Ads → POST localhost:3000/api/paid-tasks

email-extractor (Hono/Bun — localhost:8787)
  └─ stateless, no DB, just calls OpenAI and returns task titles

CubeHQ Dashboard (Next.js — localhost:3000)
  └─ untouched — extension reuses existing API endpoints + auth
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
│   │   │       ├── iAIClient.ts            ← IAIClient interface
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
    ├── manifest.json                       ← declares permissions, injects content.js, sets popup
    ├── content/
    │   └── content.js                      ← injected into every Gmail tab, reads DOM on demand
    ├── popup/
    │   ├── popup.html                      ← the UI window structure
    │   ├── popup.js                        ← orchestration: clients → analyze → tasks → post
    │   └── popup.css                       ← styling
    └── icons/
        └── icon.png
```

---

## Extension Popup — UI Flow

```
┌──────────────────────────────────────┐
│  Gmail Task Extractor                │
│                                      │
│  Client   [ Select client...    ▼ ]  │  ← GET /api/clients?lite=1 on popup open
│  Table    [ SEO / Email / Paid  ▼ ]  │  ← static dropdown
│                                      │
│           [ Analyze Email ]          │  ← triggers content.js + AI call
│                                      │
│  ── Suggested Tasks ──               │
│  ✕  Fix meta descriptions for HP     │  ← user can remove with ✕
│  ✕  Update backlink report           │
│  ✕  Review keyword rankings          │
│                                      │
│  Status   [ No status         ▼ ]    │  ← shown for all tables
│  Priority [ No priority       ▼ ]    │  ← SEO only
│  ETA      [ dd/mm/yyyy         ]     │  ← SEO only
│                                      │
│  [ Cancel ]        [ Add Tasks ]     │  ← posts one request per task
└──────────────────────────────────────┘
```

- AI fills **title only** — everything else is user-selected
- One config applies to all tasks in the batch
- **Priority and ETA only shown for SEO** — EmailTaskSchema and PaidTaskSchema use `.strict()`, sending unknown fields returns 400

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
  constructor(message: string, public status: number) { super(message) }
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
  origin: "*",
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

## Gmail DOM Extraction

```js
// content.js — triggered by popup.js message only
const parts = [...document.querySelectorAll('.a3s.aiL')]
  .filter(el => el.offsetParent !== null)  // only visible/expanded emails

const body    = parts.map(el => el.innerText.trim()).join('\n\n---\n\n')
const subject = document.querySelector('.hP')?.innerText ?? ''
const sender  = document.querySelector('.gD')?.getAttribute('email') ?? ''
```

- Single email → extracts that one
- Thread, one email expanded → extracts only that one
- Thread, multiple expanded → concatenates all (more context = better AI output)
- No email open → popup shows "Please open an email first"

---

## Dashboard API Endpoints Used (Existing — Zero Changes to Dashboard)

### Fetch Clients
```
GET  http://localhost:3000/api/clients?lite=1
credentials: include  (dashboard cookie auto-attached by browser)
Returns: [{ id: "uuid", name: "Client Name", ... }]
```

### Create SEO Task
```
POST http://localhost:3000/api/tasks
credentials: include
Body: {
  title:     string,           // required — AI generated
  client_id: string,           // required — uuid from picker
  status?:   "To Be Started" | "In Progress" | "Pending Review"
             | "Completed" | "Implemented" | "Blocked",
  priority?: "P0" | "P1" | "P2" | "P3",   // optional, defaults to P2
  eta_end?:  string,                       // optional, ISO date e.g. "2026-06-01"
}
// FORBIDDEN — causes 400: internal_approval, client_link_visible,
//             client_approval, client_feedback_note, client_feedback_at
```

### Create Email Task
```
POST http://localhost:3000/api/email-tasks
credentials: include
Body: {
  title:     string,           // required — AI generated
  client_id: string,           // required — uuid from picker
  status?:   "To Be Started" | "In Progress" | "Pending Review"
             | "Completed" | "Implemented" | "Blocked",
}
// ⚠️  Schema is .strict() — DO NOT send priority or eta_end
//     they are not in EmailTaskSchema → 400 validation error
// FORBIDDEN — causes 400: internal_approval, client_approval,
//             client_feedback_note, client_feedback_at
```

### Create Paid Ads Task
```
POST http://localhost:3000/api/paid-tasks
credentials: include
Body: {
  title:     string,           // required — AI generated
  client_id: string,           // required — uuid from picker
  status?:   "To Be Started" | "In Progress" | "Pending Review"
             | "Completed" | "Implemented" | "Blocked",
}
// ⚠️  Schema is .strict() — DO NOT send priority or eta_end
//     they are not in PaidTaskSchema → 400 validation error
// FORBIDDEN — causes 400: internal_approval, client_approval,
//             client_feedback_note, client_feedback_at
```

> Each task is one individual POST — goes through the full lifecycle engine,
> validation, and notifications identical to manually adding from the dashboard.

---

## Environment Variables

### `email-extractor/.env`
```env
OPENAI_API_KEY=sk-...        # Required
PORT=8787                    # Hono server port (default 8787)
OPENAI_MODEL=gpt-4o-mini     # Model to use (cheap + fast for task extraction)
```

### `email-extractor/.env.example`
```env
OPENAI_API_KEY=
PORT=8787
OPENAI_MODEL=gpt-4o-mini
```

### `CubeHQ-Dashboard/.env` — CORS for extension requests

The dashboard's `handleCORS` reads `CORS_ORIGINS`. If unset → falls back to wildcard `*` automatically. No change needed for local dev if `CORS_ORIGINS` is not set.

If `CORS_ORIGINS` is already set to specific domains, extension requests will be blocked — Chrome extension origins look like `chrome-extension://abcdef123456` (a specific ID). Fix: after loading the extension in Chrome, copy its ID from `chrome://extensions` and add it:

```env
CORS_ORIGINS=http://localhost:3000,chrome-extension://YOUR_EXTENSION_ID_HERE
```

Simplest for local dev: leave `CORS_ORIGINS` unset → server uses `*` → extension requests go through.

---

## Prerequisites Checklist

- [ ] **Bun installed** — `curl -fsSL https://bun.sh/install | bash`
- [ ] **OpenAI API key** — already have it, goes in `email-extractor/.env`
- [ ] **Dashboard running locally** — `npm run dev` in `CubeHQ-Dashboard/`
- [ ] **Logged into dashboard in Chrome** — session cookie must exist for auth to work
- [ ] **Chrome Developer Mode** — `chrome://extensions` → enable Developer Mode (top right toggle)
- [ ] **CORS check** — if `CORS_ORIGINS` is set in dashboard `.env`, add extension ID to it

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
11. `manifest.json` — permissions, content script declaration, popup declaration
12. `content/content.js` — Gmail DOM reader, message listener
13. `popup/popup.html` — UI structure
14. `popup/popup.css` — styling
15. `popup/popup.js` — fetch clients → analyze email → show tasks → post to dashboard

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
- No publishing to Chrome Web Store — loaded unpacked for internal use (Unlisted when ready to share)
