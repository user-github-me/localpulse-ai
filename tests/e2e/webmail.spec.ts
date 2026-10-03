import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
// @ts-expect-error Native companion server has no TS declarations.
import { createTrackerServer } from '../../tools/email-tracker/server.mjs';
// @ts-expect-error Native companion queue has no TS declarations.
import { createMemoryActivityStore } from '../../tools/email-tracker/activity-store.mjs';
import { test, expect, seedStorage, openPanel } from './extension';
const service = 'https://localpulse-email-tracker.vercel.app';
for (const host of ['mail.google.com', 'outlook.live.com']) {
  test(`automatic ${host} tracking creates one image per draft, toggles and displays local activity`, async ({
    context,
    extensionId,
  }) => {
    const server = (await createTrackerServer({
      publicUrl: service,
      signingSecret: randomBytes(32).toString('base64url'),
      store: createMemoryActivityStore(),
    })) as Server;
    await new Promise<void>((resolve) => server.listen(47880, '127.0.0.1', resolve));
    const payloads: string[] = [];
    try {
      await context.route(`${service}/**`, async (route) => {
        const request = route.request();
        payloads.push(request.postData() ?? '');
        const response = await fetch(request.url().replace(service, 'http://127.0.0.1:47880'), {
          method: request.method(),
          headers: { 'Content-Type': 'application/json' },
          ...(request.postData() && { body: request.postData()! }),
        });
        await route.fulfill({
          status: response.status,
          contentType: response.headers.get('content-type') ?? 'application/json',
          body: Buffer.from(await response.arrayBuffer()),
        });
      });
      await seedStorage(context, extensionId, { settings: { onboardingComplete: false } });
      const setup = await context.newPage();
      await setup.goto(`chrome-extension://${extensionId}/onboarding.html`);
      await setup.getByRole('button', { name: 'Continue', exact: true }).click();
      await setup.getByRole('button', { name: 'Continue', exact: true }).click();
      await setup.getByRole('button', { name: 'Enable email tracking', exact: true }).click();
      await expect(
        setup.getByText('Encrypted read service connected.', { exact: true }),
      ).toBeVisible();
      expect(payloads.filter((body) => body.includes('encryptionKey'))).toHaveLength(1);
      const attributes = host === 'mail.google.com' ? 'class="Am"' : 'aria-multiline="true"';
      await context.route(`https://${host}/**`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><body><input name="subject" value="PRIVATE SUBJECT"><input name="to" value="private@example.test"><div id="compose"><div id="draft1" ${attributes} role="textbox" contenteditable="true">PRIVATE BODY</div><div id="draft2" ${attributes} role="textbox" contenteditable="true">ANOTHER PRIVATE BODY</div></div><div class="adn" role="article"><span class="g3" data-localpulse-header>12:26</span><div id="sent"></div></div></body></html>`,
        }),
      );
      const mail = await context.newPage();
      await mail.goto(`https://${host}/mail`);
      await expect(mail.locator('#draft1 img[data-localpulse-pixel]')).toHaveCount(1);
      await expect(mail.locator('#draft2 img[data-localpulse-pixel]')).toHaveCount(1);
      const source = await mail.locator('#draft1 img').getAttribute('src');
      const second = await mail.locator('#draft2 img').getAttribute('src');
      expect(source).not.toBe(second);
      await mail.locator('[data-localpulse-tools="draft"]').first().click();
      await expect(mail.locator('#draft1 img')).toHaveCount(0);
      await mail.locator('[data-localpulse-tools="draft"]').first().click();
      await expect(mail.locator('#draft1 img')).toHaveCount(1);
      await mail.evaluate((url) => {
        const image = document.createElement('img');
        image.src = url!;
        document.querySelector('#sent')!.append(image);
      }, source);
      const badge = mail.locator('[data-localpulse-tools="badge"]').first();
      await expect(badge).toContainText('0 estimated reads');
      // Synthetic recipient request bypasses the owner's browser image-blocking rules.
      await (await fetch(source!.replace(service, 'http://127.0.0.1:47880'))).arrayBuffer();
      await badge.click();
      await expect(badge).toContainText('1 estimated reads');
      await mkdir('local/screens', { recursive: true });
      await mail.screenshot({ path: `local/screens/${host}-tracking-v1.1.png` });
      expect(payloads.join(' ')).not.toMatch(
        /PRIVATE|private@example|subject|recipient|body|draftId/,
      );
      expect(payloads.filter((body) => body.includes('encryptionKey'))).toHaveLength(2);
      const panel = await openPanel(context, extensionId, mail);
      await panel.getByRole('button', { name: 'Email tracking', exact: true }).click();
      const tracking = panel.getByRole('dialog', { name: 'Email tracking' });
      await expect(
        tracking.getByRole('button', { name: 'Turn off automatic tracking' }),
      ).toBeEnabled();
      await panel.screenshot({ path: `local/screens/${host}-dashboard-v1.1.png` });
      await tracking.locator('summary').filter({ hasText: 'Test tracking service' }).click();
      await tracking.getByRole('button', { name: 'Test tracking service', exact: true }).click();
      await expect(tracking.getByText(/The encrypted tracking pipeline works/)).toBeVisible();
      await tracking
        .getByText('Advanced · manual images and private names', { exact: true })
        .click();
      await tracking.getByLabel('Private image name', { exact: true }).fill('Private project');
      await tracking.getByRole('button', { name: 'Save name locally' }).click();
      await expect(
        tracking.getByRole('button', { name: 'Private project', exact: true }),
      ).toBeVisible();
      expect(payloads.join(' ')).not.toContain('Private project');
      await tracking.getByRole('button', { name: 'Turn off automatic tracking' }).click();
      await mail.reload();
      await expect(mail.locator('[data-localpulse-tools]')).toHaveCount(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
