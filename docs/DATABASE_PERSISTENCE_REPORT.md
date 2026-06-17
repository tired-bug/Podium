# DATABASE PERSISTENCE REPORT

---

## Which database is active at runtime

**Decision logic** (`backend/src/db/index.ts` → `initDb()`):

```
if (process.env.NODE_ENV === 'production' && (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN))
  → process.exit(1)           // hard fail, no SQLite fallback in production

if (TURSO_DATABASE_URL && TURSO_AUTH_TOKEN)
  → connect to Turso
  → if connection succeeds: _useTurso = true
  → if connection fails in production: process.exit(1)
  → if connection fails in development: fall back to local SQLite

else (no Turso env vars, development only)
  → local SQLite at $PODIUM_DATA_DIR/podium.db or ./data/podium.db
```

**At runtime:** Always Turso in production (enforced). Local SQLite in development without env vars.

---

## Write path (Frontend → Database)

```
Frontend (e.g. setup wizard POST /api/auth/signup)
  → axios POST /api/auth/signup
  → backend/src/routes/auth.ts — router.post('/signup')
  → getDb().prepare('INSERT INTO users ...').run(...)
    → createShim(_local).prepare(sql)
      → localStmt.run(...)              // SYNCHRONOUS write to local SQLite
      → if isWrite && _turso && _useTurso:
          _writeQueue.push({ sql, params })   // queued for async Turso write
    → setInterval(flushQueue, 500ms)    // batch flush to Turso every 500ms
      → _turso.batch([...], 'write')    // async write to Turso
```

**Critical observation:** The `app_initialized` flag is written via `db.prepare(...).run()`
which goes through the shim. The local SQLite write is synchronous and immediate.
The Turso write is async via the queue — it will be flushed within 500ms.
On redeployment, `syncFromTurso()` runs at startup and restores `settings` (including
`app_initialized`) from Turso before `applyDefaults()` is called.
`applyDefaults()` uses `INSERT OR IGNORE` so it will NOT overwrite `app_initialized`
if it was already synced from Turso.

---

## Read path (Database → Frontend)

```
Frontend (e.g. GET /api/auth/setup)
  → axios GET /api/auth/setup
  → backend/src/routes/auth.ts — router.get('/setup')
  → getDb().prepare("SELECT value FROM settings WHERE key='app_initialized'").get()
    → createShim(_local).prepare(sql).get()
      → localStmt.get()     // reads from LOCAL SQLite (always synchronous)
```

**Important:** ALL reads come from LOCAL SQLite, never directly from Turso.
Turso is write-replication only. On startup, `syncFromTurso()` populates local SQLite
from Turso so that subsequent reads are accurate.

---

## Does setup state survive redeployments?

**YES — if Turso is configured correctly.**

Sequence on redeploy:
1. `initDb()` called
2. `applySchemaToTurso()` — creates tables in Turso if missing
3. `syncFromTurso()` — pulls all rows from Turso `settings` table into local SQLite
   → `app_initialized = 'true'` is restored
4. `applySchema()` — creates local SQLite tables (IF NOT EXISTS, no-op)
5. `applyMigrations()` — adds columns (IF NOT EXISTS, no-op)
6. `applyDefaults()` — `INSERT OR IGNORE`, will not overwrite `app_initialized`
7. Startup diagnostics print `Initialized: Yes`
8. `/api/auth/setup` returns `{ needsSetup: false }`

**If Turso is NOT configured:** Production refuses to start (exits). Development uses ephemeral
local SQLite — setup state is lost on restart. This is by design.

---

## Does user data survive redeployments?

**YES** — `users` table is in `syncFromTurso()` table list.
All user rows are restored from Turso on each startup.

---

## Does deployment data survive redeployments?

**YES** — `cloud_deployments` and `deployments` are in `syncFromTurso()` table list.

---

## SQLite vs Turso override risk

There is NO scenario where SQLite overrides Turso data because:
- All reads come from local SQLite which is POPULATED from Turso at startup
- `applyDefaults()` uses `INSERT OR IGNORE` — it never overwrites synced data
- `applyMigrations()` only adds columns, never modifies data

The only risk is a partial sync failure mid-startup (e.g. Turso times out on one table).
The code logs errors per-table and continues — partial data is possible but not data loss.

---

## Verdict

Database persistence architecture is correct in design. The four CRITICAL build bugs
(BUG-001 through BUG-004 in ROOT_CAUSE_ANALYSIS.md) must be fixed before any of this
executes successfully.
