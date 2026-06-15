import path from 'path';
import fs from 'fs';

interface SyncStatement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): any;
}

interface SyncDb {
  prepare(sql: string): SyncStatement;
  exec(sql: string): void;
}

let _local: any = null;
let _turso: any = null;

/* ---------------- EXTENDED SCHEMA EXPORT ---------------- */

export function ensureExtendedSchema(): void {
  applyExtendedSchema();
}

/* ---------------- DB PATH (DEV ONLY) ---------------- */

function getDbPath(): string {
  const dataDir = process.env.PODIUM_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'podium.db');
}

/* ---------------- TURSO INIT ---------------- */

async function initTurso() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) {
    console.log('[db] No Turso → local dev mode only');
    return;
  }

  const { createClient } = require('@libsql/client');

  _turso = createClient({
    url: tursoUrl,
    authToken: tursoToken,
  });

  console.log('[turso] Connected ✓');
}

/* ---------------- LOCAL SQLITE (DEV ONLY) ---------------- */

function initLocal() {
  const sqlite = require('node:sqlite');
  const dbPath = getDbPath();

  _local = new sqlite.DatabaseSync(dbPath);
  _local.exec('PRAGMA journal_mode = WAL');
  _local.exec('PRAGMA foreign_keys = ON');

  console.log(`[db] Local SQLite → ${dbPath}`);
}

/* ---------------- DB LAYER (IMPORTANT FIX) ---------------- */

function createDb(): SyncDb {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    exec(sql: string) {
      // DEV ONLY: local schema sync
      if (!isProd) _local?.exec(sql);

      // ALWAYS: apply to Turso if available
      if (_turso) {
        _turso.executeMultiple(sql).catch(console.error);
      }
    },

    prepare(sql: string): SyncStatement {
      const localStmt = _local?.prepare(sql);

      const isWrite =
        /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

      return {
        get: (...args: any[]) => {
          if (!isProd) return localStmt?.get(...args);
          return null;
        },

        all: (...args: any[]) => {
          if (!isProd) return localStmt?.all(...args);
          return [];
        },

        run: (...args: any[]) => {
          let result = null;

          // 🔥 SINGLE SOURCE OF TRUTH = TURSO
          if (_turso) {
            result = _turso.execute({ sql, args }).catch(console.error);
          } else if (!isProd) {
            result = localStmt?.run(...args);
          }

          return result;
        },
      };
    },
  };
}

/* ---------------- PUBLIC API ---------------- */

export function getDb(): SyncDb {
  if (!_turso && !process.env.NODE_ENV) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return createDb();
}

/* ---------------- INIT ---------------- */

export async function initDb(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';

  await initTurso();

  if (!isProd) {
    initLocal();
  }

  applySchema();
  applyDefaults();
  applyExtendedSchema();

  console.log('[db] Ready (Turso-first)');
}

/* ---------------- SCHEMA ---------------- */

function applySchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT DEFAULT 'viewer',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      status TEXT,
      repo_url TEXT,
      branch TEXT,
      image TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `;

  // DEV only local schema
  _local?.exec(sql);

  // PROD source of truth
  _turso?.executeMultiple(sql).catch(console.error);
}

/* ---------------- DEFAULTS ---------------- */

function applyDefaults() {
  const defaults: [string, string][] = [
    ['platform_name', 'Podium'],
    ['groq_model', 'llama-3.3-70b-versatile'],
    ['app_url', 'http://localhost:3000'],
  ];

  for (const [k, v] of defaults) {
    if (_turso) {
      _turso.execute({
        sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        args: [k, v],
      }).catch(console.error);
    } else {
      _local?.prepare(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
      ).run(k, v);
    }
  }
}

/* ---------------- EXTENSION HOOK ---------------- */

function applyExtendedSchema() {
  // safe placeholder for future migrations
}