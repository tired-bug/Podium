/**
 * AnomalyDetectionService
 *
 * Cloud-deployment-focused anomaly detection.
 * Operates entirely on cloud_deployments history — no container/Docker metrics.
 *
 * Rules implemented:
 *   1. repeated_failure       — deployment failed ≥3 times in 24 h
 *   2. stuck_building         — status has been 'building'/'queued' for >30 min
 *   3. deployment_outage      — deployment was live, is now failed/suspended
 *   4. build_duration_spike   — latest build took >2× the rolling average
 *   5. unusual_frequency      — >5 deploys in 1 h (possible runaway CI or mistake)
 *   6. health_degradation     — success rate dropped below 50 % in last 7 days
 */

import { getDb } from '../db/index';
import { v4 as uuidv4 } from 'uuid';
import { broadcastNotification } from '../routes/notifications';

const DETECTION_INTERVAL_MS = 5 * 60_000; // every 5 minutes

// ── helpers ──────────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key='anomaly_detection'")
      .get() as any;
    return row?.value === 'true';
  } catch {
    return true; // default on
  }
}

function openAnomalyExists(
  deploymentId: string,
  type: string,
  windowMs: number,
): boolean {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = getDb()
    .prepare(
      `SELECT id FROM anomalies
       WHERE deployment_id=? AND type=? AND resolved=0 AND created_at>?`,
    )
    .get(deploymentId, type, since);
  return !!row;
}

function raiseAnomaly(
  deploymentId: string,
  type: string,
  severity: 'warning' | 'critical',
  message: string,
  recommendation: string,
  provider: string,
  deploymentName: string,
): void {
  const db = getDb();
  const id = uuidv4();
  // Store recommendation in message field as JSON so the UI can read it
  const payload = JSON.stringify({ message, recommendation, provider });
  db.prepare(
    `INSERT INTO anomalies (id, deployment_id, type, severity, message)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, deploymentId, type, severity, payload);

  broadcastNotification(
    'anomaly',
    `${severity === 'critical' ? '🔴' : '🟡'} ${deploymentName} — ${humanType(type)}`,
    message,
    '/ai/anomalies',
  );
}

function humanType(type: string): string {
  const map: Record<string, string> = {
    repeated_failure:  'Repeated Failures',
    stuck_building:    'Stuck Building',
    deployment_outage: 'Deployment Outage',
    build_duration_spike: 'Build Duration Spike',
    unusual_frequency: 'Unusual Deploy Frequency',
    health_degradation:'Health Degradation',
  };
  return map[type] ?? type;
}

// ── rule 1: repeated failure ─────────────────────────────────────────────────

function detectRepeatedFailure(deps: any[]): void {
  const window24h = Date.now() - 24 * 3600_000;

  // Group all deployments by (provider, name-prefix to deduplicate provider_deployment_id variants)
  // We use provider_deployment_id as the stable grouping key when available.
  const failed = deps.filter(
    d =>
      d.status === 'failed' &&
      d.updated_at &&
      new Date(d.updated_at).getTime() > window24h,
  );

  // count failures per logical service (same provider + same name root)
  const counts: Record<string, { count: number; dep: any }> = {};
  for (const d of failed) {
    const key = `${d.provider}::${d.name}`;
    if (!counts[key]) counts[key] = { count: 0, dep: d };
    counts[key].count++;
  }

  for (const { count, dep } of Object.values(counts)) {
    if (count < 3) continue;
    if (openAnomalyExists(dep.id, 'repeated_failure', 4 * 3600_000)) continue;
    raiseAnomaly(
      dep.id,
      'repeated_failure',
      'critical',
      `${dep.name} has failed ${count} times in the last 24 hours on ${dep.provider}.`,
      'Inspect build logs for the root cause. Check for dependency changes, environment variable issues, or provider-side outages.',
      dep.provider,
      dep.name,
    );
  }
}

// ── rule 2: stuck building ───────────────────────────────────────────────────

function detectStuckBuilding(deps: any[]): void {
  const STUCK_THRESHOLD_MS = 30 * 60_000; // 30 minutes
  const now = Date.now();

  for (const dep of deps) {
    if (dep.status !== 'building' && dep.status !== 'queued') continue;
    if (!dep.updated_at) continue;

    const since = now - new Date(dep.updated_at).getTime();
    if (since < STUCK_THRESHOLD_MS) continue;
    if (openAnomalyExists(dep.id, 'stuck_building', 2 * 3600_000)) continue;

    const minutes = Math.round(since / 60_000);
    raiseAnomaly(
      dep.id,
      'stuck_building',
      'critical',
      `${dep.name} has been in "${dep.status}" state for ${minutes} minutes on ${dep.provider}.`,
      'Force a redeploy or check provider status. Long build times may indicate a missing build cache, a frozen step, or a provider infrastructure issue.',
      dep.provider,
      dep.name,
    );
  }
}

// ── rule 3: deployment outage ─────────────────────────────────────────────────

function detectDeploymentOutage(deps: any[]): void {
  // Deployments that have a URL (were once live) but are now failed/suspended
  for (const dep of deps) {
    if (!dep.url) continue;
    if (dep.status !== 'failed' && dep.status !== 'suspended') continue;
    if (openAnomalyExists(dep.id, 'deployment_outage', 6 * 3600_000)) continue;

    raiseAnomaly(
      dep.id,
      'deployment_outage',
      'critical',
      `${dep.name} is unreachable — status is "${dep.status}" but a live URL was previously recorded (${dep.url}).`,
      'Trigger a new deployment or rollback to the last known good revision. Verify provider health and check for quota exhaustion.',
      dep.provider,
      dep.name,
    );
  }
}

// ── rule 4: build duration spike ─────────────────────────────────────────────

function detectBuildDurationSpike(deps: any[]): void {
  // Group by (provider, name) to get history per service
  const byService: Record<string, any[]> = {};
  for (const d of deps) {
    const key = `${d.provider}::${d.name}`;
    if (!byService[key]) byService[key] = [];
    byService[key].push(d);
  }

  for (const [, history] of Object.entries(byService)) {
    const finished = history
      .filter(d => ['live', 'running', 'failed'].includes(d.status) && d.created_at && d.updated_at)
      .map(d => ({
        ...d,
        duration: new Date(d.updated_at).getTime() - new Date(d.created_at).getTime(),
      }))
      .filter(d => d.duration > 10_000 && d.duration < 30 * 60_000) // plausible range
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (finished.length < 3) continue; // need baseline

    const latest = finished[0];
    const baseline = finished.slice(1, 6); // previous 1-5 builds
    const avgMs = baseline.reduce((s, d) => s + d.duration, 0) / baseline.length;

    if (latest.duration < avgMs * 2) continue; // not a spike
    if (openAnomalyExists(latest.id, 'build_duration_spike', 4 * 3600_000)) continue;

    const latestMin = (latest.duration / 60_000).toFixed(1);
    const avgMin    = (avgMs / 60_000).toFixed(1);
    raiseAnomaly(
      latest.id,
      'build_duration_spike',
      'warning',
      `${latest.name} took ${latestMin} min to build — ${((latest.duration / avgMs - 1) * 100).toFixed(0)}% longer than the ${avgMin} min average on ${latest.provider}.`,
      'Investigate slow build steps: large dependencies, missing cache, or increased bundle size. Consider parallelising build tasks.',
      latest.provider,
      latest.name,
    );
  }
}

// ── rule 5: unusual deploy frequency ─────────────────────────────────────────

function detectUnusualFrequency(deps: any[]): void {
  const window1h = Date.now() - 3600_000;

  // Group by (provider, name root)
  const byService: Record<string, any[]> = {};
  for (const d of deps) {
    if (!d.created_at) continue;
    if (new Date(d.created_at).getTime() < window1h) continue;
    const key = `${d.provider}::${d.name}`;
    if (!byService[key]) byService[key] = [];
    byService[key].push(d);
  }

  for (const [, group] of Object.entries(byService)) {
    if (group.length < 6) continue; // threshold: >5 deploys/hour
    const rep = group[0];
    if (openAnomalyExists(rep.id, 'unusual_frequency', 2 * 3600_000)) continue;

    raiseAnomaly(
      rep.id,
      'unusual_frequency',
      'warning',
      `${rep.name} on ${rep.provider} was deployed ${group.length} times in the last hour — an unusually high rate.`,
      'Check CI/CD webhooks for loops. Ensure branch protection rules are in place to prevent accidental rapid pushes.',
      rep.provider,
      rep.name,
    );
  }
}

// ── rule 6: health degradation ────────────────────────────────────────────────

function detectHealthDegradation(deps: any[]): void {
  const window7d = Date.now() - 7 * 24 * 3600_000;

  // Group by provider
  const byProvider: Record<string, any[]> = {};
  for (const d of deps) {
    if (!d.created_at) continue;
    if (new Date(d.created_at).getTime() < window7d) continue;
    if (!byProvider[d.provider]) byProvider[d.provider] = [];
    byProvider[d.provider].push(d);
  }

  for (const [provider, group] of Object.entries(byProvider)) {
    if (group.length < 5) continue; // need meaningful sample

    const failed = group.filter(d => d.status === 'failed').length;
    const rate   = (failed / group.length) * 100;
    if (rate < 50) continue; // degradation = >50 % failure rate

    // Use a synthetic provider-level ID (first dep's id) for dedup
    const repId = group[0].id;
    if (openAnomalyExists(repId, 'health_degradation', 6 * 3600_000)) continue;

    raiseAnomaly(
      repId,
      'health_degradation',
      'critical',
      `${provider} has a ${rate.toFixed(0)}% failure rate across ${group.length} deployments in the last 7 days.`,
      'Review recent changes across all services on this provider. Check for shared environment variables, provider limits, or a systemic configuration problem.',
      provider,
      provider,
    );
  }
}

// ── main loop ─────────────────────────────────────────────────────────────────

async function runDetection(): Promise<void> {
  if (!isEnabled()) return;

  const db = getDb();
  const deps = db
    .prepare(
      `SELECT id, provider, name, status, url, created_at, updated_at
       FROM cloud_deployments
       ORDER BY created_at DESC`,
    )
    .all() as any[];

  if (deps.length === 0) return;

  detectRepeatedFailure(deps);
  detectStuckBuilding(deps);
  detectDeploymentOutage(deps);
  detectBuildDurationSpike(deps);
  detectUnusualFrequency(deps);
  detectHealthDegradation(deps);
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startAnomalyDetection(): void {
  if (_timer) return;
  console.log('[anomaly] Starting cloud deployment anomaly detection');
  // Initial run after 15 s startup delay, then every DETECTION_INTERVAL_MS
  setTimeout(() => runDetection().catch(e => console.warn('[anomaly] Initial run error:', e.message)), 15_000);
  _timer = setInterval(
    () => runDetection().catch(e => console.warn('[anomaly] Detection error:', e.message)),
    DETECTION_INTERVAL_MS,
  );
}

export function stopAnomalyDetection(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
