import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { requireAuth, AuthRequest, hashPassword, comparePassword } from '../auth';

const router = Router();

router.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, email, role, last_login, created_at FROM users WHERE id = ?'
  ).get(req.user!.sub) as any;

  if (!user) return res.status(404).json({ error: 'User not found' });

  let profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user!.sub) as any;

  
  if (!profile) {
    db.prepare(`
      INSERT OR IGNORE INTO user_profiles (user_id, display_name)
      VALUES (?, ?)
    `).run(req.user!.sub, user.username);
    profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user!.sub) as any;
  }

  return res.json({ ...user, profile: profile || {} });
});

router.put('/', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const {
    display_name, bio, job_title, company, location, website,
    github_username, timezone, theme_preference,
    notification_email, notification_deployments, notification_anomalies, notification_team,
  } = req.body;

  
  db.prepare(`
    INSERT INTO user_profiles (
      user_id, display_name, bio, job_title, company, location, website,
      github_username, timezone, theme_preference,
      notification_email, notification_deployments, notification_anomalies, notification_team,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      bio = excluded.bio,
      job_title = excluded.job_title,
      company = excluded.company,
      location = excluded.location,
      website = excluded.website,
      github_username = excluded.github_username,
      timezone = excluded.timezone,
      theme_preference = excluded.theme_preference,
      notification_email = excluded.notification_email,
      notification_deployments = excluded.notification_deployments,
      notification_anomalies = excluded.notification_anomalies,
      notification_team = excluded.notification_team,
      updated_at = datetime('now')
  `).run(
    req.user!.sub, display_name || null, bio || null, job_title || null,
    company || null, location || null, website || null, github_username || null,
    timezone || 'Africa/Tunis', theme_preference || 'dark',
    notification_email ? 1 : 0, notification_deployments ? 1 : 0,
    notification_anomalies ? 1 : 0, notification_team ? 1 : 0,
  );

  
  const { username, email } = req.body;
  if (username || email) {
    const updates: string[] = [];
    const vals: any[] = [];
    if (username) { updates.push('username = ?'); vals.push(username); }
    if (email) { updates.push('email = ?'); vals.push(email); }
    if (updates.length) {
      vals.push(req.user!.sub);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }
  }

  res.json({ ok: true });
});

// Quick toggle used by the topbar user menu — doesn't require resending
// the whole profile form.
router.put('/status', requireAuth, (req: AuthRequest, res: Response) => {
  const { activity_status } = req.body;
  if (activity_status !== 'active' && activity_status !== 'away') {
    return res.status(400).json({ error: "activity_status must be 'active' or 'away'" });
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO user_profiles (user_id, activity_status, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET activity_status = excluded.activity_status, updated_at = datetime('now')
  `).run(req.user!.sub, activity_status);
  res.json({ ok: true, activity_status });
});

router.put('/avatar', requireAuth, (req: AuthRequest, res: Response) => {
  const { avatar } = req.body; 
  if (!avatar) return res.status(400).json({ error: 'avatar required' });

  
  if (avatar.length > 700_000) return res.status(400).json({ error: 'Image too large (max ~500KB)' });

  const db = getDb();
  db.prepare(`
    INSERT INTO user_profiles (user_id, avatar, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET avatar = excluded.avatar, updated_at = datetime('now')
  `).run(req.user!.sub, avatar);

  res.json({ ok: true });
});

router.delete('/avatar', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare("UPDATE user_profiles SET avatar = NULL, updated_at = datetime('now') WHERE user_id = ?")
    .run(req.user!.sub);
  res.json({ ok: true });
});

router.get('/sessions', requireAuth, (req: AuthRequest, res: Response) => {
  res.json([{
    id: 'current',
    device: req.headers['user-agent']?.split(' ').slice(-1)[0] || 'Unknown',
    ip: req.ip || '127.0.0.1',
    current: true,
    lastActive: new Date().toISOString(),
  }]);
});

export default router;
