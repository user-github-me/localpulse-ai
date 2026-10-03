import { browser, type Browser } from '#imports';
import { isLocalUrl } from '@/lib/text';
import type { EndpointConfig } from '@/storage/settings';

const FIRST_RULE_ID = 1000;

/**
 * Ollama answers requests from browser extensions with HTTP 403 unless OLLAMA_ORIGINS lists them.
 * These rules set the Origin header of LocalPulse's own requests to the server's address, so it
 * works without extra setup. With declarativeNetRequestWithHostAccess they
 * only apply to local servers the user granted access to.
 */
export function localOriginRules(
  endpoints: readonly EndpointConfig[],
  extensionHost: string,
): Browser.declarativeNetRequest.Rule[] {
  const origins = [
    ...new Set(
      endpoints
        .filter((endpoint) => isLocalUrl(endpoint.baseUrl))
        .map((endpoint) => new URL(endpoint.baseUrl).origin),
    ),
  ];
  return origins.map(
    (origin, index) =>
      ({
        id: FIRST_RULE_ID + index,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'origin', operation: 'set', value: origin }],
        },
        condition: {
          urlFilter: `|${origin}/`,
          initiatorDomains: [extensionHost],
          resourceTypes: ['xmlhttprequest'],
        },
      }) as unknown as Browser.declarativeNetRequest.Rule,
  );
}

export async function syncLocalOriginRules(endpoints: readonly EndpointConfig[]): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  if (!dnr?.updateDynamicRules) return;
  const extensionHost = new URL(browser.runtime.getURL('/')).host;
  const existing = await dnr.getDynamicRules();
  await dnr.updateDynamicRules({
    removeRuleIds: existing
      .filter((rule) => rule.id >= FIRST_RULE_ID && rule.id < 2000)
      .map((rule) => rule.id),
    addRules: localOriginRules(endpoints, extensionHost),
  });
}
