import type { AppConfig, MLCEngineInterface } from '@mlc-ai/web-llm';
import { i18n } from '#i18n';
import { browser } from '#imports';
import { ProviderError } from '@/lib/errors';
import { estimateTokens } from '@/lib/text';
import type { ChatMessage, GenerateOptions, Provider, ProviderState } from './types';
import { DEFAULT_WEBLLM_MODEL, webllmLibPath, webllmModel } from './webllm-models';

/** The bundled models have a 4k-token context window; leave room for the answer. */
const CONTEXT_TOKENS = 4096;
const OUTPUT_RESERVE_TOKENS = 1024;

let engine: Promise<MLCEngineInterface> | undefined;
let engineModel: string | undefined;
let engineWorker: Worker | undefined;
let webgpu: Promise<boolean> | undefined;

export function hasWebGPU(): Promise<boolean> {
  webgpu ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      return (await gpu.requestAdapter()) !== null;
    } catch {
      return false;
    }
  })();
  return webgpu;
}

/** WebLLM's config, pointing each model at the WebAssembly library bundled with the extension. */
export async function webllmAppConfig(): Promise<AppConfig> {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  return {
    ...prebuiltAppConfig,
    model_list: prebuiltAppConfig.model_list.map((model) => ({
      ...model,
      model_lib: browser.runtime.getURL(`/${webllmLibPath(model.model_lib)}` as '/'),
    })),
  };
}

/** Frees the loaded model's GPU memory, e.g. before loading another one. */
async function unloadEngine(): Promise<void> {
  const loading = engine;
  const worker = engineWorker;
  engine = undefined;
  engineModel = undefined;
  engineWorker = undefined;
  const loaded = await loading?.catch(() => undefined);
  await loaded?.unload().catch(() => {});
  worker?.terminate();
}

async function loadEngine(modelId: string, onProgress?: (fraction: number) => void) {
  if (engine && engineModel === modelId) return engine;
  // Only one model at a time: two would need twice the graphics memory.
  if (engine) await unloadEngine();
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  const appConfig = await webllmAppConfig();
  const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' });
  engineModel = modelId;
  engineWorker = worker;
  const loading = CreateWebWorkerMLCEngine(worker, modelId, {
    appConfig,
    initProgressCallback: (report) => onProgress?.(report.progress),
  }).catch((error: unknown) => {
    if (engine === loading) {
      engine = undefined;
      engineModel = undefined;
      engineWorker = undefined;
    }
    worker.terminate();
    throw error;
  });
  engine = loading;
  return loading;
}

export async function isModelDownloaded(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(modelId, await webllmAppConfig());
  } catch {
    return false;
  }
}

export async function deleteModel(modelId: string): Promise<void> {
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
  if (engineModel === modelId) await unloadEngine();
  await deleteModelAllInfoInCache(modelId, await webllmAppConfig());
}

/**
 * A small model that runs in the browser with WebGPU, for browsers without
 * a built-in model such as Brave and Opera. Its answers never leave the computer.
 */
export class WebLLMProvider implements Provider {
  readonly id = 'webllm';
  readonly privacy = 'on-device' as const;
  readonly label: string;
  readonly modelId: string;
  /** Whether the user has downloaded a model before; if not, skip loading WebLLM to check. */
  private readonly chosen: boolean;

  constructor(modelId: string) {
    this.chosen = Boolean(modelId);
    this.modelId = modelId || DEFAULT_WEBLLM_MODEL;
    this.label = i18n.t('webllm.inBrowser', {
      model: webllmModel(this.modelId)?.label ?? this.modelId,
    });
  }

  async state(): Promise<ProviderState> {
    if (!(await hasWebGPU())) {
      return { kind: 'unsupported', reason: "This browser or computer doesn't support WebGPU." };
    }
    if (engineModel === this.modelId && engine) return { kind: 'ready' };
    if (this.chosen && (await isModelDownloaded(this.modelId))) return { kind: 'ready' };
    const model = webllmModel(this.modelId);
    return { kind: 'needs-download', approxBytes: model ? model.downloadGB * 1e9 : undefined };
  }

  async prepare(onProgress: (fraction: number) => void): Promise<void> {
    try {
      await loadEngine(this.modelId, onProgress);
    } catch (error) {
      throw new ProviderError(
        'unsupported',
        `The in-browser model couldn't load: ${String(error)}`,
        {
          cause: error,
        },
      );
    }
  }

  async inputBudget(): Promise<number> {
    return CONTEXT_TOKENS - OUTPUT_RESERVE_TOKENS;
  }

  async countTokens(text: string): Promise<number> {
    return estimateTokens(text);
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions = {}): AsyncIterable<string> {
    let loaded: MLCEngineInterface;
    try {
      loaded = await loadEngine(this.modelId);
    } catch (error) {
      throw new ProviderError(
        'unsupported',
        `The in-browser model couldn't load: ${String(error)}`,
        {
          cause: error,
        },
      );
    }
    const abort = () => loaded.interruptGenerate();
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      const chunks = await loaded.chat.completions.create({
        messages,
        stream: true,
        max_tokens: OUTPUT_RESERVE_TOKENS,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });
      for await (const chunk of chunks) {
        if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const message = String(error);
      throw new ProviderError(
        /context|too long|exceed/i.test(message) ? 'context-too-large' : 'server',
        `The in-browser model failed: ${message}`,
        { cause: error },
      );
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
