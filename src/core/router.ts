import type { Provider, ProviderState, TaskKind } from '@/providers/types';
import { hasConsent, type CloudConsent } from '@/storage/consent';
import { isNeverCloudSite } from './privacy';

export interface RouteRequest {
  task: TaskKind;
  /** Hostname of the page, for per-site cloud rules and consent. */
  host?: string;
  /** All hostnames when the content comes from several tabs; each must allow the cloud. */
  hosts?: readonly string[];
  /** Provider to try first (a quick action pinned to a provider). */
  pinnedProviderId?: string;
  /** Providers that already failed for this request. */
  exclude?: readonly string[];
  /** Skip cloud providers, e.g. when an on-device provider failed and cloud fallback is off. */
  onDeviceOnly?: boolean;
  /**
   * Ask before using a cloud provider even when consent was saved: the content's site is unknown,
   * so the per-site rules can't be checked.
   */
  requireConsent?: boolean;
}

export interface RoutePolicy {
  localOnly: boolean;
  neverCloudSites: readonly string[];
  consent: CloudConsent;
}

export interface ProviderCheck {
  provider: Provider;
  state: ProviderState;
}

export type RouteDecision =
  | { kind: 'use'; provider: Provider }
  /** A cloud provider is ready, but the user hasn't agreed to send this site's content to it. */
  | { kind: 'consent'; provider: Provider; alternative?: Provider }
  /** Nothing is ready. `downloadable` is an on-device model one click away. */
  | {
      kind: 'setup';
      downloadable?: Provider;
      cloudBlocked: boolean;
      checks: ProviderCheck[];
    };

/**
 * Picks a provider: the first ready one in the user's order.
 * Page content never reaches a cloud provider without consent, and never when Local-only mode
 * is on or the site is on the never-send list.
 */
export async function route(
  providers: readonly Provider[],
  request: RouteRequest,
  policy: RoutePolicy,
): Promise<RouteDecision> {
  const pinned = providers.find((provider) => provider.id === request.pinnedProviderId);
  const ordered = pinned ? [pinned, ...providers.filter((p) => p !== pinned)] : providers;

  let downloadable: Provider | undefined;
  let cloudBlocked = false;
  const checks: ProviderCheck[] = [];

  const hosts = request.hosts ?? (request.host ? [request.host] : []);

  for (const provider of ordered) {
    if (request.exclude?.includes(provider.id)) continue;
    if (provider.privacy === 'cloud') {
      if (request.onDeviceOnly) continue;
      if (
        policy.localOnly ||
        hosts.some((host) => isNeverCloudSite(host, policy.neverCloudSites))
      ) {
        cloudBlocked = true;
        continue;
      }
    }

    const state = await provider.state(request.task);
    checks.push({ provider, state });

    if (state.kind === 'ready') {
      const consented =
        hosts.length === 0
          ? hasConsent(policy.consent, provider.id)
          : hosts.every((host) => hasConsent(policy.consent, provider.id, host));
      if (provider.privacy === 'cloud' && (request.requireConsent || !consented)) {
        return { kind: 'consent', provider, alternative: downloadable };
      }
      return { kind: 'use', provider };
    }
    if ((state.kind === 'needs-download' || state.kind === 'downloading') && !downloadable) {
      downloadable = provider;
    }
  }

  return { kind: 'setup', downloadable, cloudBlocked, checks };
}
