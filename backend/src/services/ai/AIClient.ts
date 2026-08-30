import axios from 'axios';

/**
 * Single point of contact with the LLM provider used across Podium
 * (repo inference, deployment-failure analysis, security/cost reports, etc).
 *
 * Why this exists: every call site used to hit each provider's endpoint
 * directly, so a provider swap meant hunting through ~6 files. Now it's
 * one file — a provider/model swap is a one-line env var change (or, worst
 * case, one new branch in callChat below).
 *
 * Currently wired to Groq's free tier (OpenAI-compatible chat completions),
 * running openai/gpt-oss-120b — an intelligent open-weight model with a
 * generous free rate limit and no quota surprises like Gemini's 20 req/day
 * cap. If Groq's free tier ever changes for a given model, swap AI_MODEL
 * below — no other file needs to change.
 */

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

function apiKey(): string | undefined {
  return process.env.AI_API_KEY || process.env.GROQ_API_KEY;
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

const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Chat-style call: system prompt + user prompt in, raw text response out.
 */
export async function aiChat(systemPrompt: string, userPrompt: string, maxTokens = 1200): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error('AI API key not configured (set GROQ_API_KEY)');

  try {
    const resp = await axios.post(
      BASE_URL,
      {
        model: model(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.1,
      },
      {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        timeout: 25000,
      }
    );

    const text = resp.data?.choices?.[0]?.message?.content;
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
 * text once the stream ends. Groq's stream is an OpenAI-style SSE delta
 * stream, so parsing is a straightforward `choices[0].delta.content` read.
 */
export async function aiChatStream(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  maxTokens = 2048
): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error('AI API key not configured (set GROQ_API_KEY)');

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  ];

  let fullText = '';

  const response = await axios.post(
    BASE_URL,
    {
      model: model(),
      messages: chatMessages,
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true,
    },
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
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
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const piece = parsed?.choices?.[0]?.delta?.content;
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
