import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { requireAuth } from '../auth';

const router = Router();

// "Self-Hosted" is a simulated provider — there is no local Docker
// integration. It mimics the same building → running lifecycle as other
// providers so the rest of the platform (logs, status, AI features) has
// something consistent to work with.

function appendCloudLog(cloudId: string, msg: string, level = 'info') {
  try {
    const row  = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(cloudId) as any;
    if (!row) return;
    const logs = JSON.parse(row.logs || '[]');
    logs.push({ time: new Date().toISOString(), message: msg, level });
    getDb()
      .prepare("UPDATE cloud_deployments SET logs=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(logs), cloudId);
  } catch {}
}

function setCloudStatus(cloudId: string, status: string, url?: string) {
  getDb()
    .prepare("UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?")
    .run(status, url || null, cloudId);
}

function allocatePort(): number {
  const PORT_START = 3100;
  const PORT_END   = 3200;
  const used = getDb()
    .prepare("SELECT config FROM cloud_deployments WHERE provider='podium' AND status NOT IN ('stopped','failed','deleted')")
    .all()
    .map((r: any) => {
      try { return JSON.parse(r.config)?.host_port; } catch { return null; }
    })
    .filter(Boolean) as number[];

  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!used.includes(p)) return p;
  }
  throw new Error('No free host ports available (3100-3200 exhausted)');
}

async function deploySelfHosted(cloudId: string): Promise<void> {
  const db  = getDb();
  const dep = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(cloudId) as any;
  if (!dep) return;

  const cfg: Record<string, any> = (() => {
    try { return JSON.parse(dep.config || '{}'); } catch { return {}; }
  })();

  try {
    setCloudStatus(cloudId, 'building');
    appendCloudLog(cloudId, '[Demo] Preparing deployment...');

    const hostPort: number = cfg.host_port || allocatePort();
    cfg.host_port = hostPort;
    db.prepare('UPDATE cloud_deployments SET config=? WHERE id=?').run(JSON.stringify(cfg), cloudId);

    const repoUrl = dep.repo_url || cfg.github_repo || '';
    const finalImage = repoUrl
      ? `podium-app-${dep.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)}:latest`
      : dep.docker_image || 'nginx:latest';

    if (repoUrl) {
      appendCloudLog(cloudId, `[Demo] Cloning ${repoUrl}...`);
      await new Promise(r => setTimeout(r, 800));
      appendCloudLog(cloudId, `[Demo] Building image "${finalImage}"...`);
      await new Promise(r => setTimeout(r, 1500));
    } else {
      appendCloudLog(cloudId, `[Demo] Pulling image "${finalImage}"...`);
      await new Promise(r => setTimeout(r, 900));
    }

    appendCloudLog(cloudId, `[Demo] Starting container on port ${hostPort}...`);
    await new Promise(r => setTimeout(r, 800));
    appendCloudLog(cloudId, '[Demo] Container started ✓');

    const publicUrl = `http://localhost:${hostPort}`;
    setCloudStatus(cloudId, 'running', publicUrl);
    appendCloudLog(cloudId, `✓ Live at ${publicUrl} (demo mode — not a real running container)`);

  } catch (err: any) {
    setCloudStatus(cloudId, 'failed');
    appendCloudLog(cloudId, `✗ ${err.message}`, 'error');
  }
}

router.post('/run/:cloudId', (req: Request, res: Response) => {
  if (req.headers['x-internal'] !== 'podium-selfhosted') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { cloudId } = req.params;
  deploySelfHosted(cloudId).catch(() => {});
  return res.json({ ok: true, cloudId });
});

router.get('/status', requireAuth, async (_req, res) => {
  res.json({ docker: false, ngrok: false, ngrokUrl: '' });
});

router.post('/:id/stop', requireAuth, async (req, res) => {
  const dep = getDb().prepare("SELECT * FROM cloud_deployments WHERE id=? AND provider='podium'").get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });
  setCloudStatus(dep.id, 'stopped');
  appendCloudLog(dep.id, 'Stopped by user');
  return res.json({ ok: true });
});

router.post('/:id/restart', requireAuth, async (req, res) => {
  const dep = getDb().prepare("SELECT * FROM cloud_deployments WHERE id=? AND provider='podium'").get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  getDb().prepare("UPDATE cloud_deployments SET status='queued', logs='[]', updated_at=datetime('now') WHERE id=?").run(dep.id);
  appendCloudLog(dep.id, 'Restarting...');
  deploySelfHosted(dep.id).catch(() => {});
  return res.json({ ok: true });
});

export default router;
export { deploySelfHosted };
