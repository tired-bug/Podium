import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();

let dockerAvailable: boolean | null = null;

async function checkDocker(): Promise<boolean> {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    const Docker = require('dockerode');
    const d = new Docker({
      socketPath: process.platform === 'win32' ? '
    });
    await new Promise<void>((resolve, reject) => {
      d.ping((err: any) => err ? reject(err) : resolve());
    });
    dockerAvailable = true;
    console.log('[docker] Docker Engine available ✓');
  } catch {
    dockerAvailable = false;
    console.log('[docker] Docker Engine not available — running in demo mode');
  }
  
  setTimeout(() => { dockerAvailable = null; }, 30_000);
  return dockerAvailable;
}

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
  logToDb(id, 'info', `[Demo] Starting "${name}" — Docker not running, simulating lifecycle`);

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
      logToDb(id, 'info', `[Demo] "${name}" is running in demo mode. Start Docker Desktop to deploy for real.`);
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

async function startDockerDeployment(dep: any): Promise<void> {
  const Docker = require('dockerode');
  const docker = new Docker({
    socketPath: process.platform === 'win32' ? '
  });

  const id = dep.id;
  getDb().prepare("UPDATE deployments SET status='building', updated_at=datetime('now') WHERE id=?").run(id);
  logToDb(id, 'info', `Starting deployment "${dep.name}"...`);

  try {
    const envVars: string[] = (JSON.parse(dep.env_vars || '[]') as Array<{ key: string; value: string }>)
      .map(e => `${e.key}=${e.value}`);

    const ports: Array<{ host: string; container: string }> = JSON.parse(dep.ports || '[]');
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, {}> = {};
    for (const p of ports) {
      const key = `${p.container}/tcp`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: p.host }];
    }

    const imageName = dep.image || `${dep.name}:latest`;

    
    if (dep.image && (dep.image.includes('/') || dep.image.includes(':'))) {
      logToDb(id, 'info', `Pulling image ${imageName}...`);
      await new Promise<void>((resolve, reject) => {
        docker.pull(imageName, {}, (err: Error | null, stream: any) => {
          if (err) { reject(err); return; }
          docker.modem.followProgress(stream, (err2: Error | null) => {
            if (err2) reject(err2); else resolve();
          });
        });
      });
    }

    logToDb(id, 'info', `Creating container for "${dep.name}"...`);
    const container = await docker.createContainer({
      Image: imageName,
      name: dep.name,
      Env: envVars,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Memory: parseMemory(dep.memory_limit || '512m'),
        CpuQuota: Math.floor(parseFloat(dep.cpu_limit || '0.5') * 100_000),
        RestartPolicy: { Name: dep.restart_policy || 'unless-stopped' },
      },
    });

    await container.start();
    const info = await container.inspect();

    getDb().prepare("UPDATE deployments SET status='running', container_id=?, updated_at=datetime('now') WHERE id=?")
      .run(info.Id, id);
    logToDb(id, 'info', `✓ Container started: ${info.Id.slice(0, 12)}`);
  } catch (err: any) {
    getDb().prepare("UPDATE deployments SET status='failed', updated_at=datetime('now') WHERE id=?").run(id);
    logToDb(id, 'error', `Deployment failed: ${err.message}`, 'stderr');
  }
}

function parseMemory(limit: string): number {
  const m = limit.match(/^(\d+)(m|g|k)?$/i);
  if (!m) return 512 * 1024 * 1024;
  const v = parseInt(m[1]);
  const u = (m[2] || 'b').toLowerCase();
  if (u === 'g') return v * 1024 * 1024 * 1024;
  if (u === 'm') return v * 1024 * 1024;
  if (u === 'k') return v * 1024;
  return v;
}

async function smartStart(dep: any) {
  const hasDocker = await checkDocker();
  if (hasDocker) {
    await startDockerDeployment(dep);
  } else {
    simulateDeployment(dep.id, dep.name);
  }
}

router.get('/', requireAuth, (_req, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM deployments ORDER BY updated_at DESC').all() as any[];
  res.json(rows.map(d => ({
    ...d,
    ports:     JSON.parse(d.ports     || '[]'),
    env_vars:  JSON.parse(d.env_vars  || '[]'),
    build_args: JSON.parse(d.build_args || '[]'),
    isDemo: !d.container_id,
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
    const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(id) as any;
    smartStart(dep).catch(() => {});
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

  if (dep.container_id && await checkDocker()) {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: process.platform === 'win32' ? '
      const c = docker.getContainer(dep.container_id);
      await c.stop().catch(() => {});
      await c.remove().catch(() => {});
    } catch {}
  }

  getDb().prepare('DELETE FROM deployments WHERE id=?').run(req.params.id);
  return res.json({ ok: true });
});

router.post('/:id/start', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  
  if (dep.container_id && await checkDocker()) {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: process.platform === 'win32' ? '
      await docker.getContainer(dep.container_id).start();
      getDb().prepare("UPDATE deployments SET status='running', updated_at=datetime('now') WHERE id=?").run(dep.id);
      return res.json({ ok: true });
    } catch {}
  }

  smartStart(dep).catch(() => {});
  return res.json({ ok: true, message: 'Starting...' });
});

router.post('/:id/stop', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  if (dep.container_id && await checkDocker()) {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: process.platform === 'win32' ? '
      await docker.getContainer(dep.container_id).stop();
    } catch {}
  } else {
    simulateStop(dep.id, dep.name);
    return res.json({ ok: true });
  }

  getDb().prepare("UPDATE deployments SET status='stopped', updated_at=datetime('now') WHERE id=?").run(dep.id);
  logToDb(dep.id, 'info', 'Deployment stopped');
  return res.json({ ok: true });
});

router.post('/:id/restart', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  if (dep.container_id && await checkDocker()) {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: process.platform === 'win32' ? '
      await docker.getContainer(dep.container_id).restart();
      getDb().prepare("UPDATE deployments SET status='running', updated_at=datetime('now') WHERE id=?").run(dep.id);
      logToDb(dep.id, 'info', 'Deployment restarted');
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  
  simulateDeployment(dep.id, dep.name);
  return res.json({ ok: true });
});

router.post('/:id/rebuild', requireAuth, requireRole('admin','developer'), async (req, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  if (dep.container_id && await checkDocker()) {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: process.platform === 'win32' ? '
      const c = docker.getContainer(dep.container_id);
      await c.stop().catch(() => {});
      await c.remove().catch(() => {});
    } catch {}
    getDb().prepare('UPDATE deployments SET container_id=NULL WHERE id=?').run(dep.id);
  }

  smartStart({ ...dep, container_id: null }).catch(() => {});
  return res.json({ ok: true, message: 'Rebuilding...' });
});

export default router;
