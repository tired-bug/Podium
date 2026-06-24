import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();

// Deployments run in simulated ("demo") mode only — there is no local
// Docker Desktop / Docker Engine integration. Lifecycle transitions
// (building → running → stopped) are faked on a timer so the rest of the
// platform (logs, metrics, anomalies, AI features) has something to work
// with end-to-end.

function logToDb(deploymentId: string, level: string, message: string, stream = 'stdout') {
  try {
    getDb().prepare('INSERT INTO build_logs (deployment_id, level, message, stream) VALUES (?, ?, ?, ?)')
      .run(deploymentId, level, message, stream);
  } catch {}
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function simulateDeployment(id: string, name: string) {
  const db = getDb();
  db.prepare("UPDATE deployments SET status='building', updated_at=datetime('now') WHERE id=?").run(id);
  logToDb(id, 'info', `[Demo] Starting "${name}"...`);

  const steps = [
    { delay: 1200, msg: '[Demo] Pulling image from registry...' },
    { delay: 2800, msg: '[Demo] Building container...' },
    { delay: 4200, msg: '[Demo] Configuring network and ports...' },
    { delay: 5500, msg: '[Demo] Container ready!' },
  ];

  for (const s of steps) {
    setTimeout(() => {
      try {
        logToDb(id, 'info', s.msg);
      } catch {}
    }, s.delay);
  }

  setTimeout(() => {
    try {
      db.prepare("UPDATE deployments SET status='running', updated_at=datetime('now') WHERE id=?").run(id);
      logToDb(id, 'info', `[Demo] "${name}" is running.`);
    } catch {}
  }, 6000);
}

function simulateStop(id: string, name: string) {
  logToDb(id, 'info', `[Demo] Stopping "${name}"...`);
  setTimeout(() => {
    try {
      getDb().prepare("UPDATE deployments SET status='stopped', updated_at=datetime('now') WHERE id=?").run(id);
      logToDb(id, 'info', `[Demo] "${name}" stopped.`);
    } catch {}
  }, 800);
}

router.get('/', requireAuth, (_req, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM deployments ORDER BY updated_at DESC').all() as any[];
  res.json(rows.map(d => ({
    ...d,
    ports:     JSON.parse(d.ports     || '[]'),
    env_vars:  JSON.parse(d.env_vars  || '[]'),
    build_args: JSON.parse(d.build_args || '[]'),
    isDemo: true,
  })));
});

router.get('/:id', requireAuth, (req, res: Response) => {
  const d = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!d) return res.status(404).json({ error: 'Not found' });
  return res.json({
    ...d,
    ports:    JSON.parse(d.ports    || '[]'),
    env_vars: JSON.parse(d.env_vars || '[]'),
    build_args: JSON.parse(d.build_args || '[]'),
  });
});

router.post('/', requireAuth, requireRole('admin','developer'), async (req: AuthRequest, res: Response) => {
  const {
    name: rawName, repo_url, branch = 'main', image,
    ports = [], env_vars = [], dockerfile_path = 'Dockerfile',
    memory_limit = '512m', cpu_limit = '0.5',
    restart_policy = 'unless-stopped', replicas = 1, build_args = [],
  } = req.body;

  if (!rawName && !repo_url && !image) {
    return res.status(400).json({ error: 'Name and either repo_url or image required' });
  }

  const name = slugify(rawName || repo_url?.split('/').pop() || uuidv4().slice(0, 8));
  if (getDb().prepare('SELECT id FROM deployments WHERE name=?').get(name)) {
    return res.status(409).json({ error: `Deployment "${name}" already exists` });
  }

  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO deployments
      (id, name, repo_url, branch, image, ports, env_vars, dockerfile_path,
       memory_limit, cpu_limit, restart_policy, replicas, build_args, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, name, repo_url || null, branch, image || null,
    JSON.stringify(ports), JSON.stringify(env_vars), dockerfile_path,
    memory_limit, cpu_limit, restart_policy, replicas, JSON.stringify(build_args));

  logToDb(id, 'info', `Deployment "${name}" created`);

  if (image) {
    simulateDeployment(id, name);
  }

  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(id) as any;
  return res.status(201).json({
    ...dep, ports: JSON.parse(dep.ports), env_vars: JSON.parse(dep.env_vars),
  });
});

router.put('/:id', requireAuth, requireRole('admin','developer'), (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  const { ports, env_vars, build_args, ...rest } = req.body;
  const updates: Record<string, any> = { ...rest, updated_at: new Date().toISOString() };
  if (ports !== undefined)     updates.ports      = JSON.stringify(ports);
  if (env_vars !== undefined)  updates.env_vars   = JSON.stringify(env_vars);
  if (build_args !== undefined) updates.build_args = JSON.stringify(build_args);

  const keys = Object.keys(updates);
  getDb().prepare(`UPDATE deployments SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`)
    .run(...Object.values(updates), req.params.id);

  const updated = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  return res.json({ ...updated, ports: JSON.parse(updated.ports), env_vars: JSON.parse(updated.env_vars) });
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  getDb().prepare('DELETE FROM deployments WHERE id=?').run(req.params.id);
  return res.json({ ok: true });
});

router.post('/:id/start', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  simulateDeployment(dep.id, dep.name);
  return res.json({ ok: true, message: 'Starting...' });
});

router.post('/:id/stop', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  simulateStop(dep.id, dep.name);
  return res.json({ ok: true });
});

router.post('/:id/restart', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  simulateDeployment(dep.id, dep.name);
  return res.json({ ok: true });
});

router.post('/:id/rebuild', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  simulateDeployment(dep.id, dep.name);
  return res.json({ ok: true, message: 'Rebuilding...' });
});

export default router;
