import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { localOriginRules } from '@/providers/local-origin';
import { orderProviders } from '@/providers/registry';
import { getConsent, grantConsent, hasConsent, revokeConsent } from '@/storage/consent';
import { getApiKey, isSessionOnlyKey, removeApiKey, setApiKey } from '@/storage/credentials';
import {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  type EndpointConfig,
} from '@/storage/settings';
import { FakeProvider } from './helpers';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('orderProviders', () => {
  const providers = [
    new FakeProvider('builtin'),
    new FakeProvider('ep:ollama'),
    new FakeProvider('ep:gemini', { privacy: 'cloud' }),
    new FakeProvider('ep:groq', { privacy: 'cloud' }),
  ];

  it('keeps on-device providers first by default', () => {
    const ids = orderProviders(providers, {
      providerOrder: ['builtin'],
      disabledProviders: [],
    }).map((p) => p.id);
    expect(ids).toEqual(['builtin', 'ep:ollama', 'ep:gemini', 'ep:groq']);
  });

  it("follows the user's order and drops turned-off providers", () => {
    const ids = orderProviders(providers, {
      providerOrder: ['ep:groq', 'builtin'],
      disabledProviders: ['ep:ollama'],
    }).map((p) => p.id);
    expect(ids).toEqual(['ep:groq', 'builtin', 'ep:gemini']);
  });
});

describe('settings', () => {
  it('returns defaults and merges updates', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await updateSettings({ localOnly: true });
    await updateSettings((current) => ({
      neverCloudSites: [...current.neverCloudSites, 'bank.com'],
    }));
    const settings = await getSettings();
    expect(settings.localOnly).toBe(true);
    expect(settings.neverCloudSites).toEqual(['bank.com']);
    expect(settings.redactForCloud).toBe(true);
  });
});

describe('API keys', () => {
  it('stores keys locally or for the session only', async () => {
    await setApiKey('ep:gemini', '  local-key ');
    expect(await getApiKey('ep:gemini')).toBe('local-key');
    await setApiKey('ep:gemini', 'session-key', { sessionOnly: true });
    expect(await getApiKey('ep:gemini')).toBe('session-key');
    expect(await isSessionOnlyKey('ep:gemini')).toBe(true);
    const local = await fakeBrowser.storage.local.get('apiKeys');
    expect(local.apiKeys).toEqual({});
    await removeApiKey('ep:gemini');
    expect(await getApiKey('ep:gemini')).toBeUndefined();
  });
});

describe('cloud consent', () => {
  it('grants per site or everywhere, and revokes', async () => {
    await grantConsent('ep:gemini', 'site', 'news.example');
    let consent = await getConsent();
    expect(hasConsent(consent, 'ep:gemini', 'news.example')).toBe(true);
    expect(hasConsent(consent, 'ep:gemini', 'other.example')).toBe(false);

    await grantConsent('ep:groq', 'always');
    consent = await getConsent();
    expect(hasConsent(consent, 'ep:groq', 'anything.example')).toBe(true);

    await revokeConsent('ep:gemini');
    consent = await getConsent();
    expect(hasConsent(consent, 'ep:gemini', 'news.example')).toBe(false);
    expect(consent.sites).toEqual({});
  });
});

describe('localOriginRules', () => {
  const endpoint = (id: string, baseUrl: string): EndpointConfig => ({
    id,
    presetId: 'custom',
    label: id,
    baseUrl,
    model: 'm',
    contextTokens: 4096,
  });

  it('adds one rule per local origin, only for LocalPulse requests', () => {
    const rules = localOriginRules(
      [
        endpoint('a', 'http://localhost:11434/v1'),
        endpoint('b', 'http://localhost:11434/v1'),
        endpoint('c', 'http://127.0.0.1:1234/v1'),
        endpoint('d', 'https://api.groq.com/openai/v1'),
      ],
      'abcdefghijklmnop',
    );
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      action: {
        requestHeaders: [{ header: 'origin', operation: 'set', value: 'http://localhost:11434' }],
      },
      condition: { urlFilter: '|http://localhost:11434/', initiatorDomains: ['abcdefghijklmnop'] },
    });
  });
});
