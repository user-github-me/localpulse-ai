import { getApiKey } from '@/storage/credentials';
import type { Settings } from '@/storage/settings';
import { BuiltinAIProvider } from './builtin-ai';
import { OpenAICompatibleProvider } from './openai-compatible';
import { WebLLMProvider } from './webllm';
import type { Provider } from './types';

// One instance per page, so its caches (context window, token counter) survive re-renders.
const builtin = new BuiltinAIProvider();

/**
 * All providers the user could use, in the default privacy order:
 * built-in AI → local servers → in-browser model → cloud APIs.
 */
export function createProviders(settings: Settings): Provider[] {
  // WebLLM's 6 MB bundles are too large for addons.mozilla.org's validator, so the Firefox build
  // leaves the in-browser model out.
  const inBrowser = import.meta.env.FIREFOX ? [] : [new WebLLMProvider(settings.webllmModel)];
  const endpoints = settings.endpoints.map(
    (endpoint) => new OpenAICompatibleProvider(endpoint, { getKey: () => getApiKey(endpoint.id) }),
  );
  const local = endpoints.filter((provider) => provider.privacy === 'on-device');
  const cloud = endpoints.filter((provider) => provider.privacy === 'cloud');
  return [builtin, ...local, ...inBrowser, ...cloud];
}

/**
 * Applies the user's order and switches. Providers the user hasn't placed keep their default
 * position after the placed ones, on-device before cloud.
 */
export function orderProviders(
  providers: Provider[],
  settings: Pick<Settings, 'providerOrder' | 'disabledProviders'>,
): Provider[] {
  const rank = new Map(settings.providerOrder.map((id, index) => [id, index]));
  const privacyRank = (provider: Provider) => (provider.privacy === 'on-device' ? 0 : 1);
  return providers
    .filter((provider) => !settings.disabledProviders.includes(provider.id))
    .sort((a, b) => {
      const rankA = rank.get(a.id);
      const rankB = rank.get(b.id);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      return privacyRank(a) - privacyRank(b);
    });
}
