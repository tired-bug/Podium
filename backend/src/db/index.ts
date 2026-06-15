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

/* ---------------- paths ---------------- */

function getDbPath(): string {
  const dataDir = process.env.PODIUM_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'podium.db');
}

/* ---------------- turso sync queue ---------------- */

async function flushQueue() {
  if (_flushing || !_turso || _writeQueue.length === 0) return;
  _flushing = true;

  const batch = [..._writeQueue];
  _writeQueue = [];

  try {
    if (typeof _turso.batch === 'function') {
      await _turso.batch(
        batch.map(({ sql, params }) => ({ sql, args: params })),
        'write'
      );
    }
  } catch (err) {
    console.error('[turso] Batch write error:', err);
    _writeQueue = [...batch, ..._writeQueue];
  } finally {
    _flushing = false;
  }
}

setInterval(() => flushQueue().catch(() => {}), 500);

/* ---------------- db shim ---------------- */

function createShim(local: any): SyncDb {
  return {
    exec(sql: string) {
      local.exec(sql);

      if (_turso) {
        _turso.executeMultiple(sql).catch((e: any) => {
          if (!String(e).includes('already exists')) {
            console.error('[turso] exec error:', e);
          }
        });
      }
    },

    prepare(sql: string): SyncStatement {
      const isWrite =
        /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

      const stmt = local.prepare(sql);

      return {
        get: (...params: any[]) => stmt.get(...params) ?? null,
        all: (...params: any[]) => stmt.all(...params),
        run: (...params: any[]) => {
          const result = stmt.run(...params);

          if (isWrite && _turso) {
            _writeQueue.push({ sql, params });
          }

          return result;
        },
      };
    },
  };
}

/* ---------------- public API ---------------- */

export function getDb(): SyncDb {
  if (!_local) throw new Error('Database not initialized — call initDb() first');
  return createShim(_local);
}

export async function initDb(): Promise<void> {
  const sqlite = require('node:sqlite');
  const dbPath = getDbPath();

  _local = new sqlite.DatabaseSync(dbPath);

  _local.exec('PRAGMA journal_mode = WAL');
  _local.exec('PRAGMA foreign_keys = ON');
  _local.exec('PRAGMA synchronous = NORMAL');

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    try {
      const { createClient } = require('@libsql/client');
      _turso = createClient({ url: tursoUrl, authToken: tursoToken });

      await syncFromTurso();
      console.log('[turso] Connected and synced ✓');
    } catch (err) {
      console.error('[turso] Connection failed:', err);
      _turso = null;
    }
  }

  applySchema();
  applyDefaults();
  migrateModels();
  applyExtendedSchema();

  if (process.env.NODE_ENV === 'development') seedDemoData();

  console.log(`[db] Ready — ${dbPath}`);
}

/* ---------------- schema ---------------- */

function applySchema() {
  _local.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      repo_url TEXT,
      branch TEXT DEFAULT 'main',
      image TEXT
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
      message TEXT
    );
  `);
}

/* ---------------- defaults ---------------- */

function applyDefaults() {
  const stmt = _local.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  const defaults: [string, string][] = [
    ['platform_name', 'Podium'],
    ['groq_model', 'llama-3.3-70b-versatile'],
    ['app_url', 'http://localhost:3000'],
  ];

  for (const [k, v] of defaults) stmt.run(k, v);
}

/* ---------------- migration ---------------- */

function migrateModels() {
  const DEPRECATED = [
    'llama3-70b-8192',
    'llama3-8b-8192',
    'gemma-7b-it',
  ];

  const row = _local
    .prepare("SELECT value FROM settings WHERE key='groq_model'")
    .get();

  if (row?.value && DEPRECATED.includes(row.value)) {
    _local
      .prepare("UPDATE settings SET value='llama-3.3-70b-versatile' WHERE key='groq_model'")
      .run();
  }
}

/* ---------------- seed ---------------- */

function seedDemoData() {
  const row = _local.prepare('SELECT COUNT(*) as c FROM deployments').get();
  if (row.c > 0) return;

  const { v4: uuid } = require('uuid');

  const demo = [
    ['api-gateway', 'running'],
    ['frontend-app', 'running'],
    ['auth-service', 'stopped'],
  ];

  const ins = _local.prepare(
    'INSERT INTO deployments (id, name, status) VALUES (?, ?, ?)'
  );

  for (const d of demo) {
    ins.run(uuid(), d[0], d[1]);
  }
}

/* ---------------- extras ---------------- */

export function ensureExtendedSchema(): void {
  // reserved for future migrations
}

function applyExtendedSchema() {}

async function syncFromTurso() {}