import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, AuthRequest } from '../auth';
import { aiAvailable, aiModelName, aiChat, aiChatStream, isAIAuthError } from '../services/ai/AIClient';

const router = Router();

// Normalized shape used by every AI tool below so local (Docker) and cloud
// deployments can be treated uniformly regardless of which table they live in.
interface NormalizedDeployment {
  id: string;
  name: string;
  status: string;
  source: 'local' | 'cloud';
  provider?: string;       // cloud only
  image: string | null;    // docker image / repo, whichever applies
  branch?: string;
  ports: string[];
  envVars: { key: string }[];
  memoryLimit: string | null;
  cpuLimit: string | null;
  replicas: number | null;
  restartPolicy: string | null;
  raw: any;                // original row, for callers that still want it
}

function safeParseArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function normalizeLocalDeployment(dep: any): NormalizedDeployment {
  return {
    id: dep.id,
    name: dep.name,
    status: dep.status,
    source: 'local',
    image: dep.image || null,
    branch: dep.branch,
    ports: safeParseArray(dep.ports),
    envVars: safeParseArray(dep.env_vars),
    memoryLimit: dep.memory_limit ?? null,
    cpuLimit: dep.cpu_limit ?? null,
    replicas: dep.replicas ?? null,
    restartPolicy: dep.restart_policy ?? null,
    raw: dep,
  };
}

function normalizeCloudDeployment(dep: any): NormalizedDeployment {
  let config: any = {};
  try { config = JSON.parse(dep.config || '{}'); } catch { /* ignore */ }
  return {
    id: dep.id,
    name: dep.name,
    status: dep.status,
    source: 'cloud',
    provider: dep.provider,
    image: dep.docker_image || dep.repo_url || config.image || null,
    branch: dep.branch || config.branch,
    ports: safeParseArray(config.ports),
    envVars: safeParseArray(config.envVars || config.env_vars),
    memoryLimit: config.memoryLimit || config.memory_limit || null,
    cpuLimit: config.cpuLimit || config.cpu_limit || null,
    replicas: config.replicas ?? null,
    restartPolicy: config.restartPolicy || config.restart_policy || null,
    raw: dep,
  };
}

// Looks up a deployment by id in either table (local first, then cloud) and
// returns it normalized. This is the single source of truth every AI route
// should use instead of querying `deployments` alone.
function findDeploymentById(id: string): NormalizedDeployment | null {
  const local = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(id) as any;
  if (local) return normalizeLocalDeployment(local);
  const cloud = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(id) as any;
  if (cloud) return normalizeCloudDeployment(cloud);
  return null;
}

function aiErrorResponse(res: Response, err: any) {
  if (!aiAvailable()) {
    return res.status(400).json({ error: 'AI features are not configured on this server. Contact your administrator.' });
  }
  if (isAIAuthError(err)) {
    return res.status(400).json({ error: 'AI features are misconfigured on this server (the configured key was rejected). Contact your administrator.' });
  }
  const errMsg = err?.response?.data?.error?.message || err?.message || 'AI request failed';
  return res.status(502).json({ error: errMsg });
}

const SYSTEM_PROMPT = `You are Podium AI, an expert DevOps assistant embedded in the Podium AIOps platform.
You help DevOps engineers with:
- Docker container management and troubleshooting
- CI/CD pipeline optimization
- Cloud deployments (AWS, Azure, Vercel)
- Infrastructure monitoring and incident resolution
- Log analysis and debugging
- Security hardening and best practices

Be concise, precise, and actionable. Format code in markdown code blocks with language specifiers.
When analyzing issues, provide step-by-step resolution plans.`;

// Frontend polls this on mount to decide whether to show the
// "AI API Key Required" empty state. Reflects the server-side
// GROQ_API_KEY env var — never returns the key itself.
router.get('/model', requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({ hasKey: aiAvailable(), model: aiModelName() });
});

router.get('/conversations', requireAuth, (req: AuthRequest, res: Response) => {
  const convos = getDb().prepare(`
    SELECT id, title, created_at, updated_at,
           json_array_length(messages) as message_count
    FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC
  `).all(req.user!.sub);
  res.json(convos);
});

router.post('/conversations', requireAuth, (req: AuthRequest, res: Response) => {
  const id = uuidv4();
  const { title = 'New Conversation' } = req.body;
  getDb().prepare(`
    INSERT INTO ai_conversations (id, user_id, title) VALUES (?, ?, ?)
  `).run(id, req.user!.sub, title);
  const conv = getDb().prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id) as any;
  res.status(201).json({ ...conv, messages: [] });
});

router.get('/conversations/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const conv = getDb().prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.sub) as any;
  if (!conv) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...conv, messages: JSON.parse(conv.messages || '[]') });
});

router.delete('/conversations/:id', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.sub);
  res.json({ ok: true });
});

router.put('/conversations/:id/title', requireAuth, (req: AuthRequest, res: Response) => {
  const { title } = req.body;
  getDb().prepare("UPDATE ai_conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(title, req.params.id, req.user!.sub);
  res.json({ ok: true });
});

router.post('/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  const { message, history = [], conversationId } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  if (!aiAvailable()) {
    return res.status(400).json({ error: 'AI features are not configured on this server. Contact your administrator.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const messages = [
    ...history.slice(-20).map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  try {
    const fullContent = await aiChatStream(
      SYSTEM_PROMPT,
      messages,
      (piece) => {
        res.write(`data: ${JSON.stringify({ content: piece, done: false })}\n\n`);
      },
      2048
    );
    res.write(`data: [DONE]\n\n`);

    if (conversationId && fullContent) {
      try {
        const conv = getDb().prepare('SELECT messages FROM ai_conversations WHERE id = ?').get(conversationId) as any;
        if (conv) {
          const msgs = JSON.parse(conv.messages || '[]');
          msgs.push({ id: uuidv4(), role: 'user', content: message, created_at: new Date().toISOString() });
          msgs.push({ id: uuidv4(), role: 'assistant', content: fullContent, created_at: new Date().toISOString() });

          const titleUpdate = msgs.length === 2 ? message.slice(0, 60) : null;
          getDb().prepare(`
            UPDATE ai_conversations SET messages = ?, updated_at = datetime('now')
            ${titleUpdate ? ", title = ?" : ""}
            WHERE id = ?
          `).run(JSON.stringify(msgs), ...(titleUpdate ? [titleUpdate, conversationId] : [conversationId]));
        }
      } catch {}
    }
    res.end();
  } catch (err: any) {
    const errMsg = isAIAuthError(err)
      ? 'AI features are misconfigured on this server (the configured key was rejected). Contact your administrator.'
      : (err.response?.data?.error?.message || err.message);
    res.write(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`);
    res.end();
  }
});

router.post('/analyze', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId, prompt } = req.body;
  const dep = findDeploymentById(deploymentId);
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const logs = getDb().prepare('SELECT * FROM build_logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 50').all(deploymentId) as any[];
  const metrics = getDb().prepare('SELECT * FROM metrics WHERE deployment_id = ? ORDER BY timestamp DESC LIMIT 10').all(deploymentId) as any[];

  const context = `
Deployment: ${dep.name} (${dep.status})${dep.source === 'cloud' ? ` [cloud: ${dep.provider}]` : ''}
Image: ${dep.image || 'N/A'}
Branch: ${dep.branch || 'N/A'}
Memory Limit: ${dep.memoryLimit || 'N/A'}, CPU Limit: ${dep.cpuLimit || 'N/A'}

Recent Logs (last 50):
${logs.map(l => `[${l.level.toUpperCase()}] ${l.message}`).join('\n')}

Recent Metrics:
${metrics.map(m => `CPU: ${m.cpu?.toFixed(1)}%, Memory: ${m.memory?.toFixed(0)}MB`).join('\n')}
`;

  const analysisPrompt = prompt || `Analyze this deployment and provide:
1. Current health assessment
2. Key issues identified
3. Recommended actions
4. Performance optimization tips`;

  if (!aiAvailable()) return res.status(400).json({ error: 'AI features are not configured on this server. Contact your administrator.' });

  try {
    const analysis = await aiChat(SYSTEM_PROMPT, `${analysisPrompt}\n\n${context}`, 1500);
    return res.json({ analysis });
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.post('/suggest-fix', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = findDeploymentById(deploymentId);
  if (!dep) return res.status(404).json({ error: 'Not found' });

  const logs = getDb().prepare(`
    SELECT * FROM build_logs WHERE deployment_id = ? AND level IN ('error', 'warn') ORDER BY id DESC LIMIT 30
  `).all(deploymentId) as any[];

  if (!aiAvailable()) return res.status(400).json({ error: 'AI features are not configured on this server. Contact your administrator.' });

  const prompt = `Deployment "${dep.name}" has status "${dep.status}".
Error/warning logs:
${logs.map(l => `[${l.level}] ${l.message}`).join('\n') || 'No error logs found.'}

Provide a concise fix recommendation with exact commands or config changes needed.`;

  try {
    const suggestion = await aiChat(SYSTEM_PROMPT, prompt, 800);
    return res.json({ suggestion });
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.post('/summarize-logs', requireAuth, async (_req, res: Response) => {
  const { deploymentId } = _req.body;
  const logs = getDb().prepare('SELECT * FROM build_logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 100').all(deploymentId) as any[];

  if (!aiAvailable()) return res.status(400).json({ error: 'AI features are not configured on this server. Contact your administrator.' });

  const prompt = `Summarize these deployment logs in 3-5 bullet points, highlighting any issues:\n\n${
    logs.map(l => `[${l.level}] ${l.message}`).join('\n')
  }`;

  try {
    const summary = await aiChat('You are a concise technical summarizer.', prompt, 500);
    return res.json({ summary });
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

// Thin wrapper kept so the many call sites below didn't need individual edits
// beyond the name — delegates to the shared AIClient.
async function aiChatHelper(systemPrompt: string, userPrompt: string, maxTokens = 1200): Promise<string> {
  return aiChat(systemPrompt, userPrompt, maxTokens);
}

router.post('/risk-score', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;

  // Prefer a real deployment lookup (local or cloud) when a deploymentId is
  // given — this is how AI Hub's Risk Score tool calls this route. Fall back
  // to raw config fields for the pre-deploy (not-yet-created) use case.
  let name: string, image: string | null, envVars: any[], ports: any[], memoryLimit: string | null, cpuLimit: string | null, branch: string | undefined;
  let sourceNote = '';

  if (deploymentId) {
    const dep = findDeploymentById(deploymentId);
    if (!dep) return res.status(404).json({ error: 'Deployment not found' });
    name = dep.name;
    image = dep.image;
    envVars = dep.envVars;
    ports = dep.ports;
    memoryLimit = dep.memoryLimit;
    cpuLimit = dep.cpuLimit;
    branch = dep.branch;
    sourceNote = dep.source === 'cloud' ? ` (cloud, provider: ${dep.provider})` : ' (local)';
  } else {
    ({ name, image = null, envVars = [], ports = [], memoryLimit = null, cpuLimit = null, branch } = req.body);
  }

  const existingDeployments = getDb().prepare("SELECT name, status FROM deployments LIMIT 20").all() as any[];
  const recentFailures = getDb().prepare(
    "SELECT d.name, COUNT(*) as c FROM deployments d JOIN build_logs l ON l.deployment_id=d.id WHERE l.level='error' GROUP BY d.id ORDER BY c DESC LIMIT 5"
  ).all() as any[];

  const prompt = `You are a DevOps risk assessor. Rate this deployment config from 0-100 (0=safe, 100=critical risk).

Config to assess${sourceNote}:
- Name: ${name || 'unnamed'}
- Image: ${image || 'not set'}
- Branch: ${branch || 'main'}
- Memory: ${memoryLimit || '512m'}, CPU: ${cpuLimit || '0.5'}
- Ports: ${ports.join(', ') || 'none'}
- Env vars count: ${envVars.length}
- Env keys: ${envVars.map((e: any) => e.key).join(', ') || 'none'}

Platform context:
- Existing deployments: ${existingDeployments.map((d: any) => `${d.name}(${d.status})`).join(', ')}
- High-error deployments: ${recentFailures.map((d: any) => `${d.name}(${d.c} errors)`).join(', ') || 'none'}

Respond ONLY with valid JSON (no markdown, no preamble):
{
  "score": <number 0-100>,
  "level": "<low|medium|high|critical>",
  "risks": ["<risk1>", "<risk2>", "<risk3>"],
  "recommendations": ["<rec1>", "<rec2>"],
  "blockers": ["<critical issue that should stop deploy, or empty array>"]
}`;

  try {
    const raw = await aiChatHelper('You are a JSON-only responder. Output only valid JSON.', prompt, 600);
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.json(result);
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.post('/root-cause', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  if (!deploymentId) return res.status(400).json({ error: 'deploymentId required' });

  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any
           || getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const logs = getDb().prepare("SELECT level, message FROM build_logs WHERE deployment_id=? ORDER BY id DESC LIMIT 40").all(deploymentId) as any[];
  const metrics = getDb().prepare("SELECT cpu, memory FROM metrics WHERE deployment_id=? ORDER BY timestamp DESC LIMIT 10").all(deploymentId) as any[];

  const prompt = `Deployment: ${dep?.name || 'unknown'} (status: ${dep?.status || 'unknown'})
Image: ${dep?.image || dep?.docker_image || dep?.repo_url || 'N/A'}

Recent error logs:
${logs.filter((l: any) => l.level === 'error' || l.level === 'warn').map((l: any) => `[${l.level}] ${l.message}`).join('\n') || 'No error logs'}

Metrics trend (newest first):
${metrics.map((m: any) => `CPU: ${m.cpu?.toFixed(1)}% | Mem: ${m.memory?.toFixed(0)}MB`).join('\n') || 'No metrics'}

Provide a concise root cause analysis with:
1. Most likely root cause (1-2 sentences)
2. Contributing factors (2-3 bullets)
3. Immediate fix (exact commands or steps)
4. Prevention going forward`;

  try {
    const analysis = await aiChatHelper(SYSTEM_PROMPT, prompt, 900);
    const reportId = uuidv4();
    getDb().prepare(`
      INSERT INTO ai_reports (id, user_id, type, deployment_id, deployment_name, content)
      VALUES (?, ?, 'root_cause', ?, ?, ?)
    `).run(reportId, req.user!.sub, deploymentId, dep.name, analysis);
    return res.json({ id: reportId, rootCause: analysis, deployment: dep, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.post('/optimize-config', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = findDeploymentById(deploymentId);
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const metrics = getDb().prepare("SELECT cpu, memory FROM metrics WHERE deployment_id=? ORDER BY timestamp DESC LIMIT 60").all(deploymentId) as any[];
  const cpus = metrics.map((m: any) => m.cpu).filter(Boolean);
  const mems = metrics.map((m: any) => m.memory).filter(Boolean);
  const avgCpu = cpus.length ? (cpus.reduce((a: number, b: number) => a + b, 0) / cpus.length).toFixed(1) : 'N/A';
  const maxCpu = cpus.length ? Math.max(...cpus).toFixed(1) : 'N/A';
  const avgMem = mems.length ? (mems.reduce((a: number, b: number) => a + b, 0) / mems.length).toFixed(0) : 'N/A';
  const maxMem = mems.length ? Math.max(...mems).toFixed(0) : 'N/A';

  const prompt = `Optimize this deployment's resource configuration for a production company environment.
${dep.source === 'cloud' ? `This is a cloud deployment on ${dep.provider}. Resource limits may not be directly configurable the same way as containers — advise accordingly.` : ''}

Current config:
- Memory limit: ${dep.memoryLimit || 'not set / managed by provider'}
- CPU limit: ${dep.cpuLimit || 'not set / managed by provider'}
- Restart policy: ${dep.restartPolicy || 'N/A'}
- Replicas: ${dep.replicas ?? 'N/A'}

Observed metrics (last 60 data points):
- Avg CPU: ${avgCpu}% | Max CPU: ${maxCpu}%
- Avg Memory: ${avgMem}MB | Max Memory: ${maxMem}MB

Respond ONLY with valid JSON:
{
  "recommendations": [
    { "field": "memory_limit", "current": "${dep.memoryLimit || 'N/A'}", "suggested": "<value>", "reason": "<why>" },
    { "field": "cpu_limit", "current": "${dep.cpuLimit || 'N/A'}", "suggested": "<value>", "reason": "<why>" },
    { "field": "replicas", "current": "${dep.replicas ?? 'N/A'}", "suggested": "<number>", "reason": "<why>" }
  ],
  "estimatedSavings": "<cost/resource savings estimate>",
  "priorityActions": ["<action1>", "<action2>"]
}`;

  try {
    const raw = await aiChatHelper('You are a JSON-only responder.', prompt, 700);
    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.post('/incident-report', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any
           || getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const logs = getDb().prepare("SELECT level, message, timestamp FROM build_logs WHERE deployment_id=? ORDER BY id DESC LIMIT 50").all(dep.id) as any[];

  const prompt = `Generate a professional incident report for a DevOps team at a company.

Incident Summary:
- Service: ${dep.name}
- Status: ${dep.status}
- Image/Source: ${dep.image || dep.docker_image || dep.repo_url || 'N/A'}
- Report time: ${new Date().toISOString()}

Recent logs (last 50):
${logs.map((l: any) => `[${l.level}] ${l.message}`).join('\n') || 'No logs'}

Write a concise, professional incident report with these sections:
# Incident Report: ${dep.name}
## Executive Summary
## Timeline
## Root Cause Analysis
## Impact Assessment
## Resolution Steps
## Prevention Recommendations
## Action Items`;

  try {
    const report = await aiChatHelper(SYSTEM_PROMPT, prompt, 1500);
    const reportId = uuidv4();
    getDb().prepare(`
      INSERT INTO ai_reports (id, user_id, type, deployment_id, deployment_name, content)
      VALUES (?, ?, 'incident', ?, ?, ?)
    `).run(reportId, req.user!.sub, deploymentId, dep.name, report);
    return res.json({ id: reportId, report, generatedAt: new Date().toISOString(), deployment: dep.name });
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

// ── Saved reports (root-cause + incident) ──────────────────────────────────
// Persisted so a report survives navigation/refresh instead of living only
// in the tool panel's local state.

router.get('/reports', requireAuth, (req: AuthRequest, res: Response) => {
  const { type } = req.query as { type?: string };
  const rows = type
    ? getDb().prepare('SELECT * FROM ai_reports WHERE user_id=? AND type=? ORDER BY created_at DESC LIMIT 50').all(req.user!.sub, type)
    : getDb().prepare('SELECT * FROM ai_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user!.sub);
  res.json(rows);
});

router.get('/reports/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const row = getDb().prepare('SELECT * FROM ai_reports WHERE id=? AND user_id=?').get(req.params.id, req.user!.sub) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.delete('/reports/:id', requireAuth, (req: AuthRequest, res: Response) => {
  getDb().prepare('DELETE FROM ai_reports WHERE id=? AND user_id=?').run(req.params.id, req.user!.sub);
  res.json({ ok: true });
});

router.post('/security-scan', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = findDeploymentById(deploymentId);
  if (!dep) return res.status(404).json({ error: 'Not found' });

  const prompt = `Perform a security review of this deployment configuration.
${dep.source === 'cloud' ? `This is a cloud deployment hosted on ${dep.provider}.` : 'This is a locally managed Docker deployment.'}

Deployment: ${dep.name}
Image: ${dep.image || 'N/A'}
Ports exposed: ${dep.ports.join(', ') || 'none'}
Restart policy: ${dep.restartPolicy || 'N/A'}
Env var keys (values hidden): ${dep.envVars.map((e: any) => e.key).join(', ') || 'none'}

Respond ONLY with valid JSON:
{
  "overallRisk": "<low|medium|high|critical>",
  "score": <security score 0-100, higher is more secure>,
  "findings": [
    { "severity": "<low|medium|high|critical>", "category": "<category>", "issue": "<description>", "fix": "<recommendation>" }
  ],
  "passed": ["<what looks good>"],
  "complianceFlags": ["<any GDPR, SOC2, or PCI concerns>"]
}`;

  try {
    const raw = await aiChatHelper('You are a cloud security expert. Respond only in JSON.', prompt, 800);
    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.get('/cost-analysis', requireAuth, (_req, res: Response) => {
  const cloudDeps = getDb().prepare("SELECT provider, name, status FROM cloud_deployments WHERE status='live'").all() as any[];
  const localDeps = getDb().prepare("SELECT name, memory_limit, cpu_limit, status FROM deployments WHERE status='running'").all() as any[];

  
  const PROVIDER_COSTS: Record<string, number> = { aws: 0.04, azure: 0.038, vercel: 0.02, render: 0.02, podium: 0.005 };
  const breakdown = cloudDeps.map((d: any) => ({
    name: d.name, provider: d.provider, status: d.status,
    estimatedMonthlyCost: (PROVIDER_COSTS[d.provider] || 0.025) * 24 * 30,
  }));

  const totalMonthly = breakdown.reduce((sum: number, d: any) => sum + d.estimatedMonthlyCost, 0);
  res.json({
    breakdown,
    localDeployments: localDeps.length,
    totalMonthlyEstimate: totalMonthly.toFixed(2),
    currency: 'USD',
    note: 'Estimates only — actual costs depend on region, plan, and usage.',
  });
});

router.post('/compare-deployments', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentIdA, deploymentIdB } = req.body;
  const depA = findDeploymentById(deploymentIdA);
  const depB = findDeploymentById(deploymentIdB);
  if (!depA || !depB) return res.status(404).json({ error: 'One or both deployments not found' });

  const metricsA = getDb().prepare("SELECT AVG(cpu) as avgCpu, AVG(memory) as avgMem FROM metrics WHERE deployment_id=? AND timestamp > ?").get(depA.id, Date.now() - 3600000) as any;
  const metricsB = getDb().prepare("SELECT AVG(cpu) as avgCpu, AVG(memory) as avgMem FROM metrics WHERE deployment_id=? AND timestamp > ?").get(depB.id, Date.now() - 3600000) as any;

  const prompt = `Compare these two deployments and provide actionable insights.

Deployment A: ${depA.name} (${depA.status})${depA.source === 'cloud' ? ` [cloud: ${depA.provider}]` : ' [local]'}
- Image: ${depA.image || 'N/A'} | Branch: ${depA.branch || 'N/A'}
- Memory: ${depA.memoryLimit || 'N/A'} | CPU: ${depA.cpuLimit || 'N/A'}
- Avg CPU (1h): ${metricsA?.avgCpu?.toFixed(1) || 'N/A'}% | Avg Mem: ${metricsA?.avgMem?.toFixed(0) || 'N/A'}MB

Deployment B: ${depB.name} (${depB.status})${depB.source === 'cloud' ? ` [cloud: ${depB.provider}]` : ' [local]'}
- Image: ${depB.image || 'N/A'} | Branch: ${depB.branch || 'N/A'}
- Memory: ${depB.memoryLimit || 'N/A'} | CPU: ${depB.cpuLimit || 'N/A'}
- Avg CPU (1h): ${metricsB?.avgCpu?.toFixed(1) || 'N/A'}% | Avg Mem: ${metricsB?.avgMem?.toFixed(0) || 'N/A'}MB

Provide: 1) Performance winner and why, 2) Resource efficiency comparison, 3) Config differences worth addressing, 4) Recommendation for which to promote to production.`;

  try {
    const comparison = await aiChatHelper(SYSTEM_PROMPT, prompt, 800);
    return res.json({ comparison, deploymentA: depA.name, deploymentB: depB.name });
  } catch (err: any) {
    return aiErrorResponse(res, err);
  }
});

router.get('/platform-summary', requireAuth, async (_req, res: Response) => {
  const db = getDb();
  const totalDeps = (db.prepare("SELECT COUNT(*) as c FROM deployments").get() as any)?.c || 0;
  const runningDeps = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status='running'").get() as any)?.c || 0;
  const failedDeps = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status='failed'").get() as any)?.c || 0;
  const cloudRunning = (db.prepare("SELECT COUNT(*) as c FROM cloud_deployments WHERE status='live'").get() as any)?.c || 0;
  const cloudFailedDeps = (db.prepare("SELECT COUNT(*) as c FROM cloud_deployments WHERE status='failed'").get() as any)?.c || 0;
  const recentErrors = (db.prepare("SELECT COUNT(*) as c FROM build_logs WHERE level='error' AND timestamp > datetime('now','-1 hour')").get() as any)?.c || 0;

  const platformPrompt = `Generate a 3-sentence executive health summary for this DevOps platform:
- Total deployments: ${totalDeps} (${runningDeps} running, ${failedDeps} failed)
- Cloud deployments: ${cloudRunning} live, ${cloudFailedDeps} failed
- Errors in last hour: ${recentErrors}

Be direct, professional, and action-oriented. Mention if anything needs immediate attention.`;

  try {
    const summary = await aiChatHelper(SYSTEM_PROMPT, platformPrompt, 300);
    return res.json({
      summary,
      stats: { totalDeps, runningDeps, failedDeps, cloudRunning, cloudFailedDeps, recentErrors },
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const aiError = !aiAvailable()
      ? 'AI features are not configured on this server. Contact your administrator.'
      : isAIAuthError(err)
        ? 'AI features are misconfigured on this server (the configured key was rejected). Contact your administrator.'
        : (err?.response?.data?.error?.message || err?.message || 'AI summary failed');
    return res.json({
      summary: null,
      aiError,
      stats: { totalDeps, runningDeps, failedDeps, cloudRunning, cloudFailedDeps, recentErrors },
      generatedAt: new Date().toISOString(),
    });
  }
});

router.post('/natural-deploy', requireAuth, async (req: any, res: Response) => {
  const { description, repoUrl, image } = req.body;
  if (!description && !repoUrl && !image) {
    return res.status(400).json({ error: 'Provide a description, repository URL, or Docker image' });
  }

  const prompt = repoUrl
    ? `Analyze this GitHub repository URL and generate an optimal Docker deployment configuration.

Repository: ${repoUrl}

Based on common patterns for this type of repository, determine:
1. The most appropriate Docker image (official image from Docker Hub)
2. Standard ports for this stack
3. Recommended environment variables (with placeholder values)
4. Appropriate resource limits
5. A deployment name derived from the repo name

Respond ONLY with a valid JSON object, no markdown, no explanation, just JSON:
{
  "name": "deployment-name",
  "image": "docker-image:tag",
  "repo_url": "${repoUrl}",
  "branch": "main",
  "dockerfile_path": "Dockerfile",
  "ports": [{"host": "8080", "container": "80"}],
  "env_vars": [{"key": "NODE_ENV", "value": "production"}],
  "memory_limit": "512m",
  "cpu_limit": "0.5",
  "restart_policy": "unless-stopped",
  "reasoning": "One sentence explaining why you chose this configuration"
}`
    : image
    ? `Generate an optimal Docker deployment configuration for this Docker image: "${image}"

Based on this image:
1. Determine the standard container port(s) this image exposes and a sensible host port mapping
2. Suggest relevant environment variables for this image (with sensible default/placeholder values)
3. Set appropriate resource limits for this image
4. Generate a clean deployment name derived from the image name

Respond ONLY with a valid JSON object, no markdown, no explanation, just JSON:
{
  "name": "deployment-name",
  "image": "${image}",
  "repo_url": "",
  "branch": "main",
  "dockerfile_path": "",
  "ports": [{"host": "8080", "container": "80"}],
  "env_vars": [{"key": "KEY", "value": "value"}],
  "memory_limit": "512m",
  "cpu_limit": "0.5",
  "restart_policy": "unless-stopped",
  "reasoning": "One sentence explaining why you chose this configuration"
}`
    : `Generate an optimal Docker deployment configuration for this description:

"${description}"

Based on this description:
1. Choose the best official Docker image
2. Determine the correct ports
3. Suggest relevant environment variables
4. Set appropriate resource limits
5. Generate a clean deployment name

Respond ONLY with a valid JSON object, no markdown, no explanation, just JSON:
{
  "name": "deployment-name",
  "image": "docker-image:tag",
  "repo_url": "",
  "branch": "main",
  "dockerfile_path": "Dockerfile",
  "ports": [{"host": "8080", "container": "80"}],
  "env_vars": [{"key": "NODE_ENV", "value": "production"}],
  "memory_limit": "512m",
  "cpu_limit": "0.5",
  "restart_policy": "unless-stopped",
  "reasoning": "One sentence explaining why you chose this configuration"
}`;

  try {
    const raw = await aiChatHelper(
      'You are a Docker and DevOps expert. You ONLY respond with valid JSON objects. No markdown, no code blocks, no explanation. Just raw JSON.',
      prompt,
      800
    );

    let config;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      config = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI returned invalid JSON');
      config = JSON.parse(match[0]);
    }

    if (!config.name || !config.image) {
      throw new Error('AI response missing required fields');
    }

    return res.json({ config });
  } catch (err: any) {
    if (err.message === 'AI returned invalid JSON' || err.message === 'AI response missing required fields') {
      return res.status(502).json({ error: err.message });
    }
    return aiErrorResponse(res, err);
  }
});

export default router;
