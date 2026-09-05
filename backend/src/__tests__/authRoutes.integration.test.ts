import request from 'supertest';
import { buildTestApp } from './testApp';

describe('POST /api/auth/signup', () => {
  it('creates the first account as admin and returns a token', async () => {
    const app = await buildTestApp();
    const res = await request(app).post('/api/auth/signup').send({
      username: 'admin-user',
      email: 'admin@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin-user');
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const app = await buildTestApp();
    const res = await request(app).post('/api/auth/signup').send({
      username: 'shortpw',
      email: 'shortpw@example.com',
      password: 'abc123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8/i);
  });

  it('rejects a duplicate username/email', async () => {
    const app = await buildTestApp();
    await request(app).post('/api/auth/signup').send({
      username: 'dupe',
      email: 'dupe@example.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/signup').send({
      username: 'dupe',
      email: 'dupe@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(409);
  });

  it('assigns the developer role to the second account, not admin', async () => {
    const app = await buildTestApp();
    // First account in this DB run.
    await request(app).post('/api/auth/signup').send({
      username: 'first-user',
      email: 'first@example.com',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/signup').send({
      username: 'second-user',
      email: 'second@example.com',
      password: 'password123',
    });

    expect(res.body.user.role).toBe('developer');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const app = await buildTestApp();
    await request(app).post('/api/auth/signup').send({
      username: 'login-user',
      email: 'login@example.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/login').send({
      username: 'login-user',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects an incorrect password', async () => {
    const app = await buildTestApp();
    await request(app).post('/api/auth/signup').send({
      username: 'wrongpw-user',
      email: 'wrongpw@example.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/login').send({
      username: 'wrongpw-user',
      password: 'not-the-password',
    });

    expect(res.status).toBe(401);
  });

  it('rejects a login for a username that does not exist', async () => {
    const app = await buildTestApp();
    const res = await request(app).post('/api/auth/login').send({
      username: 'nobody-here',
      password: 'password123',
    });

    expect(res.status).toBe(401);
  });

  it('rejects a request missing password', async () => {
    const app = await buildTestApp();
    const res = await request(app).post('/api/auth/login').send({ username: 'x' });
    expect(res.status).toBe(400);
  });
});
