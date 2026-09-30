import { i18n } from '#i18n';
import { ProviderError } from '@/lib/errors';
import { estimateTokens } from '@/lib/text';
import type {
  ChatMessage,
  GenerateOptions,
  Provider,
  ProviderState,
  SummarizeOptions,
  SummaryType,
  TaskKind,
  TranslatorAvailability,
} from './types';

/**
 * The browser's own model through the built-in AI APIs:
 * Gemini Nano in Chrome, Phi-4-mini in Edge. Each API is checked on its own, so Edge Stable can
 * summarize and translate on-device even though its Prompt API is still behind a flag.
 */

/** Languages the Prompt API accepts for input and output (Chrome 149+). */
const PROMPT_LANGUAGES = ['en', 'es', 'ja', 'de', 'fr'];
/** Room left for the answer when budgeting the prompt. */
const OUTPUT_RESERVE_TOKENS = 1024;

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

let lastDownloadProgress = 0;

export function hasLanguageModel(): boolean {
  return typeof LanguageModel !== 'undefined';
}

export function hasSummarizer(): boolean {
  return typeof Summarizer !== 'undefined';
}

export function hasTranslator(): boolean {
  return typeof Translator !== 'undefined';
}

export function builtInModelName(userAgent = navigator.userAgent): string {
  if (/\bEdg\//.test(userAgent)) return 'Phi-4-mini';
  if (/\bChrome\//.test(userAgent)) return 'Gemini Nano';
  return 'Built-in model';
}

/** The Prompt API language for a BCP 47 tag, or undefined if it isn't supported. */
export function promptLanguage(tag: string | undefined): string | undefined {
  const base = tag?.toLowerCase().split('-')[0];
  return base && PROMPT_LANGUAGES.includes(base) ? base : undefined;
}

function languageModelOptions(language?: string): LanguageModelCreateCoreOptions {
  const output = promptLanguage(language) ?? 'en';
  return {
    expectedInputs: [{ type: 'text', languages: [...new Set(['en', output])] }],
    expectedOutputs: [{ type: 'text', languages: [output] }],
  };
}

function summarizerOptions(
  language?: string,
  type: SummaryType = 'tldr',
  length: SummarizeOptions['length'] = 'medium',
): SummarizerCreateCoreOptions {
  const output = promptLanguage(language) ?? 'en';
  return {
    type,
    format: 'markdown',
    length,
    expectedInputLanguages: [...new Set(['en', output])],
    outputLanguage: output,
  };
}

async function availabilityOf(check: () => Promise<Availability>): Promise<Availability> {
  try {
    return await check();
  } catch {
    return 'unavailable';
  }
}

function toState(availability: Availability | 'missing'): ProviderState {
  switch (availability) {
    case 'available':
      return { kind: 'ready' };
    case 'downloadable':
      return { kind: 'needs-download' };
    case 'downloading':
      return { kind: 'downloading', progress: lastDownloadProgress };
    case 'unavailable':
      return { kind: 'unsupported', reason: i18n.t('builtin.unavailable') };
    case 'missing':
      return { kind: 'unsupported', reason: i18n.t('builtin.missing') };
  }
}

async function* readStream(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function mapError(error: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) return error;
  const name = (error as { name?: string } | null)?.name;
  const message = (error as { message?: string } | null)?.message ?? 'Unknown error';
  switch (name) {
    case 'AbortError':
      return error;
    case 'QuotaExceededError':
      return new ProviderError('context-too-large', 'Too much text for the built-in model.', {
        cause: error,
      });
    case 'NotSupportedError':
    case 'NotAllowedError':
    case 'InvalidStateError':
      return new ProviderError('unsupported', `The built-in model can't do this: ${message}`, {
        cause: error,
      });
    default:
      return new ProviderError('server', `The built-in model failed: ${message}`, {
        cause: error,
      });
  }
}

function monitorProgress(onProgress: (fraction: number) => void): CreateMonitorCallback {
  return (monitor) => {
    monitor.addEventListener('downloadprogress', (event) => {
      lastDownloadProgress = event.loaded;
      onProgress(event.loaded);
    });
  };
}

export class BuiltinAIProvider implements Provider {
  readonly id = 'builtin';
  readonly privacy = 'on-device' as const;
  readonly label = builtInModelName();
  private budget?: number;
  private summaryBudget?: number;
  private counter?: Promise<LanguageModel>;

  async state(task: TaskKind = 'chat'): Promise<ProviderState> {
    const chat: Availability | 'missing' = hasLanguageModel()
      ? await availabilityOf(() => LanguageModel.availability(languageModelOptions()))
      : 'missing';
    if (chat === 'available') return { kind: 'ready' };

    const noChat = chat === 'missing' || chat === 'unavailable';
    // Without a usable Prompt API, the Summarizer API can still handle summaries (Edge Stable).
    if (task === 'summarize' && hasSummarizer() && noChat) {
      return toState(await availabilityOf(() => Summarizer.availability(summarizerOptions())));
    }
    // The Translator API has its own small models, often usable where Gemini Nano isn't. Language
    // packs are checked per pair when translating; if the pair isn't available the router moves on.
    if (task === 'translate' && hasTranslator() && noChat) return { kind: 'ready' };
    return toState(chat);
  }

  async prepare(onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
    const monitor = monitorProgress(onProgress);
    try {
      if (hasLanguageModel()) {
        const availability = await availabilityOf(() =>
          LanguageModel.availability(languageModelOptions()),
        );
        if (availability !== 'unavailable') {
          const session = await LanguageModel.create({
            ...languageModelOptions(),
            monitor,
            signal,
          });
          session.destroy();
          return;
        }
      }
      if (hasSummarizer()) {
        const summarizer = await Summarizer.create({ ...summarizerOptions(), monitor, signal });
        summarizer.destroy();
      }
    } catch (error) {
      throw mapError(error, signal);
    }
  }

  async inputBudget(): Promise<number> {
    if (this.budget !== undefined) return this.budget;
    if (!hasLanguageModel()) return 2048;
    try {
      const session = await LanguageModel.create(languageModelOptions());
      const window = session.contextWindow || session.inputQuota || 4096;
      session.destroy();
      this.budget = Math.max(1024, window - OUTPUT_RESERVE_TOKENS);
    } catch {
      this.budget = 4096 - OUTPUT_RESERVE_TOKENS;
    }
    return this.budget;
  }

  async countTokens(text: string): Promise<number> {
    if (!hasLanguageModel()) return estimateTokens(text);
    try {
      this.counter ??= LanguageModel.create(languageModelOptions());
      const session = await this.counter;
      return await session.measureContextUsage(text);
    } catch {
      this.counter = undefined;
      return estimateTokens(text);
    }
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions = {}): AsyncIterable<string> {
    if (!hasLanguageModel()) {
      throw new ProviderError('unsupported', 'This browser has no built-in chat model.');
    }
    const { signal } = options;
    const [first, ...rest] = messages;
    const system = first?.role === 'system' ? first.content : undefined;
    const turns = system === undefined ? messages : rest;
    const last = turns.at(-1);
    if (!last || last.role !== 'user') {
      throw new ProviderError('bad-request', 'The conversation must end with a question.');
    }
    const history: LanguageModelMessage[] = turns.slice(0, -1).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
    const initialPrompts: LanguageModelCreateOptions['initialPrompts'] =
      system === undefined ? history : [{ role: 'system', content: system }, ...history];

    let session: LanguageModel;
    try {
      session = await LanguageModel.create({
        ...languageModelOptions(options.language),
        initialPrompts,
        signal,
      });
    } catch (error) {
      throw mapError(error, signal);
    }
    try {
      const stream = session.promptStreaming(last.content, {
        signal,
        ...(options.jsonSchema ? { responseConstraint: options.jsonSchema } : {}),
      });
      yield* readStream(stream);
    } catch (error) {
      throw mapError(error, signal);
    } finally {
      session.destroy();
    }
  }

  async canSummarize(language?: string): Promise<boolean> {
    if (!hasSummarizer()) return false;
    const availability = await availabilityOf(() =>
      Summarizer.availability(summarizerOptions(language)),
    );
    return availability === 'available';
  }

  async summarizeBudget(): Promise<number> {
    if (this.summaryBudget !== undefined) return this.summaryBudget;
    try {
      const summarizer = await Summarizer.create(summarizerOptions());
      this.summaryBudget = Math.max(1024, summarizer.inputQuota || 4000);
      summarizer.destroy();
    } catch {
      this.summaryBudget = 3000;
    }
    return this.summaryBudget;
  }

  async *summarize(text: string, options: SummarizeOptions): AsyncIterable<string> {
    const { signal } = options;
    let summarizer: Summarizer;
    try {
      summarizer = await Summarizer.create({
        ...summarizerOptions(options.language, options.type, options.length),
        ...(options.context ? { sharedContext: options.context } : {}),
        signal,
      });
    } catch (error) {
      throw mapError(error, signal);
    }
    try {
      yield* readStream(summarizer.summarizeStreaming(text, { signal }));
    } catch (error) {
      throw mapError(error, signal);
    } finally {
      summarizer.destroy();
    }
  }

  detectLanguage(text: string): Promise<string | undefined> {
    return detectLanguage(text);
  }

  async translatorAvailability(from: string, to: string): Promise<TranslatorAvailability> {
    if (!hasTranslator()) return 'unavailable';
    const availability = await availabilityOf(() =>
      Translator.availability({ sourceLanguage: from, targetLanguage: to }),
    );
    if (availability === 'available' || availability === 'unavailable') return availability;
    return 'downloadable';
  }

  async *translate(
    text: string,
    from: string,
    to: string,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    let translator: Translator;
    try {
      translator = await Translator.create({ sourceLanguage: from, targetLanguage: to, signal });
    } catch (error) {
      throw mapError(error, signal);
    }
    try {
      yield* readStream(translator.translateStreaming(text, { signal }));
    } catch (error) {
      throw mapError(error, signal);
    } finally {
      translator.destroy();
    }
  }
}

/** Detects a text's language on-device, if the browser has the Language Detector API. */
export async function detectLanguage(text: string): Promise<string | undefined> {
  if (typeof LanguageDetector === 'undefined') return undefined;
  try {
    const detector = await LanguageDetector.create();
    const [best] = await detector.detect(text.slice(0, 2000));
    detector.destroy();
    return best && (best.confidence ?? 0) > 0.5 ? best.detectedLanguage : undefined;
  } catch {
    return undefined;
  }
}
