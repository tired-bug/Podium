import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { getDb } from '../db/index';
import { requireAuth, AuthRequest } from '../auth';

const router = Router();

function getGroqKey(): string | null {
  const setting = getDb().prepare("SELECT value FROM settings WHERE key = 'groq_api_key'").get() as any;
  return setting?.value || process.env.GROQ_API_KEY || null;
}

function getModel(): string {
  const setting = getDb().prepare("SELECT value FROM settings WHERE key = 'groq_model'").get() as any;
  return setting?.value || 'llama-3.3-70b-versatile';
}

const SYSTEM_PROMPT = `You are Podium AI, an expert DevOps assistant embedded in the Podium AIOps platform.
You help DevOps engineers with:
- Docker container management and troubleshooting
- CI/CD pipeline optimization
- Cloud deployments (AWS, Azure, Vercel)
- Infrastructure monitoring and anomaly resolution
- Log analysis and debugging
- Security hardening and best practices

Be concise, precise, and actionable. Format code in markdown code blocks with language specifiers.
When analyzing issues, provide step-by-step resolution plans.`;

router.get('/model', requireAuth, (_req, res: Response) => {
  const key = getGroqKey();
  const model = getModel();
  res.json({ model, hasKey: !!key });
});

router.put('/model', requireAuth, (req, res: Response) => {
  const { model, apiKey } = req.body;
  if (model) getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('groq_model', ?)").run(model);
  if (apiKey) getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('groq_api_key', ?)").run(apiKey);
  res.json({ ok: true });
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

  const apiKey = getGroqKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'Groq API key not configured. Please add it in Settings → AI.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const messages = [
    ...history.slice(-20).map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  let fullContent = '';

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: getModel(),
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_tokens: 2048,
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        responseType: 'stream',
      }
    );

    const stream = response.data;
    let buffer = '';

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          res.write(`data: [DONE]\n\n`);
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
          }
        } catch {}
      }
    });

    stream.on('end', () => {
      
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
    });

    stream.on('error', (err: Error) => {
      res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
      res.end();
    });

  } catch (err: any) {
    const errMsg = err.response?.data?.error?.message || err.message;
    res.write(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`);
    res.end();
  }
});

router.post('/analyze', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId, prompt } = req.body;
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const logs = getDb().prepare('SELECT * FROM build_logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 50').all(deploymentId) as any[];
  const metrics = getDb().prepare('SELECT * FROM metrics WHERE deployment_id = ? ORDER BY timestamp DESC LIMIT 10').all(deploymentId) as any[];
  const anomalies = getDb().prepare('SELECT * FROM anomalies WHERE deployment_id = ? AND resolved = 0').all(deploymentId) as any[];

  const context = `
Deployment: ${dep.name} (${dep.status})
Image: ${dep.image || 'N/A'}
Branch: ${dep.branch}
Memory Limit: ${dep.memory_limit}, CPU Limit: ${dep.cpu_limit}

Recent Logs (last 50):
${logs.map(l => `[${l.level.toUpperCase()}] ${l.message}`).join('\n')}

Recent Metrics:
${metrics.map(m => `CPU: ${m.cpu?.toFixed(1)}%, Memory: ${m.memory?.toFixed(0)}MB`).join('\n')}

Active Anomalies: ${anomalies.length > 0 ? anomalies.map(a => a.message).join('; ') : 'None'}
`;

  const analysisPrompt = prompt || `Analyze this deployment and provide:
1. Current health assessment
2. Key issues identified
3. Recommended actions
4. Performance optimization tips`;

  const apiKey = getGroqKey();
  if (!apiKey) return res.status(400).json({ error: 'Groq API key not configured' });

  try {
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: getModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${analysisPrompt}\n\n${context}` },
      ],
      max_tokens: 1500,
    }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });

    return res.json({ analysis: resp.data.choices[0].message.content });
  } catch (err: any) {
    return res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

router.post('/suggest-fix', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });

  const logs = getDb().prepare(`
    SELECT * FROM build_logs WHERE deployment_id = ? AND level IN ('error', 'warn') ORDER BY id DESC LIMIT 30
  `).all(deploymentId) as any[];

  const apiKey = getGroqKey();
  if (!apiKey) return res.status(400).json({ error: 'Groq API key not configured' });

  const prompt = `Deployment "${dep.name}" has status "${dep.status}".
Error/warning logs:
${logs.map(l => `[${l.level}] ${l.message}`).join('\n') || 'No error logs found.'}

Provide a concise fix recommendation with exact commands or config changes needed.`;

  try {
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: getModel(),
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      max_tokens: 800,
    }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });

    return res.json({ suggestion: resp.data.choices[0].message.content });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/summarize-logs', requireAuth, async (_req, res: Response) => {
  const { deploymentId } = _req.body;
  const logs = getDb().prepare('SELECT * FROM build_logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 100').all(deploymentId) as any[];

  const apiKey = getGroqKey();
  if (!apiKey) return res.status(400).json({ error: 'Groq API key not configured' });

  const prompt = `Summarize these deployment logs in 3-5 bullet points, highlighting any issues:\n\n${
    logs.map(l => `[${l.level}] ${l.message}`).join('\n')
  }`;

  try {
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: getModel(),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });

    return res.json({ summary: resp.data.choices[0].message.content });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/anomalies', requireAuth, (_req, res: Response) => {
  
  
  
  const anomalies = getDb().prepare(`
    SELECT a.*,
      COALESCE(d.name, cd.name) AS deployment_name,
      CASE WHEN cd.id IS NOT NULL THEN cd.provider ELSE NULL END AS cloud_provider
    FROM anomalies a
    LEFT JOIN deployments    d  ON a.deployment_id = d.id
    LEFT JOIN cloud_deployments cd ON a.deployment_id = cd.id
    WHERE a.resolved = 0
      AND (d.id IS NOT NULL OR cd.id IS NOT NULL)
    ORDER BY a.created_at DESC
  `).all();
  res.json(anomalies);
});

router.put('/anomalies/:id/resolve', requireAuth, (req, res: Response) => {
  getDb().prepare("UPDATE anomalies SET resolved = 1, resolved_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;

async function groqChat(systemPrompt: string, userPrompt: string, maxTokens = 1200): Promise<string> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error('Groq API key not configured');
  const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: getModel(),
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    max_tokens: maxTokens,
    temperature: 0.5,
  }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
  return resp.data.choices[0].message.content as string;
}

router.post('/risk-score', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, image, envVars = [], ports = [], memoryLimit, cpuLimit, branch } = req.body;
  const existingDeployments = getDb().prepare("SELECT name, status FROM deployments LIMIT 20").all() as any[];
  const recentFailures = getDb().prepare(
    "SELECT d.name, COUNT(*) as c FROM deployments d JOIN build_logs l ON l.deployment_id=d.id WHERE l.level='error' GROUP BY d.id ORDER BY c DESC LIMIT 5"
  ).all() as any[];

  const prompt = `You are a DevOps risk assessor. Rate this deployment config from 0-100 (0=safe, 100=critical risk).

Config to assess:
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
    const raw = await groqChat('You are a JSON-only responder. Output only valid JSON.', prompt, 600);
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/root-cause', requireAuth, async (req: AuthRequest, res: Response) => {
  const { anomalyId, deploymentId } = req.body;
  if (!anomalyId && !deploymentId) return res.status(400).json({ error: 'anomalyId or deploymentId required' });

  let anomaly: any = null;
  let dep: any = null;

  if (anomalyId) {
    anomaly = getDb().prepare('SELECT * FROM anomalies WHERE id=?').get(anomalyId) as any;
    if (!anomaly) return res.status(404).json({ error: 'Anomaly not found' });
    dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(anomaly.deployment_id) as any
       || getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(anomaly.deployment_id) as any;
  } else {
    dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any;
    if (!dep) return res.status(404).json({ error: 'Deployment not found' });
    anomaly = getDb().prepare("SELECT * FROM anomalies WHERE deployment_id=? AND resolved=0 ORDER BY created_at DESC LIMIT 1").get(deploymentId) as any;
  }

  const logs = getDb().prepare("SELECT level, message FROM build_logs WHERE deployment_id=? ORDER BY id DESC LIMIT 40").all(anomaly?.deployment_id || deploymentId) as any[];
  const metrics = getDb().prepare("SELECT cpu, memory FROM metrics WHERE deployment_id=? ORDER BY timestamp DESC LIMIT 10").all(anomaly?.deployment_id || deploymentId) as any[];

  const prompt = `Anomaly: ${anomaly?.type || 'unknown'} — ${anomaly?.message || 'No anomaly data'}
Severity: ${anomaly?.severity || 'unknown'}
Deployment: ${dep?.name || 'unknown'} (status: ${dep?.status || 'unknown'})
Image: ${dep?.image || dep?.docker_image || 'N/A'}

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
    const analysis = await groqChat(SYSTEM_PROMPT, prompt, 900);
    return res.json({ rootCause: analysis, anomaly, deployment: dep });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/optimize-config', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const metrics = getDb().prepare("SELECT cpu, memory FROM metrics WHERE deployment_id=? ORDER BY timestamp DESC LIMIT 60").all(deploymentId) as any[];
  const cpus = metrics.map((m: any) => m.cpu).filter(Boolean);
  const mems = metrics.map((m: any) => m.memory).filter(Boolean);
  const avgCpu = cpus.length ? (cpus.reduce((a: number, b: number) => a + b, 0) / cpus.length).toFixed(1) : 'N/A';
  const maxCpu = cpus.length ? Math.max(...cpus).toFixed(1) : 'N/A';
  const avgMem = mems.length ? (mems.reduce((a: number, b: number) => a + b, 0) / mems.length).toFixed(0) : 'N/A';
  const maxMem = mems.length ? Math.max(...mems).toFixed(0) : 'N/A';

  const prompt = `Optimize this deployment's resource configuration for a production company environment.

Current config:
- Memory limit: ${dep.memory_limit}
- CPU limit: ${dep.cpu_limit}
- Restart policy: ${dep.restart_policy}
- Replicas: ${dep.replicas}

Observed metrics (last 60 data points):
- Avg CPU: ${avgCpu}% | Max CPU: ${maxCpu}%
- Avg Memory: ${avgMem}MB | Max Memory: ${maxMem}MB

Respond ONLY with valid JSON:
{
  "recommendations": [
    { "field": "memory_limit", "current": "${dep.memory_limit}", "suggested": "<value>", "reason": "<why>" },
    { "field": "cpu_limit", "current": "${dep.cpu_limit}", "suggested": "<value>", "reason": "<why>" },
    { "field": "replicas", "current": "${dep.replicas}", "suggested": "<number>", "reason": "<why>" }
  ],
  "estimatedSavings": "<cost/resource savings estimate>",
  "priorityActions": ["<action1>", "<action2>"]
}`;

  try {
    const raw = await groqChat('You are a JSON-only responder.', prompt, 700);
    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/natural-deploy', requireAuth, async (req: AuthRequest, res: Response) => {
  const { prompt: userPrompt } = req.body;
  if (!userPrompt) return res.status(400).json({ error: 'prompt required' });

  const aiPrompt = `Convert this natural language deployment request into a structured deployment config.

User said: "${userPrompt}"

Respond ONLY with valid JSON (no markdown):
{
  "name": "<slug name, lowercase, dashes>",
  "image": "<docker image:tag or null>",
  "repoUrl": "<github url or null>",
  "branch": "<branch name, default main>",
  "ports": [<port numbers as integers>],
  "memoryLimit": "<e.g. 512m or 1g>",
  "cpuLimit": "<e.g. 0.5 or 1.0>",
  "envVars": [{"key": "<KEY>", "value": "<value>"}],
  "restartPolicy": "<always|unless-stopped|on-failure|no>",
  "provider": "<local|render|aws|azure|vercel|null>",
  "confidence": <0-100>,
  "clarifications": ["<anything ambiguous that needs user confirmation>"]
}`;

  try {
    const raw = await groqChat('You are a JSON-only responder for a DevOps platform.', aiPrompt, 600);
    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/incident-report', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId, anomalyIds = [] } = req.body;
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any
           || getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });

  const anomalies = anomalyIds.length > 0
    ? getDb().prepare(`SELECT * FROM anomalies WHERE id IN (${anomalyIds.map(() => '?').join(',')}) ORDER BY created_at ASC`).all(...anomalyIds) as any[]
    : getDb().prepare("SELECT * FROM anomalies WHERE deployment_id=? ORDER BY created_at ASC LIMIT 10").all(dep.id) as any[];
  const logs = getDb().prepare("SELECT level, message, timestamp FROM build_logs WHERE deployment_id=? ORDER BY id DESC LIMIT 50").all(dep.id) as any[];

  const prompt = `Generate a professional incident report for a DevOps team at a company.

Incident Summary:
- Service: ${dep.name}
- Status: ${dep.status}
- Image/Source: ${dep.image || dep.docker_image || dep.repo_url || 'N/A'}
- Report time: ${new Date().toISOString()}

Anomalies (${anomalies.length}):
${anomalies.map((a: any) => `[${a.severity.toUpperCase()}] ${a.type}: ${a.message} at ${a.created_at}`).join('\n') || 'No anomalies'}

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
    const report = await groqChat(SYSTEM_PROMPT, prompt, 1500);
    return res.json({ report, generatedAt: new Date().toISOString(), deployment: dep.name });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/security-scan', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;
  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });
  const envVars = JSON.parse(dep.env_vars || '[]');

  const prompt = `Perform a security review of this deployment configuration.

Deployment: ${dep.name}
Image: ${dep.image || 'N/A'}
Ports exposed: ${JSON.parse(dep.ports || '[]').join(', ') || 'none'}
Restart policy: ${dep.restart_policy}
Env var keys (values hidden): ${envVars.map((e: any) => e.key).join(', ') || 'none'}

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
    const raw = await groqChat('You are a cloud security expert. Respond only in JSON.', prompt, 800);
    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/cost-analysis', requireAuth, (_req, res: Response) => {
  const cloudDeps = getDb().prepare("SELECT provider, name, status FROM cloud_deployments WHERE status='running'").all() as any[];
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
  const depA = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentIdA) as any;
  const depB = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentIdB) as any;
  if (!depA || !depB) return res.status(404).json({ error: 'One or both deployments not found' });

  const metricsA = getDb().prepare("SELECT AVG(cpu) as avgCpu, AVG(memory) as avgMem FROM metrics WHERE deployment_id=? AND timestamp > ?").get(depA.id, Date.now() - 3600000) as any;
  const metricsB = getDb().prepare("SELECT AVG(cpu) as avgCpu, AVG(memory) as avgMem FROM metrics WHERE deployment_id=? AND timestamp > ?").get(depB.id, Date.now() - 3600000) as any;

  const prompt = `Compare these two deployments and provide actionable insights.

Deployment A: ${depA.name} (${depA.status})
- Image: ${depA.image || 'N/A'} | Branch: ${depA.branch}
- Memory: ${depA.memory_limit} | CPU: ${depA.cpu_limit}
- Avg CPU (1h): ${metricsA?.avgCpu?.toFixed(1) || 'N/A'}% | Avg Mem: ${metricsA?.avgMem?.toFixed(0) || 'N/A'}MB

Deployment B: ${depB.name} (${depB.status})
- Image: ${depB.image || 'N/A'} | Branch: ${depB.branch}
- Memory: ${depB.memory_limit} | CPU: ${depB.cpu_limit}
- Avg CPU (1h): ${metricsB?.avgCpu?.toFixed(1) || 'N/A'}% | Avg Mem: ${metricsB?.avgMem?.toFixed(0) || 'N/A'}MB

Provide: 1) Performance winner and why, 2) Resource efficiency comparison, 3) Config differences worth addressing, 4) Recommendation for which to promote to production.`;

  try {
    const comparison = await groqChat(SYSTEM_PROMPT, prompt, 800);
    return res.json({ comparison, deploymentA: depA.name, deploymentB: depB.name });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/platform-summary', requireAuth, async (_req, res: Response) => {
  const db = getDb();
  const totalDeps = (db.prepare("SELECT COUNT(*) as c FROM deployments").get() as any)?.c || 0;
  const runningDeps = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status='running'").get() as any)?.c || 0;
  const failedDeps = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status='failed'").get() as any)?.c || 0;
  const openAnomalies = (db.prepare("SELECT COUNT(*) as c FROM anomalies WHERE resolved=0").get() as any)?.c || 0;
  const criticalAnomalies = (db.prepare("SELECT COUNT(*) as c FROM anomalies WHERE resolved=0 AND severity='critical'").get() as any)?.c || 0;
  const cloudRunning = (db.prepare("SELECT COUNT(*) as c FROM cloud_deployments WHERE status='running'").get() as any)?.c || 0;
  const recentErrors = (db.prepare("SELECT COUNT(*) as c FROM build_logs WHERE level='error' AND timestamp > datetime('now','-1 hour')").get() as any)?.c || 0;

  const platformPrompt = `Generate a 3-sentence executive health summary for this DevOps platform:
- Total deployments: ${totalDeps} (${runningDeps} running, ${failedDeps} failed)
- Cloud deployments running: ${cloudRunning}
- Open anomalies: ${openAnomalies} (${criticalAnomalies} critical)
- Errors in last hour: ${recentErrors}

Be direct, professional, and action-oriented. Mention if anything needs immediate attention.`;

  try {
    const summary = await groqChat(SYSTEM_PROMPT, platformPrompt, 300);
    return res.json({
      summary,
      stats: { totalDeps, runningDeps, failedDeps, openAnomalies, criticalAnomalies, cloudRunning, recentErrors },
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    
    return res.json({
      summary: null,
      stats: { totalDeps, runningDeps, failedDeps, openAnomalies, criticalAnomalies, cloudRunning, recentErrors },
      generatedAt: new Date().toISOString(),
    });
  }
});

router.post('/natural-deploy', requireAuth, async (req: any, res: Response) => {
  const { description, repoUrl } = req.body;
  if (!description && !repoUrl) return res.status(400).json({ error: 'Provide description or repoUrl' });

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
    const raw = await groqChat(
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
    return res.status(500).json({ error: err.message || 'AI analysis failed' });
  }
});
