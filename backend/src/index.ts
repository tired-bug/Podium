import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { initDb, getDb, ensureExtendedSchema } from './db/index';
import { ensureDeploymentUserIdColumn } from './routes/providers';


import authRouter from './routes/auth';
import invitesRouter from './routes/invites';
import metricsRouter from './routes/metrics';
import logsRouter from './routes/logs';
import githubRouter from './routes/github';
import cloudRouter from './routes/cloud';
import aiRouter from './routes/ai';
import settingsRouter, { healthHandler } from './routes/settings';
import profileRouter from './routes/profile';
import notificationsRouter from './routes/notifications';
import providersRouter from './routes/providers';
import finopsRouter from './routes/finops';
import aiDeployRouter from './routes/ai-deploy';
import { startSyncService } from './services/SyncService';
import { startAnomalyDetection } from './services/AnomalyDetectionService';

const app = express();
const PORT = parseInt(process.env.PORT || '4000');

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', healthHandler);
app.use('/api/auth', authRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/github', githubRouter);
app.use('/api/cloud', cloudRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/providers', providersRouter);
app.use('/api/finops', finopsRouter);
app.use('/api/ai-deploy', aiDeployRouter);

const resourcesPath = (process as any).resourcesPath as string | undefined;
const staticPaths = [
  path.join(__dirname, '../../frontend/dist'),
  path.join(resourcesPath || '', 'frontend/dist'),
  path.join(__dirname, '../../../frontend/dist'),
];
let staticPath: string | null = null;
for (const p of staticPaths) { if (fs.existsSync(p)) { staticPath = p; break; } }
if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (_req, res) => res.sendFile(path.join(staticPath!, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ status: 'Podium API running', health: '/api/health' }));
}



function pruneOldData() {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  getDb().prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoff);
  getDb().prepare(
    "DELETE FROM notifications WHERE read=1 AND created_at < datetime('now', '-7 days')"
  ).run();
}

setInterval(pruneOldData, 3_600_000);

async function bootstrap() {
  await initDb();
  ensureExtendedSchema();
  ensureDeploymentUserIdColumn();

  startSyncService();
  startAnomalyDetection();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[podium] Backend on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[podium] Fatal startup error:', err);
  process.exit(1);
});

export default app;
