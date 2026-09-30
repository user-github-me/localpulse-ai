import { isAbortError } from '@/lib/errors';
import { estimateTokens, guessLanguage, hostnameOf, truncateToTokens } from '@/lib/text';
import type { ChatMessage, GenerateOptions, Provider } from '@/providers/types';
import { chunkText } from './chunking';
import {
  mapInstruction,
  NOTHING_RELEVANT,
  systemPrompt,
  userMessage,
  type PromptPage,
} from './prompts';
import type { Recipe } from './recipes';
import { selectRelevantSections } from './retrieval';

export interface TurnInput {
  recipe: Recipe;
  /** The instruction for this turn: the filled-in recipe prompt or the user's question. */
  instruction: string;
  page?: PromptPage;
  /** Earlier turns of the conversation (user questions and answers, without page content). */
  history: ChatMessage[];
  /** BCP 47 tag of the answer language. */
  language: string;
  /**
   * Share of the provider's input budget to use, 1 by default. Lowered to retry with smaller parts
   * after the provider said the input was too large.
   */
  budgetScale?: number;
}

/** Progress on long pages; the UI turns it into translated text. */
export type TurnStatus =
  | { kind: 'reading' | 'combining' | 'part'; part: number; total: number }
  | { kind: 'writing-answer' | 'writing-summary' | 'downloading-translator' };

export interface TurnCallbacks {
  onText(chunk: string): void;
  /** Progress for long pages; undefined clears it. */
  onStatus?(status: TurnStatus | undefined): void;
}

export type TurnStrategy =
  'direct' | 'summarizer' | 'translator' | 'map-reduce' | 'retrieval' | 'in-parts';

export interface TurnResult {
  strategy: TurnStrategy;
  /** For retrieval: sections used; for map-reduce and in-parts: parts processed. */
  partsUsed?: number;
  partsTotal?: number;
}

const MAX_REDUCE_ROUNDS = 3;

/**
 * Answers one turn with one provider, fitting the page into the model's context window:
 * direct when it fits; otherwise summaries in parts, the relevant sections for questions, or
 * part-by-part processing for translation.
 */
export async function runTurn(
  provider: Provider,
  input: TurnInput,
  callbacks: TurnCallbacks,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const { page, language } = input;
  const options: GenerateOptions = { signal, language };
  const system = systemPrompt(language, { quotes: input.recipe.mode === 'qa' && Boolean(page) });
  const budget = Math.floor((await provider.inputBudget()) * (input.budgetScale ?? 1));
  const history = trimHistory(input.history, Math.floor(budget * 0.25));
  const overhead =
    estimateTokens(system) +
    estimateTokens(input.instruction) +
    history.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
    96;
  const available = Math.max(256, budget - overhead);

  const ask = (content: PromptPage | undefined, instruction = input.instruction): ChatMessage[] => [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userMessage(content, instruction) },
  ];

  if (!page) {
    await pipe(provider.stream(ask(undefined), options), callbacks);
    return { strategy: 'direct' };
  }

  if (input.recipe.id === 'translate' && provider.translate) {
    const from = await sourceLanguage(provider, page);
    const to = languageCode(language);
    const availability =
      from && from !== to ? await provider.translatorAvailability?.(from, to) : undefined;
    // A language pack that isn't on this computer yet takes a while to download: a chat model
    // translates instead when there is one. Without one, the pack is downloaded.
    const downloading = availability === 'downloadable' && !(await canChat(provider));
    if (from && (availability === 'available' || downloading)) {
      if (downloading) callbacks.onStatus?.({ kind: 'downloading-translator' });
      let wrote = false;
      try {
        return await translateInParts(
          provider,
          page,
          from,
          to,
          {
            ...callbacks,
            onText: (chunk) => {
              if (!wrote && downloading) callbacks.onStatus?.(undefined);
              wrote = true;
              callbacks.onText(chunk);
            },
          },
          signal,
        );
      } catch (error) {
        // The translator can't start, e.g. its language pack needs a download that the browser
        // only allows right after a click. The model translates instead.
        if (wrote || signal?.aborted || isAbortError(error)) throw error;
        callbacks.onStatus?.(undefined);
      }
    }
  }

  if (input.recipe.summary && provider.summarize && (await provider.canSummarize?.(language))) {
    return summarizeWithSummarizer(provider, input, callbacks, signal);
  }

  let pageTokens = estimateTokens(page.text);
  if (pageTokens > available * 0.8 && pageTokens < available * 1.25) {
    pageTokens = await provider.countTokens(page.text);
  }
  if (pageTokens <= available) {
    await pipe(provider.stream(ask(page), options), callbacks);
    return { strategy: 'direct' };
  }

  switch (input.recipe.mode) {
    case 'qa': {
      const sectionSize = Math.max(200, Math.min(800, Math.floor(available / 4)));
      const sections = chunkText(page.text, sectionSize);
      const relevant = selectRelevantSections(sections, input.instruction, available);
      const note = `only the ${relevant.indexes.length} of ${relevant.total} parts of the page most relevant to the question`;
      await pipe(provider.stream(ask({ ...page, text: relevant.text, note }), options), callbacks);
      return {
        strategy: 'retrieval',
        partsUsed: relevant.indexes.length,
        partsTotal: relevant.total,
      };
    }
    case 'transform': {
      // The answer is about as long as the input, so leave room for it.
      const chunks = chunkText(page.text, Math.max(200, Math.floor(available * 0.45)));
      for (const [index, chunk] of chunks.entries()) {
        callbacks.onStatus?.({ kind: 'part', part: index + 1, total: chunks.length });
        if (index > 0) callbacks.onText('\n\n');
        const note = `part ${index + 1} of ${chunks.length}`;
        await pipe(provider.stream(ask({ ...page, text: chunk, note }), options), callbacks);
      }
      callbacks.onStatus?.(undefined);
      return { strategy: 'in-parts', partsUsed: chunks.length, partsTotal: chunks.length };
    }
    case 'reduce':
      return mapReduce(provider, input, ask, available, callbacks, options);
  }
}

async function mapReduce(
  provider: Provider,
  input: TurnInput,
  ask: (content: PromptPage | undefined, instruction?: string) => ChatMessage[],
  available: number,
  callbacks: TurnCallbacks,
  options: GenerateOptions,
): Promise<TurnResult> {
  const page = input.page as PromptPage;
  const perChunk = Math.max(
    256,
    available - estimateTokens(mapInstruction(input.instruction, 99, 99)),
  );
  let text = page.text;
  let partsTotal = 0;

  for (let round = 0; round < MAX_REDUCE_ROUNDS && estimateTokens(text) > available; round++) {
    const chunks = chunkText(text, perChunk);
    if (round === 0) partsTotal = chunks.length;
    let started = 0;
    const notes = await mapWithLimit(
      chunks,
      provider.privacy === 'cloud' ? 3 : 1,
      async (chunk, index, signal) => {
        started++;
        callbacks.onStatus?.({
          kind: round === 0 ? 'reading' : 'combining',
          part: started,
          total: chunks.length,
        });
        const note = `part ${index + 1} of ${chunks.length}`;
        const instruction = mapInstruction(input.instruction, index + 1, chunks.length);
        return collect(
          provider.stream(ask({ ...page, text: chunk, note }, instruction), { ...options, signal }),
        );
      },
      options.signal,
    );
    text = notes
      .map((note) => note.trim())
      .filter((note) => note && !NOTHING_RELEVANT.test(note))
      .join('\n\n');
  }

  if (estimateTokens(text) > available) text = truncateToTokens(text, available);
  callbacks.onStatus?.({ kind: 'writing-answer' });
  const note = 'notes taken from each part of the page, in order';
  let first = true;
  await pipe(provider.stream(ask({ ...page, text, note }), options), {
    onText: (chunk) => {
      if (first) callbacks.onStatus?.(undefined);
      first = false;
      callbacks.onText(chunk);
    },
  });
  callbacks.onStatus?.(undefined);
  return { strategy: 'map-reduce', partsUsed: partsTotal, partsTotal };
}

async function summarizeWithSummarizer(
  provider: Provider,
  input: TurnInput,
  callbacks: TurnCallbacks,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const page = input.page as PromptPage;
  const summary = input.recipe.summary as NonNullable<Recipe['summary']>;
  const summarize = provider.summarize?.bind(provider);
  if (!summarize) throw new Error('Provider has no summarizer');
  const budget = Math.floor(((await provider.summarizeBudget?.()) ?? 3000) * 0.8);
  const context = `From the page "${page.title}" on ${hostnameOf(page.url) ?? 'the web'}.`;

  let text = page.text;
  let partsTotal = 1;
  for (let round = 0; round < MAX_REDUCE_ROUNDS && estimateTokens(text) > budget; round++) {
    const chunks = chunkText(text, budget);
    if (round === 0) partsTotal = chunks.length;
    const parts: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      callbacks.onStatus?.({ kind: 'reading', part: index + 1, total: chunks.length });
      parts.push(
        await collect(
          summarize(chunk, {
            type: 'key-points',
            length: 'long',
            context,
            language: input.language,
            signal,
          }),
        ),
      );
    }
    text = parts.join('\n');
  }
  if (estimateTokens(text) > budget) text = truncateToTokens(text, budget);

  callbacks.onStatus?.(partsTotal > 1 ? { kind: 'writing-summary' } : undefined);
  await pipe(summarize(text, { ...summary, context, language: input.language, signal }), callbacks);
  callbacks.onStatus?.(undefined);
  return { strategy: 'summarizer', partsUsed: partsTotal, partsTotal };
}

async function translateInParts(
  provider: Provider,
  page: PromptPage,
  from: string,
  to: string,
  callbacks: TurnCallbacks,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const translate = provider.translate?.bind(provider);
  if (!translate) throw new Error('Provider has no translator');
  const chunks = chunkText(page.text, 1500);
  for (const [index, chunk] of chunks.entries()) {
    if (chunks.length > 1)
      callbacks.onStatus?.({ kind: 'part', part: index + 1, total: chunks.length });
    if (index > 0) callbacks.onText('\n\n');
    await pipe(translate(chunk, from, to, signal), callbacks);
  }
  callbacks.onStatus?.(undefined);
  return { strategy: 'translator', partsUsed: chunks.length, partsTotal: chunks.length };
}

/**
 * The language a translation starts from: what the browser's detector says about the text itself,
 * else what its writing system gives away. The page's declared language comes last: a page can
 * say "en" around an email in Chinese.
 */
async function sourceLanguage(provider: Provider, page: PromptPage): Promise<string | undefined> {
  const detected = (await provider.detectLanguage?.(page.text)) ?? guessLanguage(page.text);
  const tag = detected ?? page.lang;
  return tag ? languageCode(tag) : undefined;
}

async function canChat(provider: Provider): Promise<boolean> {
  return (await provider.state('chat')).kind === 'ready';
}

/** "zh-TW" → "zh-Hant", "en-US" → "en": the codes the Translator API expects. */
function languageCode(tag: string): string {
  if (/^zh-(hant|tw|hk|mo)\b/i.test(tag)) return 'zh-Hant';
  return (tag.split('-')[0] ?? tag).toLowerCase();
}

/** Keeps the most recent turns that fit, starting with a user message. */
export function trimHistory(history: readonly ChatMessage[], maxTokens: number): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (!message || message.role === 'system') continue;
    const tokens = estimateTokens(message.content);
    if (used + tokens > maxTokens) break;
    kept.unshift(message);
    used += tokens;
  }
  while (kept[0] && kept[0].role !== 'user') kept.shift();
  return kept;
}

async function pipe(stream: AsyncIterable<string>, callbacks: Pick<TurnCallbacks, 'onText'>) {
  for await (const chunk of stream) callbacks.onText(chunk);
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

/**
 * Runs `task` on each item, at most `limit` at a time. When one fails, the others stop taking
 * items and their requests are cancelled, so a failing provider isn't sent the rest of the page.
 */
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const controller = new AbortController();
  const stop = () => controller.abort(signal?.reason);
  if (signal?.aborted) stop();
  signal?.addEventListener('abort', stop);
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !controller.signal.aborted) {
      const index = next++;
      try {
        results[index] = await task(items[index] as T, index, controller.signal);
      } catch (error) {
        controller.abort(error);
        throw error;
      }
    }
  });
  try {
    await Promise.all(workers);
  } finally {
    signal?.removeEventListener('abort', stop);
  }
  if (controller.signal.aborted) throw controller.signal.reason;
  return results;
}
