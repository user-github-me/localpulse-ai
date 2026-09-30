import { describe, expect, it } from 'vitest';
import { route, type RoutePolicy } from '@/core/router';
import { FakeProvider } from './helpers';

const policy = (overrides: Partial<RoutePolicy> = {}): RoutePolicy => ({
  localOnly: false,
  neverCloudSites: [],
  consent: { always: [], sites: {} },
  ...overrides,
});

describe('route', () => {
  it('uses the first ready provider in order', async () => {
    const providers = [
      new FakeProvider('builtin', { state: { kind: 'unsupported', reason: 'no' } }),
      new FakeProvider('ep:ollama'),
      new FakeProvider('ep:gemini', { privacy: 'cloud' }),
    ];
    const decision = await route(providers, { task: 'chat' }, policy());
    expect(decision).toMatchObject({ kind: 'use', provider: { id: 'ep:ollama' } });
  });

  it('asks for consent before using a cloud provider', async () => {
    const cloud = new FakeProvider('ep:gemini', { privacy: 'cloud' });
    const decision = await route([cloud], { task: 'chat', host: 'news.example' }, policy());
    expect(decision).toMatchObject({ kind: 'consent', provider: { id: 'ep:gemini' } });
  });

  it('uses a cloud provider without asking when consent covers the site or all sites', async () => {
    const cloud = new FakeProvider('ep:gemini', { privacy: 'cloud' });
    const site = await route(
      [cloud],
      { task: 'chat', host: 'news.example' },
      policy({ consent: { always: [], sites: { 'news.example': ['ep:gemini'] } } }),
    );
    expect(site.kind).toBe('use');
    const everywhere = await route(
      [cloud],
      { task: 'chat', host: 'other.example' },
      policy({ consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(everywhere.kind).toBe('use');
  });

  it('asks every time when the site of the content is unknown, whatever consent was saved', async () => {
    const cloud = new FakeProvider('ep:gemini', { privacy: 'cloud' });
    const decision = await route(
      [cloud],
      { task: 'chat', requireConsent: true },
      policy({ consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(decision).toMatchObject({ kind: 'consent', provider: { id: 'ep:gemini' } });
  });

  it('needs every site to allow the cloud when content comes from several', async () => {
    const cloud = new FakeProvider('ep:gemini', { privacy: 'cloud' });
    const decision = await route(
      [cloud],
      { task: 'chat', hosts: ['frame.example', 'mybank.com'] },
      policy({ neverCloudSites: ['mybank.com'], consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(decision).toMatchObject({ kind: 'setup', cloudBlocked: true });
  });

  it('never picks a cloud provider in Local-only mode or on a never-send site', async () => {
    const cloud = new FakeProvider('ep:gemini', { privacy: 'cloud' });
    const localOnly = await route([cloud], { task: 'chat' }, policy({ localOnly: true }));
    expect(localOnly).toMatchObject({ kind: 'setup', cloudBlocked: true });

    const blockedSite = await route(
      [cloud],
      { task: 'chat', host: 'secure.mybank.com' },
      policy({ neverCloudSites: ['mybank.com'], consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(blockedSite).toMatchObject({ kind: 'setup', cloudBlocked: true });
  });

  it('offers a downloadable on-device model as the alternative to the cloud', async () => {
    const builtin = new FakeProvider('builtin', { state: { kind: 'needs-download' } });
    const cloud = new FakeProvider('ep:gemini', { privacy: 'cloud' });
    const decision = await route([builtin, cloud], { task: 'chat' }, policy());
    expect(decision).toMatchObject({
      kind: 'consent',
      provider: { id: 'ep:gemini' },
      alternative: { id: 'builtin' },
    });
  });

  it('reports the downloadable provider when nothing is ready', async () => {
    const builtin = new FakeProvider('builtin', { state: { kind: 'needs-download' } });
    const ollama = new FakeProvider('ep:ollama', {
      state: { kind: 'needs-setup', reason: 'no-model' },
    });
    const decision = await route([builtin, ollama], { task: 'chat' }, policy());
    expect(decision).toMatchObject({ kind: 'setup', downloadable: { id: 'builtin' } });
    if (decision.kind === 'setup') expect(decision.checks).toHaveLength(2);
  });

  it('tries a pinned provider first', async () => {
    const providers = [new FakeProvider('builtin'), new FakeProvider('ep:ollama')];
    const decision = await route(
      providers,
      { task: 'chat', pinnedProviderId: 'ep:ollama' },
      policy(),
    );
    expect(decision).toMatchObject({ kind: 'use', provider: { id: 'ep:ollama' } });
  });

  it('skips failed providers and, when asked, cloud ones', async () => {
    const providers = [
      new FakeProvider('builtin'),
      new FakeProvider('ep:gemini', { privacy: 'cloud' }),
      new FakeProvider('ep:ollama'),
    ];
    const decision = await route(
      providers,
      { task: 'chat', exclude: ['builtin'], onDeviceOnly: true },
      policy({ consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(decision).toMatchObject({ kind: 'use', provider: { id: 'ep:ollama' } });
  });
});

describe('route with several tabs', () => {
  const cloud = () => new FakeProvider('ep:gemini', { privacy: 'cloud' });

  it('blocks the cloud if any tab is on a never-send site', async () => {
    const decision = await route(
      [cloud()],
      { task: 'chat', hosts: ['news.example', 'mail.mybank.com'] },
      policy({ neverCloudSites: ['mybank.com'], consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(decision).toMatchObject({ kind: 'setup', cloudBlocked: true });
  });

  it('needs consent for every site unless the provider is always allowed', async () => {
    const partial = await route(
      [cloud()],
      { task: 'chat', hosts: ['a.example', 'b.example'] },
      policy({ consent: { always: [], sites: { 'a.example': ['ep:gemini'] } } }),
    );
    expect(partial.kind).toBe('consent');
    const all = await route(
      [cloud()],
      { task: 'chat', hosts: ['a.example', 'b.example'] },
      policy({
        consent: { always: [], sites: { 'a.example': ['ep:gemini'], 'b.example': ['ep:gemini'] } },
      }),
    );
    expect(all.kind).toBe('use');
  });
});
