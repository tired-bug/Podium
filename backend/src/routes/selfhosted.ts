/**
 * selfhosted.ts  —  Podium Self-Hosted Provider
 *
 * Clean rewrite. Key design changes:
 *  - No separate selfhosted_deployments table → writes directly into cloud_deployments
 *    so the Cloud page shows live status, logs, and URL without any sync glue.
 *  - No Cloudflare / nginx dependency → uses ngrok's local API to auto-detect the
 *    public URL, or falls back to http://localhost:<port>
 *  - Uses adm-zip (pure JS) instead of the `unzip` shell command (broken on Windows)
 *  - Auth: internal header bypass OR normal JWT — no middleware ordering issues
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { requireAuth } from '../auth';
import { v4 as uuidv4 } from 'uuid';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const router = Router();
const execP  = promisify(exec);

const PORT_START = 3100;
const PORT_END   = 3200;

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as any;
  return row?.value || process.env[key.toUpperCase()] || '';
}

function appendCloudLog(cloudId: string, msg: string, level = 'info') {
  try {
    const row  = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(cloudId) as any;
    if (!row) return;
    const logs = JSON.parse(row.logs || '[]');
    logs.push({ time: new Date().toISOString(), message: msg, level });
    getDb()
      .prepare("UPDATE cloud_deployments SET logs=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(logs), cloudId);
  } catch {}
}

function setCloudStatus(cloudId: string, status: string, url?: string) {
  getDb()
    .prepare("UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?")
    .run(status, url || null, cloudId);
}

// ─── Port allocation ──────────────────────────────────────────────────────────

function allocatePort(): number {
  // Look at all cloud_deployments with provider='podium' that are not stopped
  const used = getDb()
    .prepare("SELECT config FROM cloud_deployments WHERE provider='podium' AND status NOT IN ('stopped','failed','deleted')")
    .all()
    .map((r: any) => {
      try { return JSON.parse(r.config)?.host_port; } catch { return null; }
    })
    .filter(Boolean) as number[];

  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!used.includes(p)) return p;
  }
  throw new Error('No free host ports available (3100-3200 exhausted)');
}

// ─── Docker helpers ───────────────────────────────────────────────────────────

async function dockerAvailable(): Promise<boolean> {
  try {
    await execP('docker info --format "{{.ServerVersion}}"', { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

async function pullImage(cloudId: string, image: string): Promise<void> {
  appendCloudLog(cloudId, `Pulling image ${image}...`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['pull', image], { shell: true });
    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) appendCloudLog(cloudId, line);
    });
    proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) appendCloudLog(cloudId, line);
    });
    proc.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`docker pull exited ${code}`))
    );
  });
}

// ─── GitHub → Docker build (Windows-safe, pure JS extraction) ─────────────────

async function buildFromGitHub(cloudId: string, repoUrl: string, branch: string, imageName: string): Promise<void> {
  // Dynamic require so the server still starts if adm-zip is not installed
  let AdmZip: any;
  try { AdmZip = require('adm-zip'); } catch {
    throw new Error('adm-zip is not installed. Run: npm install adm-zip --legacy-peer-deps in the backend folder.');
  }

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) throw new Error('Invalid GitHub URL — must be https://github.com/owner/repo');
  const [, owner, repo] = match;

  const buildDir = path.join(process.cwd(), 'data', 'builds', cloudId);
  fs.mkdirSync(buildDir, { recursive: true });

  // Download archive
  appendCloudLog(cloudId, `Downloading ${owner}/${repo}@${branch}...`);
  const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
  let zipData: Buffer;
  try {
    const resp = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 60000 });
    zipData = Buffer.from(resp.data);
  } catch (e: any) {
    throw new Error(`Could not download repo (branch "${branch}" exists?): ${e.message}`);
  }
  appendCloudLog(cloudId, `Downloaded ${(zipData.length / 1024).toFixed(0)} KB`);

  // Extract with adm-zip (pure JS — no shell commands)
  const zip = new AdmZip(zipData);
  zip.extractAllTo(buildDir, true);
  fs.rmSync(path.join(buildDir, 'repo.zip'), { force: true });

  const extracted = fs.readdirSync(buildDir).find(f =>
    fs.statSync(path.join(buildDir, f)).isDirectory()
  );
  if (!extracted) throw new Error('Extraction failed — no directory found');
  const srcDir = path.join(buildDir, extracted);
  appendCloudLog(cloudId, `Extracted to ${extracted}/`);

  // Auto-generate Dockerfile if missing
  if (!fs.existsSync(path.join(srcDir, 'Dockerfile'))) {
    const hasPkg = fs.existsSync(path.join(srcDir, 'package.json'));
    if (hasPkg) {
      const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf-8'));
      const buildCmd = pkg.scripts?.build ? 'RUN npm run build' : '';
      const startCmd = pkg.scripts?.start ? '["npm","start"]' : '["node","index.js"]';
      fs.writeFileSync(path.join(srcDir, 'Dockerfile'),
        `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --production\nCOPY . .\n${buildCmd}\nEXPOSE 3000\nCMD ${startCmd}\n`);
      appendCloudLog(cloudId, 'Auto-generated Dockerfile for Node.js project');
    } else {
      fs.writeFileSync(path.join(srcDir, 'Dockerfile'),
        `FROM nginx:alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80\n`);
      appendCloudLog(cloudId, 'Auto-generated Dockerfile for static site');
    }
  }

  // Build image
  appendCloudLog(cloudId, `Building Docker image "${imageName}"...`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['build', '-t', imageName, '.'], { cwd: srcDir, shell: true });
    proc.stdout.on('data', (d: Buffer) => { const l = d.toString().trim(); if (l) appendCloudLog(cloudId, l); });
    proc.stderr.on('data', (d: Buffer) => { const l = d.toString().trim(); if (l) appendCloudLog(cloudId, l); });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`docker build failed (exit ${code})`)));
  });

  fs.rmSync(buildDir, { recursive: true, force: true });
  appendCloudLog(cloudId, 'Build complete ✓');
}

// ─── ngrok public URL detection ───────────────────────────────────────────────

async function getNgrokUrl(hostPort: number): Promise<string | null> {
  try {
    // ngrok exposes its local API on port 4040
    const { data } = await axios.get('http://localhost:4040/api/tunnels', { timeout: 2000 });
    const tunnel = (data.tunnels || []).find((t: any) =>
      t.proto === 'https' && String(t.config?.addr || '').includes(String(hostPort))
    ) || (data.tunnels || [])[0];
    return tunnel?.public_url || null;
  } catch {
    return null;
  }
}

// ─── Core deploy ──────────────────────────────────────────────────────────────

async function deploySelfHosted(cloudId: string): Promise<void> {
  const db  = getDb();
  const dep = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(cloudId) as any;
  if (!dep) return;

  const cfg: Record<string, any> = (() => {
    try { return JSON.parse(dep.config || '{}'); } catch { return {}; }
  })();

  try {
    setCloudStatus(cloudId, 'building');

    // 1. Docker check
    appendCloudLog(cloudId, 'Checking Docker...');
    if (!await dockerAvailable()) {
      throw new Error('Docker Desktop is not running. Open Docker Desktop, wait for it to say "Running", then redeploy.');
    }
    appendCloudLog(cloudId, 'Docker is available ✓');

    // 2. Allocate host port (persist in config)
    const hostPort: number = cfg.host_port || allocatePort();
    const containerPort: number = cfg.container_port || 80;
    cfg.host_port = hostPort;
    db.prepare("UPDATE cloud_deployments SET config=? WHERE id=?").run(JSON.stringify(cfg), cloudId);

    // 3. Stop & remove old container (if any) AND free the port if something else is using it
    const containerName = `podium-${dep.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}`;
    try { await execP(`docker rm -f "${containerName}"`); } catch {}

    // Free port: find and kill any container already bound to hostPort
    try {
      const { stdout: psOut } = await execP(`docker ps -q --filter "publish=${hostPort}"`);
      const victims = psOut.trim().split('\n').filter(Boolean);
      for (const cid of victims) {
        await execP(`docker rm -f ${cid}`);
        appendCloudLog(cloudId, `Freed port ${hostPort} from container ${cid.slice(0,12)}`);
      }
    } catch {}

    // 4. Build or pull image
    // repo_url may be in the column OR stored in config.github_repo (set by cloud.ts dispatch)
    const repoUrl = dep.repo_url || cfg.github_repo || '';
    const repoBranch = cfg.branch || dep.deployment_id || 'main';
    let finalImage: string;
    if (repoUrl) {
      const imageName = `podium-app-${dep.name.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,40)}:latest`;
      await buildFromGitHub(cloudId, repoUrl, repoBranch, imageName);
      finalImage = imageName;
    } else {
      finalImage = dep.docker_image || 'nginx:latest';
      await pullImage(cloudId, finalImage);
    }

    // 5. Build env args — skip internal platform keys injected by cloud.ts dispatch
    const SKIP_KEYS = new Set(['resource_group','cpu','memory','plan','github_repo','branch','container_port','host_port','env']);
    const envArgs = Object.entries(cfg.env || {})
      .filter(([k]) => !SKIP_KEYS.has(k))
      .map(([k, v]) => `-e "${k}=${String(v).replace(/"/g, '\\"')}"`)
      .join(' ');

    // 6. Run container
    appendCloudLog(cloudId, `Starting container "${containerName}" on host port ${hostPort}...`);
    const runCmd = `docker run -d --name "${containerName}" --restart unless-stopped ${envArgs} -p ${hostPort}:${containerPort} ${finalImage}`;
    await execP(runCmd, { timeout: 30000 });
    appendCloudLog(cloudId, `Container started ✓`);

    // 7. Wait for it to stay up (5s)
    await new Promise(r => setTimeout(r, 5000));
    const { stdout: state } = await execP(`docker inspect --format="{{.State.Status}}" "${containerName}"`).catch(() => ({ stdout: 'unknown' }));
    if (state.trim() !== 'running') {
      const { stdout: logs } = await execP(`docker logs --tail 20 "${containerName}"`).catch(() => ({ stdout: '' }));
      throw new Error(`Container exited immediately.\nLast logs:\n${logs}`);
    }

    // 8. Determine public URL
    const ngrokUrl  = await getNgrokUrl(hostPort);
    const manualUrl = getSetting('selfhosted_ngrok_url');
    const publicUrl = ngrokUrl || manualUrl || `http://localhost:${hostPort}`;

    setCloudStatus(cloudId, 'running', publicUrl);
    appendCloudLog(cloudId, `✓ Live at ${publicUrl}`);

    if (!ngrokUrl && !manualUrl) {
      appendCloudLog(cloudId,
        `Tip: run "ngrok http ${hostPort}" in a terminal to get a public HTTPS URL, then paste it in Settings → Self-Hosted → ngrok URL.`
      );
    }

  } catch (err: any) {
    setCloudStatus(cloudId, 'failed');
    appendCloudLog(cloudId, `✗ ${err.message}`, 'error');
  }
}

// ─── Internal deploy (called by cloud.ts dispatch) ────────────────────────────
//
// cloud.ts creates the cloud_deployments row and calls this with the row ID.
// We just run deploySelfHosted(cloudId) — no second table needed.

router.post('/run/:cloudId', (req: Request, res: Response) => {
  if (req.headers['x-internal'] !== 'podium-selfhosted') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { cloudId } = req.params;
  deploySelfHosted(cloudId).catch(() => {});
  return res.json({ ok: true, cloudId });
});

// ─── Public routes (need auth) ────────────────────────────────────────────────

// GET /api/selfhosted/status — is Docker running? is ngrok up?
router.get('/status', requireAuth, async (_req, res) => {
  const docker = await dockerAvailable();
  let ngrok = false;
  try {
    await axios.get('http://localhost:4040/api/tunnels', { timeout: 1500 });
    ngrok = true;
  } catch {}
  const ngrokUrl = getSetting('selfhosted_ngrok_url');
  res.json({ docker, ngrok, ngrokUrl });
});

// POST /api/selfhosted/:id/stop
router.post('/:id/stop', requireAuth, async (req, res) => {
  const dep = getDb().prepare("SELECT * FROM cloud_deployments WHERE id=? AND provider='podium'").get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });
  try {
    await execP(`docker rm -f "podium-${dep.name.toLowerCase().replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").slice(0,50)}"`);
  } catch {}
  setCloudStatus(dep.id, 'stopped');
  appendCloudLog(dep.id, 'Stopped by user');
  return res.json({ ok: true });
});

// POST /api/selfhosted/:id/restart
router.post('/:id/restart', requireAuth, async (req, res) => {
  const dep = getDb().prepare("SELECT * FROM cloud_deployments WHERE id=? AND provider='podium'").get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });
  // Reset logs + status then re-run
  getDb().prepare("UPDATE cloud_deployments SET status='queued', logs='[]', updated_at=datetime('now') WHERE id=?").run(dep.id);
  appendCloudLog(dep.id, 'Restarting...');
  deploySelfHosted(dep.id).catch(() => {});
  return res.json({ ok: true });
});

export default router;
export { deploySelfHosted };
