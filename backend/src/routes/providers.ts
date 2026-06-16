import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole } from '../auth';
import { providerManager, PROVIDER_META } from '../providers/ProviderManager';

const router = Router();

function getCredentials(providerId: string): Record<string, string> {
  const meta = PROVIDER_META[providerId];
  if (!meta) return {};
  const db = getDb();
  const creds: Record<string, string> = {};
  for (const k of meta.credentialKeys) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k.key) as any;
    if (row?.value) creds[k.key] = row.value;
  }
  return creds;
}

function maskCredentials(creds: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (v) masked[k] = '***masked***';
  }
  return masked;
}

// GET /api/providers — list all providers with status
router.get('/', requireAuth, (_req, res) => {
  const metas = providerManager.listMeta();
  const db = getDb();
  const result = metas.map(m => {
    const creds = getCredentials(m.id);
    const hasCredentials = m.credentialKeys.filter(k => k.required).every(k => !!creds[k.key]);
    return {
      ...m,
      connected: hasCredentials,
      credentialsMasked: maskCredentials(creds),
    };
  });
  res.json(result);
});

// GET /api/providers/:id — single provider info
router.get('/:id', requireAuth, (req, res) => {
  try {
    const meta = providerManager.getMeta(req.params.id);
    const creds = getCredentials(req.params.id);
    const hasCredentials = meta.credentialKeys.filter(k => k.required).every(k => !!creds[k.key]);
    res.json({ ...meta, connected: hasCredentials, credentialsMasked: maskCredentials(creds) });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

// POST /api/providers/:id/connect — test connection
router.post('/:id/connect', requireAuth, requireRole('admin', 'developer'), async (req, res: Response) => {
  try {
    const meta = providerManager.getMeta(req.params.id);
    const db = getDb();

    // Build credentials: use submitted values or fall back to DB
    const creds: Record<string, string> = {};
    for (const k of meta.credentialKeys) {
      const submitted = req.body[k.key];
      if (submitted && submitted !== '***masked***') {
        creds[k.key] = submitted;
      } else {
        const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k.key) as any;
        if (row?.value) creds[k.key] = row.value;
      }
    }

    const result = await providerManager.connect(req.params.id, creds);
    if (result.ok) {
      // Persist credentials
      for (const [key, val] of Object.entries(creds)) {
        db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').run(key, val);
      }
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/providers/:id/credentials — save credentials without testing
router.post('/:id/credentials', requireAuth, requireRole('admin'), async (req, res: Response) => {
  try {
    const meta = providerManager.getMeta(req.params.id);
    const db = getDb();
    for (const k of meta.credentialKeys) {
      const val = req.body[k.key];
      if (val && val !== '***masked***') {
        db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').run(k.key, val);
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/providers/:id/credentials — remove credentials
router.delete('/:id/credentials', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const meta = providerManager.getMeta(req.params.id);
    const db = getDb();
    for (const k of meta.credentialKeys) {
      db.prepare('DELETE FROM settings WHERE key=?').run(k.key);
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/providers/deploy — create a cloud deployment
router.post('/deploy', requireAuth, requireRole('admin', 'developer'), async (req: any, res: Response) => {
  const { provider, name, repoUrl, branch, image, region, envVars, buildCommand, startCommand } = req.body;

  if (!provider || !name) {
    return res.status(400).json({ error: 'provider and name are required' });
  }

  try {
    const meta = providerManager.getMeta(provider);
    if (meta.isDemo) {
      return res.status(400).json({ error: `${meta.name} is in demo mode. Connect real credentials first.` });
    }

    const creds = getCredentials(provider);
    const deploymentId = uuidv4();

    const db = getDb();
    db.prepare(`
      INSERT INTO cloud_deployments (id, provider, name, region, status, config, logs, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, '[]', datetime('now'), datetime('now'))
    `).run(deploymentId, provider, name, region || null, JSON.stringify({ repoUrl, branch, image, envVars, buildCommand, startCommand }));

    // Fire and forget
    providerManager.deploy(provider, creds, {
      name, repoUrl, branch, image, region, envVars: envVars || {}, buildCommand, startCommand,
    }, deploymentId).then(result => {
      db.prepare(`UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?`)
        .run(result.status, result.url || null, deploymentId);
    }).catch(err => {
      const logs = JSON.stringify([{ time: new Date().toISOString(), message: err.message, level: 'error' }]);
      db.prepare(`UPDATE cloud_deployments SET status='failed', logs=?, updated_at=datetime('now') WHERE id=?`)
        .run(logs, deploymentId);
    });

    res.json({ id: deploymentId, status: 'queued' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/deployments/:id/status
router.get('/deployments/:id/status', requireAuth, async (req, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });

  try {
    const creds = getCredentials(row.provider);
    const status = await providerManager.getStatus(row.provider, creds, row.id);
    db.prepare(`UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?`)
      .run(status.status, status.url || null, row.id);
    res.json(status);
  } catch (e: any) {
    res.json({ deploymentId: row.id, status: row.status, updatedAt: row.updated_at });
  }
});

// GET /api/providers/deployments/:id/logs
router.get('/deployments/:id/logs', requireAuth, async (req, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });

  try {
    const creds = getCredentials(row.provider);
    const logs = await providerManager.getLogs(row.provider, creds, row.id);
    res.json(logs);
  } catch {
    const saved = JSON.parse(row.logs || '[]');
    res.json(saved);
  }
});

// DELETE /api/providers/deployments/:id
router.delete('/deployments/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });

  try {
    const creds = getCredentials(row.provider);
    await providerManager.deleteDeployment(row.provider, creds, row.id);
    db.prepare('DELETE FROM cloud_deployments WHERE id=?').run(row.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
