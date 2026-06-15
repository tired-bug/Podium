/**
 * Database layer — uses Node.js built-in node:sqlite
 * Zero native compilation. Works on Node 22+ and Node 24+.
 */

// Suppress the "SQLite is experimental" warning on Node 22
const _origEmit = process.emitWarning.bind(process);
(process as any).emitWarning = (msg: string, ...args: any[]) => {
  if (typeof msg === 'string' && msg.includes('SQLite')) return;
  _origEmit(msg, ...args);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite = require('node:sqlite');
const DatabaseSync = sqlite.DatabaseSync;

import path from 'path';
import fs from 'fs';

let _db: any = null;

function getDbPath(): string {
  const dataDir = process.env.PODIUM_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'podium.db');
}

export function getDb(): any {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export function initDb(): void {
  const dbPath = getDbPath();
  _db = new DatabaseSync(dbPath);

  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA synchronous = NORMAL");

  _db.exec(`
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
  `);

  // Default settings
  const setStmt = _db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const defaults: [string, string][] = [
    ['platform_name', 'Podium'],
    ['groq_model', 'llama-3.3-70b-versatile'],
    ['anomaly_detection', 'true'],
    ['cpu_threshold', '90'],
    ['memory_threshold_mb', '900'],
    ['app_url', 'http://localhost:4000'],
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
  for (const [k, v] of defaults) setStmt.run(k, v);


  // ── Migrate deprecated Groq model names ───────────────────────────────────
  const DEPRECATED_MODELS = ['llama3-70b-8192', 'llama3-8b-8192', 'gemma-7b-it', 'llama3-groq-70b-8192-tool-use-preview'];
  const currentModel = (_db!.prepare("SELECT value FROM settings WHERE key='groq_model'").get() as any)?.value;
  if (currentModel && DEPRECATED_MODELS.includes(currentModel)) {
    _db!.prepare("UPDATE settings SET value='llama-3.3-70b-versatile' WHERE key='groq_model'").run();
    console.log(`[db] Migrated deprecated model "${currentModel}" → llama-3.3-70b-versatile`);
  }

  // ── Migrate deprecated Groq model names ──────────────────────────────────
  {
    const DEPRECATED = ['llama3-70b-8192', 'llama3-8b-8192', 'gemma-7b-it'];
    const row = _db!.prepare("SELECT value FROM settings WHERE key='groq_model'").get() as any;
    if (row?.value && DEPRECATED.includes(row.value)) {
      _db!.prepare("UPDATE settings SET value='llama-3.3-70b-versatile' WHERE key='groq_model'").run();
      console.log(`[db] Migrated deprecated model "${row.value}" → llama-3.3-70b-versatile`);
    }
  }

  if (process.env.NODE_ENV === 'development') seedDemoData();

  console.log(`[db] Ready — ${dbPath}`);
}

function seedDemoData(): void {
  const db = _db;
  const row = db.prepare('SELECT COUNT(*) as c FROM deployments').get() as { c: number };
  if (row.c > 0) return;

  const { v4: uuid } = require('uuid');
  const demos = [
    { id: uuid(), name: 'api-gateway',    status: 'running', repo_url: 'https://github.com/org/api-gateway', branch: 'main',    image: 'nginx:latest' },
    { id: uuid(), name: 'frontend-app',   status: 'running', repo_url: 'https://github.com/org/frontend',    branch: 'main',    image: 'node:20-alpine' },
    { id: uuid(), name: 'auth-service',   status: 'stopped', repo_url: 'https://github.com/org/auth',        branch: 'develop', image: 'auth-service:1.2' },
    { id: uuid(), name: 'worker-service', status: 'failed',  repo_url: 'https://github.com/org/worker',      branch: 'main',    image: 'worker:latest' },
  ];

  const ins = db.prepare(
    'INSERT OR IGNORE INTO deployments (id, name, status, repo_url, branch, image) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const d of demos) ins.run(d.id, d.name, d.status, d.repo_url, d.branch, d.image);

  const mIns = db.prepare(
    'INSERT INTO metrics (deployment_id, timestamp, cpu, memory, network_in, network_out) VALUES (?, ?, ?, ?, ?, ?)'
  );
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

  const lIns = db.prepare('INSERT INTO build_logs (deployment_id, level, message) VALUES (?, ?, ?)');
  for (const d of demos) lIns.run(d.id, 'info', `Deployment "${d.name}" created (demo mode)`);
}

// ── Additional tables (profile + notifications) ───────────────────────────
export function ensureExtendedSchema(): void {
  const db = _db;
  if (!db) return;
  db.exec(`
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notif ON notifications(user_id, read, created_at);
  `);
}
