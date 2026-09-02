import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { signToken, hashPassword } from '../auth';

const router = Router();

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

type Provider = 'github' | 'google';

// ── In-memory CSRF state store ──────────────────────────────────────────────
// Short-lived (5 min) and single-instance, same assumption the rest of the
// app already makes for things like in-flight email verification tokens.
const pendingStates = new Map<string, { provider: Provider; expires: number }>();
function makeState(provider: Provider): string {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { provider, expires: Date.now() + 5 * 60 * 1000 });
  return state;
}
function consumeState(state: string | undefined, provider: Provider): boolean {
  if (!state) return false;
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || entry.provider !== provider) return false;
  return entry.expires >= Date.now();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (v.expires < now) pendingStates.delete(k);
}, 10 * 60 * 1000).unref();

// ── Provider config ──────────────────────────────────────────────────────────
function isConfigured(provider: Provider): boolean {
  if (provider === 'github') return !!(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function callbackBase(req: Request): string {
  if (process.env.OAUTH_CALLBACK_BASE) return process.env.OAUTH_CALLBACK_BASE.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  return `${proto}://${host}`;
}

function redirectUri(req: Request, provider: Provider): string {
  return `${callbackBase(req)}/api/auth/oauth/${provider}/callback`;
}

function failRedirect(res: Response, message: string) {
  res.redirect(`${FRONTEND_URL}/oauth-callback?error=${encodeURIComponent(message)}`);
}

// ── GET /api/auth/oauth/providers — lets the frontend hide buttons for
//    providers that haven't been configured with credentials. ────────────────
router.get('/providers', (_req, res) => {
  res.json({ github: isConfigured('github'), google: isConfigured('google') });
});

// ── GET /api/auth/oauth/:provider — kick off the redirect to the provider ───
router.get('/:provider', (req: Request, res: Response) => {
  const provider = req.params.provider as Provider;
  if (provider !== 'github' && provider !== 'google') {
    return res.status(404).json({ error: 'Unknown provider' });
  }
  if (!isConfigured(provider)) {
    return failRedirect(res, `${provider === 'github' ? 'GitHub' : 'Google'} sign-in isn't configured on this server`);
  }

  const state = makeState(provider);
  const redirect = redirectUri(req, provider);

  if (provider === 'github') {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', state);
    return res.redirect(url.toString());
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_OAUTH_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return res.redirect(url.toString());
});

// ── Helpers to find/create the local user record ────────────────────────────
async function ensureUniqueUsername(base: string): Promise<string> {
  const db = getDb();
  const cleaned = base.toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'user';
  let candidate = cleaned;
  let n = 0;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(candidate)) {
    n += 1;
    candidate = `${cleaned}${n}`;
  }
  return candidate;
}

async function findOrCreateOAuthUser(opts: {
  provider: Provider; providerId: string; email: string | null; suggestedUsername: string; avatarUrl?: string | null;
}) {
  const db = getDb();

  // 1. Already linked to this provider account
  let user = db.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?')
    .get(opts.provider, opts.providerId) as any;
  if (user) return user;

  // 2. An existing (password-based) account with the same email — link accounts
  //    instead of creating a duplicate.
  if (opts.email) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(opts.email) as any;
    if (user) {
      db.prepare('UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?')
        .run(opts.provider, opts.providerId, user.id);
      return { ...user, oauth_provider: opts.provider, oauth_id: opts.providerId };
    }
  }

  // 3. Brand new account
  const { userCount } = db.prepare('SELECT COUNT(*) AS userCount FROM users').get() as { userCount: number };
  const role = userCount === 0 ? 'admin' : 'developer';
  const username = await ensureUniqueUsername(opts.suggestedUsername);
  const id = uuidv4();
  // OAuth accounts sign in through the provider only — this password is
  // random and never surfaced, it just satisfies the NOT NULL column.
  const hash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  const email = opts.email || `${username}@users.noreply.podium.local`;

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, email_verified, oauth_provider, oauth_id)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, username, email, hash, role, opts.provider, opts.providerId);

  if (opts.avatarUrl) {
    db.prepare(`
      INSERT INTO user_profiles (user_id, avatar, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET avatar = excluded.avatar, updated_at = datetime('now')
    `).run(id, opts.avatarUrl);
  }

  if (role === 'admin') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_initialized', 'true')").run();
  }

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
}

function completeLogin(res: Response, user: any) {
  getDb().prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  res.redirect(`${FRONTEND_URL}/oauth-callback?token=${encodeURIComponent(token)}`);
}

// ── GET /api/auth/oauth/github/callback ─────────────────────────────────────
router.get('/github/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return failRedirect(res, 'GitHub sign-in was cancelled');
  if (!code || !consumeState(state, 'github')) return failRedirect(res, 'Invalid or expired sign-in request');

  try {
    const tokenResp = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(req, 'github'),
    }, { headers: { Accept: 'application/json' } });

    const accessToken = tokenResp.data?.access_token;
    if (!accessToken) return failRedirect(res, 'GitHub did not return an access token');

    const ghHeaders = {
      Authorization: `token ${accessToken}`,
      'User-Agent': 'Podium/4.0',
      Accept: 'application/vnd.github+json',
    };
    const { data: profile } = await axios.get('https://api.github.com/user', { headers: ghHeaders });

    let email: string | null = profile.email || null;
    if (!email) {
      const { data: emails } = await axios.get('https://api.github.com/user/emails', { headers: ghHeaders });
      const primary = (emails || []).find((e: any) => e.primary && e.verified) || (emails || []).find((e: any) => e.verified);
      email = primary?.email || null;
    }

    const user = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: String(profile.id),
      email,
      suggestedUsername: profile.login || `gh-${profile.id}`,
      avatarUrl: profile.avatar_url || null,
    });

    completeLogin(res, user);
  } catch (e: any) {
    console.error('[oauth:github] callback failed:', e?.response?.data || e.message);
    failRedirect(res, 'GitHub sign-in failed');
  }
});

// ── GET /api/auth/oauth/google/callback ─────────────────────────────────────
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return failRedirect(res, 'Google sign-in was cancelled');
  if (!code || !consumeState(state, 'google')) return failRedirect(res, 'Invalid or expired sign-in request');

  try {
    const tokenResp = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(req, 'google'),
      grant_type: 'authorization_code',
    });

    const accessToken = tokenResp.data?.access_token;
    if (!accessToken) return failRedirect(res, 'Google did not return an access token');

    const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profile.email_verified && profile.email_verified !== undefined) {
      return failRedirect(res, 'Your Google email is not verified');
    }

    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: String(profile.sub),
      email: profile.email || null,
      suggestedUsername: (profile.email ? profile.email.split('@')[0] : profile.name) || `google-${profile.sub}`,
      avatarUrl: profile.picture || null,
    });

    completeLogin(res, user);
  } catch (e: any) {
    console.error('[oauth:google] callback failed:', e?.response?.data || e.message);
    failRedirect(res, 'Google sign-in failed');
  }
});

export default router;
