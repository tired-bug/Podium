import { Router } from 'express';
import db from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT d.id, d.subdomain, d.deployment_id, d.port, d.created_at,
             dep.name as deployment_name, dep.status as deployment_status
      FROM domain_bindings d
      LEFT JOIN deployments dep ON dep.id = d.deployment_id
      ORDER BY d.created_at DESC
    `);
    const bindings = rows.map((r: any) => ({
      ...r,
      full_url: `http://${r.subdomain}.podium.local:${r.port}`,
    }));
    res.json(bindings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch domain bindings' });
  }
});

router.post('/', async (req, res) => {
  const { subdomain, deployment_id, port } = req.body;
  if (!subdomain || !deployment_id || !port) {
    return res.status(400).json({ error: 'subdomain, deployment_id, and port are required' });
  }
  const slug = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  try {
    const existing = await db.get('SELECT id FROM domain_bindings WHERE subdomain = ?', [slug]);
    if (existing) return res.status(409).json({ error: `Subdomain "${slug}" is already in use` });

    const id = `dom_${Date.now()}`;
    await db.run(
      'INSERT INTO domain_bindings (id, subdomain, deployment_id, port, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, slug, deployment_id, port, new Date().toISOString()]
    );
    res.status(201).json({ id, subdomain: slug, deployment_id, port });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create domain binding' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM domain_bindings WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete domain binding' });
  }
});

export default router;
