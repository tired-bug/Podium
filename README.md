# ⚡ Podium — AIOps Platform v4.0

> Manage multi-cloud deployments, real-time metrics, CI/CD pipelines,
> and an AI assistant — all in one platform. Run it as a desktop app or deploy it free to the web.

---

## Quick Links

| | |
|---|---|
| 📖 **Deploy to web (free)** | See [DEPLOY.md](./DEPLOY.md) |
| 🖥️ **Run as desktop app** | See below |
| 🤖 **AI features** | Set `GROQ_API_KEY` on the server — get a free key at https://console.groq.com |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **22 or 24** (required — uses built-in SQLite) |
| npm | 9+ |
| Git | any |

---

## Local Development

```bash
# 1 — Copy env
cp .env.example backend/.env
# Edit backend/.env — set JWT_SECRET and GROQ_API_KEY at minimum

# 2 — Install
cd backend && npm install --legacy-peer-deps && cd ..
cd frontend && npm install --legacy-peer-deps && cd ..
npm install

# 3 — Run
npm run dev
```

Opens:
- Backend → http://localhost:4000
- Frontend → http://localhost:5173

---

## Desktop App (Windows)

```powershell
# One-click setup
.\setup.bat

# Or manual
npm run electron:dev

# Build installer
npm run dist:win
```

Output: `dist-electron/Podium-Setup-4.0.0.exe`

---

## Pages

| Route | Page |
|-------|------|
| `/login` | Sign in / Create account |
| `/dashboard` | Overview: stats, health chart, recent deployments |
| `/deployments` | Create and manage deployments (simulated/demo lifecycle) |
| `/deployments/:id` | Detail: logs, metrics, config, rebuild |
| `/cloud` | Deploy to AWS, Azure, Vercel |
| `/github` | Connect GitHub repos, trigger builds |
| `/logs` | Centralized log viewer with live streaming |
| `/metrics` | Real-time CPU / Memory / Network charts |
| `/ai` | Groq AI chat assistant with streaming |
| `/ai/anomalies` | Detected infrastructure anomalies |
| `/team` | User management and invite codes |
| `/settings` | AI (server-configured), security, about |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** | Long random string (32+ chars) |
| `GROQ_API_KEY` | For AI | Server-only secret powering all AI features — free at console.groq.com |
| `PORT` | No (4000) | Backend HTTP port |
| `PODIUM_DATA_DIR` | Production | Path to SQLite data directory |
| `ALLOWED_ORIGINS` | Production | Comma-separated allowed frontend URLs |
| `AWS_ACCESS_KEY_ID` | For AWS | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | For AWS | AWS credentials |
| `AZURE_SUBSCRIPTION_ID` | For Azure | Azure credentials |
| `VERCEL_API_TOKEN` | For Vercel | Vercel token |
| `GITHUB_TOKEN` | For private repos | GitHub PAT |

---

## npm Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start backend + frontend dev servers |
| `npm run build` | Compile backend TS + build frontend |
| `npm run electron:dev` | Build then open in Electron window |
| `npm run dist:win` | Build Windows .exe installer + portable |
| `npm run dist:mac` | Build macOS .dmg |
| `npm run dist:linux` | Build Linux AppImage + .deb |

---

## Testing & CI

- `cd backend && npm test` — Jest + Supertest. Unit tests for the auth/token/hashing
  logic, plus integration tests that hit the real `/api/auth` routes against a
  throwaway temp SQLite database (no mocking of the DB layer).
- `cd frontend && npm test` — Vitest + Testing Library. Covers `src/lib/utils.ts`,
  including a regression test for the SQLite-timestamp/UTC parsing bug.
- `.github/workflows/ci.yml` runs both suites (plus type-checks, builds, and a
  non-blocking `npm audit`) on every push and pull request to `main`. Render and
  Cloudflare Pages already auto-deploy on push (see `DEPLOY.md`), so this CI
  workflow is the missing piece: it catches broken builds/tests *before* they
  reach `main` and get auto-deployed.

## Security hardening notes

A few gaps were fixed as part of adding this test/CI setup — worth knowing about
if you're writing this up:

- **`JWT_SECRET` fallback removed in production.** The code previously fell back
  to a hardcoded default secret (`podium-dev-secret-change-in-production`) if the
  env var wasn't set. Since the source is on GitHub, anyone could read that
  string and forge a valid admin JWT. The backend now refuses to start in
  `NODE_ENV=production` if `JWT_SECRET` is missing (mirrors the existing
  fail-fast pattern already used for the Turso DB credentials).
- **Rate limiting added to `/api/auth/login` and `/api/auth/signup`.** These had
  no limit on attempts, so an attacker could script unlimited password guesses.
  Added `express-rate-limit` (20 requests / 15 min per IP).
- **`npm audit` runs in CI** (non-blocking for now) so dependency vulnerabilities
  show up on every PR instead of only when someone remembers to check.

Worth doing next, if you want to keep hardening for the writeup: input
validation with `zod` on request bodies, CSRF protection if you ever move auth
to cookies, and turning the `npm audit` CI step from non-blocking to blocking
once the current vulnerabilities are triaged.

---

## Project Structure

```
podium/
├── DEPLOY.md              ← Free web deployment guide
├── render.yaml            ← Render one-click config
├── .env.example           ← Copy to backend/.env
├── setup.bat / setup.ps1  ← Windows one-click setup
├── build/                 ← App icons (win/mac/linux)
├── backend/
│   └── src/
│       ├── index.ts       ← Express server
│       ├── auth.ts        ← JWT + bcrypt
│       ├── db/index.ts    ← SQLite schema
│       └── routes/        ← 13 API route files
└── frontend/
    └── src/
        ├── App.tsx        ← Router
        ├── pages/         ← 13 pages
        ├── components/    ← Layout + UI
        └── contexts/      ← Auth, Theme, Toast
```

---

*Podium v4.0.0 — MIT License*
