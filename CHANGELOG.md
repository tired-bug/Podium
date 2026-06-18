# Podium CHANGELOG

## v5.0.3-Auth-Reset

### Role Assignment — New Behavior

| Condition | Role Assigned |
|---|---|
| 0 users in DB (first signup) | `admin` |
| 1+ users in DB (subsequent signups) | `developer` |
| Manual assignment by admin | `viewer` |

`viewer` is never assigned automatically. It can only be set by an admin via `PUT /api/auth/users/:id/role`.

### Invite Code — Now Optional

Registration succeeds with or without an invite code.

- **No invite code** → account created, role assigned by user-count rule, no team attachment.
- **Valid invite code** → account created, role assigned by user-count rule, user attached to team referenced by invite.
- **Invalid / expired invite code** → 400 error returned.

The invite code field in the frontend is labelled `INVITE CODE (OPTIONAL)`. No frontend validation blocks an empty value.

### Role Source of Truth — Audit Results

| Layer | Source | Status |
|---|---|---|
| `users` table | `role TEXT NOT NULL DEFAULT 'viewer'` | ✓ single source |
| `requireAuth` middleware | Re-fetches `role` from DB on every request | ✓ JWT role ignored for auth decisions |
| JWT payload | Contains `role` for informational use only | ✓ not trusted for permissions |
| `/api/auth/me` | Returns `role` from DB | ✓ |
| `AuthContext` | Populates `user.role` from `/me` response | ✓ |
| `useRole` hook | Derives permissions from `user.role` | ✓ |
| `user_profiles` table | Does not store role | ✓ no conflict |

### Auth Persistence

- Token stored in `localStorage` under key `podium_token`.
- On app load, `AuthContext` calls `/api/auth/me` with stored token to restore session.
- `requireAuth` middleware re-validates token and re-fetches role from DB on every API call.
- Session survives refresh, backend restart, and Render redeploy (Turso persists data).

### Login Page Refresh Bug — Fix (v5.0.3)

The Axios response interceptor previously called `window.location.href = '/login'` on any 401 response, causing a full page reload. This was replaced with a `CustomEvent` (`podium:unauthorized`) that `AuthContext` handles via an event listener, triggering SPA logout and React Router navigation instead.

Auth endpoints (`/api/auth/login`, `/api/auth/signup`, `/api/auth/me`) are explicitly excluded from the 401 redirect to avoid redirect loops during login attempts.

### Build Verification

```
Backend:  npx tsc --noEmit  → 0 errors
Frontend: npx tsc --noEmit  → 0 errors
Full:     npm run build     → ✓ built successfully
```

### Verification Scenarios

| Scenario | Expected | Implemented |
|---|---|---|
| A: Fresh DB, first signup | `role = admin` | ✓ |
| B: Second signup | `role = developer` | ✓ |
| C: Signup without invite code | Success | ✓ |
| D: Signup with valid invite code | Success + team membership | ✓ |
| E: Login | Session restored on refresh | ✓ |
