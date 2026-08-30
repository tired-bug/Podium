import axios from 'axios';

/**
 * Single point of contact with the LLM provider used across Podium
 * (repo inference, deployment-failure analysis, security/cost reports, etc).
 *
 * Why this exists: every call site used to hit Groq's endpoint directly,
 * so when a free-tier model got pulled we had to hunt through ~6 files.
 * Now a provider/model swap is a one-line env var change (or, worst case,
 * one new branch in callChat below) instead of a repo-wide find/replace.
 *
 * Currently wired to Gemini's free tier (generateContent). If Gemini's
 * free tier ever gets discontinued for a given model the same way Groq's
 * did, swap AI_MODEL below — no other file needs to change.
 */

const DEFAULT_MODEL = 'gemini-3.6-flash';

function apiKey(): string | undefined {
  return process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
}

function model(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

export function aiAvailable(): boolean {
  return !!apiKey();
}

export function aiModelName(): string {
  return model();
}

export class AIAuthError extends Error {}

/**
 * Chat-style call: system prompt + user prompt in, raw text response out.
 * Mirrors the shape the old groqChat() helper had, so call sites barely change.
 */
export async function aiChat(systemPrompt: string, userPrompt: string, maxTokens = 1200): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error('AI API key not configured (set GEMINI_API_KEY)');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`;

  try {
    const resp = await axios.post(
      url,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.1,
        },
      },
      {
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        timeout: 25000,
      }
    );

    const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new Error('Unexpected response shape from AI provider');
    }
    return text;
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 401 || status === 403) {
      throw new AIAuthError(e?.response?.data?.error?.message || 'AI provider authentication failed');
    }
    throw e;
  }
}

export function isAIAuthError(err: any): boolean {
  return err instanceof AIAuthError;
}

/**
 * Streaming chat call for the interactive AI Hub chat widget. Emits text
 * chunks as they arrive via onChunk; resolves with the full concatenated
 * text once the stream ends.
 *
 * Note: unlike Groq's OpenAI-style delta stream, Gemini's streamGenerateContent
 * sends a JSON array of full candidate objects over time — each chunk we parse
 * out is a whole "so far" text delta, so callers just get plain text pieces
 * and don't need to know about the underlying wire format.
 */
export async function aiChatStream(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  maxTokens = 2048
): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error('AI API key not configured (set GEMINI_API_KEY)');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model()}:streamGenerateContent?alt=sse`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // gemini-3.6-flash (and later) reject requests whose last turn has role
  // "model" — drop any trailing assistant message(s) defensively so a stray
  // one in chat history doesn't hard-fail the call.
  while (contents.length && contents[contents.length - 1].role === 'model') {
    contents.pop();
  }
  if (!contents.length) {
    throw new Error('No user turn to send to AI provider');
  }

  let fullText = '';

  const response = await axios.post(
    url,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    },
    {
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      responseType: 'stream',
      timeout: 60000,
    }
  ).catch((e: any) => {
    const status = e?.response?.status;
    if (status === 401 || status === 403) {
      throw new AIAuthError(e?.response?.data?.error?.message || 'AI provider authentication failed');
    }
    throw e;
  });

  const stream = response.data;
  let buffer = '';

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        try {
          const parsed = JSON.parse(data);
          const piece = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (piece) {
            fullText += piece;
            onChunk(piece);
          }
        } catch { /* ignore partial/non-JSON keepalive lines */ }
      }
    });
    stream.on('end', () => resolve());
    stream.on('error', (err: Error) => reject(err));
  });

  return fullText;
}
