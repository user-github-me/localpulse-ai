import { ProviderError } from '@/lib/errors';
import { estimateTokens } from '@/lib/text';
import type {
  ChatMessage,
  GenerateOptions,
  Privacy,
  Provider,
  ProviderState,
  SummarizeOptions,
} from '@/providers/types';

export interface FakeProviderOptions {
  privacy?: Privacy;
  state?: ProviderState;
  budget?: number;
  reply?: (messages: ChatMessage[]) => string;
  error?: Error;
}

/** A provider that answers from a function, recording every call. */
export class FakeProvider implements Provider {
  readonly label: string;
  readonly privacy: Privacy;
  calls: ChatMessage[][] = [];
  options: GenerateOptions[] = [];
  stateValue: ProviderState;
  budget: number;
  reply: (messages: ChatMessage[]) => string;
  error?: Error;

  constructor(
    readonly id: string,
    options: FakeProviderOptions = {},
  ) {
    this.label = `Fake ${id}`;
    this.privacy = options.privacy ?? 'on-device';
    this.stateValue = options.state ?? { kind: 'ready' };
    this.budget = options.budget ?? 4000;
    this.reply = options.reply ?? (() => 'ok');
    this.error = options.error;
  }

  async state(): Promise<ProviderState> {
    return this.stateValue;
  }

  async inputBudget(): Promise<number> {
    return this.budget;
  }

  async countTokens(text: string): Promise<number> {
    return estimateTokens(text);
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions = {}): AsyncIterable<string> {
    this.calls.push(messages);
    this.options.push(options);
    if (this.error) throw this.error;
    const text = this.reply(messages);
    for (let i = 0; i < text.length; i += 7) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      yield text.slice(i, i + 7);
    }
  }
}

/** A fake with the built-in Translator and Language Detector APIs. */
export class FakeTranslatorProvider extends FakeProvider {
  translations: { text: string; from: string; to: string }[] = [];
  pairs = new Set(['zh>en']);
  detected?: string;
  /** The translator fails to start, e.g. its language pack needs a download. */
  failToStart = false;

  async detectLanguage(): Promise<string | undefined> {
    return this.detected;
  }

  /** For the pairs above: installed, or a download away. */
  availability: 'available' | 'downloadable' = 'available';

  async translatorAvailability(from: string, to: string) {
    return this.pairs.has(`${from}>${to}`) ? this.availability : ('unavailable' as const);
  }

  async *translate(text: string, from: string, to: string): AsyncIterable<string> {
    if (this.failToStart)
      throw new ProviderError('unsupported', 'The language pack needs a download');
    this.translations.push({ text, from, to });
    yield `translated from ${from} to ${to}`;
  }
}

/** A fake with the built-in Summarizer API. */
export class FakeSummarizerProvider extends FakeProvider {
  summaries: { text: string; options: SummarizeOptions }[] = [];

  async canSummarize(): Promise<boolean> {
    return true;
  }

  async summarizeBudget(): Promise<number> {
    return 500;
  }

  async *summarize(text: string, options: SummarizeOptions): AsyncIterable<string> {
    this.summaries.push({ text, options });
    yield `summary(${options.type}) of ${text.length} chars`;
  }
}

export function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

export function lorem(words: number, seed = 'alpha beta gamma delta'): string {
  const vocabulary = seed.split(' ');
  return Array.from({ length: words }, (_, i) => vocabulary[i % vocabulary.length]).join(' ');
}
