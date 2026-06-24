/**
 * Podium Docker Agent
 * ---------------------------------------------------------------------------
 * Runs locally on the same machine as Docker Desktop. Exposes a small,
 * bearer-token-authenticated HTTP API for the specific container actions
 * Podium's web UI needs (list / start / stop / restart / remove / stats).
 *
 * This intentionally does NOT expose Docker's raw API. Forwarding the raw
 * Docker socket over a public tunnel is root-equivalent remote code
 * execution if the tunnel URL ever leaks. This agent is the narrow,
 * purpose-built alternative: only a handful of routes exist, all gated by
 * AGENT_TOKEN, and there is no route that accepts an arbitrary Docker API
 * call.
 *
 * Typical setup:
 *   1. npm install
 *   2. cp .env.example .env   and fill in AGENT_TOKEN
 *   3. npm start
 *   4. In another terminal: ngrok http 4500   (or `cloudflared tunnel ...`)
 *   5. Put the resulting https URL + your AGENT_TOKEN into
 *      Podium -> Settings -> Cloud -> Docker Agent
 */

require('dotenv').config();
const express = require('express');
const Docker = require('dockerode');

const PORT = process.env.PORT || 4500;
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!AGENT_TOKEN || AGENT_TOKEN === 'changeme-generate-a-real-token') {
  console.error(
    '\n[podium-agent] AGENT_TOKEN is not set (or is still the placeholder).\n' +
    '  Generate one with:\n' +
    '    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    '  then put it in .env as AGENT_TOKEN=...\n'
  );
  process.exit(1);
}

const docker = new Docker({
  socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock',
});

const app = express();
app.use(express.json());

// --- CORS (optional allowlist; the bearer token is the real gate) ---------
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0 || (origin && ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- Auth -------------------------------------------------------------------
function requireToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== AGENT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Health check (no auth needed, reveals nothing sensitive) --------------
app.get('/health', async (_req, res) => {
  try {
    const info = await docker.info();
    res.json({ ok: true, dockerRunning: true, containers: info.Containers });
  } catch {
    res.json({ ok: true, dockerRunning: false });
  }
});

app.use(requireToken);

// --- List containers ---------------------------------------------------------
app.get('/containers', async (_req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const formatted = containers.map(c => ({
      id: c.Id,
      shortId: c.Id.slice(0, 12),
      name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
      image: c.Image,
      status: c.State,
      statusText: c.Status,
      ports: c.Ports,
      created: c.Created,
      labels: c.Labels,
    }));
    res.json(formatted);
  } catch (err) {
    res.status(503).json({ error: err.message, dockerUnavailable: true });
  }
});

// --- Start / stop / restart ---------------------------------------------------
app.post('/containers/:id/start', async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/containers/:id/stop', async (req, res) => {
  try {
    await docker.getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/containers/:id/restart', async (req, res) => {
  try {
    await docker.getContainer(req.params.id).restart();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Remove --------------------------------------------------------------------
app.delete('/containers/:id', async (req, res) => {
  try {
    const c = docker.getContainer(req.params.id);
    await c.stop().catch(() => {});
    await c.remove({ force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Live stats (SSE) ------------------------------------------------------------
app.get('/containers/:id/stats', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const container = docker.getContainer(req.params.id);
    const stream = await container.stats({ stream: true });

    stream.on('data', chunk => {
      if (closed) { stream.destroy(); return; }
      try {
        const stats = JSON.parse(chunk.toString());
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const numCPUs = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCPUs * 100 : 0;
        const memUsage = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
        const memLimit = stats.memory_stats.limit;

        res.write(`data: ${JSON.stringify({
          cpu: Math.round(cpuPercent * 100) / 100,
          memory: Math.round(memUsage / 1024 / 1024 * 100) / 100,
          memoryLimit: Math.round(memLimit / 1024 / 1024),
          networkIn: stats.networks?.eth0?.rx_bytes || 0,
          networkOut: stats.networks?.eth0?.tx_bytes || 0,
        })}\n\n`);
      } catch {}
    });

    stream.on('end', () => res.end());
    stream.on('error', () => res.end());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`[podium-agent] listening on http://localhost:${PORT}`);
  console.log('[podium-agent] expose this with a tunnel, e.g.: ngrok http ' + PORT);
});
