import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
// @ts-expect-error Companion server deliberately has no TypeScript declarations.
import { createTrackerServer } from '../../tools/email-tracker/server.mjs';
// @ts-expect-error Companion queue deliberately has no TypeScript declarations.
import { createMemoryActivityStore } from '../../tools/email-tracker/activity-store.mjs';
import { expect, openPanel, seedStorage, test } from './extension';

test('private read tracking encrypts timestamps, saves results before deletion, and exports encrypted owner backups', async ({
  context,
  extensionId,
  article,
}) => {
  const store = createMemoryActivityStore();
  const server = (await createTrackerServer({
    publicUrl: 'http://127.0.0.1:47879',
    signingSecret: randomBytes(32).toString('base64url'),
    store,
  })) as Server;
  await new Promise<void>((resolve) => server.listen(47879, '127.0.0.1', resolve));
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seedStorage(context, extensionId, { settings: { onboardingComplete: true } });
    const panel = await openPanel(context, extensionId, article);
    await panel.setViewportSize({ width: 320, height: 820 });
    const outbound: { url: string; body: string | null }[] = [];
    panel.on('request', (request) => {
      if (request.url().startsWith('http://127.0.0.1:47879'))
        outbound.push({ url: request.url(), body: request.postData() });
    });
    await panel.getByRole('button', { name: 'Email tracking', exact: true }).click();
    const tracker = panel.getByRole('dialog', { name: 'Email tracking' });
    await tracker.getByText('Use your own server', { exact: true }).click();
    await expect(tracker.getByRole('textbox', { name: 'Tracking server URL' })).toHaveValue(
      'https://localpulse-email-tracker.vercel.app',
    );
    await tracker
      .getByRole('textbox', { name: 'Tracking server URL' })
      .fill('http://127.0.0.1:47879');
    await tracker.getByRole('button', { name: 'Enable email tracking', exact: true }).click();
    await expect(
      tracker.getByText('Connected. Create an image for your first email below.', { exact: true }),
    ).toBeVisible();
    await tracker.getByRole('button', { name: 'Create tracking image' }).click();
    await expect(tracker.getByRole('region', { name: 'Private tracking image' })).toBeVisible();
    await mkdir('local/screens', { recursive: true });
    await panel.screenshot({ path: 'local/screens/email-tracking-v1.1.png' });
    expect(
      await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await tracker.getByText('HTML options', { exact: true }).click();
    await tracker.getByRole('button', { name: 'Copy HTML code', exact: true }).click();
    const html = await panel.evaluate(() => navigator.clipboard.readText());
    const pixelUrl = /src="([^"]+)"/.exec(html)?.[1];
    expect(pixelUrl).toBeTruthy();
    const created = outbound.find((request) => request.url.endsWith('/api/readers'))!;
    expect(Object.keys(JSON.parse(created.body!)).sort()).toEqual([
      'encryptionKey',
      'verificationKey',
    ]);
    expect(JSON.stringify(outbound)).not.toContain(article.url());
    expect(outbound.some((request) => request.url.includes('/p/'))).toBe(false);
    const pixel = await fetch(pixelUrl!);
    await pixel.arrayBuffer();
    await tracker.getByRole('button', { name: 'Check reads' }).click();
    await expect(tracker.getByText('1 image request', { exact: true })).toBeVisible();
    const request = outbound.find((request) => request.url.endsWith('/api/events'))!;
    const events = await (
      await fetch('http://127.0.0.1:47879/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body,
      })
    ).json();
    expect(events.events).toEqual([]);
    await tracker.getByRole('button', { name: 'Check reads' }).click();
    await expect(tracker.getByText('1 image request', { exact: true })).toBeVisible();
    await tracker.getByText('Back up or restore tracking', { exact: true }).click();
    await tracker
      .getByLabel('Backup password (at least 12 characters)')
      .fill('owner backup password');
    const [download] = await Promise.all([
      panel.waitForEvent('download'),
      tracker.getByRole('button', { name: 'Export encrypted backup' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('localpulse-read-backup.json');
    const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath!, 'utf8'));
    expect(Object.keys(backup).sort()).toEqual(['ciphertext', 'format', 'iv', 'salt', 'version']);
    await tracker.getByRole('button', { name: 'Remove tracking image', exact: true }).click();
    const deletion = panel.getByRole('dialog', { name: 'Remove tracking image', exact: true });
    await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(tracker).toBeVisible();
    await expect(tracker.getByText('1 image request', { exact: true })).toBeVisible();
    // Restore in a clean local vault, then collect a new request using the restored keys.
    await panel.evaluate(() => {
      const extension = (
        globalThis as unknown as {
          chrome: { storage: { local: { remove(key: string): Promise<void> } } };
        }
      ).chrome;
      return extension.storage.local.remove('readTrackerVault');
    });
    await panel.reload();
    await panel.getByRole('button', { name: 'Email tracking', exact: true }).click();
    await tracker.getByText('Back up or restore tracking', { exact: true }).click();
    await tracker
      .getByLabel('Backup password (at least 12 characters)')
      .fill('owner backup password');
    await tracker.locator('input[type="file"]').setInputFiles(backupPath!);
    await expect(
      tracker.getByText('Encrypted tracking backup restored.', { exact: true }),
    ).toBeVisible();
    await expect(tracker.getByText('1 image request', { exact: true })).toBeVisible();
    await (await fetch(pixelUrl!)).arrayBuffer();
    await tracker.getByRole('button', { name: 'Check reads' }).click();
    await expect(tracker.getByText('2 image requests', { exact: true })).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`first-run setup offers tracking, skips without network, and remains accessible (${theme})`, async ({
    context,
    extensionId,
    article,
  }) => {
    await seedStorage(context, extensionId, { settings: { theme, onboardingComplete: false } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 820 });
    const trackingRequests: string[] = [];
    await context.route('https://localpulse-email-tracker.vercel.app/**', (route) => {
      trackingRequests.push(route.request().url());
      return route.fulfill({
        json: { service: 'localpulse-email-tracker', version: 3, ready: true },
      });
    });
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Would you like email read tracking?' }),
    ).toBeFocused();
    await expect(page.getByRole('button', { name: 'Enable email tracking' })).toBeVisible();
    expect(trackingRequests).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { name: "You're ready." })).toBeVisible();
    expect(trackingRequests).toEqual([]);
    const panel = await openPanel(context, extensionId, article);
    await panel.getByRole('button', { name: 'Email tracking', exact: true }).click();
    const tracker = panel.getByRole('dialog', { name: 'Email tracking' });
    await expect(tracker.getByRole('button', { name: 'Enable email tracking' })).toBeVisible();
    await expect(tracker.getByRole('textbox', { name: 'Tracking server URL' })).toBeHidden();
    await expect(tracker.getByLabel('Backup password (at least 12 characters)')).toBeHidden();
    expect(trackingRequests).toEqual([]);
  });
}

test('first-run enable uses the default URL, retries after a connection failure, and persists setup without creating images', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, { settings: { onboardingComplete: false } });
  let fail = true;
  const requests: { url: string; body: string | null }[] = [];
  await context.route('https://localpulse-email-tracker.vercel.app/**', (route) => {
    requests.push({ url: route.request().url(), body: route.request().postData() });
    return route.fulfill(
      fail
        ? { status: 503, json: { error: 'Temporary failure' } }
        : { json: { service: 'localpulse-email-tracker', version: 3, ready: true } },
    );
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Enable email tracking' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Enable email tracking' }).click();
  await expect(page.getByText('Encrypted read service connected.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Email tracking', exact: true }).click();
  const tracker = panel.getByRole('dialog', { name: 'Email tracking' });
  await expect(tracker.getByRole('button', { name: 'Create tracking image' })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(
    requests.every((request) => request.url.endsWith('/api/status') && request.body === null),
  ).toBe(true);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    options.getByText('LocalPulse AI 1.1.0. Free and open source under the MIT license.', {
      exact: true,
    }),
  ).toBeVisible();
});
