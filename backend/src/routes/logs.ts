import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth } from '../auth';

const router = Router();

// Logs live inline on each cloud_deployments row as a JSON array
// ({ time, message, level? }) — that's where every real deployment (Render,
// Railway, Vercel, Azure, AWS) writes its build/runtime output. This file
// flattens that into the same log-entry shape the frontend already expects.

interface FlatLog {
  id: string;
  deployment_id: string;
  deployment_name?: string;
  timestamp: string;
  level: string;
  message: string;
  stream: string;
}

function inferLevel(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('error') || m.includes('fail') || m.includes('❌')) return 'error';
  if (m.includes('warn') || m.includes('⚠')) return 'warn';
  return 'info';
}

function allLogs(): FlatLog[] {
  const deps = getDb().prepare('SELECT id, name, logs FROM cloud_deployments').all() as any[];
  const flat: FlatLog[] = [];
  for (const d of deps) {
    let entries: any[] = [];
    try { entries = JSON.parse(d.logs || '[]'); } catch { entries = []; }
    entries.forEach((e, i) => {
      const message = e?.message || '';
      flat.push({
        id: `${d.id}-${i}`,
        deployment_id: d.id,
        deployment_name: d.name,
        timestamp: e?.time || new Date().toISOString(),
        level: e?.level || inferLevel(message),
        message,
        stream: 'stdout',
      });
    });
  }
  flat.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return flat;
}

function paginateFromEnd<T>(items: T[], limit: number, offset: number): T[] {
  // Mirrors the previous "ORDER BY id DESC LIMIT ? OFFSET ?, then reverse"
  // behavior: newest-first paging, oldest-first display within the page.
  const end = Math.max(items.length - offset, 0);
  const start = Math.max(end - limit, 0);
  return items.slice(start, end);
}

router.get('/', requireAuth, (req, res: Response) => {
  const { deploymentId, level, limit = '100', offset = '0', search } = req.query;
  let logs = allLogs();

  if (deploymentId) logs = logs.filter(l => l.deployment_id === deploymentId);
  if (level && level !== 'all') logs = logs.filter(l => l.level === level);
  if (search) {
    const s = String(search).toLowerCase();
    logs = logs.filter(l => l.message.toLowerCase().includes(s));
  }

  const total = logs.length;
  const page = paginateFromEnd(logs, parseInt(limit as string) || 100, parseInt(offset as string) || 0);
  res.json({ logs: page, total });
});

router.get('/:deploymentId', requireAuth, (req, res: Response) => {
  const { level, limit = '200', offset = '0' } = req.query;
  let logs = allLogs().filter(l => l.deployment_id === req.params.deploymentId);
  if (level && level !== 'all') logs = logs.filter(l => l.level === level);
  const page = paginateFromEnd(logs, parseInt(limit as string) || 200, parseInt(offset as string) || 0);
  res.json(page);
});

router.delete('/:deploymentId', requireAuth, (req, res: Response) => {
  getDb().prepare("UPDATE cloud_deployments SET logs='[]', updated_at=datetime('now') WHERE id=?")
    .run(req.params.deploymentId);
  res.json({ ok: true });
});

router.get('/:deploymentId/stream', requireAuth, (req, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastCount = 0;
  let closed = false;
  req.on('close', () => { closed = true; clearInterval(interval); });

  const emitNew = () => {
    const row = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(req.params.deploymentId) as any;
    if (!row) return;
    let entries: any[] = [];
    try { entries = JSON.parse(row.logs || '[]'); } catch { entries = []; }
    if (entries.length > lastCount) {
      const newOnes = entries.slice(lastCount);
      newOnes.forEach((e, i) => {
        const message = e?.message || '';
        res.write(`data: ${JSON.stringify({
          id: `${req.params.deploymentId}-${lastCount + i}`,
          deployment_id: req.params.deploymentId,
          timestamp: e?.time || new Date().toISOString(),
          level: e?.level || inferLevel(message),
          message,
        })}\n\n`);
      });
      lastCount = entries.length;
    }
  };

  emitNew();
  const interval = setInterval(() => { if (!closed) emitNew(); }, 2000);
});

export default router;
