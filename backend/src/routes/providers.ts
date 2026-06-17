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

// ─── Provider management routes ───────────────────────────────────────────────
// IMPORTANT: specific static paths must come BEFORE /:id wildcard routes

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

// ─── Deployment sub-routes (must come BEFORE /:id to avoid wildcard capture) ──

// POST /api/providers/deploy — create a cloud deployment
router.post('/deploy', requireAuth, requireRole('admin', 'developer'), async (req: any, res: Response) => {
  const { provider, name, repoUrl, branch, image, region, envVars, buildCommand, startCommand } = req.body;

  if (!provider || !name) {
    return res.status(400).json({ error: 'provider and name are required' });
  }

  console.log(`[providers] Deploy request: provider=${provider} name=${name}`);

  try {
    const meta = providerManager.getMeta(provider);
    if (meta.isDemo) {
      return res.status(400).json({ error: `${meta.name} is in demo mode. Connect real credentials first.` });
    }

    const creds = getCredentials(provider);
    const missingCreds = meta.credentialKeys.filter(k => k.required && !creds[k.key]).map(k => k.label);
    if (missingCreds.length > 0) {
      return res.status(400).json({ error: `Missing credentials: ${missingCreds.join(', ')}` });
    }

    const localId = uuidv4();
    const db = getDb();

    db.prepare(`
      INSERT INTO cloud_deployments (id, provider, name, region, status, config, logs, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, '[]', datetime('now'), datetime('now'))
    `).run(localId, provider, name, region || null, JSON.stringify({ repoUrl, branch, image, envVars, buildCommand, startCommand }));

    console.log(`[providers] Created local deployment record id=${localId}, launching provider deploy...`);

    // Fire and forget — but properly track the provider's deployment ID
    (async () => {
      try {
        console.log(`[providers] Calling ${provider}.deploy() for localId=${localId}`);
        const result = await providerManager.deploy(provider, creds, {
          name, repoUrl, branch, image, region, envVars: envVars || {}, buildCommand, startCommand,
        }, localId);

        const providerDeployId = result.deploymentId;
        console.log(`[providers] Provider returned deploymentId=${providerDeployId} status=${result.status} url=${result.url}`);

        // Store the provider's own deployment ID separately from the local UUID
        db.prepare(`
          UPDATE cloud_deployments
          SET status=?, url=COALESCE(?,url), provider_deployment_id=?, provider_error=NULL, updated_at=datetime('now')
          WHERE id=?
        `).run(result.status, result.url || null, providerDeployId, localId);

        console.log(`[providers] Updated db: localId=${localId} → provider_deployment_id=${providerDeployId} status=${result.status}`);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.error(`[providers] Deploy failed for localId=${localId}:`, errMsg);

        const logs = JSON.stringify([{ time: new Date().toISOString(), message: errMsg, level: 'error' }]);
        db.prepare(`
          UPDATE cloud_deployments
          SET status='failed', logs=?, provider_error=?, updated_at=datetime('now')
          WHERE id=?
        `).run(logs, errMsg, localId);
      }
    })();

    res.json({ id: localId, status: 'queued' });
  } catch (e: any) {
    console.error('[providers] Deploy route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/deployments — list all cloud deployments
router.get('/deployments', requireAuth, (req: any, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM cloud_deployments ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({
    ...r,
    config: (() => { try { return JSON.parse((r as any).config); } catch { return {}; } })(),
    logs: (() => { try { return JSON.parse((r as any).logs); } catch { return []; } })(),
  })));
});

// GET /api/providers/deployments/:id/status
router.get('/deployments/:id/status', requireAuth, async (req, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });

  // Use provider_deployment_id if available, otherwise fall back to local id
  const providerDepId = row.provider_deployment_id || row.id;
  console.log(`[providers] Status poll: localId=${row.id} providerDepId=${providerDepId} provider=${row.provider}`);

  if (!row.provider_deployment_id) {
    // Provider deploy may still be in progress — return current DB status
    console.warn(`[providers] No provider_deployment_id yet for localId=${row.id}, returning cached status=${row.status}`);
    return res.json({ deploymentId: row.id, status: row.status, url: row.url, updatedAt: row.updated_at });
  }

  try {
    const creds = getCredentials(row.provider);
    const status = await providerManager.getStatus(row.provider, creds, providerDepId);
    console.log(`[providers] Status result for providerDepId=${providerDepId}: status=${status.status}`);

    db.prepare(`
      UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?
    `).run(status.status, status.url || null, row.id);

    res.json({ ...status, localId: row.id });
  } catch (e: any) {
    console.error(`[providers] Status fetch error for providerDepId=${providerDepId}:`, e.message);
    // Return last known DB state rather than pretending it's queued
    res.json({ deploymentId: row.id, status: row.status, url: row.url, updatedAt: row.updated_at, error: e.message });
  }
});

// GET /api/providers/deployments/:id/logs
router.get('/deployments/:id/logs', requireAuth, async (req, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });

  const providerDepId = row.provider_deployment_id || row.id;
  console.log(`[providers] Logs request: localId=${row.id} providerDepId=${providerDepId}`);

  if (!row.provider_deployment_id) {
    // No provider ID yet — return locally stored logs (may include error)
    const saved = (() => { try { return JSON.parse(row.logs); } catch { return []; } })();
    return res.json(saved);
  }

  try {
    const creds = getCredentials(row.provider);
    const logs = await providerManager.getLogs(row.provider, creds, providerDepId);
    console.log(`[providers] Fetched ${logs.length} log lines for providerDepId=${providerDepId}`);
    res.json(logs);
  } catch (e: any) {
    console.error(`[providers] Logs fetch error for providerDepId=${providerDepId}:`, e.message);
    const saved = (() => { try { return JSON.parse(row.logs); } catch { return []; } })();
    // Append the fetch error so user sees it
    res.json([...saved, { time: new Date().toISOString(), message: `Log fetch error: ${e.message}`, level: 'error' }]);
  }
});

// DELETE /api/providers/deployments/:id
router.delete('/deployments/:id', requireAuth, requireRole('admin'), async (req, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });

  const providerDepId = row.provider_deployment_id;
  console.log(`[providers] Delete: localId=${row.id} providerDepId=${providerDepId}`);

  if (providerDepId) {
    try {
      const creds = getCredentials(row.provider);
      await providerManager.deleteDeployment(row.provider, creds, providerDepId);
      console.log(`[providers] Provider delete succeeded for providerDepId=${providerDepId}`);
    } catch (e: any) {
      console.error(`[providers] Provider delete failed for providerDepId=${providerDepId}:`, e.message);
      // Still delete locally so the user can clean up orphaned records
    }
  } else {
    console.warn(`[providers] No provider_deployment_id for localId=${row.id} — deleting local record only`);
  }

  db.prepare('DELETE FROM cloud_deployments WHERE id=?').run(row.id);
  res.json({ ok: true });
});

// ─── Provider-specific routes (wildcard /:id — must come AFTER static paths) ──

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

    console.log(`[providers] Connect test: provider=${req.params.id}`);
    const result = await providerManager.connect(req.params.id, creds);
    if (result.ok) {
      for (const [key, val] of Object.entries(creds)) {
        db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').run(key, val);
      }
      console.log(`[providers] Connect succeeded: provider=${req.params.id}`);
    } else {
      console.warn(`[providers] Connect failed: provider=${req.params.id} error=${result.error}`);
    }
    res.json(result);
  } catch (e: any) {
    console.error(`[providers] Connect error: provider=${req.params.id}`, e.message);
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

export default router;
