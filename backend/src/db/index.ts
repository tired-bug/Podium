import path from 'path';
import fs from 'fs';

const _origEmit = process.emitWarning.bind(process);

(process as any).emitWarning = (msg: string, ...args: any[]) => {
  if (typeof msg === 'string' && msg.includes('SQLite')) return;
  _origEmit(msg, ...args);
};

interface SyncStatement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
}

interface SyncDb {
  prepare(sql: string): SyncStatement;
  exec(sql: string): void;
}

let _local: any = null;
let _turso: any = null;
let _writeQueue: Array<{ sql: string; params: any[] }> = [];
let _flushing = false;

function getDbPath(): string {
  const dir = process.env.PODIUM_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'podium.db');
}

async function flushQueue() {
  if (_flushing || !_turso || !_writeQueue.length) return;
  _flushing = true;

  const batch = [..._writeQueue];
  _writeQueue = [];

  try {
    await _turso.batch(
      batch.map(b => ({ sql: b.sql, args: b.params })),
      'write'
    );
  } catch (e) {
    _writeQueue = [...batch, ..._writeQueue];
  } finally {
    _flushing = false;
  }
}

setInterval(() => flushQueue().catch(() => {}), 500);

function createShim(local: any): SyncDb {
  return {
    exec(sql: string) {
      local.exec(sql);
      if (_turso) _turso.executeMultiple(sql).catch(() => {});
    },

    prepare(sql: string): SyncStatement {
      const isWrite = /^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql);
      const stmt = local.prepare(sql);

      return {
        get: (...p) => stmt.get(...p),
        all: (...p) => stmt.all(...p),
        run: (...p) => {
          const res = stmt.run(...p);
          if (isWrite && _turso) _writeQueue.push({ sql, params: p });
          return res;
        },
      };
    },
  };
}

export function getDb(): SyncDb {
  if (!_local) throw new Error('DB not initialized');
  return createShim(_local);
}

export async function initDb() {
  const sqlite = require('node:sqlite');

  _local = new sqlite.DatabaseSync(getDbPath());

  _local.exec('PRAGMA journal_mode = WAL');
  _local.exec('PRAGMA foreign_keys = ON');

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    try {
      const { createClient } = require('@libsql/client');
      _turso = createClient({ url: tursoUrl, authToken: tursoToken });
    } catch {}
  }

  applySchema();
  applyDefaults();

  console.log('[db] ready');
}

function applySchema() {
  _local.exec(`
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
      repo_url TEXT,
      branch TEXT DEFAULT 'main',
      status TEXT DEFAULT 'pending',
      container_id TEXT,
      image TEXT,
      ports TEXT DEFAULT '[]',
      env_vars TEXT DEFAULT '[]',
      memory_limit TEXT DEFAULT '512m',
      cpu_limit TEXT DEFAULT '0.5',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cloud_deployments (
      id TEXT PRIMARY KEY,
      provider TEXT,
      name TEXT,
      region TEXT,
      status TEXT,
      url TEXT,
      config TEXT DEFAULT '{}',
      logs TEXT DEFAULT '[]',
      docker_image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT,
      timestamp INTEGER,
      cpu REAL,
      memory REAL,
      network_in REAL,
      network_out REAL
    );

    CREATE TABLE IF NOT EXISTS build_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT,
      level TEXT,
      message TEXT,
      stream TEXT DEFAULT 'stdout',
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function applyDefaults() {
  const stmt = _local.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  stmt.run('app_url', 'http://localhost:4000');
  stmt.run('platform_name', 'Podium');
  stmt.run('cpu_threshold', '90');
  stmt.run('memory_threshold_mb', '900');
  stmt.run('anomaly_detection', 'true');
}

function applyExtendedSchema() {}
function migrateModels() {}
function seedDemoData() {}
export function ensureExtendedSchema() {}