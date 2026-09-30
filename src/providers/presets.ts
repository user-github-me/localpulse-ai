import presets from './presets.json';

export interface EndpointPreset {
  id: string;
  label: string;
  /** "local" presets run on the user's machine; everything else is labeled cloud. */
  kind: 'local' | 'cloud';
  baseUrl: string;
  needsKey: boolean;
  contextTokens: number;
  keyUrl?: string;
  termsUrl?: string;
  docsUrl?: string;
  /** What happens to data sent to this provider, shown before the user enables it. */
  dataNote?: string;
  setupNote?: string;
  /** Regular expressions, most preferred first, used to suggest a default model. */
  modelHints?: string[];
}

export const ENDPOINT_PRESETS: readonly EndpointPreset[] = presets as EndpointPreset[];

export function presetById(id: string): EndpointPreset | undefined {
  return ENDPOINT_PRESETS.find((preset) => preset.id === id);
}

/** Picks a sensible default model from a provider's list; the user can always change it. */
export function suggestModel(models: string[], preset?: EndpointPreset): string | undefined {
  for (const hint of preset?.modelHints ?? []) {
    const pattern = new RegExp(hint, 'i');
    const match = models.find((model) => pattern.test(model));
    if (match) return match;
  }
  return models[0];
}
