import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth, requireRole } from '../auth';
import os from 'os';
import fs from 'fs';
import path from 'path';

const router = Router();
const startTime = Date.now();

// GET /api/settings [admin]
router.get('/', requireAuth, requireRole('admin'), (_req, res: Response) => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of rows) {
    // Mask sensitive keys
    if (r.key.includes('key') || r.key.includes('secret') || r.key.includes('token') || r.key.includes('password')) {
      settings[r.key] = r.value ? '***masked***' : '';
    } else {
      settings[r.key] = r.value;
    }
  }
  // Include env-based keys status
  settings.groq_key_configured = (!!getDb().prepare("SELECT value FROM settings WHERE key = 'groq_api_key'").get() || !!process.env.GROQ_API_KEY) ? 'true' : 'false';
  res.json(settings);
});

// PUT /api/settings [admin]
router.put('/', requireAuth, requireRole('admin'), (req: any, res: Response) => {
  const updates = req.body as Record<string, string>;
  const stmt = getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(updates)) {
    if (value === '***masked***') continue; // Don't overwrite with mask
    stmt.run(key, value);
  }
  res.json({ ok: true });
});

// GET /api/settings/health (also serves as /api/health)
export function healthHandler(_req: any, res: Response) {
  const db = getDb();
  let dbSize = 0;
  try {
    const dbPath = process.env.PODIUM_DATA_DIR
      ? path.join(process.env.PODIUM_DATA_DIR, 'podium.db')
      : path.join(process.cwd(), 'data', 'podium.db');
    dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  } catch {}

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };

  res.json({
    status: 'ok',
    version: '4.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    uptimeHuman: formatUptime(Date.now() - startTime),
    dbSize,
    userCount: userCount.c,
    nodeVersion: process.version,
    platform: process.platform,
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024),
    },
  });
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default router;
