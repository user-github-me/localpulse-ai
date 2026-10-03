import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { endpoint, expect, MOCK_API, mockChatApi, openPanel, seedStorage, test } from './extension';

// Accessibility checks with axe-core on every screen, in light and dark themes.
async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes
      .slice(0, 3)
      .map(
        (node) =>
          `${node.target.join(' ')} :: ${node.failureSummary?.replace(/\s+/g, ' ').slice(0, 220)}`,
      ),
  }));
}

for (const theme of ['light', 'dark'] as const) {
  test(`research, tabs and media dialogs have no violations (${theme})`, async ({
    context,
    extensionId,
    article,
  }) => {
    await seedStorage(context, extensionId, { settings: { theme } });
    const panel = await openPanel(context, extensionId, article);
    for (const title of [
      'Research library',
      'Tab organizer',
      'Web research',
      'Image and PDF text',
      'Audio transcript',
    ]) {
      await panel.getByRole('button', { name: title, exact: true }).click();
      const dialog = panel.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      expect(await violations(panel)).toEqual([]);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    }
  });
  test(`side panel has no accessibility violations (${theme})`, async ({
    context,
    extensionId,
    article,
  }) => {
    await mockChatApi(
      context,
      MOCK_API,
      () => 'A **summary** with `code` and a [link](https://example.org).',
    );
    await seedStorage(context, extensionId, {
      settings: { endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')], theme },
      apiKeys: { 'ep:mock': 'k' },
      cloudConsent: { always: ['ep:mock'], sites: {} },
    });
    const panel = await openPanel(context, extensionId, article);
    await panel.getByRole('button', { name: 'Summarize' }).click();
    await expect(panel.getByText(/Answered in the cloud/)).toBeVisible();
    expect(await violations(panel)).toEqual([]);

    await panel.getByRole('button', { name: 'Preview' }).click();
    expect(await violations(panel)).toEqual([]);
  });

  test(`setup card, settings and onboarding have no violations (${theme})`, async ({
    context,
    extensionId,
    article,
  }) => {
    await seedStorage(context, extensionId, { settings: { theme } });
    const panel = await openPanel(context, extensionId, article);
    await panel.getByRole('button', { name: 'Summarize' }).click();
    await expect(
      panel.getByRole('region', { name: 'Choose where answers come from' }),
    ).toBeVisible();
    expect(await violations(panel)).toEqual([]);

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByRole('button', { name: 'Ollama' }).click();
    await expect(options.getByText('Server address')).toBeVisible();
    expect(await violations(options)).toEqual([]);

    await options.goto(`chrome-extension://${extensionId}/onboarding.html`);
    await expect(options.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await violations(options)).toEqual([]);
  });
}
