/**
 * In-browser models offered in the model manager. Each model's WebAssembly
 * library is bundled with the extension (the Chrome Web Store treats WebAssembly as code); only
 * the weights, which are data, are downloaded from Hugging Face. See scripts/fetch-webllm-libs.mjs.
 */
export interface WebLLMModel {
  id: string;
  /** Key of the note in the UI text catalog (webllm.notes.<key>). */
  key: string;
  label: string;
  downloadGB: number;
  memoryGB: number;
  note: string;
}

export const WEBLLM_MODELS: readonly WebLLMModel[] = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    key: 'llama1b',
    label: 'Llama 3.2 1B',
    downloadGB: 0.7,
    memoryGB: 0.9,
    note: 'Small and fast. Runs on most computers.',
  },
  {
    id: 'Qwen3.5-2B-q4f16_1-MLC',
    key: 'qwen2b',
    label: 'Qwen 3.5 2B',
    downloadGB: 1.1,
    memoryGB: 2.2,
    note: 'Better answers, and good in many languages.',
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    key: 'llama3b',
    label: 'Llama 3.2 3B',
    downloadGB: 1.8,
    memoryGB: 2.3,
    note: 'Best answers of these. Needs a stronger computer.',
  },
];

// Gemma 3 isn't offered: WebLLM 0.2.85 fails to load it (its sliding window conflicts with the
// 4k context set in the prebuilt config).
export const DEFAULT_WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

/** Where the bundled library for a model is served from, relative to the extension root. */
export function webllmLibPath(modelLibUrl: string): string {
  return `webllm/${modelLibUrl.split('/').pop() ?? ''}`;
}

export function webllmModel(id: string): WebLLMModel | undefined {
  return WEBLLM_MODELS.find((model) => model.id === id);
}
