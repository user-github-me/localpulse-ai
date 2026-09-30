/** Where a provider runs. "on-device" includes local servers on localhost. */
export type Privacy = 'on-device' | 'cloud';

/** What the router is choosing a provider for. Some providers can only do some tasks. */
export type TaskKind = 'chat' | 'summarize' | 'translate';

export type ProviderState =
  | { kind: 'ready' }
  /** A user click is needed to start a model download. */
  | { kind: 'needs-download'; approxBytes?: number }
  | { kind: 'downloading'; progress: number }
  | {
      kind: 'needs-setup';
      reason: 'no-key' | 'no-model' | 'no-permission' | 'server-offline';
      detail?: string;
    }
  | { kind: 'unsupported'; reason: string };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  temperature?: number;
  /** BCP 47 tag of the language the answer should be in. */
  language?: string;
  /** JSON Schema for structured output, where the provider supports it. */
  jsonSchema?: Record<string, unknown>;
}

export type SummaryType = 'tldr' | 'key-points' | 'teaser' | 'headline';

export interface SummarizeOptions {
  type: SummaryType;
  length: 'short' | 'medium' | 'long';
  /** Background for the summarizer, e.g. the page title. */
  context?: string;
  language?: string;
  signal?: AbortSignal;
}

export interface Provider {
  /** Stable id: "builtin", "webllm" or an endpoint id such as "ep:ollama". */
  readonly id: string;
  /** Human-readable name, e.g. "Gemini Nano". */
  readonly label: string;
  readonly privacy: Privacy;
  state(task?: TaskKind): Promise<ProviderState>;
  /** Tokens available for the prompt, with room left for the answer. */
  inputBudget(): Promise<number>;
  /** Exact where the API allows it, otherwise an estimate. */
  countTokens(text: string): Promise<number>;
  /** Streams the answer as text chunks (each chunk is new text to append). */
  stream(messages: ChatMessage[], options?: GenerateOptions): AsyncIterable<string>;
  /** Starts a model download. Must be called from a user gesture. */
  prepare?(onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void>;
  /** Dedicated summarization model (Chrome/Edge Summarizer API). */
  summarize?(text: string, options: SummarizeOptions): AsyncIterable<string>;
  canSummarize?(language?: string): Promise<boolean>;
  summarizeBudget?(): Promise<number>;
  /** Dedicated translation model (Translator API). */
  translate?(text: string, from: string, to: string, signal?: AbortSignal): AsyncIterable<string>;
  /** Whether the translator for this pair is on this computer, can be downloaded, or doesn't exist. */
  translatorAvailability?(from: string, to: string): Promise<TranslatorAvailability>;
  /** The language of a text as a BCP 47 tag (Language Detector API), if it can tell. */
  detectLanguage?(text: string): Promise<string | undefined>;
}

export type TranslatorAvailability = 'available' | 'downloadable' | 'unavailable';

export function isReady(state: ProviderState): boolean {
  return state.kind === 'ready';
}
