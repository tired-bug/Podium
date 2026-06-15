# Podium — Free Deployment Guide
## Stack: Render (backend) + Cloudflare Pages (frontend) + Turso (database)

All three are 100% free. No credit card required for any of them.

---

## Prerequisites
- GitHub account
- Render account → https://render.com
- Cloudflare Pages account → https://pages.cloudflare.com
- Turso account → https://turso.tech
- Groq API key → https://console.groq.com

---

## Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Podium v4.0 - initial"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/podium.git
git push -u origin main
```

---

## Step 2 — Create Turso Database (2 min)

1. Go to https://turso.tech → Sign up (free, no credit card)
2. Click **Create Database** → name it `podium` → pick any region → Create
3. Click into the database → click **Generate Token** → copy it
4. Copy the **Database URL** (looks like `libsql://podium-xxxx.turso.io`)

You now have:
- `TURSO_DATABASE_URL=libsql://podium-xxxx.turso.io`
- `TURSO_AUTH_TOKEN=eyJ...`

---

## Step 3 — Deploy Backend on Render (5 min)

1. Go to https://render.com → **New → Web Service**
2. Connect your GitHub repo
3. Fill in:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install --legacy-peer-deps && npm run build`
   - **Start Command:** `node --no-warnings dist/index.js`
4. Under **Environment Variables**, add:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `JWT_SECRET` | *(click Generate)* |
   | `GROQ_API_KEY` | `gsk_your_key_here` |
   | `TURSO_DATABASE_URL` | `libsql://podium-xxxx.turso.io` |
   | `TURSO_AUTH_TOKEN` | `eyJ...your token...` |

5. Click **Create Web Service**
6. Wait for deploy (~3 min). Copy your backend URL:
   ```
   https://podium-backend-xxxx.onrender.com
   ```

---

## Step 4 — Deploy Frontend on Cloudflare Pages (3 min)

1. Go to https://pages.cloudflare.com → **Create a project → Connect to Git**
2. Select your repo
3. Fill in:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install --legacy-peer-deps && npm run build`
   - **Build Output Directory:** `dist`
4. Under **Environment Variables**, add:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://podium-backend-xxxx.onrender.com` |

5. Click **Save and Deploy**
6. Copy your Cloudflare Pages URL (e.g. `https://podium-xxxx.pages.dev`)

---

## Step 5 — Wire CORS

1. Go back to **Render → your service → Environment**
2. Add one more variable:

   | Key | Value |
   |-----|-------|
   | `ALLOWED_ORIGINS` | `https://podium-xxxx.pages.dev` |

3. Click **Save Changes** → Render will auto-redeploy

---

## Step 6 — First Login

1. Open your Cloudflare Pages URL
2. Login screen shows **"Create Account"** (first user auto-becomes admin)
3. Enter username, email, password → done

---

## Step 7 — Configure AI

1. Go to **Settings → AI**
2. Paste your Groq API key
3. Select model: `llama-3.3-70b-versatile`
4. Save

---

## Important Notes

### Cold Start
Render free tier sleeps after 15 min of inactivity. First request after idle takes ~30s.
**Before a demo:** open the app 2 minutes early to wake the server up.

### Data Persistence
All data is stored in Turso and survives redeploys permanently. On startup, the backend
syncs Turso → local SQLite (fast reads), and all writes are queued to Turso every 500ms.

### Docker Features
The Containers page and Docker-based deployments require Docker on the server.
On Render free tier, these show a graceful unavailable state. All other features work fully.

### CI/CD
Both Render and Cloudflare Pages auto-deploy on every push to `main`. No extra config needed.

---

## Local Development

```bash
cp .env.example backend/.env
# Edit backend/.env — set JWT_SECRET, GROQ_API_KEY, and optionally TURSO_* for persistent local dev

cd backend && npm install --legacy-peer-deps && cd ..
cd frontend && npm install --legacy-peer-deps && cd ..
npm install

npm run dev
# Backend: http://localhost:4000
# Frontend: http://localhost:5173
```
