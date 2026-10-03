import { test, expect, openPanel, ARTICLE_URL } from './extension';
test('previews exact duplicate tabs, saves a session and closes only after confirmation', async ({
  context,
  extensionId,
  article,
}) => {
  const duplicate = await context.newPage();
  await duplicate.goto(ARTICLE_URL);
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Tab organizer', exact: true }).click();
  const organizer = panel.getByRole('dialog', { name: 'Tab organizer' });
  await organizer.getByRole('button', { name: 'Review this window’s tabs' }).click();
  await organizer.getByRole('button', { name: 'Select unpinned duplicates' }).click();
  await expect(organizer.getByText('1 tabs selected', { exact: true })).toBeVisible();
  await organizer.getByRole('textbox', { name: 'Session name' }).fill('Saved research');
  await organizer.getByRole('button', { name: 'Save selected session' }).click();
  await expect(organizer.getByText('Saved research · 1')).toBeVisible();
  await organizer.getByRole('button', { name: 'Close selected tabs…' }).click();
  expect(duplicate.isClosed()).toBe(false);
  await organizer.getByRole('button', { name: 'Confirm close tabs' }).click();
  await expect.poll(() => duplicate.isClosed()).toBe(true);
  await organizer.getByRole('button', { name: 'Restore…' }).click();
  const newPage = context.waitForEvent('page');
  await organizer.getByRole('button', { name: 'Open saved tabs' }).click();
  const restored = await newPage;
  expect(restored.isClosed()).toBe(false);
  // Tabs opened by chrome.tabs.create can navigate before Playwright attaches its route.
  await expect
    .poll(() =>
      panel.evaluate(async (url) => {
        const browserApi = (
          globalThis as unknown as {
            chrome: { tabs: { query(options: object): Promise<{ url?: string }[]> } };
          }
        ).chrome;
        return (await browserApi.tabs.query({ url })).length;
      }, ARTICLE_URL),
    )
    .toBe(2);
});
