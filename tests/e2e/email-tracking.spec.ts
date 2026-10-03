import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
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
    await panel.getByRole('button', { name: 'Follow-ups', exact: true }).click();
    await panel.getByRole('button', { name: 'Image activity tracking', exact: true }).click();
    const tracker = panel.getByRole('dialog', { name: 'Private email read activity' });
    await tracker
      .getByRole('textbox', { name: 'Tracking server URL' })
      .fill('http://127.0.0.1:47879');
    await tracker.getByRole('button', { name: 'Connect server', exact: true }).click();
    await expect(
      tracker.getByText('Encrypted read service connected.', { exact: true }),
    ).toBeVisible();
    await tracker.getByRole('button', { name: 'Create private tracking image' }).click();
    await expect(tracker.getByRole('region', { name: 'Private tracking image' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
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
    await tracker.getByRole('button', { name: 'Collect and delete server events' }).click();
    await expect(tracker.getByText('1 image requests', { exact: true })).toBeVisible();
    const request = outbound.find((request) => request.url.endsWith('/api/events'))!;
    const events = await (
      await fetch('http://127.0.0.1:47879/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body,
      })
    ).json();
    expect(events.events).toEqual([]);
    await tracker.getByRole('button', { name: 'Collect and delete server events' }).click();
    await expect(tracker.getByText('1 image requests', { exact: true })).toBeVisible();
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
    await expect(tracker.getByText('1 image requests', { exact: true })).toBeVisible();
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
    await panel.getByRole('button', { name: 'Follow-ups', exact: true }).click();
    await panel.getByRole('button', { name: 'Image activity tracking', exact: true }).click();
    await tracker
      .getByLabel('Backup password (at least 12 characters)')
      .fill('owner backup password');
    await tracker.locator('input[type="file"]').setInputFiles(backupPath!);
    await expect(
      tracker.getByText('Encrypted tracking backup restored.', { exact: true }),
    ).toBeVisible();
    await expect(tracker.getByText('1 image requests', { exact: true })).toBeVisible();
    await (await fetch(pixelUrl!)).arrayBuffer();
    await tracker.getByRole('button', { name: 'Collect and delete server events' }).click();
    await expect(tracker.getByText('2 image requests', { exact: true })).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
