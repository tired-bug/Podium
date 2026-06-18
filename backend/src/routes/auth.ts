import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { signToken, hashPassword, comparePassword, requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = getDb()
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, username) as any;

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  getDb()
    .prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")
    .run(user.id);

  // Role is always sourced from the database — never from the JWT payload alone
  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  return res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
});

// ── Signup ─────────────────────────────────────────────────────────────────────
// Role assignment rules:
//   - 0 existing users  → admin  (first account, always)
//   - 1+ existing users → developer  (subsequent accounts)
//   - viewer is NEVER assigned automatically; only manually by an admin
// Invite code is OPTIONAL:
//   - omitted / blank → account created, no team attachment
//   - provided        → validated, user attached to team referenced by invite
router.post('/signup', async (req, res) => {
  const { username, email, password, inviteCode } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  // ── Role: determined by existing user count, not by invite ──────────────────
  const { userCount } = db.prepare('SELECT COUNT(*) AS userCount FROM users').get() as { userCount: number };
  const role: string = userCount === 0 ? 'admin' : 'developer';

  // ── Invite code: optional — only process if non-empty ───────────────────────
  let inviteId: string | null = null;
  if (inviteCode && String(inviteCode).trim() !== '') {
    const trimmedCode = String(inviteCode).trim();
    const invite = db.prepare(`
      SELECT * FROM invites
      WHERE code = ? AND used_by IS NULL AND expires_at > datetime('now')
    `).get(trimmedCode) as any;

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }
    inviteId = invite.id;
    // Mark invite as pending until real user id is available
    db.prepare("UPDATE invites SET used_by = 'pending', used_at = datetime('now') WHERE id = ?")
      .run(inviteId);
  }

  // ── Duplicate check ──────────────────────────────────────────────────────────
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    // Roll back pending invite mark if we bail
    if (inviteId) {
      db.prepare("UPDATE invites SET used_by = NULL, used_at = NULL WHERE id = ?").run(inviteId);
    }
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  // ── Create user ──────────────────────────────────────────────────────────────
  const id = uuidv4();
  const hash = await hashPassword(password);
  db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, email, hash, role);

  // ── Finalize invite (point to real user id) ──────────────────────────────────
  if (inviteId) {
    db.prepare("UPDATE invites SET used_by = ? WHERE id = ?").run(id, inviteId);
  }

  // ── Mark app as initialized after first admin is created ─────────────────────
  if (role === 'admin') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_initialized', 'true')").run();
  }

  const token = signToken({ sub: id, username, role });
  return res.status(201).json({
    token,
    user: { id, username, email, role },
  });
});

// ── Current user ─────────────────────────────────────────────────────────────
// Role is always re-fetched from DB — JWT role is informational only
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  const user = getDb()
    .prepare('SELECT id, username, email, role, last_login, created_at FROM users WHERE id = ?')
    .get(req.user!.sub) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

// ── User management (admin only) ──────────────────────────────────────────────
router.get('/users', requireAuth, requireRole('admin'), (_req, res: Response) => {
  const users = getDb()
    .prepare('SELECT id, username, email, role, last_login, created_at FROM users ORDER BY created_at ASC')
    .all();
  res.json(users);
});

router.put('/users/:id/role', requireAuth, requireRole('admin'), (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!['admin', 'developer', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (req.params.id === req.user!.sub) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  const result = getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  return res.json({ ok: true });
});

router.delete('/users/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res: Response) => {
  if (req.params.id === req.user!.sub) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  getDb().prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

router.put('/password', requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.user!.sub) as any;

  const valid = await comparePassword(currentPassword, user.password_hash);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

  const hash = await hashPassword(newPassword);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user!.sub);
  return res.json({ ok: true });
});

export default router;
