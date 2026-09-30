import { browser } from '#imports';
import { ProviderError } from '@/lib/errors';
import { readSSE } from '@/lib/sse';
import { estimateTokens, isLocalUrl, originPattern } from '@/lib/text';
import type { EndpointConfig } from '@/storage/settings';
import { presetById } from './presets';
import type {
  ChatMessage,
  GenerateOptions,
  Privacy,
  Provider,
  ProviderState,
  TaskKind,
} from './types';

/** Room left for the answer when budgeting the prompt. */
const OUTPUT_RESERVE_TOKENS = 1024;

export interface OpenAICompatibleDeps {
  getKey: () => Promise<string | undefined>;
  fetch?: typeof fetch;
  /** Whether the extension may call this origin (needed for local servers). */
  hasHostAccess?: (pattern: string) => Promise<boolean>;
}

/**
 * One adapter for every provider that speaks the OpenAI Chat Completions API:
 * Ollama, LM Studio, llama.cpp, Gemini (OpenAI-compatible endpoint), OpenRouter, Groq, ... (§3.2, §3.4)
 */
export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly label: string;
  readonly privacy: Privacy;
  private readonly fetch: typeof fetch;

  constructor(
    private readonly config: EndpointConfig,
    private readonly deps: OpenAICompatibleDeps,
  ) {
    this.id = config.id;
    this.label = config.model ? `${config.label} (${displayModel(config.model)})` : config.label;
    this.privacy = isLocalUrl(config.baseUrl) ? 'on-device' : 'cloud';
    this.fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async state(_task?: TaskKind): Promise<ProviderState> {
    const preset = presetById(this.config.presetId);
    if (!this.config.baseUrl) return { kind: 'needs-setup', reason: 'server-offline' };
    if (preset?.needsKey && !(await this.deps.getKey())) {
      return { kind: 'needs-setup', reason: 'no-key' };
    }
    if (!this.config.model) return { kind: 'needs-setup', reason: 'no-model' };
    if (this.privacy === 'on-device') {
      const pattern = originPattern(this.config.baseUrl);
      const hasAccess = this.deps.hasHostAccess ?? defaultHasHostAccess;
      if (pattern && !(await hasAccess(pattern))) {
        return { kind: 'needs-setup', reason: 'no-permission' };
      }
    }
    return { kind: 'ready' };
  }

  async inputBudget(): Promise<number> {
    return Math.max(512, this.config.contextTokens - OUTPUT_RESERVE_TOKENS);
  }

  async countTokens(text: string): Promise<number> {
    return estimateTokens(text);
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions = {}): AsyncIterable<string> {
    const key = await this.deps.getKey();
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: true,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    let response: Response;
    try {
      response = await this.fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ProviderError('network', this.unreachableMessage(), { cause: error });
    }

    if (!response.ok) throw await toProviderError(response, this.config);
    if (!response.body) throw new ProviderError('server', 'The server sent an empty response.');

    for await (const data of readSSE(response.body)) {
      if (data === '[DONE]') return;
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        continue;
      }
      if (chunk.error) {
        throw new ProviderError('server', chunk.error.message ?? 'The provider reported an error.');
      }
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }

  private unreachableMessage(): string {
    if (this.privacy === 'on-device') {
      return `Can't reach ${this.config.label} at ${this.config.baseUrl}. Is it running?`;
    }
    return `Can't reach ${this.config.label}. Check your connection. If this provider blocks browser requests, grant it access in Settings.`;
  }
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  error?: { message?: string };
}

async function defaultHasHostAccess(pattern: string): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

/** Model ids like "models/gemini-x" are shown without the prefix. */
export function displayModel(model: string): string {
  return model.replace(/^models\//, '');
}

export async function toProviderError(
  response: Response,
  config: Pick<EndpointConfig, 'label' | 'baseUrl' | 'model'>,
): Promise<ProviderError> {
  const detail = await readErrorDetail(response);
  const status = response.status;
  const retryAfter = Number(response.headers.get('retry-after')) || undefined;
  const suffix = detail ? ` (${detail})` : '';

  if (status === 401) {
    return new ProviderError('auth', `${config.label} rejected the API key${suffix}.`, { status });
  }
  if (status === 403) {
    if (isLocalUrl(config.baseUrl)) {
      return new ProviderError(
        'auth',
        `${config.label} refused the request (403). If it's Ollama, allow browser extensions with OLLAMA_ORIGINS=chrome-extension://* or re-grant access in Settings.`,
        { status },
      );
    }
    return new ProviderError('auth', `${config.label} denied access${suffix}.`, { status });
  }
  if (status === 404) {
    return new ProviderError(
      'not-found',
      `${config.label} doesn't know the model "${config.model}"${suffix}.`,
      { status },
    );
  }
  if (status === 429) {
    const kind = /quota|exhausted|billing|credits/i.test(detail) ? 'quota' : 'rate-limit';
    const wait = retryAfter ? ` Try again in ${retryAfter} s.` : '';
    return new ProviderError(
      kind,
      `${config.label}: free limit reached${suffix}.${wait} You can switch provider.`,
      { status, retryAfterSeconds: retryAfter },
    );
  }
  if (
    status === 413 ||
    (status === 400 && /context|too long|too many tokens|maximum.*tokens/i.test(detail))
  ) {
    return new ProviderError('context-too-large', `The page is too long for this model${suffix}.`, {
      status,
    });
  }
  if (status >= 500) {
    return new ProviderError('server', `${config.label} had a server error (${status}).`, {
      status,
    });
  }
  return new ProviderError(
    'bad-request',
    `${config.label} returned an error (${status})${suffix}.`,
    {
      status,
    },
  );
}

async function readErrorDetail(response: Response): Promise<string> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return '';
  }
  try {
    const json = JSON.parse(text) as unknown;
    const first = Array.isArray(json) ? json[0] : json;
    const error = (first as { error?: unknown })?.error;
    if (typeof error === 'string') return error.slice(0, 300);
    const message = (error as { message?: unknown })?.message;
    if (typeof message === 'string') return message.slice(0, 300);
  } catch {
    // Not JSON.
  }
  return text.trim().slice(0, 300);
}

/** Lists model ids from GET {baseUrl}/models, hiding ones that can't chat. */
export async function listModels(
  baseUrl: string,
  key: string | undefined,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
  } catch (error) {
    throw new ProviderError('network', `Can't reach ${baseUrl}.`, { cause: error });
  }
  if (!response.ok) {
    throw await toProviderError(response, { label: 'The server', baseUrl, model: '' });
  }
  const json = (await response.json()) as {
    data?: { id?: unknown }[];
    models?: { id?: unknown }[];
  };
  const items = json.data ?? json.models ?? [];
  const ids = items
    .map((item) => (typeof item.id === 'string' ? item.id : ''))
    .filter(Boolean)
    .map(displayModel)
    .filter(
      (id) =>
        !/embed|imagen|veo|tts|whisper|image-generation|native-audio|moderation|guard|rerank/i.test(
          id,
        ),
    );
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
