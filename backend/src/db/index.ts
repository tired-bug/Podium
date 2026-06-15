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

      const localStmt = local.prepare(sql);

      return {
        get: (...params: any[]) => localStmt.get(...params) ?? null,
        all: (...params: any[]) => localStmt.all(...params),
        run: (...params: any[]) => {
          const result = localStmt.run(...params);

          if (isWrite && _turso) {
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
      console.error('[turso] Connection failed, running local-only:', err);
      _turso = null;
    }
  } else {
    console.log('[db] No Turso credentials — using local SQLite only');
  }

  applySchema();
  applyDefaults();
  migrateModels();
  applyExtendedSchema();

  if (process.env.NODE_ENV === 'development') seedDemoData();

  console.log(`[db] Ready — ${dbPath}`);
}

function applyDefaults() {
  const stmt = _local.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

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
  ];

  for (const [k, v] of defaults) stmt.run(k, v);
}

function seedDemoData() {
  const row = _local.prepare(
    'SELECT COUNT(*) as c FROM deployments'
  ).get() as { c: number };

  if (row.c > 0) return;

  const { v4: uuid } = require('uuid');

  const demos = [
    {
      id: uuid(),
      name: 'api-gateway',
      status: 'running',
      repo_url: 'https://github.com/example/api-gateway',
      branch: 'main',
      image: 'node:18',
    },
    {
      id: uuid(),
      name: 'frontend-app',
      status: 'running',
      repo_url: 'https://github.com/example/frontend-app',
      branch: 'main',
      image: 'nginx:latest',
    },
    {
      id: uuid(),
      name: 'auth-service',
      status: 'stopped',
      repo_url: 'https://github.com/example/auth-service',
      branch: 'main',
      image: 'node:18',
    },
    {
      id: uuid(),
      name: 'worker-service',
      status: 'failed',
      repo_url: 'https://github.com/example/worker-service',
      branch: 'main',
      image: 'node:18',
    },
  ];

  const ins = _local.prepare(
    'INSERT OR IGNORE INTO deployments (id, name, status, repo_url, branch, image) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const d of demos) {
    ins.run(d.id, d.name, d.status, d.repo_url, d.branch, d.image);
  }

  const mIns = _local.prepare(
    'INSERT INTO metrics (deployment_id, timestamp, cpu, memory, network_in, network_out) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const now = Date.now();

  for (const d of demos.filter(x => x.status === 'running')) {
    for (let i = 60; i >= 0; i--) {
      mIns.run(
        d.id,
        now - i * 60_000,
        +(Math.random() * 40 + 10).toFixed(2),
        +(Math.random() * 300 + 80).toFixed(2),
        +(Math.random() * 20).toFixed(2),
        +(Math.random() * 10).toFixed(2)
      );
    }
  }

  const lIns = _local.prepare(
    'INSERT INTO build_logs (deployment_id, level, message) VALUES (?, ?, ?)'
  );

  for (const d of demos) {
    lIns.run(
      d.id,
      'info',
      `Deployment "${d.name}" created (demo mode)`
    );
  }
}

/* ---------------- remaining functions unchanged ---------------- */

function applySchema() {
  _local.exec(`CREATE TABLE IF NOT EXISTS users (...);`);
}

function migrateModels() {
  const DEPRECATED = [
    'llama3-70b-8192',
    'llama3-8b-8192',
    'gemma-7b-it',
    'llama3-groq-70b-8192-tool-use-preview',
  ];

  const row = _local
    .prepare("SELECT value FROM settings WHERE key='groq_model'")
    .get() as any;

  if (row?.value && DEPRECATED.includes(row.value)) {
    _local
      .prepare(
        "UPDATE settings SET value='llama-3.3-70b-versatile' WHERE key='groq_model'"
      )
      .run();
  }
}

function applyExtendedSchema() {}

async function syncFromTurso() {}