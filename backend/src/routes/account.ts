import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── API Tokens ───────────────────────────────────────────────────────────

router.get('/tokens', requireAuth, (req: AuthRequest, res: Response) => {
  const rows = getDb().prepare(
    'SELECT id, name, token_prefix, scopes, last_used_at, expires_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user!.sub);
  res.json(rows);
});

router.post('/tokens', requireAuth, (req: AuthRequest, res: Response) => {
  const { name, scopes, expires_in_days } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });

  const raw = `pdm_${crypto.randomBytes(24).toString('hex')}`;
  const id = uuidv4();
  const expiresAt = expires_in_days
    ? new Date(Date.now() + Number(expires_in_days) * 86400000).toISOString()
    : null;

  getDb().prepare(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.sub, name.trim(), hashToken(raw), raw.slice(0, 12), scopes || 'read', expiresAt);

  res.status(201).json({ id, name: name.trim(), token: raw, token_prefix: raw.slice(0, 12), scopes: scopes || 'read', expires_at: expiresAt });
});

router.delete('/tokens/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const result = getDb().prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.sub);
  if (result.changes === 0) return res.status(404).json({ error: 'Token not found' });
  res.json({ ok: true });
});

// ── SSH Keys ─────────────────────────────────────────────────────────────

function fingerprintOf(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  const keyBody = parts[1] || parts[0];
  try {
    const der = Buffer.from(keyBody, 'base64');
    const md5 = crypto.createHash('md5').update(der).digest('hex');
    return md5.match(/.{2}/g)!.join(':');
  } catch {
    return crypto.createHash('md5').update(publicKey).digest('hex').match(/.{2}/g)!.join(':');
  }
}

router.get('/ssh-keys', requireAuth, (req: AuthRequest, res: Response) => {
  const rows = getDb().prepare(
    'SELECT id, title, fingerprint, key_type, last_used_at, created_at FROM ssh_keys WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user!.sub);
  res.json(rows);
});

router.post('/ssh-keys', requireAuth, (req: AuthRequest, res: Response) => {
  const { title, public_key } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
  if (!public_key || !/^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-\S+)\s+\S+/.test(public_key.trim())) {
    return res.status(400).json({ error: 'Invalid public key format' });
  }
  const trimmed = public_key.trim();
  const keyType = trimmed.split(/\s+/)[0];
  const id = uuidv4();
  try {
    getDb().prepare(
      'INSERT INTO ssh_keys (id, user_id, title, public_key, fingerprint, key_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.user!.sub, title.trim(), trimmed, fingerprintOf(trimmed), keyType);
  } catch (e: any) {
    if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'This key is already registered' });
    throw e;
  }
  res.status(201).json({ id, title: title.trim(), fingerprint: fingerprintOf(trimmed), key_type: keyType });
});

router.delete('/ssh-keys/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const result = getDb().prepare('DELETE FROM ssh_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.sub);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  res.json({ ok: true });
});

// ── Feature Flags (admin-managed, visible to all) ───────────────────────

const DEFAULT_FLAGS: Array<{ key: string; label: string; description: string }> = [
  { key: 'ai_assistant', label: 'AI Assistant', description: 'Enable the AI chat assistant across the platform' },
  { key: 'ai_incident_reports', label: 'AI Incident Reports', description: 'Auto-generate AI incident reports on anomalies' },
  { key: 'finops_insights', label: 'FinOps Insights', description: 'Cost anomaly detection and budget recommendations' },
  { key: 'domain_auto_ssl', label: 'Automatic SSL for Domains', description: 'Provision SSL certificates automatically for custom domains' },
  { key: 'beta_ui', label: 'Beta UI Components', description: 'Opt into early-access UI components still in testing' },
];

function ensureDefaultFlags() {
  const db = getDb();
  const existing = new Set((db.prepare('SELECT key FROM feature_flags').all() as { key: string }[]).map(r => r.key));
  for (const f of DEFAULT_FLAGS) {
    if (!existing.has(f.key)) {
      db.prepare('INSERT INTO feature_flags (key, label, description, enabled) VALUES (?, ?, ?, 0)').run(f.key, f.label, f.description);
    }
  }
}

router.get('/feature-flags', requireAuth, (_req: AuthRequest, res: Response) => {
  ensureDefaultFlags();
  const rows = getDb().prepare('SELECT key, label, description, enabled, updated_at FROM feature_flags ORDER BY label').all();
  res.json(rows);
});

router.put('/feature-flags/:key', requireAuth, requireRole('admin'), (req: AuthRequest, res: Response) => {
  ensureDefaultFlags();
  const { enabled } = req.body || {};
  const result = getDb().prepare(
    "UPDATE feature_flags SET enabled = ?, updated_at = datetime('now') WHERE key = ?"
  ).run(enabled ? 1 : 0, req.params.key);
  if (result.changes === 0) return res.status(404).json({ error: 'Flag not found' });
  res.json({ ok: true });
});

export default router;
