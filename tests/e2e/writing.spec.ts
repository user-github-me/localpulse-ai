import type { BrowserContext, Page } from '@playwright/test';
import {
  endpoint,
  expect,
  MOCK_API,
  MOCK_LOCAL_API,
  mockChatApi,
  openPanel,
  seedStorage,
  test,
} from './extension';

// The `chrome` API inside page.evaluate() callbacks, which run in extension pages.
declare const chrome: {
  storage: { session: { set(items: Record<string, unknown>): Promise<void> } };
  tabs: { query(query: { url: string }): Promise<{ id?: number }[]> };
};

const COMPOSE_URL = 'https://mail.test/compose';
const DRAFT = "Hi team,\n\nwe're meeting tomorow at 10.\n\nThanks,\nSam";
const FIXED = "Hi team,\n\nWe're meeting tomorrow at 10.\n\nThanks,\nSam";

async function openDraft(
  context: BrowserContext,
  text = DRAFT,
  title = 'New message',
): Promise<Page> {
  await context.route(`${COMPOSE_URL}**`, (route) =>
    route.fulfill({
      body: `<!doctype html><html lang="en"><head><title>${title}</title></head><body>
        <textarea id="message" rows="8" cols="60"></textarea></body></html>`,
      contentType: 'text/html; charset=utf-8',
    }),
  );
  const page = await context.newPage();
  await page.goto(COMPOSE_URL);
  await page.evaluate((draft) => {
    const field = document.getElementById('message') as HTMLTextAreaElement;
    field.value = draft;
    field.focus();
    field.setSelectionRange(0, field.value.length);
  }, text);
  return page;
}

test('text selected in a field gets Proofread by default, keeps its line breaks and goes back in', async ({
  context,
  extensionId,
}) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, () => FIXED);
  // Default quick actions: Proofread and Rewrite aren't among them.
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      onboardingComplete: true,
    },
  });
  const draft = await openDraft(context);
  const panel = await openPanel(context, extensionId, draft);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Rewrite' })).toBeVisible();
  await panel.getByRole('button', { name: 'Proofread' }).click();

  // Shown exactly as Replace will put it back: "Thanks," and "Sam" on separate lines.
  await expect(panel.locator('p.answer')).toHaveText(FIXED, { useInnerText: true });
  expect(requests[0]?.body.messages.at(-1)?.content).toContain(DRAFT);
  await panel.getByRole('button', { name: 'Replace selection' }).click();
  await expect(panel.getByText('Replaced the selected text on the page.')).toBeVisible();
  expect(await draft.locator('#message').inputValue()).toBe(FIXED);
});

test('right-click Proofread on a field uses its exact text and offers Replace', async ({
  context,
  extensionId,
}) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, () => FIXED);
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      onboardingComplete: true,
    },
  });
  const draft = await openDraft(context);
  const panel = await openPanel(context, extensionId, draft);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  // What the context menu hands over: its copy of the selection has no line breaks.
  await panel.evaluate(
    async ({ url, text }) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.storage.session.set({
        pendingAction: {
          id: 'menu-proofread',
          recipeId: 'proofread',
          tabId: tab?.id,
          selection: text,
          url,
          pageUrl: url,
          createdAt: Date.now(),
        },
      });
    },
    { url: COMPOSE_URL, text: DRAFT.replace(/\s+/g, ' ') },
  );
  await expect(panel.getByRole('button', { name: 'Replace selection' })).toBeVisible();
  expect(requests[0]?.body.messages.at(-1)?.content).toContain(DRAFT);
});

test('Replace refuses when the field no longer holds the text the answer was written from', async ({
  context,
  extensionId,
}) => {
  await mockChatApi(context, MOCK_LOCAL_API, () => FIXED);
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      onboardingComplete: true,
    },
  });
  const draft = await openDraft(context);
  const panel = await openPanel(context, extensionId, draft);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  await panel.getByRole('button', { name: 'Proofread' }).click();
  await expect(panel.getByRole('button', { name: 'Replace selection' })).toBeVisible();

  // The user edits the draft and selects something else before clicking Replace.
  await draft.evaluate(() => {
    const field = document.getElementById('message') as HTMLTextAreaElement;
    field.value = 'A completely different message.';
    field.focus();
    field.setSelectionRange(0, field.value.length);
  });
  await panel.getByRole('button', { name: 'Replace selection' }).click();
  await expect(
    panel.getByText(/has changed since this answer, so nothing was replaced/),
  ).toBeVisible();
  expect(await draft.locator('#message').inputValue()).toBe('A completely different message.');
});

test('Replace refuses text where the cloud model changed the placeholder of a hidden address', async ({
  context,
  extensionId,
}) => {
  const draft = 'Hi team,\n\nwrite to jane@mail.test tomorow.\n\nThanks,\nSam';
  // The first answer translates the placeholder, so the address can't be put back; the second
  // keeps it.
  const cloud = await mockChatApi(context, MOCK_API, () =>
    cloud.length === 1
      ? 'Hi team,\n\nWrite to [correo 1] tomorrow.\n\nThanks,\nSam'
      : 'Hi team,\n\nWrite to [email 1] tomorrow.\n\nThanks,\nSam',
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
    cloudConsent: { always: ['ep:mock'], sites: {} },
  });
  const page = await openDraft(context, draft);
  const panel = await openPanel(context, extensionId, page);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  await panel.getByRole('button', { name: 'Proofread' }).click();
  await expect(panel.getByRole('button', { name: 'Replace selection' })).toBeVisible();
  expect(JSON.stringify(cloud[0]?.body.messages)).not.toContain('jane@mail.test');
  await panel.getByRole('button', { name: 'Replace selection' }).click();
  await expect(panel.getByText(/couldn't be put back into this text/)).toBeVisible();
  expect(await page.locator('#message').inputValue()).toBe(draft);

  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(panel.locator('p.answer')).toContainText('Write to jane@mail.test tomorrow.');
  await panel.getByRole('button', { name: 'Replace selection' }).click();
  await expect(panel.getByText('Replaced the selected text on the page.')).toBeVisible();
  expect(await page.locator('#message').inputValue()).toBe(
    'Hi team,\n\nWrite to jane@mail.test tomorrow.\n\nThanks,\nSam',
  );
});

test("an address in the tab title, hidden from the cloud, doesn't stop Replace", async ({
  context,
  extensionId,
}) => {
  const cloud = await mockChatApi(
    context,
    MOCK_API,
    () => 'Hey, can you send me the report tomorrow?',
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
    cloudConsent: { always: ['ep:mock'], sites: {} },
  });
  const page = await openDraft(
    context,
    'hey can u send me the report tmrw',
    'Inbox (3) - jane@mail.test - Mail',
  );
  const panel = await openPanel(context, extensionId, page);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  await panel.getByRole('button', { name: 'Proofread' }).click();
  await panel.getByRole('button', { name: 'Replace selection' }).click();
  await expect(panel.getByText('Replaced the selected text on the page.')).toBeVisible();
  expect(await page.locator('#message').inputValue()).toBe(
    'Hey, can you send me the report tomorrow?',
  );
  expect(JSON.stringify(cloud[0]?.body.messages)).not.toContain('jane@mail.test');
});
