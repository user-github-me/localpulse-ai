import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/lib/errors';
import {
  listModels,
  OpenAICompatibleProvider,
  toProviderError,
} from '@/providers/openai-compatible';
import { suggestModel, presetById } from '@/providers/presets';
import type { EndpointConfig } from '@/storage/settings';
import { sseBody } from './helpers';

const cloud: EndpointConfig = {
  id: 'ep:groq',
  presetId: 'groq',
  label: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-test',
  contextTokens: 6000,
};

const local: EndpointConfig = {
  id: 'ep:ollama',
  presetId: 'ollama',
  label: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
  model: 'qwen3',
  contextTokens: 4096,
};

function streamResponse(events: string[]): Response {
  return new Response(sseBody(events.map((event) => `data: ${event}\n\n`)), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('OpenAICompatibleProvider', () => {
  it('labels local servers as on-device and APIs as cloud', () => {
    expect(new OpenAICompatibleProvider(local, { getKey: async () => undefined }).privacy).toBe(
      'on-device',
    );
    expect(new OpenAICompatibleProvider(cloud, { getKey: async () => 'k' }).privacy).toBe('cloud');
  });

  it('streams text deltas and sends the key in a header', async () => {
    const fetch = vi.fn(async () =>
      streamResponse([
        JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
        '[DONE]',
      ]),
    );
    const provider = new OpenAICompatibleProvider(cloud, { getKey: async () => 'secret', fetch });
    let text = '';
    for await (const chunk of provider.stream([{ role: 'user', content: 'Hi' }])) text += chunk;
    expect(text).toBe('Hello');

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(url).not.toContain('secret');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'llama-test', stream: true });
  });

  it('reports setup problems before any request', async () => {
    const noKey = new OpenAICompatibleProvider(cloud, { getKey: async () => undefined });
    expect(await noKey.state()).toMatchObject({ kind: 'needs-setup', reason: 'no-key' });

    const noModel = new OpenAICompatibleProvider(
      { ...cloud, model: '' },
      { getKey: async () => 'k' },
    );
    expect(await noModel.state()).toMatchObject({ kind: 'needs-setup', reason: 'no-model' });

    const noAccess = new OpenAICompatibleProvider(local, {
      getKey: async () => undefined,
      hasHostAccess: async () => false,
    });
    expect(await noAccess.state()).toMatchObject({ kind: 'needs-setup', reason: 'no-permission' });

    const ready = new OpenAICompatibleProvider(local, {
      getKey: async () => undefined,
      hasHostAccess: async () => true,
    });
    expect(await ready.state()).toEqual({ kind: 'ready' });
  });

  it('turns a network failure into a clear error', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const provider = new OpenAICompatibleProvider(local, { getKey: async () => undefined, fetch });
    const stream = provider.stream([{ role: 'user', content: 'Hi' }]);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('Is it running?'),
    });
  });
});

describe('toProviderError', () => {
  const error = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    toProviderError(new Response(JSON.stringify(body), { status, headers }), cloud);

  it('maps statuses to kinds the router understands', async () => {
    expect((await error(401, { error: { message: 'bad key' } })).kind).toBe('auth');
    expect((await error(404, { error: 'no model' })).kind).toBe('not-found');
    expect((await error(500, {})).kind).toBe('server');
    expect(
      (await error(400, { error: { message: 'maximum context length is 8192 tokens' } })).kind,
    ).toBe('context-too-large');
    expect((await error(400, { error: { message: 'invalid parameter' } })).kind).toBe(
      'bad-request',
    );
  });

  it('separates quota from rate limits and reads Retry-After', async () => {
    const quota = await error(429, [{ error: { message: 'RESOURCE_EXHAUSTED: quota' } }]);
    expect(quota.kind).toBe('quota');
    const rate = await error(
      429,
      { error: { message: 'Rate limit reached for requests per minute' } },
      {
        'retry-after': '12',
      },
    );
    expect(rate.kind).toBe('rate-limit');
    expect(rate.retryAfterSeconds).toBe(12);
    expect(rate.tryNextProvider).toBe(true);
    expect(new ProviderError('auth', 'x').tryNextProvider).toBe(false);
  });

  it('explains Ollama origin rejections', async () => {
    const refused = await toProviderError(new Response('', { status: 403 }), local);
    expect(refused.message).toContain('OLLAMA_ORIGINS');
  });
});

describe('models', () => {
  it('lists chat models, strips the "models/" prefix and hides embeddings', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        data: [
          { id: 'models/gemini-3.5-flash' },
          { id: 'models/gemini-3.5-flash-lite' },
          { id: 'models/text-embedding-004' },
          { id: 'models/imagen-4' },
        ],
      }),
    );
    const models = await listModels('https://example.com/v1', 'k', fetch);
    expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  });

  it('suggests a model from the preset hints', () => {
    const gemini = presetById('gemini');
    expect(suggestModel(['gemini-3.5-flash', 'gemini-3.5-flash-lite'], gemini)).toBe(
      'gemini-3.5-flash-lite',
    );
    expect(suggestModel(['a', 'b'], undefined)).toBe('a');
    expect(suggestModel(['x', 'model:free'], presetById('openrouter'))).toBe('model:free');
  });
});
