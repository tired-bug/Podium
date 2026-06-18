import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';
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

// ─── Ensure user_id column exists on cloud_deployments ────────────────────────
// Called at startup from index.ts — safe to call multiple times.
// Uses PRAGMA table_info so ALTER TABLE is never executed when the column
// already exists — eliminates "duplicate column name" errors on restart.
export function ensureDeploymentUserIdColumn(): void {
  const db = getDb();
  type ColInfo = { name: string };
  const existing = (db.prepare('PRAGMA table_info(cloud_deployments)').all() as ColInfo[])
    .map(r => r.name);

  const needed: Array<{ colDef: string; colName: string }> = [
    { colName: 'user_id',          colDef: 'user_id TEXT' },
    { colName: 'creator_username', colDef: 'creator_username TEXT' },
  ];

  for (const { colName, colDef } of needed) {
    if (!existing.includes(colName)) {
      db.prepare(`ALTER TABLE cloud_deployments ADD COLUMN ${colDef}`).run();
      console.log(`[providers] Added column ${colName} to cloud_deployments`);
    }
  }
}

// ─── Provider list ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, (_req, res) => {
  const metas = providerManager.listMeta();
  const result = metas.map(m => {
    const creds = getCredentials(m.id);
    const requiredKeys = m.credentialKeys.filter(k => k.required);
    const hasCredentials = requiredKeys.every(k => !!creds[k.key]);
    return { ...m, connected: hasCredentials, credentialsMasked: maskCredentials(creds) };
  });
  res.json(result);
});

// ─── Static sub-routes BEFORE /:id wildcard ───────────────────────────────────

// POST /api/providers/deploy
router.post('/deploy', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const {
    provider, name, repoUrl, branch, image, region, envVars, buildCommand, startCommand,
    ownerId, runtime, plan, projectName, workspaceId, framework, rootDirectory, outputDirectory,
  } = req.body;

  if (!provider || !name) {
    return res.status(400).json({ error: 'provider and name are required' });
  }

  console.log(`[providers] Deploy: provider=${provider} name=${name} userId=${req.user?.sub}`);

  try {
    const meta = providerManager.getMeta(provider);
    if (meta.isDemo) {
      return res.status(400).json({ error: `${meta.name} is in demo mode. Connect real credentials first.` });
    }

    const creds = getCredentials(provider);
    const missingCreds = meta.credentialKeys
      .filter(k => k.required && !creds[k.key])
      .map(k => k.label);
    if (missingCreds.length > 0) {
      return res.status(400).json({ error: `Missing credentials: ${missingCreds.join(', ')}` });
    }

    const localId = uuidv4();
    const db = getDb();
    const userId = req.user!.sub;

    // If this repo was connected under GitHub with a token (e.g. it's private),
    // reuse that token so providers can fetch its source without any extra
    // setup on the user's part.
    let githubToken: string | undefined;
    if (repoUrl) {
      const repoRow = db.prepare('SELECT token FROM github_repos WHERE repo_url = ?').get(repoUrl) as any;
      if (repoRow?.token) githubToken = repoRow.token;
    }

    db.prepare(`
      INSERT INTO cloud_deployments
        (id, provider, name, region, status, config, logs, source_type, repo_url, docker_image, user_id, creator_username, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, '[]', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      localId, provider, name, region || null,
      JSON.stringify({ repoUrl, branch, image, envVars, buildCommand, startCommand, ownerId, runtime, plan, projectName, workspaceId, framework, rootDirectory, outputDirectory }),
      repoUrl ? 'git' : (image ? 'docker' : 'unknown'),
      repoUrl || null,
      image || null,
      userId,
      req.user!.username
    );

    console.log(`[providers] Created local deployment id=${localId} userId=${userId}`);

    (async () => {
      try {
        const result = await providerManager.deploy(provider, creds, {
          name, repoUrl, branch, image, region, envVars: envVars || {},
          buildCommand, startCommand, ownerId, runtime, plan,
          projectName, workspaceId, framework, rootDirectory, outputDirectory,
          githubToken,
        }, localId);

        db.prepare(`
          UPDATE cloud_deployments
          SET status=?, url=COALESCE(?,url), provider_deployment_id=?, provider_error=NULL, updated_at=datetime('now')
          WHERE id=?
        `).run(result.status, result.url || null, result.deploymentId, localId);

        console.log(`[providers] Deploy success localId=${localId} providerDepId=${result.deploymentId} status=${result.status}`);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.error(`[providers] Deploy failed localId=${localId}:`, errMsg);
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

// GET /api/providers/deployments — scoped to current user (admins see all)
router.get('/deployments', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';

  const rows = isAdmin
    ? db.prepare('SELECT * FROM cloud_deployments ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM cloud_deployments WHERE user_id = ? ORDER BY created_at DESC').all(userId);

  res.json(rows.map(r => ({
    ...r,
    config: (() => { try { return JSON.parse((r as any).config); } catch { return {}; } })(),
    logs: (() => { try { return JSON.parse((r as any).logs); } catch { return []; } })(),
  })));
});

// GET /api/providers/deployments/:id/status
router.get('/deployments/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });
  if (!isAdmin && row.user_id && row.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const providerDepId = row.provider_deployment_id;
  if (!providerDepId) {
    return res.json({ deploymentId: row.id, status: row.status, url: row.url, updatedAt: row.updated_at, error: row.provider_error || undefined });
  }

  try {
    const creds = getCredentials(row.provider);
    const status = await providerManager.getStatus(row.provider, creds, providerDepId);
    db.prepare(`UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?`)
      .run(status.status, status.url || null, row.id);
    res.json({ ...status, localId: row.id });
  } catch (e: any) {
    res.json({ deploymentId: row.id, status: row.status, url: row.url, updatedAt: row.updated_at, error: e.message });
  }
});

// GET /api/providers/deployments/:id/logs
router.get('/deployments/:id/logs', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });
  if (!isAdmin && row.user_id && row.user_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const providerDepId = row.provider_deployment_id;
  if (!providerDepId) {
    const saved = (() => { try { return JSON.parse(row.logs); } catch { return []; } })();
    return res.json(saved);
  }

  try {
    const creds = getCredentials(row.provider);
    const logs = await providerManager.getLogs(row.provider, creds, providerDepId);
    res.json(logs);
  } catch (e: any) {
    const saved = (() => { try { return JSON.parse(row.logs); } catch { return []; } })();
    res.json([...saved, { time: new Date().toISOString(), message: `Log fetch error: ${e.message}`, level: 'error' }]);
  }
});

// DELETE /api/providers/deployments/failed — purge all failed records owned by user
// NOTE: This MUST be registered before DELETE /deployments/:id so Express does not
// match the literal segment "failed" as an :id parameter (which would return 404).
router.delete('/deployments/failed', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  if (isAdmin) {
    const result = db.prepare("DELETE FROM cloud_deployments WHERE status='failed'").run();
    return res.json({ deleted: result.changes });
  }
  const result = db.prepare("DELETE FROM cloud_deployments WHERE status='failed' AND user_id=?").run(userId);
  return res.json({ deleted: result.changes });
});

// DELETE /api/providers/deployments/:id
router.delete('/deployments/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });

  if (row.provider_deployment_id) {
    try {
      const creds = getCredentials(row.provider);
      await providerManager.deleteDeployment(row.provider, creds, row.provider_deployment_id);
    } catch (e: any) {
      console.error(`[providers] Provider delete failed:`, e.message);
    }
  }

  db.prepare('DELETE FROM cloud_deployments WHERE id=?').run(row.id);
  res.json({ ok: true });
});

// GET /api/providers/render/owners
router.get('/render/owners', requireAuth, async (_req, res: Response) => {
  const creds = getCredentials('render');
  if (!creds.render_api_key) return res.status(400).json({ error: 'Render API key not configured' });
  try {
    const owners = await providerManager.listRenderOwners(creds.render_api_key);
    res.json(owners);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/render/services
router.get('/render/services', requireAuth, async (_req, res: Response) => {
  const creds = getCredentials('render');
  if (!creds.render_api_key) return res.status(400).json({ error: 'Render API key not configured' });
  try {
    const provider = (providerManager as any).get('render');
    const services = await provider.listDeployments(creds);
    res.json(services);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/railway/workspaces
router.get('/railway/workspaces', requireAuth, async (_req, res: Response) => {
  const creds = getCredentials('railway');
  if (!creds.railway_token) return res.status(400).json({ error: 'Railway API token not configured' });
  try {
    const provider = (providerManager as any).get('railway');
    const workspaces = await provider.listWorkspaces(creds.railway_token);
    res.json(workspaces);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/railway/projects
router.get('/railway/projects', requireAuth, async (_req, res: Response) => {
  const creds = getCredentials('railway');
  if (!creds.railway_token) return res.status(400).json({ error: 'Railway API token not configured' });
  try {
    const provider = (providerManager as any).get('railway');
    const projects = await provider.listProjects(creds.railway_token);
    res.json(projects);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/vercel/repos
router.get('/vercel/repos', requireAuth, async (_req, res: Response) => {
  const creds = getCredentials('vercel');
  if (!creds.vercel_token) return res.status(400).json({ error: 'Vercel API token not configured' });
  try {
    const provider = (providerManager as any).get('vercel');
    const repos = await provider.listGithubRepos(creds);
    res.json(repos);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/vercel/deployments
router.get('/vercel/deployments', requireAuth, async (_req, res: Response) => {
  const creds = getCredentials('vercel');
  if (!creds.vercel_token) return res.status(400).json({ error: 'Vercel API token not configured' });
  try {
    const provider = (providerManager as any).get('vercel');
    const deployments = await provider.listDeployments(creds);
    res.json(deployments);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/providers/inventory — aggregate across all connected providers
router.get('/inventory', requireAuth, async (_req, res: Response) => {
  const results: Record<string, any[]> = {};
  for (const providerId of ['vercel', 'render', 'railway']) {
    const meta = PROVIDER_META[providerId];
    if (!meta) continue;
    const creds = getCredentials(providerId);
    const requiredKeys = meta.credentialKeys.filter(k => k.required);
    if (!requiredKeys.every(k => !!creds[k.key])) continue;
    try {
      const provider = (providerManager as any).get(providerId);
      if (typeof provider.listDeployments === 'function') {
        results[providerId] = await provider.listDeployments(creds);
      }
    } catch (e: any) {
      results[providerId] = [];
      console.warn(`[inventory] ${providerId} failed:`, e.message);
    }
  }
  res.json(results);
});

// POST /api/providers/sync
router.post('/sync', requireAuth, requireRole('admin', 'developer'), async (_req, res: Response) => {
  try {
    const { triggerSync } = require('../services/SyncService');
    await triggerSync();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /:id wildcard routes — MUST come after all static routes ─────────────────

// GET /api/providers/:id
router.get('/:id', requireAuth, (req, res) => {
  try {
    const meta = providerManager.getMeta(req.params.id);
    const creds = getCredentials(req.params.id);
    const requiredKeys = meta.credentialKeys.filter(k => k.required);
    const hasCredentials = requiredKeys.every(k => !!creds[k.key]);
    res.json({ ...meta, connected: hasCredentials, credentialsMasked: maskCredentials(creds) });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

// POST /api/providers/:id/connect
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
    const result = await providerManager.connect(req.params.id, creds);
    if (result.ok) {
      for (const [key, val] of Object.entries(creds)) {
        db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').run(key, val);
      }
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/providers/:id/credentials
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

// DELETE /api/providers/:id/credentials
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
