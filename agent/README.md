# Podium Docker Agent

Lets Podium's cloud-hosted backend manage containers running in **Docker
Desktop on your own machine**, instead of falling back to demo mode.

## Why this exists

Podium's backend (e.g. deployed on Render/Railway/Vercel) has no way to reach
`/var/run/docker.sock` or `//./pipe/docker_engine` on your laptop — that path
only exists locally. This agent runs on your machine, sits next to Docker
Desktop, and exposes a small HTTP API that the cloud backend can call over a
tunnel instead.

## Security model — read this before exposing anything

**This agent does not expose the Docker socket or Docker's raw API.**
Forwarding the raw socket through a public tunnel would be root-equivalent
remote code execution on your machine if the tunnel URL ever leaked — there
are botnets that actively scan for exactly that.

Instead, this agent only exposes a fixed, narrow set of routes:

| Route | Action |
|---|---|
| `GET /containers` | list containers |
| `POST /containers/:id/start` | start one container |
| `POST /containers/:id/stop` | stop one container |
| `POST /containers/:id/restart` | restart one container |
| `DELETE /containers/:id` | force-remove one container |
| `GET /containers/:id/stats` | live CPU/memory stream (SSE) |
| `GET /health` | unauthenticated liveness check only |

There is no route that accepts an arbitrary Docker API call, image name, or
shell command. Every route except `/health` requires a bearer token
(`AGENT_TOKEN`) that only you and your Podium backend know.

Recommended extra hardening (optional, not required to function):
- Use Cloudflare Tunnel instead of ngrok's free tier if you want a stable,
  non-rotating URL.
- Restrict the tunnel to your Podium backend's outbound IP if your tunnel
  provider supports IP allowlisting.
- Rotate `AGENT_TOKEN` periodically — just update it in `.env` and in
  Podium's Settings at the same time.

## Setup (Windows)

1. **Install dependencies and create your token**
   ```
   cd agent
   setup.bat
   ```
   This copies `.env.example` to `.env`. Open `.env` and set `AGENT_TOKEN` to
   a real random value:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Start the agent** (setup.bat does this for you, or manually):
   ```
   npm start
   ```
   You should see `[podium-agent] listening on http://localhost:4500`.

3. **Expose it publicly with a tunnel.** In a second terminal:
   ```
   ngrok http 4500
   ```
   Copy the `https://...ngrok-free.app` URL it gives you.

   (Cloudflare Tunnel works too: `cloudflared tunnel --url http://localhost:4500`)

4. **Connect it to Podium.** In the Podium web UI:
   `Settings → Cloud → Docker Agent`
   - **Agent URL**: the tunnel URL from step 3 (e.g. `https://abc123.ngrok-free.app`)
   - **Agent Token**: the same value you put in `.env`

   Save. The Containers page will now show containers from your machine
   instead of the demo/unavailable state.

## Setup (macOS/Linux)

Same idea, no `.bat` needed:
```
cd agent
npm install
cp .env.example .env
# edit .env, set AGENT_TOKEN
npm start
# in another terminal:
ngrok http 4500
```

## Running it in the background

For day-to-day use you probably don't want to keep a terminal window open.
Options:
- **Windows**: use [NSSM](https://nssm.cc/) or Task Scheduler to run
  `node server.js` at login.
- **macOS**: a `launchd` plist, or just `pm2 start server.js`.
- **Linux**: a `systemd` user service, or `pm2 start server.js`.

Whatever you use, make sure the tunnel (ngrok/cloudflared) also stays running
continuously — if it restarts, ngrok's free tier will give you a **new**
URL, and you'll need to update it in Podium Settings again. Cloudflare
Tunnel with a named tunnel avoids this by giving you a stable URL.

## Troubleshooting

- **Podium shows "Docker Agent unreachable"**: check the agent terminal is
  still running and the tunnel is still up. Tunnel URLs from free ngrok
  rotate on restart.
- **Podium shows "Unauthorized"**: the `AGENT_TOKEN` in `.env` and in Podium
  Settings don't match. Update both to the same value.
- **Agent shows "Docker is not running"**: open Docker Desktop on your
  machine and wait until it says "Running", then refresh the Containers page.
