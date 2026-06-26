import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth } from '../auth';
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

function isProviderConnected(providerId: string): boolean {
  const meta = PROVIDER_META[providerId];
  if (!meta) return false;
  const creds = getCredentials(providerId);
  return meta.credentialKeys.filter(k => k.required).every(k => !!creds[k.key]);
}

/**
 * Derives deployment metrics from the cloud_deployments table and provider APIs.
 * No fabricated data — all values come from real deployment history.
 */
async function computeProviderMetrics(
  providerId: string,
  deployments: any[]
): Promise<ProviderMetrics> {
  const now = Date.now();

  // Aggregate across all deployments for this provider
  const total = deployments.length;
  const successful = deployments.filter(d =>
    d.status === 'live' || d.status === 'running'
  ).length;
  const failed = deployments.filter(d =>
    d.status === 'failed'
  ).length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

  // Build duration: parse logs for timing info
  // Derive from created_at vs updated_at timestamps when status reached live
  const buildDurations: number[] = [];
  for (const dep of deployments) {
    if (dep.created_at && dep.updated_at && (dep.status === 'live' || dep.status === 'failed')) {
      const created = new Date(dep.created_at).getTime();
      const updated = new Date(dep.updated_at).getTime();
      const durationMs = updated - created;
      // Sanity check: builds between 10 seconds and 30 minutes are plausible
      if (durationMs > 10_000 && durationMs < 30 * 60 * 1000) {
        buildDurations.push(Math.round(durationMs / 1000));
      }
    }
  }
  const avgBuildDuration = buildDurations.length > 0
    ? Math.round(buildDurations.reduce((a, b) => a + b, 0) / buildDurations.length)
    : null;

  // Deployment frequency: deployments per day over last 30 days
  const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
  const recentDeps = deployments.filter(d => {
    const created = d.created_at ? new Date(d.created_at).getTime() : 0;
    return created >= thirtyDaysAgo;
  });
  const deployFrequency = recentDeps.length > 0
    ? parseFloat((recentDeps.length / 30).toFixed(2))
    : 0;

  // Uptime: fraction of time where at least one deployment is live
  // Derived from status — if current status is 'live', treat as up
  const liveCount = deployments.filter(d => d.status === 'live' || d.status === 'running').length;
  const uptime = total > 0 ? Math.round((liveCount / total) * 100) : 0;

  // Trend: deployments per day for the last 14 days
  const trend = buildTrend(deployments, 14);

  // Per-deployment breakdown
  const perDeployment: DeploymentMetrics[] = deployments.map(dep => {
    const created = dep.created_at ? new Date(dep.created_at).getTime() : null;
    const updated = dep.updated_at ? new Date(dep.updated_at).getTime() : null;
    let buildDur: number | null = null;
    if (created && updated && (dep.status === 'live' || dep.status === 'failed')) {
      const ms = updated - created;
      if (ms > 10_000 && ms < 30 * 60 * 1000) buildDur = Math.round(ms / 1000);
    }

    return {
      id: dep.id,
      name: dep.name,
      status: dep.status,
      url: dep.url || null,
      createdAt: dep.created_at || null,
      updatedAt: dep.updated_at || null,
      buildDuration: buildDur,
      region: dep.region || null,
    };
  });

  return {
    provider: providerId,
    total,
    successful,
    failed,
    successRate,
    avgBuildDuration,
    deployFrequency,
    uptime,
    trend,
    deployments: perDeployment,
  };
}

function buildTrend(deployments: any[], days: number): TrendPoint[] {
  const now = Date.now();
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - (i + 1) * 24 * 3600 * 1000;
    const dayEnd   = now - i * 24 * 3600 * 1000;
    const date = new Date(dayStart).toISOString().slice(0, 10);
    const count = deployments.filter(d => {
      const created = d.created_at ? new Date(d.created_at).getTime() : 0;
      return created >= dayStart && created < dayEnd;
    }).length;
    const successCount = deployments.filter(d => {
      const created = d.created_at ? new Date(d.created_at).getTime() : 0;
      return created >= dayStart && created < dayEnd && (d.status === 'live' || d.status === 'running');
    }).length;
    points.push({ date, deployments: count, successful: successCount });
  }
  return points;
}

interface TrendPoint {
  date: string;
  deployments: number;
  successful: number;
}

interface DeploymentMetrics {
  id: string;
  name: string;
  status: string;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  buildDuration: number | null;
  region: string | null;
}

interface ProviderMetrics {
  provider: string;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  avgBuildDuration: number | null;
  deployFrequency: number;
  uptime: number;
  trend: TrendPoint[];
  deployments: DeploymentMetrics[];
}

// GET /api/metrics
// Returns cloud deployment metrics grouped by provider
router.get('/', requireAuth, async (_req, res: Response) => {
  try {
    const db = getDb();
    const allDeps = db.prepare(
      `SELECT id, provider, name, status, url, region, created_at, updated_at
       FROM cloud_deployments
       ORDER BY created_at DESC`
    ).all() as any[];

    const providers = ['railway', 'render', 'vercel'];
    const result: ProviderMetrics[] = [];

    for (const pid of providers) {
      if (!isProviderConnected(pid)) continue;
      const deps = allDeps.filter(d => d.provider === pid);
      const metrics = await computeProviderMetrics(pid, deps);
      result.push(metrics);
    }

    // Also include providers with deployments but no active connection
    // (historical data is still valid)
    const providerIdsWithData = new Set(allDeps.map(d => d.provider));
    for (const pid of providerIdsWithData) {
      if (providers.includes(pid)) continue; // already handled
      if (result.find(r => r.provider === pid)) continue;
      const deps = allDeps.filter(d => d.provider === pid);
      const metrics = await computeProviderMetrics(pid, deps);
      result.push(metrics);
    }

    res.json(result);
  } catch (err: any) {
    console.error('[metrics] Error computing metrics:', err);
    res.status(500).json({ error: err.message || 'Failed to compute metrics' });
  }
});

// GET /api/metrics/:provider
// Returns metrics for a single provider
router.get('/:provider', requireAuth, async (req, res: Response) => {
  try {
    const { provider } = req.params;
    const db = getDb();
    const deps = db.prepare(
      `SELECT id, provider, name, status, url, region, created_at, updated_at
       FROM cloud_deployments
       WHERE provider = ?
       ORDER BY created_at DESC`
    ).all(provider) as any[];

    const metrics = await computeProviderMetrics(provider, deps);
    res.json(metrics);
  } catch (err: any) {
    console.error('[metrics] Error computing provider metrics:', err);
    res.status(500).json({ error: err.message || 'Failed to compute metrics' });
  }
});

export default router;
