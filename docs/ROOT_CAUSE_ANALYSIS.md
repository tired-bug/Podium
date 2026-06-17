# ROOT CAUSE ANALYSIS
Podium Critical Stabilization Patch

---

## BUG-001 — `startSyncService` called but never imported (CRITICAL — BUILD BREAK)

**File:** `backend/src/index.ts`
**Line:** 179

**Root Cause:**
`startSyncService` is called in `bootstrap()` but is never imported at the top of `index.ts`.
There is no `import { startSyncService } from './services/SyncService'` statement.
TypeScript will emit a compile error: `Cannot find name 'startSyncService'`.
The compiled JavaScript will throw `ReferenceError: startSyncService is not defined` at runtime.

**Impact:** Backend cannot start. All features are broken.

---

## BUG-002 — `listDeployments` defined OUTSIDE class body in VercelProvider (CRITICAL — BUILD BREAK)

**File:** `backend/src/providers/vercel/VercelProvider.ts`

**Root Cause:**
The closing brace `}` of the `VercelProvider` class appears at line ~154 (after `deleteDeployment`).
`listDeployments` and `listGithubRepos` are then defined as bare `async` functions at the module
level — outside the class body. TypeScript parses them as free-floating async functions, not class
methods. These functions reference `this.client(...)` which does not exist in the module scope,
causing a compile error and a runtime `TypeError`.

**Impact:** VercelProvider fails to compile. Vercel deployments cannot be created or listed.
Provider sync for Vercel fails entirely.

---

## BUG-003 — `listDeployments` defined OUTSIDE class body in RailwayProvider (CRITICAL — BUILD BREAK)

**File:** `backend/src/providers/railway/RailwayProvider.ts`

**Root Cause:**
Same structural defect as BUG-002. The `RailwayProvider` class closes after `deleteDeployment`.
`listDeployments` and `listWorkspaces` are orphaned at module scope. Both reference `this.gql()`
which does not exist outside the class.

**Impact:** RailwayProvider fails to compile. Railway deployments cannot be listed or synced.

---

## BUG-004 — `listDeployments` defined OUTSIDE class body in RenderProvider (CRITICAL — BUILD BREAK)

**File:** `backend/src/providers/render/RenderProvider.ts`

**Root Cause:**
Same structural defect. `RenderProvider` class closes after `deleteDeployment`. `listDeployments`
is an orphaned module-level function that references `this.client(...)`.

**Impact:** RenderProvider fails to compile. Render deployments cannot be listed or synced.

---

## BUG-005 — Routes registered after `export default router` are unreachable (MEDIUM)

**File:** `backend/src/routes/providers.ts`

**Root Cause:**
`export default router` appears mid-file. All route registrations that follow (vercel/repos,
vercel/deployments, railway/workspaces, railway/projects, render/services, inventory, sync)
are added to the router AFTER Express has already captured the exported reference. In CommonJS
module evaluation this is safe because the object is mutated in-place and the export is a
reference. However the pattern is fragile, non-standard, and may behave incorrectly under
certain bundlers. The routes ARE reachable at runtime in Node CommonJS, but the code is
architecturally broken and will confuse future maintainers.

**Impact:** Minor at runtime in current configuration. HIGH risk of regression.

---

## BUG-006 — `app_initialized` flag not included in `syncFromTurso` table list (MEDIUM)

**File:** `backend/src/db/index.ts` — `syncFromTurso()`

**Root Cause:**
`syncFromTurso` pulls the following tables from Turso on startup:
`users, invites, deployments, cloud_deployments, metrics, build_logs, ai_conversations,
anomalies, settings, selfhosted_deployments, github_repos, user_profiles, notifications, domain_bindings`

`settings` IS in the list, so `app_initialized` will be synced correctly as part of the
settings table. This is NOT a bug in itself, but a risk: if Turso sync fails for `settings`,
the local SQLite will not have `app_initialized = true`, causing the setup wizard to reappear.

The `initDb` function correctly exits in production if Turso is unreachable, so this is
a defensive concern rather than a proven defect.

---

## BUG-007 — JWT secret defaults to weak hardcoded string in production (LOW)

**File:** `backend/src/auth.ts` line 6

**Root Cause:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'podium-dev-secret-change-in-production';
```

If `JWT_SECRET` env var is not set in production the hardcoded value is used. Any token signed
with this secret on one instance is valid on any other instance that also omits the env var —
but the secret is publicly known from source code.

**Impact:** Session tokens are forgeable if `JWT_SECRET` is not set. Medium severity.

---

## Summary Table

| ID      | Severity | File                               | Description                                  | Blocks Build? |
|---------|----------|------------------------------------|----------------------------------------------|---------------|
| BUG-001 | CRITICAL | backend/src/index.ts               | `startSyncService` not imported              | YES           |
| BUG-002 | CRITICAL | backend/src/providers/vercel/…     | `listDeployments` outside class body         | YES           |
| BUG-003 | CRITICAL | backend/src/providers/railway/…    | `listDeployments` outside class body         | YES           |
| BUG-004 | CRITICAL | backend/src/providers/render/…     | `listDeployments` outside class body         | YES           |
| BUG-005 | MEDIUM   | backend/src/routes/providers.ts    | Routes registered after export               | NO            |
| BUG-006 | MEDIUM   | backend/src/db/index.ts            | Turso sync failure loses `app_initialized`   | NO            |
| BUG-007 | LOW      | backend/src/auth.ts                | Weak JWT secret fallback                     | NO            |
