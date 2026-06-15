import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();

// ── Email helper ──────────────────────────────────────────────────────────────
async function sendInviteEmail(
  toEmail: string,
  code: string,
  role: string,
  inviterName: string,
  expiresAt: string,
): Promise<void> {
  const db = getDb();
  const getSetting = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any)?.value || '';

  const host     = getSetting('smtp_host');
  const port     = parseInt(getSetting('smtp_port') || '587');
  const user     = getSetting('smtp_user');
  const pass     = getSetting('smtp_pass');
  const fromName = getSetting('platform_name') || 'Podium';
  const fromAddr = getSetting('smtp_from') || user;
  const appUrl   = getSetting('app_url') || 'http://localhost:4000';

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Add SMTP settings in Settings → Notifications.');
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  const signupLink = `${appUrl}/login?invite=${code}&mode=signup`;
  const expires    = new Date(expiresAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  await transporter.sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to: toEmail,
    subject: `${inviterName} invited you to ${fromName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050508; margin: 0; padding: 40px 20px; }
        .card { max-width: 500px; margin: 0 auto; background: #0f0f1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; }
        .banner { height: 6px; background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899); }
        .body { padding: 36px 40px; }
        h1 { color: #f0f0ff; font-size: 22px; margin: 0 0 8px; font-weight: 800; }
        p { color: #9090b8; font-size: 14px; line-height: 1.7; margin: 0 0 20px; }
        .role { display: inline-block; background: rgba(99,102,241,0.2); color: #818cf8; padding: 3px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; border: 1px solid rgba(99,102,241,0.3); text-transform: capitalize; }
        .btn { display: block; background: linear-gradient(135deg,#6366f1,#a855f7); color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; text-align: center; margin: 28px 0; }
        .code { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 20px; color: #f0f0ff; letter-spacing: 0.1em; text-align: center; margin: 16px 0; }
        .footer { color: #484F58; font-size: 12px; margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); }
      </style></head>
      <body>
        <div class="card">
          <div class="banner"></div>
          <div class="body">
            <h1>⚡ You're invited to Podium</h1>
            <p><strong style="color:#f0f0ff">${inviterName}</strong> has invited you to join their team as a <span class="role">${role}</span></p>
            <p>Click the button below to create your account:</p>
            <a href="${signupLink}" class="btn">Accept Invitation →</a>
            <p style="margin-bottom:4px;font-size:12px;color:#5a5a7a">Or use this invite code manually:</p>
            <div class="code">${code}</div>
            <div class="footer">
              This invitation expires on ${expires}.<br>
              If you weren't expecting this, you can safely ignore this email.
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}

// GET /api/invites [admin]
router.get('/', requireAuth, requireRole('admin'), (_req, res: Response) => {
  const invites = getDb().prepare(`
    SELECT i.*, u1.username as created_by_username, u2.username as used_by_username
    FROM invites i
    LEFT JOIN users u1 ON i.created_by = u1.id
    LEFT JOIN users u2 ON i.used_by = u2.id
    ORDER BY i.created_at DESC
  `).all();
  res.json(invites);
});

// POST /api/invites [admin]
router.post('/', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { role = 'viewer', expiryHours = 48, email } = req.body;

  if (!['admin', 'developer', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const id       = uuidv4();
  const code     = uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase();
  const expiresAt = new Date(Date.now() + expiryHours * 3_600_000).toISOString();

  getDb().prepare(`
    INSERT INTO invites (id, code, role, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, code, role, req.user!.sub, expiresAt);

  const invite = getDb().prepare('SELECT * FROM invites WHERE id = ?').get(id) as any;

  // Send email if address provided
  let emailSent = false;
  let emailError: string | null = null;

  if (email && email.includes('@')) {
    const inviter = getDb().prepare('SELECT username FROM users WHERE id = ?').get(req.user!.sub) as any;
    try {
      await sendInviteEmail(email, code, role, inviter?.username || 'Your admin', expiresAt);
      emailSent = true;
    } catch (err: any) {
      emailError = err.message;
    }
  }

  return res.status(201).json({
    ...invite,
    link: `podium://invite/${code}`,
    emailSent,
    emailError,
  });
});

// DELETE /api/invites/:id [admin]
router.delete('/:id', requireAuth, requireRole('admin'), (req, res: Response) => {
  getDb().prepare('DELETE FROM invites WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/invites/validate/:code [public]
router.get('/validate/:code', (req, res: Response) => {
  const invite = getDb().prepare(
    'SELECT code, role, expires_at, used_by FROM invites WHERE code = ?'
  ).get(req.params.code) as any;

  if (!invite)               return res.json({ valid: false, reason: 'Invalid code' });
  if (invite.used_by)        return res.json({ valid: false, reason: 'Already used' });
  if (new Date(invite.expires_at) < new Date()) return res.json({ valid: false, reason: 'Expired' });

  return res.json({ valid: true, role: invite.role, expiresAt: invite.expires_at });
});

// POST /api/invites/send-email [admin] — resend email for existing invite
router.post('/:id/send-email', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const invite = getDb().prepare('SELECT * FROM invites WHERE id = ?').get(req.params.id) as any;
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  const inviter = getDb().prepare('SELECT username FROM users WHERE id = ?').get(req.user!.sub) as any;

  try {
    await sendInviteEmail(email, invite.code, invite.role, inviter?.username || 'Your admin', invite.expires_at);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
