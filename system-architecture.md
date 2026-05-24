# Full-Stack TypeScript — Architecture Reference

> A reference guide for building projects with this stack. Feed to an LLM to replicate the same architecture, conventions, and patterns.

---

## Table of Contents
1. [Monorepo Structure](#1-monorepo-structure)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Infrastructure & DevOps](#4-infrastructure--devops)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Key Patterns & Conventions](#6-key-patterns--conventions)

---

## 1. Monorepo Structure

```
project-root/
├── backend/           # Bun + Hono API server
├── frontend/          # React 19 + Vite SPA
├── biome.json         # Shared Biome linter/formatter config (root)
├── bun.lock           # Bun lockfile
└── system-architecture.md
```

### Shared Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| Biome | ^2.4.1 | Linting + formatting (replaces ESLint + Prettier) |
| Husky | ^9.1.7 | Git hooks |
| lint-staged | ^16.2.7 | Run checks on staged files only |
| TypeScript | ~5.9.x | Type safety across both workspaces |

**Biome** is the sole linter/formatter for the entire repo. No `.eslintrc`, no `.prettierrc`.
- `bun run check` — auto-fix
- `bun run check:ci` — read-only (for CI)

---

## 2. Backend Architecture

### 2.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Bun | 1.x |
| Framework | Hono | ^4.11.9 |
| ORM | Drizzle ORM | ^0.45.1 |
| Database | PostgreSQL | 16 |
| Job Queue | BullMQ | ^5.69.3 |
| Redis client | ioredis | ^5.9.3 |
| Validation | Zod | ^4.3.6 |
| Route validation | @hono/zod-validator | ^0.7.6 |
| Auth | JWT via hono/jwt (HS256) | — |
| Email | nodemailer | ^8.0.1 |
| File parsing | xlsx | ^0.18.5 |
| AI — OpenAI | openai | ^6.22.0 |
| AI — Google | @google/generative-ai | ^0.24.1 |
| AI — Anthropic | @anthropic-ai/sdk | ^0.74.0 |
| Structured AI output | @instructor-ai/instructor | ^1.7.0 |

### 2.2 Folder Structure

```
backend/
├── index.ts                     # App entry: Hono instance, CORS, global error handler, route registration
├── drizzle.config.ts            # Drizzle kit: lists all schema files, sets DB URL
├── docker-compose.yml           # PostgreSQL 16 + Redis 7 for local dev
│
├── common/
│   ├── clients/                 # External service clients (factory + interface pattern)
│   │   ├── ai/                  # AI provider clients
│   │   │   ├── iAIClient.ts     # Interface
│   │   │   ├── openAIClient.ts
│   │   │   ├── geminiClient.ts
│   │   │   ├── anthropicAIClient.ts
│   │   │   ├── baseAIClient.ts
│   │   │   └── factory.ts       # createAIClient("openai" | "gemini" | "anthropic")
│   │   ├── scraper/             # Async web scraper client
│   │   │   ├── IScraperClient.ts
│   │   │   ├── scraperClient.ts
│   │   │   └── factory.ts
│   │   ├── fileProcessor/       # CSV / XLSX parsing
│   │   │   ├── IFileProcessor.ts
│   │   │   └── fileProcessorClient.ts
│   │   └── smtp/                # Transactional email
│   │       ├── ISmtpClient.ts
│   │       └── smtpClient.ts
│   ├── config/
│   │   └── settings.ts          # Centralised env var access — never use process.env directly
│   ├── errors/
│   │   └── index.ts             # HttpError class
│   ├── response/
│   │   ├── types.ts             # ApiSuccessResponse<T>, ApiErrorResponse<E>
│   │   └── helpers.ts           # successResponse(), errResponse()
│   └── utils/
│       └── utils.ts
│
├── controllers/                 # Business logic — called by routers, throw HttpError on failure
│   ├── auth/
│   │   ├── controller.ts        # signUp, signIn, requestMagicLink, verifyMagicLink, handleGoogleCallback
│   │   ├── types.ts
│   │   └── utils.ts             # issueJwt(), toProfile(), generateSlug()
│   └── <entity>/                # One controller folder per domain entity
│       ├── controller.ts
│       └── types.ts
│
├── db/                          # Drizzle ORM schemas + query functions
│   ├── client.ts                # pg Pool → drizzle(pool) instance
│   ├── base.ts                  # baseTableColumns() — id, timestamps, soft-delete, audit cols
│   ├── index.ts                 # Barrel: re-exports all schemas and repos
│   ├── migrations/run.ts        # Migration runner script
│   └── <entity>/
│       ├── index.ts             # pgTable schema + inferred TypeScript types
│       └── repo.ts              # getX(), createX(), updateX(), deleteX() query functions
│
├── middlewares/
│   └── auth.ts                  # requireAuth: verify JWT, load user + workspace into context
│
├── routers/                     # HTTP routes — thin layer, validates input, calls controller
│   ├── auth/
│   │   ├── router.ts
│   │   ├── types.ts             # Zod input schemas
│   │   └── index.ts
│   └── <entity>/
│       ├── router.ts
│       ├── types.ts
│       └── index.ts
│
└── workers/                     # BullMQ async job processors
    ├── connection.ts            # Shared Redis connection for BullMQ
    ├── queue.ts                 # Queue factory helper
    ├── index.ts                 # Worker process entry point
    └── <job-type>/
        ├── jobs.ts              # Enqueue functions (called by controllers/routers)
        └── worker.ts            # Job processor logic
```

### 2.3 Entry Point (`index.ts`)

```typescript
const app = new Hono()

app.use(requestId())
app.use(cors({
  origin: settings.server.corsOrigin,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}))

app.onError((err, c) => {
  if (err instanceof HttpError)
    return errResponse(c, { message: err.message }, err.status)
  return errResponse(c, { message: "Internal server error" }, 500)
})

// Route registration
app.route("/auth", authRoute)
app.route("/health", healthRoute)
app.route("/<entity>", entityRoute)

export default { port: settings.server.port, fetch: app.fetch }
```

### 2.4 Auth Routes

All auth is **cookie-based JWT**. The backend owns all OAuth/magic-link redirect logic.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | No | Email + password signup. Creates user + workspace. Sets httpOnly cookie. |
| POST | `/auth/signin` | No | Email + password signin. Sets httpOnly cookie. |
| POST | `/auth/logout` | No | Clears the auth cookie. |
| POST | `/auth/email` | No | Send a magic-link email. |
| GET | `/auth/email/verify?token=` | No | Verify magic link → set cookie → redirect to `FRONTEND_URL`. |
| GET | `/auth/google` | No | Redirect browser to Google OAuth consent screen. |
| GET | `/auth/google/callback?code=` | No | Exchange OAuth code → set cookie → redirect to `FRONTEND_URL`. |
| GET | `/auth/me` | Yes | Return `{ userId, email, name }` for the authenticated user. |

### 2.5 Database Schema Conventions

**Driver**: `pg` Pool + `drizzle-orm/node-postgres`

#### Base Columns (shared by every table via `baseTableColumns()`)
```
id          serial PRIMARY KEY
createdAt   timestamptz DEFAULT now()
updatedAt   timestamptz DEFAULT now()
deletedAt   timestamptz (nullable)
isDeleted   boolean DEFAULT false
createdBy   int (nullable)
updatedBy   int (nullable)
deletedBy   int (nullable)
```

These columns are injected into every table. Project-specific tables (users, workspaces, etc.) are defined per-project — this base layer is the only shared convention.

### 2.6 Authentication Flow

JWT is stored in an **httpOnly, SameSite=Lax** cookie named `token`. The `secure` flag is only set when `NODE_ENV=production`.

```typescript
setCookie(c, "token", jwt, {
  httpOnly: true,
  secure: settings.server.isProduction,
  sameSite: "Lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60  // 7 days — must match JWT exp
})
```

**JWT payload**: `{ sub: string, email: string, iat: number, exp: number }`

**`requireAuth` middleware** (`middlewares/auth.ts`):
1. Reads JWT from cookie `token`, or falls back to `Authorization: Bearer <token>` header
2. Verifies with `hono/jwt` using HS256 and `JWT_SECRET`
3. Loads `user` record from DB (by `sub`)
4. Verifies user has a `workspaceId` assigned
5. Loads `workspace` record
6. Sets `c.set("auth", payload)`, `c.set("user", user)`, `c.set("workspace", workspace)`
7. Returns 401 at any failure point

**Google OAuth**: Backend owns `GOOGLE_REDIRECT_URI`. After exchanging the code with Google, it sets the cookie and redirects to `FRONTEND_URL`. The frontend never sees the OAuth code.

**Magic Links**: Link points to `APP_URL/auth/email/verify?token=...`. Backend verifies, sets cookie, redirects to `FRONTEND_URL`.

**New user sign-up** (any method): Always runs inside a DB transaction that creates the user **and** a default workspace, then links them together with `OWNER` role.

### 2.7 Workers

Workers run as a **separate process** (`bun run workers:dev`) and share the same codebase.

```typescript
// workers/<job-type>/jobs.ts — called from controllers
export const enqueueJob = async (data: JobData) => {
  await queue.add("jobName", data)
}

// workers/<job-type>/worker.ts — processes jobs
worker.process("jobName", async (job) => {
  const { data } = job
  // ... processing logic
})
```

### 2.8 External Clients Pattern

All external clients follow **interface + factory**:

```typescript
// 1. Define an interface
interface IServiceClient {
  doSomething(params: Params): Promise<Result>
}

// 2. Implement it
class ConcreteClient implements IServiceClient { ... }

// 3. Export a factory
export const createServiceClient = (): IServiceClient => new ConcreteClient()
```

This makes clients mockable and swappable without changing call sites.

---

## 3. Frontend Architecture

### 3.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | ^19.2.4 |
| Build tool | Vite | ^7.3.1 |
| Routing | React Router | ^7.13.0 |
| HTTP client | apisauce (axios wrapper) | ^3.2.2 |
| Server state | TanStack React Query | ^5.90.21 |
| Client state | Zustand | ^5.0.11 |
| Styling | Tailwind CSS | ^4.2.0 |
| UI primitives | Radix UI | various |
| Icons | lucide-react | ^0.575.0 |
| Charts | Recharts | ^3.7.0 |
| Validation | Zod | ^4.3.6 |
| camelCase conversion | humps | ^2.0.1 |
| Class utilities | clsx + tailwind-merge + CVA | — |

### 3.2 Folder Structure

```
frontend/src/
├── App.tsx                      # Root: route tree + providers
├── main.tsx                     # ReactDOM.createRoot + QueryClientProvider
├── index.css                    # Global Tailwind styles
│
├── common/
│   ├── api/
│   │   ├── client.ts            # Apisauce instance, withCredentials:true, response-transform
│   │   ├── constants.ts         # BASE_URL = VITE_API_BASE_URL || "http://localhost:8000"
│   │   ├── use-query.ts         # useQuery<T> wrapper + queryClient (staleTime:Infinity)
│   │   ├── use-mutation.ts      # useMutation<T> wrapper
│   │   ├── use-infinite-query.ts
│   │   ├── post-process.ts      # checkUnauthorized() — throws ApiError on non-2xx
│   │   ├── error.ts             # ApiError class, ErrorResponse type
│   │   ├── types.ts             # GenericAPIResponse<T>
│   │   └── index.ts             # Barrel re-export
│   ├── assets/
│   │   └── icons/               # SVG React components
│   ├── components/              # Shared, feature-agnostic UI components
│   │   ├── layout/              # App shell (sidebar + topbar wrapper)
│   │   ├── sidebar/
│   │   ├── top-bar/
│   │   ├── button/
│   │   ├── input/
│   │   ├── toast/               # Radix-based notifications
│   │   ├── tooltip/             # Radix-based tooltip
│   │   ├── chart/               # Recharts wrappers
│   │   └── skeleton-loader/
│   ├── config/                  # App-level constants
│   ├── hooks/                   # Shared React hooks
│   ├── stores/                  # Zustand stores
│   └── utils/
│       └── tailwind.ts          # cn() = clsx + tailwind-merge
│
└── features/                    # One folder per product feature
    ├── auth/
    │   ├── context/AuthProvider.tsx    # Global auth state
    │   ├── components/
    │   │   ├── ProtectedRoute.tsx      # Redirects to /login if unauthenticated
    │   │   └── AuthCallback.tsx        # Fallback for stale OAuth callback URLs
    │   ├── hooks/useAuthApi.ts         # useCurrentUser, useSignIn, useSignUp,
    │   │                               # useMagicLinkRequest, useLogout, navigateToLogin
    │   ├── pages/LoginPage.tsx         # Login / sign-up UI
    │   ├── storage/tokenStorage.ts     # No-ops (cookie-based auth, no localStorage)
    │   └── types.ts                    # AuthUser, AuthContextValue
    └── <feature>/
        ├── pages/               # Route-level page components
        ├── components/          # Feature-specific presentational components
        ├── hooks/               # API hooks (useQuery / useMutation wrappers)
        ├── types/               # TypeScript interfaces for this feature
        └── mocks/               # Static mock data for development
```

### 3.3 Routing (`App.tsx`)

```tsx
<BrowserRouter>
  <AuthProvider>
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — all wrapped in ProtectedRoute + Layout */}
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              {/* add feature routes here */}
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

`ProtectedRoute` shows a loading spinner while `AuthProvider` resolves `useCurrentUser`. Redirects to `/login` only after the initial fetch completes and `isAuthenticated` is false — no flash of the login page.

### 3.4 API Client (`common/api/client.ts`)

```typescript
export const api = create({
  baseURL: BASE_URL,          // VITE_API_BASE_URL or http://localhost:8000
  withCredentials: true,      // Send httpOnly cookie on every request
  headers: { "Content-Type": "application/json; charset=utf-8" }
})

// Unwrap { success: true, data: T } → T for every successful response
api.addResponseTransform((response) => {
  if (
    response.ok &&
    response.data !== null &&
    typeof response.data === "object" &&
    "success" in response.data &&
    "data" in response.data
  ) {
    response.data = (response.data as { data: unknown }).data
  }
})

// Thin wrappers for common HTTP methods
export const get  = async <T>(url, params?, headers?) => api.get<T>(...)
export const post = async <T>(url, data?, headers?)  => api.post<T>(...)
export const put  = async <T>(url, data?, headers?)  => api.put<T>(...)
export const del  = async <T>(url, params?, headers?) => api.delete<T>(...)
```

### 3.5 React Query Setup (`common/api/use-query.ts`)

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: Infinity,     // Never re-fetch in background automatically
      gcTime: Infinity,
      refetchInterval: false
    }
  }
})

// Thin wrapper that spreads options into TanStack useQuery
export const useQuery = <T>({ queryKey, queryFn, options? }) =>
  libUseQuery<T, ErrorResponse>({ queryKey, queryFn, ...options })
```

### 3.6 Auth State (`features/auth/context/AuthProvider.tsx`)

```typescript
interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean            // true during the initial /auth/me fetch
  login: () => void           // navigates to /auth/google
  logout: () => Promise<void> // POST /auth/logout → clear state → /login
  refresh: () => Promise<void>
}

interface AuthUser {
  userId: string
  email: string
  name: string
}
```

On mount, `AuthProvider` calls `useCurrentUser()` → `GET /auth/me`. A 401 returns `null` (unauthenticated) rather than throwing. `loading` remains `true` until the initial fetch settles, preventing `ProtectedRoute` from redirecting prematurely.

---

## 4. Infrastructure & DevOps

### 4.1 Docker Compose

`backend/docker-compose.yml` spins up both required services for local development:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
```

Both have health checks. Run with `docker-compose up -d`.

### 4.2 NPM Scripts

#### Backend
```bash
bun run dev           # Start API server with hot reload
bun run workers:dev   # Start BullMQ workers with hot reload
bun run check         # Biome format + lint (auto-fix)
bun run check:ci      # Biome check (read-only, for CI)
bun run db:generate   # drizzle-kit generate → new migration SQL
bun run db:migrate    # Apply pending migrations
bun run db:push       # Push schema directly (dev only, no migration file)
bun run db:studio     # Open Drizzle Studio UI
```

#### Frontend
```bash
npm run dev           # Vite dev server on port 5173
npm run build         # tsc -b && vite build
npm run preview       # Preview production build
npm run check         # Biome format + lint (auto-fix)
npm run check:ci      # Biome check (read-only, for CI)
```

### 4.3 Vite Config

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api/, "") }
    }
  }
})
```

### 4.4 Git Hooks

Husky pre-commit runs `lint-staged` → `biome check --write` on staged `.ts` / `.tsx` files only.

---

## 5. Environment Variables Reference

### Backend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_SECRET` | ✅ | — | HMAC-SHA256 secret for JWT signing |
| `PORT` | No | `8000` | HTTP server port |
| `NODE_ENV` | No | — | `production` enables secure cookies and other prod guards |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin — must match frontend URL |
| `APP_URL` | No | `""` | Backend public URL (used in email links) |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend URL — OAuth and magic-link redirect target |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | No | — | Must be `<APP_URL>/auth/google/callback` |
| `OPENAI_API_KEY` | No | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | — | Anthropic Claude API key |
| `GOOGLE_AI_API_KEY` | No | — | Google Gemini API key |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USERNAME` | No | — | SMTP auth user |
| `SMTP_PASSWORD` | No | — | SMTP auth password |

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `http://localhost:8000` | Backend API base URL |

---

## 6. Key Patterns & Conventions

### 6.1 Database Model Pattern

Each entity lives in `backend/db/<entity>/` with exactly two files:

**`index.ts`** — schema definition:
```typescript
import { baseTableColumns } from "@/db/base"

export const things = pgTable("things", {
  ...baseTableColumns(),
  name: text("name").notNull(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id),
})

export type Thing    = typeof things.$inferSelect
export type NewThing = typeof things.$inferInsert
export * from "./repo"
```

**`repo.ts`** — query functions:
```typescript
export const getThings = async (filters: Partial<Thing>) => { ... }
export const createThing = async (data: NewThing) => { ... }
export const updateThing = async (id: number, data: Partial<NewThing>) => { ... }
```

**`db/index.ts`** re-exports everything. **`drizzle.config.ts`** lists every schema file. Both must be updated when adding a new entity.

Deletes are **soft** (`isDeleted = true`, `deletedAt = now()`) — hard deletes are reserved for specific cases.

### 6.2 Router ↔ Controller Pattern

**Router** (`routers/<entity>/router.ts`) — thin layer:
```typescript
router.post("/", requireAuth, zValidator("json", CreateSchema), async (c) => {
  const data = c.req.valid("json")
  const workspace = c.get("workspace")
  const result = await createThing(data, workspace.id)
  return successResponse(c, { thing: result }, 201)
})
```

**Controller** (`controllers/<entity>/controller.ts`) — all business logic:
```typescript
export async function createThing(data: NewThing, workspaceId: number) {
  const existing = await getThings({ name: data.name, workspaceId })
  if (existing.length) throw new HttpError("Already exists", 409)
  return await createThingRepo(data)
}
```

### 6.3 Response Envelope

Every response — success or error — uses the same wrapper:

```typescript
// Success
successResponse(c, data, status = 200)
// → { "success": true, "data": { ... } }

// Error
errResponse(c, data, status = 400)
// → { "success": false, "data": { "message": "..." } }
```

The frontend's `api.addResponseTransform` automatically strips the envelope, so all hook consumers receive `T` directly from `response.data`.

### 6.4 Error Handling

```typescript
// In any controller — throw to abort and send an error response
throw new HttpError("Resource not found", 404)
throw new HttpError("Already exists", 409)
throw new HttpError("Unauthorized", 401)

// Caught by global handler in index.ts:
app.onError((err, c) => {
  if (err instanceof HttpError)
    return errResponse(c, { message: err.message }, err.status)
  return errResponse(c, { message: "Internal server error" }, 500)
})
```

### 6.5 Settings Pattern

Never access `process.env` directly. All env vars are accessed through `settings`:

```typescript
// common/config/settings.ts
function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required config: ${key}`)
  return v
}

export const settings = {
  database: { url: required("DATABASE_URL") },  // throws at startup if missing
  auth:     { jwtSecret: required("JWT_SECRET"), frontendUrl: env("FRONTEND_URL") ?? "http://localhost:5173" },
  server:   { port: Number(env("PORT")) || 8000, isProduction: env("NODE_ENV") === "production" },
  // ...
}
```

### 6.6 Frontend Hook Pattern

API hooks in `features/<name>/hooks/` follow a consistent shape:

```typescript
// Query
export const useThings = () => useQuery({
  queryKey: ["things"],
  queryFn: async () => {
    const response = await get<Thing[]>("/things")
    return checkUnauthorized(response)  // returns data or throws ApiError
  }
})

// Mutation
export const useCreateThing = () => useMutation({
  mutationKey: ["createThing"],
  mutationFn: async (data: NewThing) => {
    const response = await post<Thing>("/things", data)
    return checkUnauthorized(response)
  }
})
```

`checkUnauthorized(response)` returns `response.data` on success and throws `ApiError` on any non-OK response.

### 6.7 Tailwind Utility

```typescript
// src/common/utils/tailwind.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// Usage — handles conditional classes and Tailwind conflict resolution
className={cn("px-4 py-2", isActive && "bg-blue-500", className)}
```

### 6.8 External Client Pattern

```typescript
// 1. Interface
interface IEmailClient {
  send(params: EmailParams): Promise<void>
}

// 2. Concrete implementation
class SmtpEmailClient implements IEmailClient {
  async send(params: EmailParams) { ... }
}

// 3. Factory — call sites never import the concrete class
export const createEmailClient = (): IEmailClient => new SmtpEmailClient()

// 4. Usage in a controller or worker
const emailClient = createEmailClient()
await emailClient.send({ to, subject, body })
```

### 6.9 Path Aliases

`@/` maps to the workspace root source directory in both workspaces:

- **Backend**: `@/` → `backend/` (Bun + `tsconfig.json` `paths`)
- **Frontend**: `@/` → `frontend/src/` (Vite `resolve.alias` + `tsconfig.app.json` `paths`)

### 6.10 Adding a New Feature Checklist

**Backend:**
1. Create `db/<entity>/index.ts` (schema) and `repo.ts` (queries)
2. Add schema file path to `drizzle.config.ts`
3. Add export to `db/index.ts`
4. Create `controllers/<entity>/controller.ts`
5. Create `routers/<entity>/router.ts` + `types.ts` (Zod schemas)
6. Register route in `index.ts` with `app.route("/<entity>", route)`
7. Run `bun run db:generate` then `bun run db:migrate`

**Frontend:**
1. Create `features/<name>/` with `pages/`, `components/`, `hooks/`, `types/`, `mocks/`
2. Add API hooks in `hooks/` following the pattern in §6.6
3. Add route in `App.tsx` inside `ProtectedRoute`
4. Add navigation entry to the sidebar component
