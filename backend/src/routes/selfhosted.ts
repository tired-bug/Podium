import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { requireAuth } from '../auth';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const router = Router();
const execP = promisify(exec);

const PORT_START = 3100;
const PORT_END = 3200;

/* -------------------------- utils -------------------------- */

function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as any;
  return row?.value || process.env[key.toUpperCase()] || '';
}

function appendCloudLog(cloudId: string, msg: string, level = 'info') {
  try {
    const row = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(cloudId) as any;
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

function allocatePort(): number {
  const used = getDb()
    .prepare("SELECT config FROM cloud_deployments WHERE provider='podium' AND status NOT IN ('stopped','failed','deleted')")
    .all()
    .map((r: any) => {
      try {
        return JSON.parse(r.config)?.host_port;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as number[];

  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!used.includes(p)) return p;
  }

  throw new Error('No free host ports available (3100-3200 exhausted)');
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execP('docker info', { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------- docker helpers -------------------------- */

async function pullImage(cloudId: string, image: string): Promise<void> {
  appendCloudLog(cloudId, `Pulling image ${image}...`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['pull', image]);

    proc.stdout.on('data', (d) => appendCloudLog(cloudId, d.toString().trim()));
    proc.stderr.on('data', (d) => appendCloudLog(cloudId, d.toString().trim()));

    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`docker pull failed (${code})`))
    );
  });
}

/* -------------------------- git build -------------------------- */

async function buildFromGitHub(
  cloudId: string,
  repoUrl: string,
  branch: string,
  imageName: string
): Promise<void> {
  let AdmZip: any;
  try {
    AdmZip = require('adm-zip');
  } catch {
    throw new Error('adm-zip missing. Run: npm install adm-zip');
  }

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) {
    throw new Error('Invalid GitHub URL — must be a valid GitHub repo');
  }

  const [, owner, repo] = match;

  const buildDir = path.join(process.cwd(), 'data', 'builds', cloudId);
  fs.mkdirSync(buildDir, { recursive: true });

  appendCloudLog(cloudId, `Downloading ${owner}/${repo}@${branch}...`);

  const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

  const resp = await axios.get(zipUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const zipData = Buffer.from(resp.data);
  appendCloudLog(cloudId, `Downloaded ${(zipData.length / 1024).toFixed(0)} KB`);

  const zip = new AdmZip(zipData);
  zip.extractAllTo(buildDir, true);

  const extracted = fs.readdirSync(buildDir).find(f =>
    fs.statSync(path.join(buildDir, f)).isDirectory()
  );

  if (!extracted) throw new Error('Extraction failed');

  const srcDir = path.join(buildDir, extracted);

  /* Dockerfile auto generation */
  if (!fs.existsSync(path.join(srcDir, 'Dockerfile'))) {
    const hasPkg = fs.existsSync(path.join(srcDir, 'package.json'));

    if (hasPkg) {
      const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf-8'));

      const buildCmd = pkg.scripts?.build ? 'RUN npm run build' : '';
      const startCmd = pkg.scripts?.start ? '["npm","start"]' : '["node","index.js"]';

      fs.writeFileSync(
        path.join(srcDir, 'Dockerfile'),
        `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
${buildCmd}
EXPOSE 3000
CMD ${startCmd}
`
      );
    } else {
      fs.writeFileSync(
        path.join(srcDir, 'Dockerfile'),
        `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`
      );
    }
  }

  /* build image */
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['build', '-t', imageName, '.'], {
      cwd: srcDir,
    });

    proc.stdout.on('data', (d) => appendCloudLog(cloudId, d.toString().trim()));
    proc.stderr.on('data', (d) => appendCloudLog(cloudId, d.toString().trim()));

    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`docker build failed (${code})`))
    );
  });

  fs.rmSync(buildDir, { recursive: true, force: true });

  appendCloudLog(cloudId, 'Build complete ✓');
}

/* -------------------------- ngrok -------------------------- */

async function getNgrokUrl(hostPort: number): Promise<string | null> {
  try {
    const { data } = await axios.get('http://127.0.0.1:4040/api/tunnels');
    const tunnel = (data.tunnels || []).find((t: any) =>
      String(t.config?.addr || '').includes(String(hostPort))
    );

    return tunnel?.public_url || null;
  } catch {
    return null;
  }
}

/* -------------------------- deploy -------------------------- */

async function deploySelfHosted(cloudId: string): Promise<void> {
  const db = getDb();

  const dep = db.prepare('SELECT * FROM cloud_deployments WHERE id=?').get(cloudId) as any;
  if (!dep) return;

  const cfg: any = safeJson(dep.config);

  try {
    setCloudStatus(cloudId, 'building');

    appendCloudLog(cloudId, 'Checking Docker...');
    if (!(await dockerAvailable())) {
      throw new Error('Docker is not running');
    }

    appendCloudLog(cloudId, 'Docker OK ✓');

    const hostPort = cfg.host_port || allocatePort();
    const containerPort = cfg.container_port || 80;

    cfg.host_port = hostPort;

    db.prepare('UPDATE cloud_deployments SET config=? WHERE id=?')
      .run(JSON.stringify(cfg), cloudId);

    const containerName = buildContainerName(dep.name);

    try {
      await execP(`docker rm -f ${containerName}`);
    } catch {}

    /* image */
    let image: string;

    if (dep.repo_url || cfg.github_repo) {
      const repo = dep.repo_url || cfg.github_repo;
      const branch = cfg.branch || 'main';

      image = `podium-app-${dep.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      await buildFromGitHub(cloudId, repo, branch, image);
    } else {
      image = dep.docker_image || 'nginx:latest';
      await pullImage(cloudId, image);
    }

    /* env */
    const env = Object.entries(cfg.env || {})
      .map(([k, v]) => `-e ${k}=${String(v).replace(/"/g, '\\"')}`)
      .join(' ');

    appendCloudLog(cloudId, 'Starting container...');

    await execP(
      `docker run -d --name ${containerName} --restart unless-stopped ${env} -p ${hostPort}:${containerPort} ${image}`
    );

    await new Promise(r => setTimeout(r, 4000));

    const { stdout } = await execP(
      `docker inspect --format="{{.State.Status}}" ${containerName}`
    ).catch(() => ({ stdout: 'unknown' }));

    if (stdout.trim() !== 'running') {
      const logs = await execP(
        `docker logs --tail 30 ${containerName}`
      ).catch(() => ({ stdout: '' }));

      throw new Error(`Container failed:\n${logs.stdout}`);
    }

    const ngrokUrl = await getNgrokUrl(hostPort);
    const manual = getSetting('selfhosted_ngrok_url');

    const publicUrl = ngrokUrl || manual || `http://localhost:${hostPort}`;

    setCloudStatus(cloudId, 'running', publicUrl);

    appendCloudLog(cloudId, `Live at ${publicUrl}`);
  } catch (err: any) {
    setCloudStatus(cloudId, 'failed');
    appendCloudLog(cloudId, err.message, 'error');
  }
}

/* -------------------------- helpers -------------------------- */

function safeJson(v: any) {
  try {
    return JSON.parse(v || '{}');
  } catch {
    return {};
  }
}

function buildContainerName(name: string) {
  return (
    'podium-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
  );
}

/* -------------------------- routes -------------------------- */

router.post('/run/:cloudId', (req, res) => {
  if (req.headers['x-internal'] !== 'podium-selfhosted') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  deploySelfHosted(req.params.cloudId).catch(() => {});
  res.json({ ok: true });
});

router.get('/status', requireAuth, async (_req, res) => {
  const docker = await dockerAvailable();

  let ngrok = false;
  try {
    await axios.get('http://127.0.0.1:4040/api/tunnels');
    ngrok = true;
  } catch {}

  res.json({
    docker,
    ngrok,
    ngrokUrl: getSetting('selfhosted_ngrok_url'),
  });
});

router.post('/:id/stop', requireAuth, async (req, res) => {
  const dep = getDb()
    .prepare("SELECT * FROM cloud_deployments WHERE id=? AND provider='podium'")
    .get(req.params.id) as any;

  if (!dep) return res.status(404).json({ error: 'Not found' });

  try {
    await execP(`docker rm -f ${buildContainerName(dep.name)}`);
  } catch {}

  setCloudStatus(dep.id, 'stopped');
  appendCloudLog(dep.id, 'Stopped');

  res.json({ ok: true });
});

router.post('/:id/restart', requireAuth, async (req, res) => {
  const id = req.params.id;

  getDb()
    .prepare("UPDATE cloud_deployments SET status='queued', logs='[]' WHERE id=?")
    .run(id);

  deploySelfHosted(id).catch(() => {});

  res.json({ ok: true });
});

export default router;
export { deploySelfHosted };