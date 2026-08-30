import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth } from '../auth';

const router = Router();

// ── Cost estimation tables (free-tier-aware) ─────────────────────────────────
const PROVIDER_COST = {
  render:  { perService: 7,   freeTierServices: 1,  buildCostPer: 0.10 },
  railway: { perService: 5,   freeTierServices: 0,  buildCostPer: 0.08 },
  vercel:  { perService: 0,   freeTierServices: 3,  buildCostPer: 0.00 },
  azure:   { perService: 45,  freeTierServices: 0,  buildCostPer: 0.50 },
  aws:     { perService: 35,  freeTierServices: 0,  buildCostPer: 0.40 },
} as const;

type KnownProvider = keyof typeof PROVIDER_COST;

function getProviderCosts(provider: string) {
  return PROVIDER_COST[provider as KnownProvider] ?? { perService: 10, freeTierServices: 0, buildCostPer: 0.15 };
}

// Counts deploys in the past 30 days for a given provider
function recentBuildCount(deployments: any[], provider: string): number {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return deployments.filter(d => d.provider === provider && d.created_at >= cutoff).length;
}

// ── Main analytics builder ────────────────────────────────────────────────────
function buildFinOpsData() {
  const db = getDb();
  const all: any[] = db.prepare('SELECT * FROM cloud_deployments ORDER BY created_at DESC').all();
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();

  // Group by provider
  const byProvider: Record<string, any[]> = {};
  for (const d of all) {
    if (!byProvider[d.provider]) byProvider[d.provider] = [];
    byProvider[d.provider].push(d);
  }

  const providerSummaries = Object.entries(byProvider).map(([provider, deps]) => {
    const costs = getProviderCosts(provider);
    const activeServices = deps.filter(d => ['active', 'live', 'running', 'ready'].includes(d.status)).length;
    const failedServices = deps.filter(d => ['failed', 'error', 'crashed'].includes(d.status)).length;
    const idleServices   = deps.filter(d => ['inactive', 'stopped', 'sleeping'].includes(d.status)).length;
    const recentBuilds   = deps.filter(d => d.created_at >= thirtyDaysAgo).length;
    const weekBuilds     = deps.filter(d => d.created_at >= sevenDaysAgo).length;

    // Estimate monthly cost
    const billableServices = Math.max(0, activeServices - costs.freeTierServices);
    const serviceCost  = billableServices * costs.perService;
    const buildCost    = recentBuilds * costs.buildCostPer;
    const estimatedCost = serviceCost + buildCost;

    return {
      provider,
      deploymentCount: deps.length,
      activeServices,
      failedServices,
      idleServices,
      recentBuilds,
      weekBuilds,
      estimatedMonthlyCost: +estimatedCost.toFixed(2),
      freeTierServices: costs.freeTierServices,
      billableServices,
    };
  });

  // ── Recommendations ──────────────────────────────────────────────────────
  const recommendations: {
    type: string;
    severity: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    deploymentId?: string;
    deploymentName?: string;
    provider?: string;
    estimatedSaving?: number;
  }[] = [];

  // 1. Unused / inactive deployments
  const unusedDeps = all.filter(d =>
    ['inactive', 'stopped', 'sleeping'].includes(d.status) &&
    d.updated_at < new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()
  );
  for (const d of unusedDeps) {
    const costs = getProviderCosts(d.provider);
    recommendations.push({
      type: 'unused_deployment',
      severity: 'high',
      title: `Unused deployment: ${d.name}`,
      description: `"${d.name}" on ${d.provider} has been inactive for 14+ days. Consider deleting it to avoid potential charges.`,
      deploymentId: d.id,
      deploymentName: d.name,
      provider: d.provider,
      estimatedSaving: costs.perService,
    });
  }

  // 2. Failed deployments lingering
  const failedDeps = all.filter(d =>
    ['failed', 'error', 'crashed'].includes(d.status) &&
    d.updated_at < new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
  );
  for (const d of failedDeps) {
    recommendations.push({
      type: 'failed_deployment',
      severity: 'medium',
      title: `Failed deployment needs attention: ${d.name}`,
      description: `"${d.name}" on ${d.provider} has been in a failed state for 3+ days. Fix or remove it.`,
      deploymentId: d.id,
      deploymentName: d.name,
      provider: d.provider,
      estimatedSaving: 0,
    });
  }

  // 3. Excessive redeployments (more than 10 in 7 days for one service)
  const recentAll = all.filter(d => d.created_at >= sevenDaysAgo);
  const nameCount: Record<string, { count: number; provider: string; id: string }> = {};
  for (const d of recentAll) {
    if (!nameCount[d.name]) nameCount[d.name] = { count: 0, provider: d.provider, id: d.id };
    nameCount[d.name].count++;
  }
  for (const [name, info] of Object.entries(nameCount)) {
    if (info.count >= 5) {
      recommendations.push({
        type: 'excessive_redeployments',
        severity: info.count >= 10 ? 'high' : 'medium',
        title: `High redeploy frequency: ${name}`,
        description: `"${name}" on ${info.provider} was redeployed ${info.count} times in the past 7 days. Review CI/CD triggers to reduce unnecessary builds.`,
        deploymentId: info.id,
        deploymentName: name,
        provider: info.provider,
        estimatedSaving: +(info.count * getProviderCosts(info.provider).buildCostPer).toFixed(2),
      });
    }
  }

  // 4. Provider consolidation opportunity (many providers, some with 1 service)
  const singleServiceProviders = providerSummaries.filter(p => p.deploymentCount === 1 && getProviderCosts(p.provider).perService > 0);
  if (singleServiceProviders.length >= 2) {
    const saving = singleServiceProviders.reduce((a, p) => a + getProviderCosts(p.provider).perService, 0);
    recommendations.push({
      type: 'consolidation_opportunity',
      severity: 'low',
      title: 'Provider consolidation opportunity',
      description: `You have single services spread across ${singleServiceProviders.map(p => p.provider).join(', ')}. Consolidating to one provider could simplify management and reduce overhead.`,
      estimatedSaving: +saving.toFixed(2),
    });
  }

  // 5. Free tier advice for Vercel/Render
  const renderSummary = providerSummaries.find(p => p.provider === 'render');
  if (renderSummary && renderSummary.activeServices > 3) {
    recommendations.push({
      type: 'free_tier_optimization',
      severity: 'low',
      title: 'Render: review active service count',
      description: `You have ${renderSummary.activeServices} active Render services. Render's free tier covers 1 service; consider which services can be moved to the free tier or paused.`,
      provider: 'render',
      estimatedSaving: +((renderSummary.activeServices - 1) * PROVIDER_COST.render.perService).toFixed(2),
    });
  }

  // 6. Always surface something — if no cost/waste issues were found, fall back
  // to proactive housekeeping/best-practice suggestions so the panel never reads as "unused".
  if (recommendations.length === 0 && all.length > 0) {
    const noMonitoring = providerSummaries.every(p => p.recentBuilds === 0);
    if (noMonitoring) {
      recommendations.push({
        type: 'housekeeping',
        severity: 'low',
        title: 'No deploys in the last 30 days',
        description: 'Nothing has redeployed recently. Confirm your CI/CD triggers are still wired up correctly, or archive services you no longer maintain.',
        estimatedSaving: 0,
      });
    }
    if (providerSummaries.length === 1) {
      recommendations.push({
        type: 'housekeeping',
        severity: 'low',
        title: 'Single-provider setup — consider a cost/uptime baseline',
        description: `All services run on ${providerSummaries[0].provider}. Set a monthly cost alert threshold now, before usage grows, so a spike is caught early.`,
        provider: providerSummaries[0].provider,
        estimatedSaving: 0,
      });
    } else {
      recommendations.push({
        type: 'housekeeping',
        severity: 'low',
        title: 'Set spend alerts across providers',
        description: `You're spread across ${providerSummaries.length} providers with no current waste detected. Configure a monthly budget alert per provider so cost growth is visible before it compounds.`,
        estimatedSaving: 0,
      });
    }
    recommendations.push({
      type: 'housekeeping',
      severity: 'low',
      title: 'Nothing to optimize right now — establish a baseline instead',
      description: `${totalActiveFromAll(all)} services are active and healthy. Revisit this panel after your next growth spike; free-tier limits (e.g. Render's 1 free service, Vercel's free hobby tier) are the most common source of surprise charges as usage increases.`,
      estimatedSaving: 0,
    });
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalEstimatedCost = +providerSummaries.reduce((s, p) => s + p.estimatedMonthlyCost, 0).toFixed(2);
  const totalActive        = providerSummaries.reduce((s, p) => s + p.activeServices, 0);
  const totalDeployments   = all.length;
  const totalSavingsOpportunity = +recommendations.reduce((s, r) => s + (r.estimatedSaving ?? 0), 0).toFixed(2);

  return {
    summary: {
      totalDeployments,
      totalActiveServices: totalActive,
      totalEstimatedMonthlyCost: totalEstimatedCost,
      totalSavingsOpportunity,
      providerCount: providerSummaries.length,
    },
    providerSummaries,
    recommendations: recommendations.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    }),
    // Last 30-day build timeline (daily counts)
    buildTimeline: buildTimeline(all),
  };
}

function totalActiveFromAll(all: any[]): number {
  return all.filter(d => ['active', 'live', 'running', 'ready'].includes(d.status)).length;
}

function buildTimeline(deployments: any[]) {
  const days: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    days[key] = 0;
  }
  for (const dep of deployments) {
    const key = dep.created_at?.slice(0, 10);
    if (key && key in days) days[key]++;
  }
  return Object.entries(days).map(([date, count]) => ({ date, count }));
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, (_req, res: Response) => {
  try {
    const data = buildFinOpsData();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/provider/:provider', requireAuth, (req, res: Response) => {
  try {
    const { provider } = req.params;
    const db = getDb();
    const deps: any[] = db.prepare(
      'SELECT * FROM cloud_deployments WHERE provider=? ORDER BY created_at DESC'
    ).all(provider);

    const costs = getProviderCosts(provider);
    const active  = deps.filter(d => ['active', 'live', 'running', 'ready'].includes(d.status));
    const failed  = deps.filter(d => ['failed', 'error', 'crashed'].includes(d.status));
    const idle    = deps.filter(d => ['inactive', 'stopped', 'sleeping'].includes(d.status));

    res.json({ provider, costs, deployments: deps, active, failed, idle });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
