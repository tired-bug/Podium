import express from 'express';
import { initDb, ensureExtendedSchema } from '../db/index';
import authRouter from '../routes/auth';

let initialized = false;

/**
 * Builds a real Express app wired to a real (temp, throwaway) SQLite
 * database, without starting a listening HTTP server. This lets integration
 * tests exercise actual route handlers + actual SQL instead of mocking the
 * database, which is what makes them worth having.
 */
export async function buildTestApp() {
  if (!initialized) {
    await initDb();
    ensureExtendedSchema();
    initialized = true;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}
