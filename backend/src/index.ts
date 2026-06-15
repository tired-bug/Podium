import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';

import { initDb, getDb, ensureExtendedSchema } from './db/index';
import { broadcastNotification } from './routes/notifications';

import authRouter from './routes/auth';
import invitesRouter from './routes/invites';
import deploymentsRouter from './routes/deployments';
import containersRouter from './routes/containers';
import metricsRouter from './routes/metrics';
import logsRouter from './routes/logs';
import githubRouter from './routes/github';
import cloudRouter from './routes/cloud';
import aiRouter from './routes/ai';
import settingsRouter, { healthHandler } from './routes/settings';
import profileRouter from './routes/profile';
import notificationsRouter from './routes/notifications';
import selfhostedRouter from './routes/selfhosted';

const app = express();
const PORT = parseInt(process.env.PORT || '4000');

/* ---------------- Docker instance ---------------- */

const docker = new Docker({
  socketPath:
    process.platform === 'win32'
      ? '\\\\.\\pipe\\docker_engine'
      : '/var/run/docker.sock',
});

/* ---------------- CORS ---------------- */

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

/* ---------------- Routes ---------------- */

app.get('/api/health', healthHandler);

app.use('/api/auth', authRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/deployments', deploymentsRouter);
app.use('/api/containers', containersRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/github', githubRouter);
app.use('/api/cloud', cloudRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/selfhosted', selfhostedRouter);

/* ---------------- Static frontend ---------------- */

const resourcesPath = (process as any).resourcesPath as string | undefined;

const staticPaths = [
  path.join(__dirname, '../../frontend/dist'),
  path.join(resourcesPath || '', 'frontend/dist'),
  path.join(__dirname, '../../../frontend/dist'),
];

let staticPath: string | null = null;

for (const p of staticPaths) {
  if (fs.existsSync(p)) {
    staticPath = p;
    break;
  }
}

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath!, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ status: 'Podium API running', health: '/api/health' });
  });
}

/* ---------------- Metrics Collection ---------------- */

async function collectMetrics() {
  const db = getDb();

  const running = db
    .prepare("SELECT * FROM deployments WHERE status='running' AND container_id IS NOT NULL")
    .all() as any[];

  for (const dep of running) {
    try {
      const container = docker.getContainer(dep.container_id);

      const stats: any = await new Promise((resolve, reject) => {
        container.stats({ stream: false }, (err: any, data: any) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage;

      const sysDelta =
        stats.cpu_stats.system_cpu_usage -
        stats.precpu_stats.system_cpu_usage;

      const numCPUs = stats.cpu_stats.online_cpus || 1;

      const cpu =
        sysDelta > 0 ? (cpuDelta / sysDelta) * numCPUs * 100 : 0;

      const memory =
        (stats.memory_stats.usage -
          (stats.memory_stats.stats?.cache || 0)) /
        1024 /
        1024;

      db.prepare(
        `INSERT INTO metrics 
        (deployment_id, timestamp, cpu, memory, network_in, network_out)
        VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        dep.id,
        Date.now(),
        cpu,
        memory,
        (stats.networks?.eth0?.rx_bytes || 0) / 1024,
        (stats.networks?.eth0?.tx_bytes || 0) / 1024
      );

      detectAnomalies(dep.id, dep.name, cpu, memory);
    } catch {
      // ignore container errors
    }
  }
}

/* ---------------- Simulated Metrics ---------------- */

function generateSimulatedMetrics() {
  const db = getDb();

  const running = db
    .prepare("SELECT id, name FROM deployments WHERE status='running'")
    .all() as any[];

  for (const dep of running) {
    const recent = db
      .prepare(
        'SELECT id FROM metrics WHERE deployment_id = ? AND timestamp > ? LIMIT 1'
      )
      .get(dep.id, Date.now() - 12000);

    if (!recent) {
      const cpu = +(Math.random() * 45 + 8).toFixed(2);
      const memory = +(Math.random() * 250 + 80).toFixed(2);

      db.prepare(
        `INSERT INTO metrics 
        (deployment_id, timestamp, cpu, memory, network_in, network_out)
        VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        dep.id,
        Date.now(),
        cpu,
        memory,
        +(Math.random() * 15).toFixed(2),
        +(Math.random() * 8).toFixed(2)
      );

      detectAnomalies(dep.id, dep.name, cpu, memory);
    }
  }
}

/* ---------------- Anomaly Detection ---------------- */

function detectAnomalies(
  depId: string,
  depName: string,
  cpu: number,
  memory: number
) {
  const db = getDb();

  const cpuThr =
    parseFloat(
      (db.prepare("SELECT value FROM settings WHERE key='cpu_threshold'").get() as any)
        ?.value
    ) || 90;

  const memThr =
    parseFloat(
      (db.prepare("SELECT value FROM settings WHERE key='memory_threshold_mb'").get() as any)
        ?.value
    ) || 900;

  const enabled =
    (db.prepare("SELECT value FROM settings WHERE key='anomaly_detection'").get() as any)
      ?.value === 'true';

  if (!enabled) return;

  const tenMin = new Date(Date.now() - 600_000).toISOString();

  if (cpu > cpuThr) {
    const exists = db
      .prepare(
        "SELECT id FROM anomalies WHERE deployment_id=? AND type='high_cpu' AND resolved=0 AND created_at>?"
      )
      .get(depId, tenMin);

    if (!exists) {
      const id = uuidv4();

      db.prepare(
        `INSERT INTO anomalies (id, deployment_id, type, severity, message)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        id,
        depId,
        'high_cpu',
        'critical',
        `CPU at ${cpu.toFixed(1)}% (threshold ${cpuThr}%)`
      );

      broadcastNotification(
        'anomaly',
        `High CPU: ${depName}`,
        `CPU usage at ${cpu.toFixed(1)}% — exceeds ${cpuThr}% threshold`,
        '/ai/anomalies'
      );
    }
  }

  if (memory > memThr) {
    const exists = db
      .prepare(
        "SELECT id FROM anomalies WHERE deployment_id=? AND type='high_memory' AND resolved=0 AND created_at>?"
      )
      .get(depId, tenMin);

    if (!exists) {
      const id = uuidv4();

      db.prepare(
        `INSERT INTO anomalies (id, deployment_id, type, severity, message)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        id,
        depId,
        'high_memory',
        'warning',
        `Memory at ${memory.toFixed(0)}MB (threshold ${memThr}MB)`
      );

      broadcastNotification(
        'anomaly',
        `High Memory: ${depName}`,
        `Memory at ${memory.toFixed(0)}MB — exceeds ${memThr}MB threshold`,
        '/ai/anomalies'
      );
    }
  }
}

/* ---------------- Cleanup ---------------- */

function pruneOldData() {
  const cutoff = Date.now() - 24 * 3600 * 1000;

  getDb()
    .prepare('DELETE FROM metrics WHERE timestamp < ?')
    .run(cutoff);

  getDb()
    .prepare(
      "DELETE FROM notifications WHERE read=1 AND created_at < datetime('now', '-7 days')"
    )
    .run();
}

/* ---------------- Intervals ---------------- */

setInterval(() => collectMetrics().catch(() => {}), 10_000);
setInterval(generateSimulatedMetrics, 12_000);
setInterval(pruneOldData, 3_600_000);

/* ---------------- Bootstrap ---------------- */

async function bootstrap() {
  await initDb();
  ensureExtendedSchema();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[podium] Backend running on http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[podium] Fatal startup error:', err);
  process.exit(1);
});

export default app;