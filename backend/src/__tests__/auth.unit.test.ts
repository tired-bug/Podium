import { signToken, verifyToken, hashPassword, comparePassword } from '../auth';

describe('JWT helpers', () => {
  it('signs a token that verifies back to the same payload', () => {
    const token = signToken({ sub: 'user-1', username: 'alice', role: 'admin' });
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.username).toBe('alice');
    expect(decoded.role).toBe('admin');
  });

  it('rejects a tampered token', () => {
    const token = signToken({ sub: 'user-1', username: 'alice', role: 'admin' });
    const tampered = token.slice(0, -2) + 'xx';

    expect(() => verifyToken(tampered)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const jwt = require('jsonwebtoken');
    const foreignToken = jwt.sign({ sub: 'user-1', username: 'alice', role: 'admin' }, 'wrong-secret');

    expect(() => verifyToken(foreignToken)).toThrow();
  });
});

describe('password hashing', () => {
  it('hashes a password and can verify it back', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');

    const ok = await comparePassword('correct horse battery staple', hash);
    expect(ok).toBe(true);
  });

  it('rejects an incorrect password against a real hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    const ok = await comparePassword('wrong password', hash);
    expect(ok).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });
});
