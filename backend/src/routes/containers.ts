import { Router, Response } from 'express';
import Docker from 'dockerode';
import { requireAuth, requireRole } from '../auth';

const router = Router();
let docker: Docker | null = null;

function getDocker(): Docker {
  if (!docker) {
    docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });
  }
  return docker;
}

router.get('/', requireAuth, async (_req, res: Response) => {
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
  try {
    await getDocker().getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  try {
    await getDocker().getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restart', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  try {
    await getDocker().getContainer(req.params.id).restart();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
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

export default router;
