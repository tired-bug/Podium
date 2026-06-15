# ⚡ Podium — AIOps Desktop Platform v4.0

> Manage Docker containers, multi-cloud deployments, real-time metrics, CI/CD pipelines,
> and an AI assistant — all in a single native desktop app.

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 18 or 20 | https://nodejs.org |
| npm | 9+ | included with Node |
| Git | any | https://git-scm.com |
| Docker Desktop | any | optional — Containers page shows a graceful error if absent |

---

## Quick Start — Windows

### Option A: One-click setup (recommended)

Double-click **`setup.bat`** — it installs everything and prints next steps.

Or in PowerShell:
```powershell
.\setup.ps1
```

### Option B: Manual steps (PowerShell)

```powershell
# 1 — Install backend
cd backend
npm install --legacy-peer-deps
cd ..

# 2 — Install + build frontend
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..

# 3 — Install Electron (root)
npm install

# 4 — Create your .env
Copy-Item .env.example backend\.env
notepad backend\.env
```

Edit `backend\.env` and set at minimum:
```env
JWT_SECRET=any-long-random-string-at-least-32-chars
GROQ_API_KEY=gsk_your_key_here
```

Get a **free Groq API key** → https://console.groq.com

---

## Running the App

### Browser dev mode (hot reload)
```powershell
npm run dev
```
Opens backend on `http://localhost:4000` and frontend on `http://localhost:5173`.
Visit **http://localhost:5173** in your browser.

### Electron desktop window
```powershell
npm run electron:dev
```
Opens the app in its own frameless window with splash screen and system tray.

---

## Building the Windows Installer

```powershell
npm run dist:win
```

Output in `dist-electron\`:
- `Podium-Setup-4.0.0.exe` — NSIS installer (Program Files, desktop shortcut, start menu)
- `Podium-4.0.0.exe` — Portable, no installation needed

> **Note:** Windows Defender may show a SmartScreen warning for unsigned executables.
> Click "More info → Run anyway". To avoid this, sign the exe with a code-signing certificate.

---

## First Launch

1. On the login screen you will see **"Create Account"** (auto-detected, no invite code needed for the first user)
2. Enter username, email, and password — this becomes your **admin account**
3. You're redirected to the Dashboard

---

## AI Assistant

1. Go to **Settings → AI**
2. Paste your Groq API key (`gsk_...`)
3. Choose a model (LLaMA 3 70B is recommended and free)
4. Click **Save Changes**
5. Open **AI Assistant** and start chatting

---

## Inviting Teammates

1. Go to **Team → Invite Member**
2. Choose role (Developer or Viewer) and expiry
3. Copy the generated invite code
4. Teammate signs up at the login screen using the code

---

## Project Structure

```
podium\
├── setup.bat              ← Windows one-click setup
├── setup.ps1              ← PowerShell setup
├── .env.example           ← Copy to backend\.env
├── electron\
│   ├── main.js            ← Desktop window, backend process, tray
│   ├── preload.js         ← Window controls bridge
│   └── splash.html        ← Boot screen
├── build\
│   ├── icon.ico           ← Windows icon
│   ├── icon.icns          ← macOS icon
│   └── icon.png           ← Linux icon
├── backend\
│   └── src\
│       ├── index.ts       ← Express server entry
│       ├── auth.ts        ← JWT + bcrypt
│       ├── db\index.ts    ← SQLite schema + init
│       └── routes\        ← 10 API route files
└── frontend\
    └── src\
        ├── App.tsx        ← Router
        ├── pages\         ← 13 pages
        ├── components\    ← Layout + UI components
        └── contexts\      ← Auth, Theme, Toast
```

---

## All npm Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start backend + frontend dev servers |
| `npm run build` | Compile backend TS + build frontend |
| `npm run electron:dev` | Build then open in Electron window |
| `npm run dist:win` | Build Windows .exe installer + portable |
| `npm run dist:mac` | Build macOS .dmg |
| `npm run dist:linux` | Build Linux AppImage + .deb |

---

## Pages

| Route | Page |
|-------|------|
| `/login` | Sign in / Create account |
| `/dashboard` | Overview: stats, health chart, recent deployments |
| `/deployments` | Create and manage Docker deployments |
| `/deployments/:id` | Detail: logs, metrics, config, rebuild |
| `/containers` | All Docker containers on this host |
| `/cloud` | Deploy to AWS, Azure, Vercel |
| `/github` | Connect GitHub repos, trigger builds |
| `/logs` | Centralized log viewer with live streaming |
| `/metrics` | Real-time CPU / Memory / Network charts |
| `/ai` | Groq AI chat assistant with streaming |
| `/ai/anomalies` | Detected infrastructure anomalies |
| `/team` | User management and invite codes |
| `/settings` | AI, cloud credentials, security, about |

---

## Environment Variables (`backend\.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** | Long random string (32+ chars) |
| `GROQ_API_KEY` | For AI | Get free at console.groq.com |
| `PORT` | No (4000) | Backend HTTP port |
| `AWS_ACCESS_KEY_ID` | For AWS | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | For AWS | AWS credentials |
| `AZURE_SUBSCRIPTION_ID` | For Azure | Azure credentials |
| `VERCEL_API_TOKEN` | For Vercel | Vercel token |
| `GITHUB_TOKEN` | For private repos | GitHub PAT |

---

## Troubleshooting

**`npm install` fails on better-sqlite3**
```powershell
# Install Windows build tools first (run as Administrator)
npm install --global windows-build-tools
# Then retry
cd backend
npm install --legacy-peer-deps
```

**Port 4000 already in use**
```powershell
# Find and kill the process using port 4000
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

**Docker containers not showing**
Start Docker Desktop. Make sure it's running (whale icon in system tray).

**Electron window is blank / can't connect**
Make sure the backend started — check the terminal running `npm run dev`. The backend
must be ready before Electron loads the window. The splash screen polls `/api/health`
every 500ms and only shows the window when the backend responds 200.

**SmartScreen blocks the installer**
The `.exe` is unsigned. Click "More info" → "Run anyway". For production,
sign with a code-signing certificate from DigiCert or Sectigo.

---

## Data Location (Windows)

SQLite database and user data are stored at:
```
C:\Users\<YourName>\AppData\Roaming\Podium\podium-data\podium.db
```
This survives app updates. To reset everything, delete that folder.

---

*Podium v4.0.0 — MIT License*
