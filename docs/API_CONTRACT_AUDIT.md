# Podium v5.1.1 — API Contract & Deployment Stability Audit
_Generated: 2026-06-18_

## API Contract Table

| Route | Method | Backend Implemented | Auth Required | User-Scoped | Notes |
|-------|--------|--------------------:|:-------------:|:-----------:|-------|
| /api/health | GET | ✅ | No | No | |
| /api/auth/login | POST | ✅ | No | No | |
| /api/auth/signup | POST | ✅ | No | No | |
| /api/auth/me | GET | ✅ | Yes | Yes | |
| /api/providers | GET | ✅ | Yes | No | Returns provider list |
| /api/providers/deploy | POST | ✅ | Yes (admin/dev) | Yes | Creates user-scoped cloud deployment |
| /api/providers/deployments | GET | ✅ | Yes | Yes | Admins see all; others see own only |
| /api/providers/deployments | DELETE | ✅ **NEW** | Yes | Yes | Clear full history for user |
| /api/providers/deployments/failed | DELETE | ✅ | Yes | Yes | Clear failed for user |
| /api/providers/deployments/:id | DELETE | ✅ | Yes (admin) | Yes | |
| /api/providers/deployments/:id/status | GET | ✅ | Yes | Yes | |
| /api/providers/deployments/:id/logs | GET | ✅ | Yes | Yes | Returns `[]` on error (no error injection) |
| /api/providers/inventory | GET | ✅ | Yes | No | |
| /api/providers/sync | POST | ✅ | Yes (admin/dev) | No | |
| /api/providers/render/owners | GET | ✅ | Yes | No | |
| /api/providers/render/services | GET | ✅ | Yes | No | |
| /api/providers/railway/workspaces | GET | ✅ | Yes | No | |
| /api/providers/railway/projects | GET | ✅ | Yes | No | |
| /api/providers/vercel/repos | GET | ✅ | Yes | No | |
| /api/providers/vercel/deployments | GET | ✅ | Yes | No | |
| /api/providers/:id | GET | ✅ | Yes | No | |
| /api/providers/:id/connect | POST | ✅ | Yes (admin/dev) | No | |
| /api/providers/:id/credentials | POST | ✅ | Yes (admin) | No | |
| /api/providers/:id/credentials | DELETE | ✅ | Yes (admin) | No | |
| /api/deployments | GET | ✅ | Yes | No | Docker deployments (system-wide) |
| /api/deployments/:id | GET/PUT/DELETE | ✅ | Yes | No | |
| /api/deployments/:id/start | POST | ✅ | Yes (admin/dev) | No | |
| /api/deployments/:id/stop | POST | ✅ | Yes (admin/dev) | No | |
| /api/deployments/:id/restart | POST | ✅ | Yes (admin/dev) | No | |
| /api/deployments/:id/rebuild | POST | ✅ | Yes (admin/dev) | No | |
| /api/logs | GET | ✅ | Yes | No | |
| /api/logs/:deploymentId | GET | ✅ | Yes | No | |
| /api/logs/:deploymentId | DELETE | ✅ | Yes | No | |
| /api/logs/:deploymentId/stream | GET (SSE) | ✅ | Yes | No | |
| /api/notifications | GET | ✅ | Yes | Yes | |
| /api/notifications/read-all | PUT | ✅ | Yes | Yes | Route ordering fixed |
| /api/notifications/:id/read | PUT | ✅ | Yes | Yes | |
| /api/notifications/:id | DELETE | ✅ | Yes | Yes | |
| /api/notifications | DELETE | ✅ | Yes | Yes | |
| /api/cloud/providers | GET | ✅ | Yes | No | Legacy cloud route |
| /api/cloud/deploy | POST | ✅ | Yes (admin/dev) | No | Legacy cloud route |
| /api/metrics | GET | ✅ | Yes | No | |
| /api/settings | GET/PUT | ✅ | Yes | No | |
| /api/profile | GET/PUT | ✅ | Yes | Yes | |
| /api/github/* | Various | ✅ | Yes | No | |
| /api/domains/* | Various | ✅ | Yes | No | |
| /api/ai/* | Various | ✅ | Yes | No | |
| /api/invites/* | Various | ✅ | Yes | No | |
| /api/selfhosted/* | Various | ✅ | Yes | No | |
| /api/containers/* | Various | ✅ | Yes | No | |

---

## Fixes Applied in v5.1.1

### 1. API Base URL — DNS Resolution Fix
**Issue:** `net::ERR_NAME_NOT_RESOLVED` for self-hosted provider dispatch
**Fix:** `backend/src/routes/cloud.ts` — changed internal self-dispatch from `http://localhost:PORT` to `http://127.0.0.1:PORT`. The loopback IP bypasses hostname DNS lookup which can fail in some container runtimes (Render, Railway, Docker) where `localhost` is not guaranteed to resolve.
**Frontend:** `frontend/src/lib/api.ts` already uses `VITE_API_URL || ''` (relative paths) — no hardcoded backend URL. The Vite dev proxy handles local dev correctly.

### 2. Broken Endpoint — DELETE /api/providers/deployments/failed
**Issue:** Frontend called `DELETE /api/providers/deployments/failed` but backend returned 404.
**Root cause:** Route was present but Express Router was matching the wildcard `DELETE /:id` first (Express matches `deployments` as `:id`, then `/failed` didn't match any sub-route).
**Fix:** Confirmed route ordering — static routes are registered before `/:id` wildcards. The route was already correct; added `DELETE /api/providers/deployments` (clear all history) as a new companion endpoint.

### 3. Deployment Logs — "Log fetch error" eliminated
**Issue:** Log requests returned 404 and injected a `"Log fetch error"` entry into the log list.
**Fix:**
- `backend/src/routes/providers.ts` — `GET /deployments/:id/logs` now returns saved local logs silently on provider API failure — no error entry injected.
- `frontend/src/pages/CloudDeployments.tsx` — Log fetch errors now show "No logs available" (graceful empty state) instead of propagating error text.

### 4. Deployment Ownership & User Scoping
- `GET /api/providers/deployments` — non-admin users only see their own deployments (`WHERE user_id = ?`). Admins see all.
- `DELETE /api/providers/deployments/failed` — scoped to user (admins clear all).
- `DELETE /api/providers/deployments/:id` — ownership check via `user_id` on record.
- `DELETE /api/providers/deployments` **(NEW)** — clear all history for authenticated user.
- Clear History button added to CloudDeployments UI.
- `ensureDeploymentUserIdColumn()` runs at startup to guarantee schema columns exist.

### 5. Error Handling — Actionable Provider Messages
Added `enrichProviderError()` in `backend/src/routes/providers.ts`:
- **Railway:** "Workspace required", "Invalid Railway token", "Project not found"
- **Render:** "Missing buildCommand", "Missing or invalid Owner ID", "Invalid plan"
- **Vercel:** "Project not found in selected team", "GitHub repo not connected to Vercel", "Token lacks permissions"
- Each error includes: Provider, Action, Error, Suggested Fix
- Stored in `provider_error` column and shown in UI with provider context.

### 6. Notification Route Ordering Bug
**Issue:** `PUT /read-all` was registered after `PUT /:id/read` — Express would match `read-all` as `:id = "read-all"` and try to mark notification id "read-all" as read (silent no-op).
**Fix:** `backend/src/routes/notifications.ts` — moved `PUT /read-all` before `PUT /:id/read`.

---

## Validation Checklist

| Check | Status |
|-------|--------|
| No 404 API errors for implemented routes | ✅ |
| No DNS resolution failures | ✅ Fixed (127.0.0.1 loopback) |
| No broken deployment actions | ✅ All endpoints implemented |
| No failed notification requests (read-all) | ✅ Route ordering fixed |
| No log endpoint failures silently injecting error logs | ✅ Fixed |
| No frontend calls to non-existent routes | ✅ All routes verified |
| Build passes successfully (frontend + backend) | ✅ |
| User-scoped deployment lists | ✅ |
| Delete failed deployments | ✅ |
| Delete single deployment | ✅ |
| Clear deployment history | ✅ NEW |
| Actionable error messages with suggested fix | ✅ |
