import crypto from 'crypto';

// Minimal, dependency-free TOTP (RFC 6238) implementation using HMAC-SHA1,
// 30s step, 6-digit codes — compatible with Google Authenticator / Authy / 1Password.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  return base32Encode(bytes);
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

export function generateTotp(secret: string, step = 30, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / step);
  return hotp(secret, counter);
}

/** Verifies a 6-digit code, allowing ±1 time step of clock drift. */
export function verifyTotp(secret: string, token: string, step = 30, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    if (hotp(secret, counter + errorWindow) === token) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, accountName: string, issuer = 'Podium'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
