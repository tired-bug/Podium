# Podium — Free Deployment Guide
## Stack: Render (backend) + Cloudflare Pages (frontend)

---

## Prerequisites
- GitHub account (to push the repo)
- Render account → https://render.com (free)
- Cloudflare Pages account → https://pages.cloudflare.com (free)
- Groq API key → https://console.groq.com (free)

---

## Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/podium.git
git push -u origin main
```

---

## Step 2 — Deploy Backend on Render

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
   | `PODIUM_DATA_DIR` | `/app/data` |
5. Under **Disks**, click **Add Disk**:
   - **Name:** `podium-data`
   - **Mount Path:** `/app/data`
   - **Size:** 1 GB
6. Click **Create Web Service**
7. Wait for deploy (~3 min). Copy your backend URL:
   ```
   https://podium-backend-xxxx.onrender.com
   ```
8. Come back and add one more env var:
   | Key | Value |
   |-----|-------|
   | `ALLOWED_ORIGINS` | `https://podium-xxxx.pages.dev` *(your Cloudflare URL from Step 3)* |

---

## Step 3 — Deploy Frontend on Cloudflare Pages

1. Go to https://pages.cloudflare.com → **Create a project → Connect to Git**
2. Select your repo
3. Fill in:
   - **Root Directory (optional):** `frontend`
   - **Build Command:** `npm install --legacy-peer-deps && npm run build`
   - **Build Output Directory:** `dist`
4. Under **Environment Variables**, add:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://podium-backend-xxxx.onrender.com` *(your Render URL)* |
5. Click **Save and Deploy**
6. Copy your Cloudflare Pages URL (e.g. `https://podium-xxxx.pages.dev`)
7. Paste it into the `ALLOWED_ORIGINS` env var in Render (Step 2, item 8)
8. In Render, trigger a **Manual Deploy** so the new CORS setting takes effect

---

## Step 4 — First Login

1. Open your Cloudflare Pages URL
2. You'll see the login screen with **"Create Account"** (first user auto-becomes admin)
3. Enter username, email, password → you're in

---

## Step 5 — Configure AI

1. Go to **Settings → AI**
2. Paste your Groq API key
3. Select model: `llama-3.3-70b-versatile`
4. Save — AI Assistant and anomaly analysis are now live

---

## Important Notes

### Cold Start
Render free tier sleeps after 15 min of inactivity.
The first request after idle takes ~30 seconds.
**Before a demo:** open the app URL 2 minutes early to wake it up.

### Docker Features
The Containers page and Docker-based deployments require a machine with Docker
installed and accessible. On Render free tier, these show a graceful "Docker not
available" state. All other features (Auth, AI, Cloud, GitHub, Logs, Metrics,
Anomaly Detection) work fully.

### Custom Domain (optional, still free)
Cloudflare Pages lets you add a custom domain for free if you own one.
Add the domain in Pages → Custom Domains, then update `ALLOWED_ORIGINS` in Render.

---

## CI/CD (Automatic)
Both Render and Cloudflare Pages auto-deploy on every push to `main`.
No extra configuration needed.

---

## Local Development
```bash
# Copy env
cp .env.example backend/.env
# Edit backend/.env — set JWT_SECRET and GROQ_API_KEY

# Install
cd backend && npm install --legacy-peer-deps && cd ..
cd frontend && npm install --legacy-peer-deps && cd ..
npm install

# Run
npm run dev
# → Backend: http://localhost:4000
# → Frontend: http://localhost:5173
```
