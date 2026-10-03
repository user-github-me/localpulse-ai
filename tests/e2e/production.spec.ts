import { chromium, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('production install registers background actions and opens onboarding without optional permissions', async () => {
  const path = resolve('local/build/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const state = await worker.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          chrome: {
            runtime: {
              getManifest(): { version: string; host_permissions?: string[] };
              onInstalled: { hasListeners(): boolean };
            };
            action: { onClicked: { hasListeners(): boolean } };
            permissions: { contains(value: { permissions: string[] }): Promise<boolean> };
          };
        }
      ).chrome;
      return {
        manifest: api.runtime.getManifest(),
        installed: api.runtime.onInstalled.hasListeners(),
        toolbar: api.action.onClicked.hasListeners(),
        alarmsGranted: await api.permissions.contains({ permissions: ['alarms'] }),
      };
    });
    expect(state.manifest.version).toBe('1.1.0');
    expect(state.manifest.host_permissions ?? []).toEqual([]);
    expect(state.alarmsGranted).toBe(false);
    expect(state.installed).toBe(true);
    expect(state.toolbar).toBe(true);
    await expect
      .poll(() => context.pages().some((page) => page.url().endsWith('/onboarding.html')))
      .toBe(true);
    const onboarding = context.pages().find((page) => page.url().endsWith('/onboarding.html'))!;
    await expect(onboarding.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});
