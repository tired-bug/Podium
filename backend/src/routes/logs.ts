import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth } from '../auth';

const router = Router();

router.get('/', requireAuth, (req, res: Response) => {
  const { deploymentId, level, limit = '100', offset = '0', search } = req.query;
  let query = `
    SELECT l.*, d.name as deployment_name
    FROM build_logs l
    JOIN deployments d ON l.deployment_id = d.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (deploymentId) { query += ' AND l.deployment_id = ?'; params.push(deploymentId); }
  if (level && level !== 'all') { query += ' AND l.level = ?'; params.push(level); }
  if (search) { query += ' AND l.message LIKE ?'; params.push(`%${search}%`); }

  const totalRow = getDb().prepare(query.replace('l.*, d.name as deployment_name', 'COUNT(*) as total')).get(...params) as any;

  query += ` ORDER BY l.id DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const logs = getDb().prepare(query).all(...params);
  res.json({ logs: logs.reverse(), total: totalRow?.total || 0 });
});

router.get('/:deploymentId', requireAuth, (req, res: Response) => {
  const { level, limit = '200', offset = '0' } = req.query;
  let query = 'SELECT * FROM build_logs WHERE deployment_id = ?';
  const params: any[] = [req.params.deploymentId];

  if (level && level !== 'all') { query += ' AND level = ?'; params.push(level); }
  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit as string), parseInt(offset as string));

  const logs = getDb().prepare(query).all(...params);
  res.json(logs.reverse());
});

router.delete('/:deploymentId', requireAuth, (req, res: Response) => {
  getDb().prepare('DELETE FROM build_logs WHERE deployment_id = ?').run(req.params.deploymentId);
  res.json({ ok: true });
});

router.get('/:deploymentId/stream', requireAuth, (req, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastId = 0;
  let closed = false;
  req.on('close', () => { closed = true; clearInterval(interval); });

  
  const initial = getDb().prepare(
    'SELECT * FROM build_logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 100'
  ).all(req.params.deploymentId) as any[];

  if (initial.length > 0) {
    lastId = initial[0].id;
    const reversed = [...initial].reverse();
    for (const log of reversed) {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    }
  }

  const interval = setInterval(() => {
    if (closed) return;
    const newLogs = getDb().prepare(
      'SELECT * FROM build_logs WHERE deployment_id = ? AND id > ? ORDER BY id ASC LIMIT 50'
    ).all(req.params.deploymentId, lastId) as any[];

    if (newLogs.length > 0) {
      lastId = (newLogs[newLogs.length - 1] as any).id;
      for (const log of newLogs) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }
    }
  }, 2000);
});

export default router;
