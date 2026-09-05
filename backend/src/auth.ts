import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from './db/index';

// ── CRITICAL: Fail fast if JWT_SECRET is missing in production ─────────────
// A hardcoded fallback secret means anyone who reads the source (or the
// public GitHub repo) can forge valid tokens for any user, including admins.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[auth] FATAL: JWT_SECRET must be set in production.');
  console.error('[auth] Refusing to start with a default/guessable secret.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || 'podium-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyToken(token);
    
    const user = getDb().prepare('SELECT id, role FROM users WHERE id = ?').get(payload.sub) as { id: string; role: string } | undefined;
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = { ...payload, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
