/**
 * SyncService — periodically fetches deployments from all connected providers
 * and updates the local/Turso cloud_deployments table.
 */
import { getDb } from '../db/index';
import { providerManager, PROVIDER_META } from '../providers/ProviderManager';

const SYNC_INTERVAL_MS = 60_000; // 1 minute

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

async function syncProvider(providerId: string): Promise<void> {
  const meta = PROVIDER_META[providerId];
  if (!meta) return;

  const creds = getCredentials(providerId);
  const requiredKeys = meta.credentialKeys.filter(k => k.required);
  if (!requiredKeys.every(k => !!creds[k.key])) return; // not connected

  const db = getDb();

  try {
    const provider = providerManager.get(providerId) as any;

    // Get all active deployments from this provider
    let providerDeployments: Array<{ id: string; name: string; status: string; url?: string; createdAt?: string; updatedAt?: string }> = [];

    if (typeof provider.listDeployments === 'function') {
      providerDeployments = await provider.listDeployments(creds);
    } else {
      // Fallback: poll status for known deployments
      const known = db.prepare(
        `SELECT * FROM cloud_deployments WHERE provider=? AND provider_deployment_id IS NOT NULL AND status NOT IN ('failed','deleted')`
      ).all(providerId) as any[];

      for (const row of known) {
        try {
          const status = await providerManager.getStatus(providerId, creds, row.provider_deployment_id);
          db.prepare(`UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?`)
            .run(status.status, status.url || null, row.id);
        } catch (e: any) {
          console.warn(`[sync] Status poll failed for ${row.id}:`, e.message);
        }
      }
      return;
    }

    // Sync only updates STATUS of existing user-owned records.
    // Never inserts new records from sync — those would be orphaned (no user_id).
    // Provider inventory is fetched live in /inventory endpoint instead.
    for (const dep of providerDeployments) {
      const existing = db.prepare(
        'SELECT id FROM cloud_deployments WHERE provider=? AND provider_deployment_id=?'
      ).get(providerId, dep.id) as any;

      if (existing) {
        db.prepare(
          `UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE provider=? AND provider_deployment_id=?`
        ).run(dep.status, dep.url || null, providerId, dep.id);
      }
      // No else: do not insert records without a user_id owner
    }

    console.log(`[sync] ${providerId}: synced ${providerDeployments.length} deployments`);
  } catch (e: any) {
    console.warn(`[sync] Failed to sync ${providerId}:`, e.message);
  }
}

async function runSync(): Promise<void> {
  const providers = ['render', 'railway', 'vercel'];
  for (const p of providers) {
    await syncProvider(p).catch(e => console.warn(`[sync] ${p} sync error:`, e.message));
  }
}

let _syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncService(): void {
  if (_syncInterval) return;
  console.log('[sync] Starting background deployment sync service');
  // Run once after 10s startup delay, then every SYNC_INTERVAL_MS
  setTimeout(() => {
    runSync().catch(e => console.warn('[sync] Initial sync error:', e.message));
  }, 10_000);
  _syncInterval = setInterval(() => {
    runSync().catch(e => console.warn('[sync] Periodic sync error:', e.message));
  }, SYNC_INTERVAL_MS);
}

export function stopSyncService(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}

export async function triggerSync(): Promise<void> {
  return runSync();
}
