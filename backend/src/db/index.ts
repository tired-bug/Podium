import path from 'path';
import fs from 'fs';

// Suppress Node.js sqlite experimental warnings
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
let _useTurso = false;

function getDbPath(): string {
  const dataDir = process.env.PODIUM_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'podium.db');
}

async function flushQueue() {
  if (_flushing || !_turso || _writeQueue.length === 0) return;
  _flushing = true;
  const batch = [..._writeQueue];
  _writeQueue = [];
  try {
    await _turso.batch(
      batch.map(({ sql, params }) => ({ sql, args: params })),
      'write'
    );
  } catch (err) {
    console.error('[turso] Batch write error:', err);
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
      if (_turso && _useTurso) {
        _turso.executeMultiple(sql).catch((e: any) => {
          if (!String(e).includes('already exists') && !String(e).includes('duplicate column')) {
            console.error('[turso] exec error:', e);
          }
        });
      }
    },
    prepare(sql: string): SyncStatement {
      const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);
      const localStmt = local.prepare(sql);

      return {
        get(...params: any[]) {
          return localStmt.get(...params) ?? null;
        },
        all(...params: any[]) {
          return localStmt.all(...params);
        },
        run(...params: any[]) {
          const result = localStmt.run(...params);
          if (isWrite && _turso && _useTurso) {
            _writeQueue.push({ sql, params });
          }
          return result;
        },
      };
    },
  };
}

export function getDb(): SyncDb {
  if (!_local) throw new Error('Database not initialized — call initDb() first');
  return createShim(_local);
}

export async function initDb(): Promise<void> {
  const tursoUrl   = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // ── CRITICAL: Fail fast if Turso env vars are missing in production ──────
  if (process.env.NODE_ENV === 'production' && (!tursoUrl || !tursoToken)) {
    console.error('[db] FATAL: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in production.');
    console.error('[db] Refusing to start with local SQLite in production — data would be lost on redeploy.');
    process.exit(1);
  }

  const sqlite = require('node:sqlite');
  const dbPath = getDbPath();
  _local = new sqlite.DatabaseSync(dbPath);
  _local.exec('PRAGMA journal_mode = WAL');
  _local.exec('PRAGMA foreign_keys = ON');
  _local.exec('PRAGMA synchronous = NORMAL');

  // Local schema must exist BEFORE we sync from Turso, otherwise every
  // INSERT OR REPLACE during sync fails with "no such table" and is
  // silently swallowed, leaving the local DB empty even though Turso has data.
  applySchema();
  applyMigrations();

  if (tursoUrl && tursoToken) {
    try {
      const { createClient } = require('@libsql/client');
      _turso = createClient({ url: tursoUrl, authToken: tursoToken });

      // Verify connection works
      await _turso.execute('SELECT 1');
      _useTurso = true;

      console.log('[db] ✓ Turso connection established');
      console.log(`[db] Database URL: ${tursoUrl}`);

      // Apply schema to Turso first so tables exist before we sync
      await applySchemaToTurso();
      await syncFromTurso();
      console.log('[turso] ✓ Synced from Turso');
    } catch (err) {
      console.error('[turso] ✗ Connection failed:', err);
      if (process.env.NODE_ENV === 'production') {
        console.error('[db] FATAL: Cannot connect to Turso in production. Exiting.');
        process.exit(1);
      }
      console.warn('[db] Falling back to local SQLite (development only)');
      _turso = null;
      _useTurso = false;
    }
  } else {
    console.log('[db] No Turso credentials — using local SQLite');
    _useTurso = false;
  }

  applyDefaults();
  migrateModels();

  // Print startup diagnostics
  await printDiagnostics();

  // Seed demo data only in development and only if no real data exists
  if (process.env.NODE_ENV === 'development') seedDemoData();

  console.log(`[db] ✓ Ready — ${_useTurso ? 'Turso' : 'local SQLite'} @ ${dbPath}`);
}

async function applySchemaToTurso() {
  if (!_turso) return;

  const schemaSql = getSchemaSQL();
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await _turso.execute(stmt);
    } catch (e: any) {
      if (!String(e).includes('already exists') && !String(e).includes('duplicate column')) {
        console.warn(`[turso] Schema stmt warning: ${e.message}`);
      }
    }
  }
}

async function syncFromTurso() {
  if (!_turso) return;
  const TABLES = [
    'users', 'invites', 'deployments', 'cloud_deployments',
    'metrics', 'build_logs', 'ai_conversations', 'anomalies',
    'settings', 'selfhosted_deployments', 'github_repos',
    'user_profiles', 'notifications', 'domain_bindings',
  ];

  for (const table of TABLES) {
    try {
      const result = await _turso.execute(`SELECT * FROM ${table}`);
      if (!result.rows || result.rows.length === 0) continue;

      const cols = result.columns;
      const placeholders = cols.map(() => '?').join(', ');
      const insertSql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
      const stmt = _local.prepare(insertSql);

      for (const row of result.rows) {
        stmt.run(...cols.map((c: string) => row[c]));
      }
      console.log(`[turso] Synced ${result.rows.length} rows from ${table}`);
    } catch (e: any) {
      console.error(`[turso] Sync error for ${table}:`, e?.message || e);
    }
  }
}

async function printDiagnostics() {
  const db = createShim(_local);
  try {
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c ?? 0;
    const deployCount = (db.prepare('SELECT COUNT(*) as c FROM cloud_deployments').get() as any)?.c ?? 0;
    const initialized = (db.prepare("SELECT value FROM settings WHERE key='app_initialized'").get() as any)?.value;

    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║       Podium Startup Diagnostics     ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  DB Provider : ${(_useTurso ? 'Turso (remote)' : 'Local SQLite  ').padEnd(22)}║`);
    console.log(`║  Initialized : ${(initialized === 'true' ? 'Yes' : 'No').padEnd(22)}║`);
    console.log(`║  Users       : ${String(userCount).padEnd(22)}║`);
    console.log(`║  Deployments : ${String(deployCount).padEnd(22)}║`);
    console.log('╚══════════════════════════════════════╝');
    console.log('');
  } catch (e) {
    console.warn('[db] Could not print diagnostics:', e);
  }
}

function getSchemaSQL(): string {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_by TEXT NOT NULL,
      used_by TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      repo_url TEXT,
      branch TEXT NOT NULL DEFAULT 'main',
      status TEXT NOT NULL DEFAULT 'pending',
      container_id TEXT,
      image TEXT,
      ports TEXT NOT NULL DEFAULT '[]',
      env_vars TEXT NOT NULL DEFAULT '[]',
      dockerfile_path TEXT NOT NULL DEFAULT 'Dockerfile',
      domain TEXT,
      auto_deploy INTEGER NOT NULL DEFAULT 1,
      build_args TEXT NOT NULL DEFAULT '[]',
      replicas INTEGER NOT NULL DEFAULT 1,
      memory_limit TEXT NOT NULL DEFAULT '512m',
      cpu_limit TEXT NOT NULL DEFAULT '0.5',
      restart_policy TEXT NOT NULL DEFAULT 'unless-stopped',
      commit_sha TEXT,
      commit_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cloud_deployments (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      region TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      url TEXT,
      provider_deployment_id TEXT,
      provider_error TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      logs TEXT NOT NULL DEFAULT '[]',
      source_type TEXT,
      repo_url TEXT,
      docker_image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      cpu REAL,
      memory REAL,
      network_in REAL,
      network_out REAL
    );
    CREATE INDEX IF NOT EXISTS idx_metrics ON metrics(deployment_id, timestamp);
    CREATE TABLE IF NOT EXISTS build_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      stream TEXT NOT NULL DEFAULT 'stdout'
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS anomalies (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS selfhosted_deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL DEFAULT 'docker',
      docker_image TEXT,
      repo_url TEXT,
      branch TEXT DEFAULT 'main',
      port INTEGER,
      container_port INTEGER DEFAULT 80,
      env_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued',
      url TEXT,
      logs TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS github_repos (
      id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL UNIQUE,
      branch TEXT NOT NULL DEFAULT 'main',
      token TEXT,
      auto_deploy INTEGER NOT NULL DEFAULT 0,
      last_commit_sha TEXT,
      last_commit_message TEXT,
      last_synced TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      bio TEXT,
      job_title TEXT,
      company TEXT,
      location TEXT,
      website TEXT,
      github_username TEXT,
      avatar TEXT,
      timezone TEXT DEFAULT 'Africa/Tunis',
      theme_preference TEXT DEFAULT 'dark',
      notification_email INTEGER DEFAULT 1,
      notification_deployments INTEGER DEFAULT 1,
      notification_anomalies INTEGER DEFAULT 1,
      notification_team INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif ON notifications(user_id, read, created_at);
    CREATE TABLE IF NOT EXISTS domain_bindings (
      id TEXT PRIMARY KEY,
      subdomain TEXT NOT NULL UNIQUE,
      deployment_id TEXT NOT NULL,
      port TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
}

function applySchema() {
  _local.exec(getSchemaSQL());
}

/**
 * Non-destructive column migrations. Safe to run on every startup.
 */
function applyMigrations() {
  const migrations = [
    `ALTER TABLE cloud_deployments ADD COLUMN provider_deployment_id TEXT`,
    `ALTER TABLE cloud_deployments ADD COLUMN provider_error TEXT`,
    `ALTER TABLE cloud_deployments ADD COLUMN source_type TEXT`,
    `ALTER TABLE cloud_deployments ADD COLUMN repo_url TEXT`,
    `ALTER TABLE cloud_deployments ADD COLUMN docker_image TEXT`,
  ];
  for (const sql of migrations) {
    try {
      _local.exec(sql);
    } catch (_e: any) {
      // Column already exists — expected on subsequent starts, safe to ignore
    }
  }
}

function applyDefaults() {
  const stmt = _local.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const defaults: [string, string][] = [
    ['platform_name', 'Podium'],
    ['groq_model', 'llama-3.3-70b-versatile'],
    ['anomaly_detection', 'true'],
    ['cpu_threshold', '90'],
    ['memory_threshold_mb', '900'],
    ['app_url', 'http://localhost:3000'],
    ['smtp_host', ''],
    ['smtp_port', '587'],
    ['smtp_user', ''],
    ['smtp_pass', ''],
    ['smtp_from', ''],
    ['azure_resource_group', 'podium-rg'],
    ['azure_location', 'eastus'],
    ['aws_default_region', 'us-east-1'],
    ['selfhosted_domain', 'localhost'],
    ['cloudflare_tunnel_id', ''],
    ['cloudflare_tunnel_token', ''],
    ['cloudflare_tunnel_domain', ''],
    // app_initialized is NOT set here — it is only set after first admin creation
  ];
  for (const [k, v] of defaults) stmt.run(k, v);
}

function migrateModels() {
  const DEPRECATED = ['llama3-70b-8192', 'llama3-8b-8192', 'gemma-7b-it', 'llama3-groq-70b-8192-tool-use-preview'];
  const row = _local.prepare("SELECT value FROM settings WHERE key='groq_model'").get() as any;
  if (row?.value && DEPRECATED.includes(row.value)) {
    _local.prepare("UPDATE settings SET value='llama-3.3-70b-versatile' WHERE key='groq_model'").run();
    if (_turso && _useTurso) {
      _writeQueue.push({ sql: "UPDATE settings SET value='llama-3.3-70b-versatile' WHERE key='groq_model'", params: [] });
    }
    console.log(`[db] Migrated deprecated model "${row.value}" → llama-3.3-70b-versatile`);
  }
}

export function ensureExtendedSchema(): void {
  // no-op kept for compatibility
}

function seedDemoData(): void {
  // Only seed if no users exist (truly first run) AND app is not initialized
  const userCount = (_local.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const row = _local.prepare('SELECT COUNT(*) as c FROM deployments').get() as { c: number };
  if (row.c > 0) return;

  const { v4: uuid } = require('uuid');
  const demos = [
    { id: uuid(), name: 'api-gateway',    status: 'running', repo_url: 'https://github.com/example/api-gateway',    branch: 'main', image: '' },
    { id: uuid(), name: 'frontend-app',   status: 'running', repo_url: 'https://github.com/example/frontend-app',   branch: 'main', image: '' },
    { id: uuid(), name: 'auth-service',   status: 'stopped', repo_url: 'https://github.com/example/auth-service',   branch: 'main', image: '' },
    { id: uuid(), name: 'worker-service', status: 'failed',  repo_url: 'https://github.com/example/worker-service', branch: 'main', image: '' },
  ];

  const ins = _local.prepare('INSERT OR IGNORE INTO deployments (id, name, status, repo_url, branch, image) VALUES (?, ?, ?, ?, ?, ?)');
  for (const d of demos) ins.run(d.id, d.name, d.status, d.repo_url, d.branch, d.image);

  const mIns = _local.prepare('INSERT INTO metrics (deployment_id, timestamp, cpu, memory, network_in, network_out) VALUES (?, ?, ?, ?, ?, ?)');
  const now = Date.now();
  for (const d of demos.filter(x => x.status === 'running')) {
    for (let i = 60; i >= 0; i--) {
      mIns.run(d.id, now - i * 60_000,
        +(Math.random() * 40 + 10).toFixed(2),
        +(Math.random() * 300 + 80).toFixed(2),
        +(Math.random() * 20).toFixed(2),
        +(Math.random() * 10).toFixed(2),
      );
    }
  }

  const lIns = _local.prepare('INSERT INTO build_logs (deployment_id, level, message) VALUES (?, ?, ?)');
  for (const d of demos) lIns.run(d.id, 'info', `Deployment "${d.name}" created (demo mode)`);
}
