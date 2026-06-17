# Podium — Production-Ready Build Instructions

## Prerequisites
- Node.js 20+
- npm 9+

## Backend Build

```bash
cd backend
npm install
npx tsc -p tsconfig.json
```

## Frontend Build

```bash
cd frontend
npm install
npm run build
```

## Environment Variables (Required for Production)

Set these in your Render environment:

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
NODE_ENV=production
PORT=4000
JWT_SECRET=your-secret-here
ALLOWED_ORIGINS=https://your-app.onrender.com
```

**IMPORTANT:** `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are **required** in production.
The app will refuse to start without them to prevent silent data loss.

## What Was Fixed

### 1. Database Persistence (Critical)
- App now fails fast in production if Turso credentials are missing
- Silent SQLite fallback removed from production
- `applySchemaToTurso()` runs before sync so tables exist on first deploy
- Startup diagnostics log DB provider, user count, deployment count

### 2. Setup Loop (Critical)
- `app_initialized` flag stored in Turso settings table
- Setup page only appears if flag is absent AND no admin exists
- Flag is set immediately on first admin creation

### 3. Vercel Provider
- Resolves GitHub repo URL → numeric `repoId` via Vercel APIs
- Auto-creates/links Vercel project before deployment
- Fixes "gitSource missing required property repoId" error

### 4. Render Provider  
- `render_owner_id` is now optional
- Auto-fetches available owners/workspaces from API
- Frontend shows owner dropdown (auto-populated after API key entry)
- Fixes "invalid ownerID" error

### 5. Railway Provider
- Repo path normalized (strips https://github.com/ prefix)
- Repository connect failure is non-fatal (service still created)
