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

// Fetches the short (7-char) commit SHA for a repo/branch so each deployment
// version can be identified by code rather than a generic label. Best-effort:
// returns null for docker-image deployments or if the lookup fails, so it
// never blocks a deploy/redeploy/rollback.
async function fetchCommitSha(repoUrl?: string | null, branch?: string | null): Promise<string | null> {
  if (!repoUrl) return null;
  try {
    const axios = require('axios');
    const repoPath = repoUrl.replace('https://github.com/', '');
    const db = getDb();
    const repoRow = db.prepare('SELECT token FROM github_repos WHERE repo_url = ?').get(repoUrl) as any;
    const headers: Record<string, string> = { 'User-Agent': 'Podium/4.0' };
    if (repoRow?.token) headers['Authorization'] = `token ${repoRow.token}`;
    const resp = await axios.get(`https://api.github.com/repos/${repoPath}/commits/${branch || 'main'}`, { headers });
    return resp.data.sha?.slice(0, 7) || null;
  } catch {
    return null;
  }
}

// ─── Ensure user_id column exists on cloud_deployments ────────────────────────
// Called at startup from index.ts — safe to call multiple times.
// Uses PRAGMA table_info so ALTER TABLE is never executed when the column
// already exists — eliminates "duplicate column name" errors on restart.
export function ensureDeploymentUserIdColumn(): void {
  return;
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
        (id, provider, name, region, status, config, logs, source_type, repo_url, docker_image, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, '[]', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      localId, provider, name, region || null,
      JSON.stringify({ repoUrl, branch, image, envVars, buildCommand, startCommand, ownerId, runtime, plan, projectName, workspaceId, framework, rootDirectory, outputDirectory }),
      repoUrl ? 'git' : (image ? 'docker' : 'unknown'),
      repoUrl || null,
      image || null,
      userId
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

        // Record this as a version regardless of outcome — a failed initial
        // deploy still needs to show up in history so later successful
        // redeploys have something to roll back *from*, and so the config
        // that failed isn't silently lost.
        const initialCommitSha = await fetchCommitSha(repoUrl, branch);
        db.prepare(`
          INSERT INTO deployment_versions (id, deployment_id, label, config, docker_image, repo_url, status, provider_deployment_id, created_by, commit_sha)
          VALUES (?, ?, 'initial deploy', ?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), localId, JSON.stringify({ repoUrl, branch, image, envVars: envVars || {}, buildCommand, startCommand, ownerId, runtime, plan, projectName, workspaceId, framework, rootDirectory, outputDirectory }),
          image || null, repoUrl || null, result.status, result.deploymentId || null, userId, initialCommitSha);

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

        // Still record the version so the config isn't lost — this deploy
        // never got a provider_deployment_id, but a later successful
        // redeploy can still exist alongside it in history.
        db.prepare(`
          INSERT INTO deployment_versions (id, deployment_id, label, config, docker_image, repo_url, status, provider_deployment_id, created_by)
          VALUES (?, ?, 'initial deploy', ?, ?, ?, 'failed', NULL, ?)
        `).run(uuidv4(), localId, JSON.stringify({ repoUrl, branch, image, envVars: envVars || {}, buildCommand, startCommand, ownerId, runtime, plan, projectName, workspaceId, framework, rootDirectory, outputDirectory }),
          image || null, repoUrl || null, userId);
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

// GET /api/providers/deployments/:id/versions — deployment history for rollback
router.get('/deployments/:id/versions', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });
  if (!isAdmin && row.user_id && row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

  const versions = db.prepare('SELECT * FROM deployment_versions WHERE deployment_id=? ORDER BY created_at DESC').all(req.params.id) as any[];
  res.json(versions.map(v => ({ ...v, config: (() => { try { return JSON.parse(v.config); } catch { return {}; } })() })));
});

// POST /api/providers/deployments/:id/redeploy — re-run with current config, snapshot a new version
router.post('/deployments/:id/redeploy', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });
  if (!isAdmin && row.user_id && row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

  const cfg = (() => { try { return JSON.parse(row.config || '{}'); } catch { return {}; } })();
  db.prepare("UPDATE cloud_deployments SET status='queued', provider_error=NULL, updated_at=datetime('now') WHERE id=?").run(row.id);
  res.json({ ok: true, status: 'queued' });

  try {
    const creds = getCredentials(row.provider);
    const result = row.provider_deployment_id
      ? await providerManager.redeployExisting(row.provider, creds, row.provider_deployment_id, { name: row.name, region: row.region, image: row.docker_image, repoUrl: row.repo_url, ...cfg })
      : await providerManager.deploy(row.provider, creds, { name: row.name, region: row.region, image: row.docker_image, repoUrl: row.repo_url, ...cfg }, row.id);
    db.prepare(`UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), provider_deployment_id=?, provider_error=NULL, updated_at=datetime('now') WHERE id=?`)
      .run(result.status, result.url || null, result.deploymentId, row.id);
    const redeployCommitSha = await fetchCommitSha(row.repo_url, cfg.branch);
    db.prepare(`
      INSERT INTO deployment_versions (id, deployment_id, label, config, docker_image, repo_url, status, provider_deployment_id, created_by, commit_sha)
      VALUES (?, ?, 'redeploy', ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), row.id, JSON.stringify(cfg), row.docker_image || null, row.repo_url || null, result.status, result.deploymentId || null, userId, redeployCommitSha);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    db.prepare(`UPDATE cloud_deployments SET status='failed', provider_error=?, updated_at=datetime('now') WHERE id=?`).run(errMsg, row.id);
    const redeployCommitSha = await fetchCommitSha(row.repo_url, cfg.branch).catch(() => null);
    db.prepare(`
      INSERT INTO deployment_versions (id, deployment_id, label, config, docker_image, repo_url, status, provider_deployment_id, created_by, commit_sha)
      VALUES (?, ?, 'redeploy', ?, ?, ?, 'failed', NULL, ?, ?)
    `).run(uuidv4(), row.id, JSON.stringify(cfg), row.docker_image || null, row.repo_url || null, userId, redeployCommitSha);
  }
});
router.post('/deployments/:id/rollback', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const { version_id } = req.body || {};
  if (!version_id) return res.status(400).json({ error: 'version_id is required' });

  const db = getDb();
  const userId = req.user!.sub;
  const isAdmin = req.user!.role === 'admin';
  const row = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Deployment not found' });
  if (!isAdmin && row.user_id && row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

  const version = db.prepare('SELECT * FROM deployment_versions WHERE id=? AND deployment_id=?').get(version_id, row.id) as any;
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const cfg = (() => { try { return JSON.parse(version.config || '{}'); } catch { return {}; } })();
  db.prepare("UPDATE cloud_deployments SET status='queued', provider_error=NULL, config=?, docker_image=?, repo_url=?, updated_at=datetime('now') WHERE id=?")
    .run(JSON.stringify(cfg), version.docker_image || null, version.repo_url || null, row.id);
  res.json({ ok: true, status: 'queued' });

  try {
    const creds = getCredentials(row.provider);
    const result = row.provider_deployment_id
      ? await providerManager.redeployExisting(row.provider, creds, row.provider_deployment_id, { name: row.name, region: row.region, image: version.docker_image, repoUrl: version.repo_url, ...cfg })
      : await providerManager.deploy(row.provider, creds, { name: row.name, region: row.region, image: version.docker_image, repoUrl: version.repo_url, ...cfg }, row.id);
    db.prepare(`UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), provider_deployment_id=?, provider_error=NULL, updated_at=datetime('now') WHERE id=?`)
      .run(result.status, result.url || null, result.deploymentId, row.id);
    db.prepare(`
      INSERT INTO deployment_versions (id, deployment_id, label, config, docker_image, repo_url, status, provider_deployment_id, created_by, commit_sha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), row.id, `rollback to ${timeAgoLabel(version.created_at)}`, JSON.stringify(cfg), version.docker_image || null, version.repo_url || null, result.status, result.deploymentId || null, userId, version.commit_sha || null);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    db.prepare(`UPDATE cloud_deployments SET status='failed', provider_error=?, updated_at=datetime('now') WHERE id=?`).run(errMsg, row.id);
    db.prepare(`
      INSERT INTO deployment_versions (id, deployment_id, label, config, docker_image, repo_url, status, provider_deployment_id, created_by, commit_sha)
      VALUES (?, ?, ?, ?, ?, ?, 'failed', NULL, ?, ?)
    `).run(uuidv4(), row.id, `rollback to ${timeAgoLabel(version.created_at)}`, JSON.stringify(cfg), version.docker_image || null, version.repo_url || null, userId, version.commit_sha || null);
  }
});

function timeAgoLabel(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

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
    // A workspace token can't enumerate workspaces via `me` (it has no
    // personal-account identity to query) — if one's been configured manually,
    // just confirm it resolves and return it directly instead of auto-detecting.
    if (creds.railway_workspace_id) {
      const ws = await provider.getWorkspace(creds.railway_token, creds.railway_workspace_id);
      if (!ws) return res.status(400).json({ error: 'Configured Workspace ID could not be resolved with this token' });
      return res.json([ws]);
    }
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
    const projects = await provider.listProjects(creds.railway_token, creds.railway_workspace_id);
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
