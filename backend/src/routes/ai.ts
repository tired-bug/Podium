import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { getDb } from '../db/index';
import { requireAuth, AuthRequest } from '../auth';

const router = Router();

/* ---------------- helpers ---------------- */

function getGroqKey(): string | null {
  const setting = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'groq_api_key'")
    .get() as any;
  return setting?.value || process.env.GROQ_API_KEY || null;
}

function getModel(): string {
  const setting = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'groq_model'")
    .get() as any;
  return setting?.value || 'llama-3.3-70b-versatile';
}

const SYSTEM_PROMPT = `
You are Podium AI, a DevOps assistant.

You help with:
- Docker & containers
- CI/CD pipelines
- Cloud (AWS/Azure/Vercel)
- Logs & debugging
- Monitoring & anomalies
- Security & optimization

Be concise and actionable.
`;

/* ---------------- safe groq caller ---------------- */

async function groqChat(system: string, user: string, maxTokens = 1200) {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error('Groq API key not configured');

  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: getModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: maxTokens,
      temperature: 0.6
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return resp.data.choices[0].message.content;
}

/* ---------------- model settings ---------------- */

router.get('/model', requireAuth, (_req, res: Response) => {
  const key = getGroqKey();
  res.json({ model: getModel(), hasKey: !!key });
});

router.put('/model', requireAuth, (req, res: Response) => {
  const { model, apiKey } = req.body;
  if (model) {
    getDb()
      .prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('groq_model',?)")
      .run(model);
  }
  if (apiKey) {
    getDb()
      .prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('groq_api_key',?)")
      .run(apiKey);
  }
  res.json({ ok: true });
});

/* ---------------- CHAT (streaming) ---------------- */

router.post('/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const apiKey = getGroqKey();
  if (!apiKey) return res.status(400).json({ error: 'Missing Groq API key' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: getModel(),
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        max_tokens: 2048
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    let buffer = '';

    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.replace('data: ', '').trim();

        if (data === '[DONE]') {
          res.write(`data: [DONE]\n\n`);
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {}
      }
    });

    response.data.on('end', () => res.end());
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

/* ---------------- ANALYZE DEPLOYMENT ---------------- */

router.post('/analyze', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;

  const dep = getDb().prepare('SELECT * FROM deployments WHERE id=?').get(deploymentId) as any;
  if (!dep) return res.status(404).json({ error: 'not found' });

  const logs = getDb()
    .prepare('SELECT * FROM build_logs WHERE deployment_id=? ORDER BY id DESC LIMIT 50')
    .all(deploymentId) as any[];

  const prompt = `
Analyze deployment:
Name: ${dep.name}
Status: ${dep.status}
Image: ${dep.image || 'N/A'}

Logs:
${logs.map(l => `[${l.level}] ${l.message}`).join('\n')}

Return issues + fixes.
`;

  const analysis = await groqChat(SYSTEM_PROMPT, prompt, 1200);
  res.json({ analysis });
});

/* ---------------- FIX SUGGESTION ---------------- */

router.post('/suggest-fix', requireAuth, async (req: AuthRequest, res: Response) => {
  const { deploymentId } = req.body;

  const logs = getDb()
    .prepare("SELECT * FROM build_logs WHERE deployment_id=? AND level IN ('error','warn') ORDER BY id DESC LIMIT 30")
    .all(deploymentId) as any[];

  const prompt = `
Fix this deployment:

Logs:
${logs.map(l => `[${l.level}] ${l.message}`).join('\n')}

Give exact fix commands.
`;

  const suggestion = await groqChat(SYSTEM_PROMPT, prompt, 900);
  res.json({ suggestion });
});

/* ---------------- RISK SCORE ---------------- */

router.post('/risk-score', requireAuth, async (req: AuthRequest, res: Response) => {
  const prompt = `
Rate this deployment risk 0-100.
Return JSON only.

Config:
${JSON.stringify(req.body)}
`;

  const raw = await groqChat('Return only JSON', prompt, 800);
  const clean = raw.replace(/```json|```/g, '').trim();

  res.json(JSON.parse(clean));
});

/* ---------------- ROOT CAUSE ---------------- */

router.post('/root-cause', requireAuth, async (req: AuthRequest, res: Response) => {
  const prompt = `
Find root cause of issue:

${JSON.stringify(req.body)}

Return structured analysis.
`;

  const result = await groqChat(SYSTEM_PROMPT, prompt, 1200);
  res.json({ rootCause: result });
});

export default router;