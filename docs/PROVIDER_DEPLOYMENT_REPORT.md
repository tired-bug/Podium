# PROVIDER DEPLOYMENT REPORT

---

## Deployment Creation Flow (all providers)

```
Frontend (CloudDeployments.tsx or Providers.tsx)
  → POST /api/providers/deploy  { provider, name, repoUrl, branch, envVars, ... }

backend/src/routes/providers.ts — router.post('/deploy')
  → validates provider + name
  → checks meta.isDemo (rejects AWS/Azure/GCP)
  → getCredentials(provider)     reads from settings table (local SQLite ← Turso)
  → checks required credentials are present
  → INSERT INTO cloud_deployments (status='queued')
  → fires async IIFE:
      providerManager.deploy(provider, creds, opts, localId)
        → ProviderManager.deploy()
            → this.get(provider).deploy(creds, opts, localId)
              → VercelProvider.deploy() / RailwayProvider.deploy() / RenderProvider.deploy()
                → provider API call (HTTPS)
                → returns { deploymentId, url, status }
      UPDATE cloud_deployments SET status, url, provider_deployment_id WHERE id=localId
  → responds immediately: { id: localId, status: 'queued' }
```

---

## Vercel Deployment Creation

**Current state:** BROKEN — compile error (BUG-002).

**After fix, execution path:**

1. `resolveGithubRepoId(token, teamId, repoUrl)`:
   - Parses `owner/repo` from URL
   - Calls `GET /v9/projects?repoUrl=...` to find existing linked project
   - Falls back to `GET /v1/integrations/git-namespaces` + search-repos
   - Returns numeric `repoId` (required by Vercel `/v13/deployments`)

2. `getOrCreateProject(token, teamId, name, repoId, repoName, branch)`:
   - `GET /v9/projects/{name}` — finds existing
   - If 404: `POST /v10/projects` with `gitRepository: { type: 'github', repo: repoName }`

3. `POST /v13/deployments` with:
   ```json
   {
     "name": "<name>",
     "target": "production",
     "gitSource": { "type": "github", "repoId": <numeric>, "ref": "<branch>" },
     "env": [...]
   }
   ```

4. Response: `{ id (deployment id), url, readyState }`

**Potential runtime issue (not a bug):** If GitHub is not connected to the Vercel account,
`resolveGithubRepoId` will throw a descriptive error. The user must connect GitHub to Vercel
at vercel.com/account/git before deploying from a repo.

**listDeployments path:** `GET /v6/deployments?limit=50[&teamId=...]`
Maps `state` field (READY/BUILDING/ERROR/CANCELED/QUEUED) to internal status.

---

## Railway Deployment Creation

**Current state:** BROKEN — compile error (BUG-003).

**After fix, execution path:**

1. If no `railway_project_id` in credentials:
   - `mutation projectCreate(name)` → creates new project, returns `projectId`

2. `mutation serviceCreate(projectId, name)` → returns `serviceId`

3. If `envVars`:
   - `mutation variableCollectionUpsert(serviceId, variables)` — sets env vars

4. If `repoUrl`:
   - Strips `https://github.com/` prefix → `owner/repo` format
   - `mutation serviceConnect(id, { repo, branch })` — connects GitHub repo
   - Note: non-fatal if this fails (logs warning, continues)

5. Returns `{ deploymentId: serviceId, url: https://<name>.up.railway.app, status: 'building' }`

**listDeployments path:** Full GraphQL query fetching all projects → services → latest deployment.
Maps `SUCCESS/DEPLOYING/BUILDING/FAILED/CRASHED/REMOVED/WAITING` to internal status.

**Note:** Railway's `staticUrl` field on a deployment node is used for the URL — this may be
null for non-web services.

---

## Render Deployment Creation

**Current state:** BROKEN — compile error (BUG-004).

**After fix, execution path:**

1. Resolve `ownerId`:
   - If `render_owner_id` in credentials: use it
   - Else: `GET /owners?limit=20` → auto-select first owner

2. Build payload:
   ```json
   {
     "type": "web_service",
     "name": "<name>",
     "ownerId": "<ownerId>",
     "region": "<region|oregon>",
     "plan": "free",
     "envVars": [...],
     "repo": "<repoUrl>",   // if repoUrl provided
     "branch": "<branch>",
     "autoDeploy": "yes"
   }
   ```
   OR with `image.imagePath` for Docker image deployments.

3. `POST /services` → returns `{ service: { id, serviceDetails: { url } } }`

4. Returns `{ deploymentId: serviceId, url, status: 'building' }`

**listDeployments path:** `GET /services?limit=100`
Status mapping uses `svc.suspended` and `svc.serviceDetails?.url` presence.

**Potential issue:** The status mapping in `listDeployments` for Render is simplistic:
```typescript
statusMap[svc.suspended === 'suspended' ? 'suspended' : (svc.serviceDetails?.url ? 'live' : 'building')]
```
This maps any service with a URL to 'live' and any without to 'building', ignoring actual
deploy state. The `getStatus` method is more accurate (uses `svc.deploy?.status`).
This is a logic weakness, not a blocking bug.

---

## Provider Inventory Sync

**SyncService** (`backend/src/services/SyncService.ts`):

- Runs on startup (10s delay) and every 60s
- For each of `['render', 'railway', 'vercel']`:
  - Reads credentials from `settings` table
  - Checks all required credential keys are present — skips if not connected
  - Calls `provider.listDeployments(creds)` (the method that is currently broken)
  - Upserts results into `cloud_deployments` table (INSERT OR IGNORE for new, UPDATE for existing)

**Current state:** BROKEN because `listDeployments` is outside the class body on all three providers.
After BUG-002/003/004 fixes, sync will work correctly.

**Import discovery:** Yes — the sync service will discover and import existing deployments from
connected providers on first sync run (10s after startup). Any deployment in the provider account
that is not in `cloud_deployments` will be inserted with `source_type='sync'`.

---

## Authentication Persistence

**Token storage:** `localStorage` key `podium_token`

**On page load:**
```
AuthContext.useEffect → refreshUser()
  → localStorage.getItem('podium_token')
  → if no token: setLoading(false), stay unauthenticated
  → if token: GET /api/auth/me with Authorization: Bearer <token>
    → backend/src/auth.ts requireAuth()
      → jwt.verify(token, JWT_SECRET)   // validates signature + expiry (7d)
      → SELECT id, role FROM users WHERE id = ?   // verifies user still exists
      → sets req.user
    → routes/auth.ts GET /me
      → SELECT user FROM users WHERE id = req.user.sub
      → returns user object
  → setUser(data)
```

**Why sessions are lost after refresh:** Sessions are NOT lost if the token is valid and
`JWT_SECRET` is consistent across redeployments. Sessions WILL be lost if:
1. `JWT_SECRET` env var changes between deployments → old tokens invalid
2. Token expires (7d TTL) → user must log in again
3. Backend is in development mode without Turso → user table empty after restart

There is no token refresh mechanism. After 7 days the user must log in again.
The 401 interceptor in `api.ts` removes the token and redirects to `/login` on any 401.

---

## Provider-Specific API Verification

| Provider | Auth Method | Verified Against |
|----------|-------------|-----------------|
| Vercel   | `Bearer <token>` header | `api.vercel.com` |
| Railway  | `Bearer <token>` header | `backboard.railway.app/graphql/v2` |
| Render   | `Bearer <apiKey>` header | `api.render.com/v1` |

All credential keys are stored in the `settings` table (key-value) and retrieved via
`getCredentials()` in both `providers.ts` routes and `SyncService.ts`. Credentials survive
redeployments via Turso sync.
