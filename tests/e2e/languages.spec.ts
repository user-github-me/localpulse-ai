import type { BrowserContext, Page } from '@playwright/test';
import {
  endpoint,
  expect,
  MOCK_LOCAL_API,
  mockChatApi,
  openPanel,
  seedStorage,
  test,
} from './extension';

// Like a webmail page: it says it's English, but the email is in Chinese.
const EMAIL_URL = 'https://mail.test/inbox/42';
const EMAIL_HTML = `<!doctype html><html lang="en"><head><title>AirTCP重置密码 - Inbox</title></head>
<body><main><article>
  <h1>AirTCP重置密码</h1>
  <p id="first">您收到此邮件是因为您在AirTCP申请了密码重置,如果不是您申请的,请忽略此邮件.</p>
  <p>若要开始重置密码,请点击以下链接 :)</p>
</article></main></body></html>`;
const TRANSLATION =
  'You received this email because you requested a password reset on AirTCP. If you did not request it, please ignore this email.';

async function openEmail(context: BrowserContext): Promise<Page> {
  await context.route('https://mail.test/**', (route) =>
    route.fulfill({ body: EMAIL_HTML, contentType: 'text/html; charset=utf-8' }),
  );
  const page = await context.newPage();
  await page.goto(EMAIL_URL);
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('first') as HTMLElement);
    document.getSelection()?.addRange(range);
  });
  return page;
}

test('translating a selection shows the translation, even when the model repeats the <page> wrapper', async ({
  context,
  extensionId,
}) => {
  // What Gemini Nano did: it copied LocalPulse's wrapper around its translation.
  await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () =>
      `<page title="AirTCP重置密码 - Inbox" url="${EMAIL_URL}" content="text the user selected">\n${TRANSLATION}\n</page>`,
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      // The test browser has Chrome's translator but not its language packs; use the mock model.
      providerOrder: ['ep:local'],
      onboardingComplete: true,
    },
  });
  const email = await openEmail(context);
  const panel = await openPanel(context, extensionId, email);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  await panel.getByRole('button', { name: 'Translate' }).click();

  await expect(panel.getByText(TRANSLATION)).toBeVisible();
  await expect(panel.getByText('Answered on this device by Local Mock')).toBeVisible();
  await expect(panel.getByText(/not on the page/)).toHaveCount(0);
  await expect(panel.getByText('text the user selected')).toHaveCount(0);
});

test('an English summary of a Chinese email does not flag its translated quotes', async ({
  context,
  extensionId,
}) => {
  await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () =>
      'The email confirms a password reset. It says "You received this email because you requested a password reset on AirTCP" and "If you did not request this reset, please ignore this email".',
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      onboardingComplete: true,
    },
  });
  const email = await openEmail(context);
  const panel = await openPanel(context, extensionId, email);
  // A long Chinese sentence is many words, not one.
  await expect(panel.getByText(/Your selection, \d{2,} words/)).toBeVisible();
  await panel.getByRole('button', { name: 'Summarize' }).click();

  await expect(panel.getByText(/The email confirms a password reset/)).toBeVisible();
  await expect(panel.getByText(/not on the page/)).toHaveCount(0);
});
