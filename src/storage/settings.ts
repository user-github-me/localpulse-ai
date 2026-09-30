import { storage } from '#imports';
import type { Recipe } from '@/core/recipes';

export type ThemeSetting = 'system' | 'light' | 'dark';

/** A user-configured OpenAI-compatible endpoint (local server or cloud API). */
export interface EndpointConfig {
  /** Provider id, always starting with "ep:". */
  id: string;
  /** Preset it was created from (see presets.json), or "custom". */
  presetId: string;
  label: string;
  /** Base URL without a trailing slash, e.g. http://localhost:11434/v1 */
  baseUrl: string;
  /** Selected model id; empty until the user picks one. */
  model: string;
  /** Context window hint in tokens, used for budgeting. */
  contextTokens: number;
}

export interface Settings {
  /** Provider ids in priority order. Providers missing here are appended (see orderProviders). */
  providerOrder: string[];
  disabledProviders: string[];
  endpoints: EndpointConfig[];
  /** recipe id → provider id */
  pinnedProviders: Record<string, string>;
  localOnly: boolean;
  allowCloudFallback: boolean;
  /** Hostnames whose content is never sent to cloud providers. */
  neverCloudSites: string[];
  redactForCloud: boolean;
  saveHistory: boolean;
  /** "auto" follows the browser language. */
  answerLanguage: string;
  theme: ThemeSetting;
  onboardingComplete: boolean;
  /** Use the selected text instead of the whole page when there is a selection. */
  preferSelection: boolean;
  /** Id of the in-browser (WebLLM) model the user downloaded, if any. */
  webllmModel: string;
  /** Quick actions the user created. */
  customRecipes: Recipe[];
  /** Ids of the quick actions shown in the panel, in order. */
  quickActions: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  providerOrder: ['builtin'],
  disabledProviders: [],
  endpoints: [],
  pinnedProviders: {},
  localOnly: false,
  allowCloudFallback: false,
  neverCloudSites: [],
  redactForCloud: true,
  saveHistory: true,
  answerLanguage: 'auto',
  theme: 'system',
  onboardingComplete: false,
  preferSelection: true,
  webllmModel: '',
  customRecipes: [],
  quickActions: [
    'summarize',
    'key-points',
    'explain-code',
    'simplify',
    'action-items',
    'translate',
  ],
};

const settingsItem = storage.defineItem<Partial<Settings>>('local:settings', { fallback: {} });

function withDefaults(value: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
}

export async function getSettings(): Promise<Settings> {
  return withDefaults(await settingsItem.getValue());
}

export async function updateSettings(
  patch: Partial<Settings> | ((current: Settings) => Partial<Settings>),
): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => callback(withDefaults(value)));
}

/** The language answers should be written in, as a BCP 47 tag. */
export function resolveAnswerLanguage(settings: Settings): string {
  if (settings.answerLanguage !== 'auto') return settings.answerLanguage;
  return (typeof navigator !== 'undefined' && navigator.language) || 'en';
}
