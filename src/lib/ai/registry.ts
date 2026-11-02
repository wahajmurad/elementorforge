/**
 * AI provider registry. Every provider implements the same minimal interface;
 * the pipeline is provider-agnostic. Providers:
 *  - anthropic : Claude Messages API (ANTHROPIC_API_KEY)
 *  - openai    : OpenAI Chat Completions (OPENAI_API_KEY)
 *  - zai       : Z.ai SDK (used in this sandbox; backend only)
 *  - mock      : deterministic offline generator (tests / no-key demo)
 *
 * Selection: AI_PROVIDER env (anthropic|openai|zai|mock), auto-detected by
 * available keys when unset. Model per provider configurable via AI_MODEL.
 */

export interface ChatMessage { role: 'system' | 'user'; content: string }

export interface AiResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  provider: string;
  model: string;
}

export interface AiProvider {
  name: string;
  model: string;
  complete(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<AiResult>;
}

function extractJson(text: string): unknown {
  // Tolerant JSON extraction: strips code fences and prose.
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error('AI response did not contain JSON');
  const candidate = cleaned.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    // try trimming trailing prose after the last brace/bracket
    const lastObj = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (lastObj > 0) return JSON.parse(candidate.slice(0, lastObj + 1));
    throw new Error('AI response was not parseable JSON');
  }
}

async function anthropicProvider(): Promise<AiProvider> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const model = process.env.AI_MODEL || 'claude-sonnet-4-20250514';
  return {
    name: 'anthropic', model,
    async complete(messages, opts) {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const userMsgs = messages.filter(m => m.role === 'user').map(m => ({ role: 'user' as const, content: m.content }));
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: opts?.maxTokens ?? 8000, system, messages: userMsgs, temperature: opts?.temperature ?? 0.4 }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
      return {
        text: data.content.filter(c => c.type === 'text').map(c => c.text).join(''),
        tokensIn: data.usage.input_tokens, tokensOut: data.usage.output_tokens,
        provider: 'anthropic', model,
      };
    },
  };
}

async function openaiProvider(): Promise<AiProvider> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.AI_MODEL || 'gpt-4o';
  return {
    name: 'openai', model,
    async complete(messages, opts) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model, messages, max_tokens: opts?.maxTokens ?? 8000, temperature: opts?.temperature ?? 0.4,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number } };
      return {
        text: data.choices[0]?.message?.content ?? '',
        tokensIn: data.usage.prompt_tokens, tokensOut: data.usage.completion_tokens,
        provider: 'openai', model,
      };
    },
  };
}

async function zaiProvider(): Promise<AiProvider> {
  // Sandbox/自研 provider. Imported dynamically — backend only.
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  return {
    name: 'zai', model: process.env.AI_MODEL || 'glm-4.6',
    async complete(messages, opts) {
      const completion = await zai.chat.completions.create({
        messages: messages.map(m => ({ role: m.role as 'assistant' | 'user', content: m.content })),
        thinking: { type: 'disabled' },
      });
      return {
        text: completion.choices[0]?.message?.content ?? '',
        tokensIn: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
        tokensOut: Math.ceil((completion.choices[0]?.message?.content ?? '').length / 4),
        provider: 'zai', model: 'glm-4.6',
      };
    },
  };
}

// Deterministic offline provider used by tests and no-key environments.
export const mockProvider: AiProvider = {
  name: 'mock', model: 'mock-1',
  async complete(messages) {
    const { mockComplete } = await import('./mock-engine');
    return {
      text: mockComplete(messages),
      tokensIn: 0, tokensOut: 0, provider: 'mock', model: 'mock-1',
    };
  },
};

let cached: AiProvider | null = null;

/** Wrap any provider with exponential backoff on 429/5xx (rate limits, blips). */
function withRetries(p: AiProvider): AiProvider {
  return {
    name: p.name, model: p.model,
    async complete(messages, opts) {
      let lastErr: unknown;
      const delays = [2000, 6000, 15000];
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
          return await p.complete(messages, opts);
        } catch (err) {
          lastErr = err;
          const msg = (err as Error).message ?? '';
          const retryable = /\b429\b|\b5\d\d\b|rate.?limit|overloaded|timeout/i.test(msg);
          if (!retryable || attempt === delays.length) throw err;
          await new Promise(r => setTimeout(r, delays[attempt]));
        }
      }
      throw lastErr;
    },
  };
}

export async function getProvider(): Promise<AiProvider> {
  if (cached) return cached;
  const preferred = process.env.AI_PROVIDER?.toLowerCase();
  const order: string[] = preferred ? [preferred] : ['anthropic', 'openai', 'zai', 'mock'];
  for (const name of order) {
    try {
      const p = name === 'anthropic' ? await anthropicProvider()
        : name === 'openai' ? await openaiProvider()
        : name === 'zai' ? await zaiProvider()
        : mockProvider;
      cached = withRetries(p);
      return cached;
    } catch { /* try next */ }
  }
  return withRetries(mockProvider);
}

export { extractJson };
