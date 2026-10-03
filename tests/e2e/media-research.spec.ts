import AxeBuilder from '@axe-core/playwright';
import { test, expect, openPanel, seedStorage } from './extension';
test('local media tools disclose downloads and remain inactive until explicit enable', async ({
  context,
  extensionId,
  article,
}) => {
  const requests: string[] = [];
  context.on('request', (request) => {
    if (/huggingface|hf\.co|raw\.githubusercontent/.test(request.url()))
      requests.push(request.url());
  });
  const panel = await openPanel(context, extensionId, article);
  for (const title of ['Image and PDF text', 'Audio transcript']) {
    await panel.getByRole('button', { name: title, exact: true }).click();
    const dialog = panel.getByRole('dialog', { name: title });
    await expect(
      dialog.getByRole('button', { name: 'Download model data and enable' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', {
        name: title === 'Audio transcript' ? 'Transcribe locally' : 'Recognize text locally',
      }),
    ).toBeDisabled();
    expect(
      (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  expect(requests).toEqual([]);
});
test('web research sends only a typed query and fetches only the explicitly selected source', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, { settings: { localOnly: true } });
  const requests: string[] = [];
  await context.route('https://en.wikipedia.org/**', (route) => {
    requests.push(route.request().url());
    return route.fulfill(
      route.request().url().includes('/w/api.php')
        ? {
            json: {
              query: { search: [{ title: 'Privacy', snippet: 'Local <b>research</b> tools' }] },
            },
          }
        : {
            contentType: 'text/html',
            body: `<html><head><title>Privacy</title></head><body><article><h1>Privacy</h1><p>${'Local tools keep research on your device. '.repeat(50)}</p></article></body></html>`,
          },
    );
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Web research', exact: true }).click();
  const research = panel.getByRole('dialog', { name: 'Web research' });
  expect(requests).toEqual([]);
  await research.getByRole('textbox', { name: 'Search query' }).fill('privacy tools');
  await research.getByRole('button', { name: 'Search this query' }).click();
  await expect(research.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]!).searchParams.get('srsearch')).toBe('privacy tools');
  expect(requests.join(' ')).not.toContain(article.url());
  await research.getByRole('button', { name: 'Fetch public source into workspace' }).click();
  await expect(
    research.getByText(
      'Source added to your workspace. AI requests still follow your existing privacy settings.',
    ),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
});
test('onboarding shows Windows modifier names from browser platform information', async ({
  context,
  extensionId,
}) => {
  await context.addInitScript(() => {
    const api = (
      globalThis as unknown as {
        chrome?: {
          runtime?: { getPlatformInfo?: () => Promise<object> };
          commands?: { getAll?: () => Promise<object[]> };
        };
      }
    ).chrome;
    if (api?.runtime) api.runtime.getPlatformInfo = async () => ({ os: 'win', arch: 'x86-64' });
    if (api?.commands)
      api.commands.getAll = async () => [{ name: '_execute_action', shortcut: 'Ctrl+Shift+K' }];
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText(/You can also press Ctrl\+Shift\+K/)).toBeVisible();
  expect(await page.locator('main').innerText()).not.toContain('⌥');
});

test('onboarding explains toolbar access when the shortcut is unassigned', async ({
  context,
  extensionId,
}) => {
  await context.addInitScript(() => {
    const api = (
      globalThis as unknown as { chrome?: { commands?: { getAll?: () => Promise<object[]> } } }
    ).chrome;
    if (api?.commands)
      api.commands.getAll = async () => [{ name: '_execute_action', shortcut: '' }];
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText(/You can assign a keyboard shortcut/)).toBeVisible();
  expect(await page.locator('main').innerText()).not.toContain('You can also press');
});
