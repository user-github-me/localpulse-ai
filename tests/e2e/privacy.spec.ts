import type { BrowserContext, Page } from '@playwright/test';
import {
  ARTICLE_URL,
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
};

const OTHER_URL = 'https://other.test/post';

/** An ordinary site, not on the never-send list. */
async function routeOtherSite(context: BrowserContext): Promise<void> {
  await context.route('https://other.test/**', (route) =>
    route.fulfill({
      body: `<!doctype html><html lang="en"><head><title>Garden notes</title></head><body><main><article>
        <h1>Garden notes</h1><p>${'Tomatoes need sun, water and patience in equal measure. '.repeat(20)}</p>
      </article></main></body></html>`,
      contentType: 'text/html; charset=utf-8',
    }),
  );
}

async function openOtherPage(context: BrowserContext): Promise<Page> {
  await routeOtherSite(context);
  const page = await context.newPage();
  await page.goto(OTHER_URL);
  return page;
}

test('a right-click action follows the rules of the page the text is on', async ({
  context,
  extensionId,
}) => {
  const requests = await mockChatApi(context, MOCK_API, () => 'cloud answer');
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      neverCloudSites: ['article.test'],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
    cloudConsent: { always: ['ep:mock'], sites: {} },
  });
  // The panel shows an allowed page, but the text was selected on a never-send site.
  const other = await openOtherPage(context);
  const panel = await openPanel(context, extensionId, other);
  await expect(panel.getByRole('heading', { name: 'Garden notes' })).toBeVisible();
  await panel.evaluate(async (action) => chrome.storage.session.set({ pendingAction: action }), {
    id: 'from-menu',
    recipeId: 'explain',
    selection: 'Compute shaders let a page run massively parallel work on the GPU.',
    url: ARTICLE_URL,
    pageUrl: ARTICLE_URL,
    createdAt: Date.now(),
  });
  await expect(panel.getByText(/Cloud providers are off for this page/)).toBeVisible();
  expect(requests).toHaveLength(0);
});

test('follow-up questions to the cloud leave out answers about never-send sites', async ({
  context,
  extensionId,
  article,
}) => {
  await mockChatApi(context, MOCK_LOCAL_API, () => 'Your balance is 1,200.');
  const cloud = await mockChatApi(context, MOCK_API, () => 'Tomatoes need sun.');
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [
        endpoint('ep:mock', MOCK_API, 'Mock Cloud'),
        endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock'),
      ],
      providerOrder: ['ep:mock', 'ep:local'],
      neverCloudSites: ['article.test'],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
    cloudConsent: { always: ['ep:mock'], sites: {} },
  });
  const panel = await openPanel(context, extensionId, article);
  const ask = async (question: string) => {
    await panel.getByRole('textbox', { name: 'Ask about this page' }).fill(question);
    await panel.keyboard.press('Enter');
  };

  // On the never-send site the cloud is skipped and the local model answers.
  await ask('What is my balance?');
  await expect(panel.getByText('Answered on this device by Local Mock')).toBeVisible();

  // The same tab moves on to an ordinary site, where the cloud may be used.
  await routeOtherSite(context);
  await article.goto(OTHER_URL);
  await expect(panel.getByRole('heading', { name: 'Garden notes' })).toBeVisible();
  await ask('What do tomatoes need?');
  await expect(panel.getByText('Answered in the cloud by Mock Cloud')).toBeVisible();
  await expect(
    panel.getByText("1 earlier answer about another page wasn't sent to Mock Cloud."),
  ).toBeVisible();

  expect(cloud).toHaveLength(1);
  const sent = JSON.stringify(cloud[0]?.body.messages);
  expect(sent).not.toContain('balance');
  expect(sent).toContain('What do tomatoes need?');
});

test('Local-only mode switched on while the consent dialog is open stops the send', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_API, () => 'cloud answer');
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize' }).click();
  const consent = panel.getByRole('dialog', { name: /Send to Mock Cloud/ });
  await expect(consent).toBeVisible();

  // Meanwhile, in Settings, the user turns on Local-only mode.
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      onboardingComplete: true,
      localOnly: true,
    },
  });
  await consent.getByRole('button', { name: 'Send this time' }).click();
  await expect(panel.getByText(/Cloud providers are now off for this page/)).toBeVisible();
  expect(requests).toHaveLength(0);
});

test('the cloud sees placeholders; the answer shows the real address, but never in a link', async ({
  context,
  extensionId,
}) => {
  await context.route('https://seeds.test/**', (route) =>
    route.fulfill({
      body: `<!doctype html><html lang="en"><head><title>Seed swap</title></head><body><main><article>
        <h1>Seed swap</h1><p>Write to jane@seeds.test for tomato seeds. ${'Seeds keep for years if they stay dry and cool. '.repeat(20)}</p>
      </article></main></body></html>`,
      contentType: 'text/html; charset=utf-8',
    }),
  );
  const cloud = await mockChatApi(context, MOCK_API, () =>
    cloud.length === 1
      ? 'Write to [Email 1]. Details: https://evil.test/?e=[email 1]'
      : 'You can write to [email 1].',
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
    cloudConsent: { always: ['ep:mock'], sites: {} },
  });
  const tab = await context.newPage();
  await tab.goto('https://seeds.test/swap');
  const panel = await openPanel(context, extensionId, tab);
  const ask = async (question: string) => {
    await panel.getByRole('textbox', { name: 'Ask about this page' }).fill(question);
    await panel.keyboard.press('Enter');
  };

  await ask('Who has seeds?');
  await expect(panel.getByText('Write to jane@seeds.test.')).toBeVisible();
  const first = JSON.stringify(cloud[0]?.body.messages);
  expect(first).not.toContain('jane@seeds.test');
  expect(first).toContain('[email 1]');
  expect(first).toContain('Write each placeholder exactly as it is');
  // The link keeps the placeholder: opening it must not send the address to that site.
  const links = await panel
    .locator('.answer a')
    .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  expect(links.filter((href) => href.includes('evil.test'))).not.toHaveLength(0);
  expect(links.some((href) => href.includes('evil.test') && href.includes('jane'))).toBe(false);

  // A follow-up takes the earlier answer along, with the address hidden again.
  await ask('How do I reach them?');
  await expect(panel.getByText('You can write to jane@seeds.test.')).toBeVisible();
  expect(JSON.stringify(cloud[1]?.body.messages)).not.toContain('jane@seeds.test');
});
