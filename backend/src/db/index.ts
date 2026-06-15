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

/* ---------------- DB PATH (DEV ONLY) ---------------- */

function getDbPath(): string {
  const dataDir = process.env.PODIUM_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'podium.db');
}

/* ---------------- TURSO CLIENT ---------------- */

async function initTurso() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) {
    console.log('[db] No Turso credentials → local only mode');
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
  _local.exec('PRAGMA synchronous = NORMAL');

  console.log(`[db] Local SQLite ready → ${dbPath}`);
}

/* ---------------- DB SHIM ---------------- */

function createDb(): SyncDb {
  return {
    exec(sql: string) {
      _local?.exec(sql);
      if (_turso) {
        _turso.executeMultiple(sql).catch(console.error);
      }
    },

    prepare(sql: string): SyncStatement {
      const localStmt = _local?.prepare(sql);

      const isWrite =
        /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

      return {
        get: (...args: any[]) => localStmt?.get(...args),
        all: (...args: any[]) => localStmt?.all(...args),

        run: (...args: any[]) => {
          const result = localStmt?.run(...args);

          // write-through to Turso ONLY for production sync
          if (isWrite && _turso) {
            _turso.execute({ sql, args }).catch(console.error);
          }

          return result;
        },
      };
    },
  };
}

/* ---------------- PUBLIC API ---------------- */

export function getDb(): SyncDb {
  if (!_local && !_turso) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return createDb();
}

/* ---------------- INIT ---------------- */

export async function initDb(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';

  // ALWAYS init Turso first (source of truth)
  await initTurso();

  // Local DB only for dev
  if (!isProd) {
    initLocal();
  }

  applySchema();
  applyDefaults();

  console.log('[db] Ready (Turso-first mode)');
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

  _local?.exec(sql);
  _turso?.executeMultiple(sql);
}

/* ---------------- DEFAULTS ---------------- */

function applyDefaults() {
  const defaults: [string, string][] = [
    ['platform_name', 'Podium'],
    ['groq_model', 'llama-3.3-70b-versatile'],
    ['app_url', 'http://localhost:3000'],
  ];

  const stmt = _local?.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  for (const [k, v] of defaults) {
    stmt?.run(k, v);
  }

  if (_turso) {
    for (const [k, v] of defaults) {
      _turso.execute({
        sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        args: [k, v],
      }).catch(console.error);
    }
  }
}