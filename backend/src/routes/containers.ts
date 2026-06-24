import { Router, Response } from 'express';
import Docker from 'dockerode';
import axios from 'axios';
import { getDb } from '../db/index';
import { requireAuth, requireRole } from '../auth';

const router = Router();
let docker: Docker | null = null;

function getDocker(): Docker {
  if (!docker) {
    docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });
  }
  return docker;
}

// ─── Remote Docker Agent (optional) ────────────────────────────────────────
// When configured, container management is proxied to a local agent running
// next to Docker Desktop on the user's machine (see /agent in the repo),
// reached through a tunnel (ngrok/Cloudflare Tunnel). This lets a
// cloud-hosted backend manage containers on a machine it can't otherwise
// reach. Falls back to local dockerode (the original behavior) when the
// agent isn't configured, so self-hosted / same-machine deployments are
// unaffected.

function getSetting(key: string): string {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as any;
    return row?.value || '';
  } catch {
    return '';
  }
}

function getAgentConfig(): { url: string; token: string } | null {
  const url = getSetting('docker_agent_url').replace(/\/+$/, '');
  const token = getSetting('docker_agent_token');
  if (!url || !token) return null;
  return { url, token };
}

function agentClient(agent: { url: string; token: string }) {
  return axios.create({
    baseURL: agent.url,
    timeout: 10000,
    headers: { Authorization: `Bearer ${agent.token}` },
  });
}

router.get('/', requireAuth, async (_req, res: Response) => {
  const agent = getAgentConfig();
  if (agent) {
    try {
      const { data } = await agentClient(agent).get('/containers');
      return res.json(data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        return res.status(503).json({ error: 'Docker Agent rejected the token. Check Settings → Cloud → Docker Agent.', dockerUnavailable: true });
      }
      return res.status(503).json({ error: 'Docker Agent unreachable. Check it is running and the tunnel is up.', dockerUnavailable: true });
    }
  }

  try {
    const d = getDocker();
    const containers = await d.listContainers({ all: true });
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
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Docker is not running or not accessible', dockerUnavailable: true });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/start', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const agent = getAgentConfig();
  if (agent) {
    try {
      await agentClient(agent).post(`/containers/${req.params.id}/start`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(err.response?.status || 500).json({ error: err.response?.data?.error || err.message });
    }
  }
  try {
    await getDocker().getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const agent = getAgentConfig();
  if (agent) {
    try {
      await agentClient(agent).post(`/containers/${req.params.id}/stop`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(err.response?.status || 500).json({ error: err.response?.data?.error || err.message });
    }
  }
  try {
    await getDocker().getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restart', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const agent = getAgentConfig();
  if (agent) {
    try {
      await agentClient(agent).post(`/containers/${req.params.id}/restart`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(err.response?.status || 500).json({ error: err.response?.data?.error || err.message });
    }
  }
  try {
    await getDocker().getContainer(req.params.id).restart();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
  const agent = getAgentConfig();
  if (agent) {
    try {
      await agentClient(agent).delete(`/containers/${req.params.id}`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(err.response?.status || 500).json({ error: err.response?.data?.error || err.message });
    }
  }
  try {
    const c = getDocker().getContainer(req.params.id);
    await c.stop().catch(() => {});
    await c.remove({ force: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/stats', requireAuth, async (req, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  const agent = getAgentConfig();
  if (agent) {
    try {
      const upstream = await agentClient(agent).get(`/containers/${req.params.id}/stats`, {
        responseType: 'stream',
        timeout: 0,
      });
      upstream.data.on('data', (chunk: Buffer) => {
        if (closed) { upstream.data.destroy(); return; }
        res.write(chunk);
      });
      upstream.data.on('end', () => res.end());
      upstream.data.on('error', () => res.end());
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: 'Docker Agent unreachable' })}\n\n`);
      res.end();
    }
    return;
  }

  try {
    const container = getDocker().getContainer(req.params.id);
    const stream = await container.stats({ stream: true }) as any;

    stream.on('data', (chunk: Buffer) => {
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
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ─── Agent status (for Settings UI / diagnostics) ──────────────────────────
router.get('/agent/status', requireAuth, async (_req, res: Response) => {
  const agent = getAgentConfig();
  if (!agent) return res.json({ configured: false });
  try {
    const { data } = await agentClient(agent).get('/health');
    return res.json({ configured: true, reachable: true, dockerRunning: !!data.dockerRunning });
  } catch {
    return res.json({ configured: true, reachable: false });
  }
});

export default router;
