import { ProviderError } from '@/lib/errors';
import type { Provider, ProviderState } from './types';

// The Firefox build uses this instead of webllm.ts (see wxt.config.ts): WebLLM's 6 MB bundles are
// too large for addons.mozilla.org's validator, so Firefox has no in-browser model for now.

export const hasWebGPU = async (): Promise<boolean> => false;
export const isModelDownloaded = async (_modelId: string): Promise<boolean> => false;
export const deleteModel = async (_modelId: string): Promise<void> => {};

export class WebLLMProvider implements Provider {
  readonly id = 'webllm';
  readonly privacy = 'on-device' as const;
  readonly label = 'In-browser model';
  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async state(): Promise<ProviderState> {
    return {
      kind: 'unsupported',
      reason: "The Firefox version doesn't include in-browser models yet.",
    };
  }

  async inputBudget(): Promise<number> {
    return 0;
  }

  async countTokens(): Promise<number> {
    return 0;
  }

  async prepare(): Promise<void> {}

  stream(): AsyncIterable<string> {
    throw new ProviderError('unsupported', 'In-browser models are not available in Firefox.');
  }
}
