import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../db/index';
import { signToken, hashPassword, comparePassword, requireAuth, requireRole, AuthRequest } from '../auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';

const router = Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

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

  // Require email verification (skip for admin accounts created before verification was added)
  if (user.email_verified === 0 && user.email_verification_token !== null) {
    return res.status(403).json({ error: 'Email not verified. Please check your inbox.' });
  }

  getDb()
    .prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")
    .run(user.id);

  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  return res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
});

// ── Signup ─────────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { username, email, password, inviteCode } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  const { userCount } = db.prepare('SELECT COUNT(*) AS userCount FROM users').get() as { userCount: number };
  const role: string = userCount === 0 ? 'admin' : 'developer';

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
    db.prepare("UPDATE invites SET used_by = 'pending', used_at = datetime('now') WHERE id = ?")
      .run(inviteId);
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    if (inviteId) {
      db.prepare("UPDATE invites SET used_by = NULL, used_at = NULL WHERE id = ?").run(inviteId);
    }
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  const id = uuidv4();
  const hash = await hashPassword(password);

  // First user (admin) is auto-verified; subsequent users need email verification
  const verificationToken = role === 'admin' ? null : generateToken();
  const verificationExpires = role === 'admin' ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const emailVerified = role === 'admin' ? 1 : 0;

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, email_verified, email_verification_token, email_verification_expires)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, email, hash, role, emailVerified, verificationToken, verificationExpires);

  if (inviteId) {
    db.prepare("UPDATE invites SET used_by = ? WHERE id = ?").run(id, inviteId);
  }

  if (role === 'admin') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_initialized', 'true')").run();
  }

  // Send verification email (non-blocking)
  if (verificationToken) {
    try {
      await sendVerificationEmail(email, verificationToken);
      console.log('[auth] Verification email dispatched to', email);
    } catch (err: any) {
      console.error('[auth] Failed to send verification email:', err?.message || err);
    }
    return res.status(201).json({ message: 'Account created. Please check your email to verify your account.' });
  }

  // Admin: auto-login
  const token = signToken({ sub: id, username, role });
  return res.status(201).json({
    token,
    user: { id, username, email, role },
  });
});

// ── Verify email ──────────────────────────────────────────────────────────────
router.post('/verify-email', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const user = getDb().prepare(`
    SELECT id FROM users
    WHERE email_verification_token = ?
      AND email_verified = 0
      AND email_verification_expires > datetime('now')
  `).get(token) as any;

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification token' });
  }

  getDb().prepare(`
    UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires = NULL
    WHERE id = ?
  `).run(user.id);

  return res.json({ ok: true, message: 'Email verified successfully' });
});

// ── Resend verification email ─────────────────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  // Always return 200 to avoid revealing whether email exists
  if (!email) return res.json({ ok: true });

  const user = getDb().prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0').get(email) as any;

  if (user) {
    const token = generateToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    getDb().prepare(`
      UPDATE users SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?
    `).run(token, expires, user.id);

    try {
      await sendVerificationEmail(email, token);
      console.log('[auth] Resend verification email dispatched to', email);
    } catch (err: any) {
      console.error('[auth] Failed to resend verification email:', err?.message || err);
    }
  }

  return res.json({ ok: true });
});

// ── Forgot password ───────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  // Always return 200 — do not reveal whether email exists
  if (!email) return res.json({ ok: true });

  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

  if (user) {
    const token = generateToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    getDb().prepare(`
      UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?
    `).run(token, expires, user.id);

    try {
      await sendPasswordResetEmail(email, token);
      console.log('[auth] Password reset email dispatched to', email);
    } catch (err: any) {
      console.error('[auth] Failed to send password reset email:', err?.message || err);
    }
  }

  return res.json({ ok: true });
});

// ── Reset password ────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = getDb().prepare(`
    SELECT id FROM users
    WHERE password_reset_token = ?
      AND password_reset_expires > datetime('now')
  `).get(token) as any;

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hash = await hashPassword(password);
  getDb().prepare(`
    UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?
  `).run(hash, user.id);

  return res.json({ ok: true, message: 'Password reset successfully' });
});

// ── Current user ─────────────────────────────────────────────────────────────
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
