import { storage } from '#imports';

/** Which cloud providers the user agreed to send page content to. */
export interface CloudConsent {
  /** Provider ids allowed on every site. */
  always: string[];
  /** hostname → provider ids allowed on that site. */
  sites: Record<string, string[]>;
}

const consentItem = storage.defineItem<CloudConsent>('local:cloudConsent', {
  fallback: { always: [], sites: {} },
});

export function hasConsent(consent: CloudConsent, providerId: string, host?: string): boolean {
  if (consent.always.includes(providerId)) return true;
  return host !== undefined && (consent.sites[host]?.includes(providerId) ?? false);
}

export async function getConsent(): Promise<CloudConsent> {
  return consentItem.getValue();
}

export async function grantConsent(
  providerId: string,
  scope: 'site' | 'always',
  host?: string,
): Promise<void> {
  const consent = await consentItem.getValue();
  if (scope === 'always') {
    if (!consent.always.includes(providerId)) consent.always = [...consent.always, providerId];
  } else if (host) {
    const current = consent.sites[host] ?? [];
    if (!current.includes(providerId))
      consent.sites = { ...consent.sites, [host]: [...current, providerId] };
  }
  await consentItem.setValue(consent);
}

export async function revokeConsent(providerId: string): Promise<void> {
  const consent = await consentItem.getValue();
  const sites: Record<string, string[]> = {};
  for (const [host, ids] of Object.entries(consent.sites)) {
    const kept = ids.filter((id) => id !== providerId);
    if (kept.length) sites[host] = kept;
  }
  await consentItem.setValue({ always: consent.always.filter((id) => id !== providerId), sites });
}

export async function clearConsent(): Promise<void> {
  await consentItem.setValue({ always: [], sites: {} });
}
