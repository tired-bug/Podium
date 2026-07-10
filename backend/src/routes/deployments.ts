import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole } from '../auth';

const router = Router();

// The `deployments` table is retained as a lightweight record store for build
// logs and anomaly tracking that other parts of the platform reference. There
// is no local Docker/container lifecycle — all actual deploys go through the
// cloud providers (Railway, Render, Vercel, etc.).

function logToDb(deploymentId: string, level: string, message: string, stream = 'stdout') {
  try {
    getDb().prepare('INSERT INTO build_logs (deployment_id, level, message, stream) VALUES (?, ?, ?, ?)')
      .run(deploymentId, level, message, stream);
  } catch {}
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.get('/', requireAuth, (_req, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM deployments ORDER BY updated_at DESC').all() as any[];
  res.json(rows.map(d => ({
    ...d,
    ports:      JSON.parse(d.ports     || '[]'),
    env_vars:   JSON.parse(d.env_vars  || '[]'),
    build_args: JSON.parse(d.build_args || '[]'),
  })));
});

router.get('/:id', requireAuth, (req, res: Response) => {
  const d = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!d) return res.status(404).json({ error: 'Not found' });
  return res.json({
    ...d,
    ports:      JSON.parse(d.ports    || '[]'),
    env_vars:   JSON.parse(d.env_vars || '[]'),
    build_args: JSON.parse(d.build_args || '[]'),
  });
});

router.post('/', requireAuth, requireRole('admin', 'developer'), async (req, res: Response) => {
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

  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(id) as any;
  return res.status(201).json({
    ...dep, ports: JSON.parse(dep.ports), env_vars: JSON.parse(dep.env_vars),
  });
});

router.put('/:id', requireAuth, requireRole('admin', 'developer'), (req, res: Response) => {
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

// DELETE /api/deployments/failed — purge all failed deployment records
// NOTE: This MUST be registered before DELETE /:id so Express does not match
// the literal segment "failed" as an :id parameter.
router.delete('/failed', requireAuth, requireRole('admin'), (_req, res: Response) => {
  const result = getDb().prepare("DELETE FROM deployments WHERE status='failed'").run();
  return res.json({ deleted: result.changes });
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  getDb().prepare('DELETE FROM deployments WHERE id=?').run(req.params.id);
  return res.json({ ok: true });
});

export default router;
