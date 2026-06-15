import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, AuthRequest } from '../auth';

const router = Router();

// ── Helper to create a notification ──────────────────────────────────────────
export function createNotification(
  userId: string,
  type: 'deployment' | 'anomaly' | 'build' | 'team' | 'cloud' | 'system',
  title: string,
  message: string,
  link?: string,
) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, type, title, message, link || null);
  } catch {}
}

// ── Broadcast to all users ────────────────────────────────────────────────────
export function broadcastNotification(
  type: 'deployment' | 'anomaly' | 'build' | 'team' | 'cloud' | 'system',
  title: string,
  message: string,
  link?: string,
) {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
    for (const u of users) createNotification(u.id, type, title, message, link);
  } catch {}
}

// GET /api/notifications
router.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string || '50');
  const unreadOnly = req.query.unread === 'true';

  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  if (unreadOnly) query += ' AND read = 0';
  query += ' ORDER BY created_at DESC LIMIT ?';

  const notifications = getDb().prepare(query).all(req.user!.sub, limit);
  const unreadCount = (getDb().prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.user!.sub) as { c: number }).c;

  res.json({ notifications, unreadCount });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.sub);
  res.json({ ok: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user!.sub);
  res.json({ ok: true });
});

// DELETE /api/notifications/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.sub);
  res.json({ ok: true });
});

// DELETE /api/notifications — clear all read
router.delete('/', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare('DELETE FROM notifications WHERE user_id = ? AND read = 1').run(req.user!.sub);
  res.json({ ok: true });
});

export default router;
