import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth } from '../auth';

const router = Router();

router.get('/', requireAuth, (req, res: Response) => {
  const from = req.query.from ? parseInt(req.query.from as string) : Date.now() - 5 * 60 * 1000;
  const to = req.query.to ? parseInt(req.query.to as string) : Date.now();

  const metrics = getDb().prepare(`
    SELECT m.*, d.name as deployment_name
    FROM metrics m
    JOIN deployments d ON m.deployment_id = d.id
    WHERE m.timestamp BETWEEN ? AND ?
    ORDER BY m.deployment_id, m.timestamp ASC
  `).all(from, to);

  res.json(metrics);
});

router.get('/:id', requireAuth, (req, res: Response) => {
  const from = req.query.from ? parseInt(req.query.from as string) : Date.now() - 3600 * 1000;
  const to = req.query.to ? parseInt(req.query.to as string) : Date.now();
  const resolution = req.query.resolution as string || 'raw';

  let metrics;

  if (resolution === '1m') {
    metrics = getDb().prepare(`
      SELECT
        (timestamp / 60000) * 60000 as timestamp,
        AVG(cpu) as cpu,
        AVG(memory) as memory,
        AVG(network_in) as network_in,
        AVG(network_out) as network_out,
        deployment_id
      FROM metrics
      WHERE deployment_id = ? AND timestamp BETWEEN ? AND ?
      GROUP BY (timestamp / 60000)
      ORDER BY timestamp ASC
    `).all(req.params.id, from, to);
  } else if (resolution === '5m') {
    metrics = getDb().prepare(`
      SELECT
        (timestamp / 300000) * 300000 as timestamp,
        AVG(cpu) as cpu,
        AVG(memory) as memory,
        AVG(network_in) as network_in,
        AVG(network_out) as network_out,
        deployment_id
      FROM metrics
      WHERE deployment_id = ? AND timestamp BETWEEN ? AND ?
      GROUP BY (timestamp / 300000)
      ORDER BY timestamp ASC
    `).all(req.params.id, from, to);
  } else {
    metrics = getDb().prepare(`
      SELECT * FROM metrics
      WHERE deployment_id = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `).all(req.params.id, from, to);
  }

  
  const latest = getDb().prepare(`
    SELECT * FROM metrics WHERE deployment_id = ? ORDER BY timestamp DESC LIMIT 1
  `).get(req.params.id) as any;

  res.json({ metrics, latest: latest || null });
});

export default router;
