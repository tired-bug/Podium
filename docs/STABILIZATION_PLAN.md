# STABILIZATION PLAN

---

## Fix Priority

| Priority | Bug    | Fix                                              |
|----------|--------|--------------------------------------------------|
| 1        | BUG-001 | Add missing `startSyncService` import in index.ts |
| 2        | BUG-002 | Move `listDeployments`/`listGithubRepos` inside VercelProvider class |
| 3        | BUG-003 | Move `listDeployments`/`listWorkspaces` inside RailwayProvider class |
| 4        | BUG-004 | Move `listDeployments` inside RenderProvider class |
| 5        | BUG-005 | Consolidate providers.ts routes before export    |

---

## Fix 1 — BUG-001: Missing SyncService import

**File:** `backend/src/index.ts`
**Function:** module-level imports / `bootstrap()`
**Root Cause:** `startSyncService` is called at line 179 but never imported.
**Code Change:** Add import at line 27 (after `providersRouter` import):

```typescript
// ADD THIS LINE:
import { startSyncService } from './services/SyncService';
```

**Verification:** `npx tsc --noEmit` in backend directory should no longer report
`Cannot find name 'startSyncService'`.
**Expected Outcome:** Backend compiles. Sync service starts 10s after bootstrap.

---

## Fix 2 — BUG-002: VercelProvider class closure

**File:** `backend/src/providers/vercel/VercelProvider.ts`
**Root Cause:** `listDeployments` and `listGithubRepos` are outside the class body.
**Code Change:** Remove the stray `}` that closes the class after `deleteDeployment`,
move the closing brace to after `listGithubRepos`.

Before (abbreviated):
```typescript
  async deleteDeployment(...) { ... }
}                              // ← WRONG: closes class here

  async listDeployments(...) { ... }   // ← orphaned
  async listGithubRepos(...) { ... }   // ← orphaned
```

After:
```typescript
  async deleteDeployment(...) { ... }

  async listDeployments(...) { ... }

  async listGithubRepos(...) { ... }
}                              // ← class closes here
```

**Verification:** `npx tsc --noEmit`. `new VercelProvider().listDeployments` should be a function.
**Expected Outcome:** Vercel deployment creation and listing compile and execute.

---

## Fix 3 — BUG-003: RailwayProvider class closure

**File:** `backend/src/providers/railway/RailwayProvider.ts`
**Root Cause:** `listDeployments` and `listWorkspaces` are outside the class body.
**Code Change:** Remove stray `}` after `deleteDeployment`, move class-closing brace to end.

**Verification:** `npx tsc --noEmit`.
**Expected Outcome:** Railway deployment listing and workspace listing work.

---

## Fix 4 — BUG-004: RenderProvider class closure

**File:** `backend/src/providers/render/RenderProvider.ts`
**Root Cause:** `listDeployments` is outside the class body.
**Code Change:** Remove stray `}` after `deleteDeployment`, move class-closing brace to end.

**Verification:** `npx tsc --noEmit`.
**Expected Outcome:** Render deployment listing works. Sync service discovers Render services.

---

## Fix 5 — BUG-005: providers.ts route ordering

**File:** `backend/src/routes/providers.ts`
**Root Cause:** Routes registered after `export default router`.
**Code Change:** Move `export default router` to the very end of the file, after all route
registrations. This is a correctness fix — the routes currently work in CommonJS due to
reference semantics, but the code is non-standard and fragile.

**Verification:** All provider-specific routes (/vercel/repos, /inventory, /sync, etc.) respond
correctly after the fix.
**Expected Outcome:** Route file is architecturally correct. No functional regression.

---

## Environment Variables Required for Production

The following env vars MUST be set before deploying:

| Variable              | Required | Purpose                             |
|-----------------------|----------|-------------------------------------|
| `TURSO_DATABASE_URL`  | YES      | Turso database URL (libsql://...)   |
| `TURSO_AUTH_TOKEN`    | YES      | Turso auth token                    |
| `JWT_SECRET`          | YES      | Must be consistent across redeploys |
| `NODE_ENV`            | YES      | Set to `production`                 |
| `PORT`                | NO       | Defaults to 4000                    |
| `ALLOWED_ORIGINS`     | NO       | CORS — defaults to allow all        |

Provider credentials are stored in the database (settings table) after connecting via UI.
They do NOT need to be env vars.
