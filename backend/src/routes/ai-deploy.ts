/**
 * /api/ai-deploy — AI Deployment Engine routes
 *
 * POST /api/ai-deploy/plan          – inspect repo → return DeploymentPlan
 * POST /api/ai-deploy/execute       – execute confirmed plan, SSE stream
 * POST /api/ai-deploy/redeploy      – redeploy existing cloudDep, SSE stream
 * GET  /api/ai-deploy/analyze/:id   – failure analysis for a cloud deployment
 */

import { Router, Response } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../auth';
import { AIDeploymentEngine } from '../services/ai/index';
import { getDb } from '../db/index';

const router = Router();

function getGithubToken(userId: string): string | undefined {
  try {
    const row = getDb().prepare('SELECT token FROM github_accounts WHERE user_id = ? LIMIT 1').get(userId) as any;
    return row?.token;
  } catch { return undefined; }
}

// ── POST /api/ai-deploy/plan ─────────────────────────────────────────────────

router.post('/plan', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const { repoUrl, branch = 'main', provider, selectedServicePath } = req.body;

  if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });
  if (!provider || !['railway', 'render', 'vercel'].includes(provider)) {
    return res.status(400).json({ error: 'provider must be railway, render, or vercel' });
  }

  const userId = req.user!.sub;
  const githubToken = getGithubToken(userId);

  const engine = new AIDeploymentEngine(githubToken);

  try {
    const { plan, detection } = await engine.buildPlan(repoUrl, branch, provider, selectedServicePath);
    return res.json({ plan, detection });
  } catch (err: any) {
    console.error('[ai-deploy/plan]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to inspect repository' });
  }
});

// ── POST /api/ai-deploy/execute ──────────────────────────────────────────────

router.post('/execute', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const { plan } = req.body;

  if (!plan || !plan.repoUrl || !plan.provider) {
    return res.status(400).json({ error: 'A valid deployment plan is required' });
  }

  const userId = req.user!.sub;
  const githubToken = getGithubToken(userId);

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: any) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch {}
  };

  const engine = new AIDeploymentEngine(githubToken);

  try {
    const result = await engine.executePlan(plan, userId, (update) => {
      send(update);
    });
    send({ type: 'done', cloudDeploymentId: result.cloudDeploymentId, url: result.url });
  } catch (err: any) {
    send({ type: 'error', message: err.message || 'Execution failed', done: true });
  } finally {
    res.end();
  }
});

// ── POST /api/ai-deploy/redeploy ─────────────────────────────────────────────

router.post('/redeploy', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const { cloudDeploymentId } = req.body;
  if (!cloudDeploymentId) return res.status(400).json({ error: 'cloudDeploymentId required' });

  const userId = req.user!.sub;
  const githubToken = getGithubToken(userId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: any) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); (res as any).flush?.(); } catch {}
  };

  const engine = new AIDeploymentEngine(githubToken);

  try {
    await engine.redeploy(cloudDeploymentId, userId, (update) => send(update));
    send({ type: 'done' });
  } catch (err: any) {
    send({ type: 'error', message: err.message || 'Redeploy failed', done: true });
  } finally {
    res.end();
  }
});

// ── GET /api/ai-deploy/analyze/:id ──────────────────────────────────────────

router.get('/analyze/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const dep = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const githubToken = getGithubToken(req.user!.sub);
  const engine = new AIDeploymentEngine(githubToken);

  try {
    const analysis = await engine.analyzeFailure(req.params.id);
    return res.json(analysis);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
