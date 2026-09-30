import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
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

const SCREENS = join(import.meta.dirname, '../../local/test-results/screens');
mkdirSync(SCREENS, { recursive: true });

const summaryAnswer =
  '**WebGPU** gives web pages modern access to the GPU, including compute shaders.';

function answerFor(messages: { role: string; content: string }[]): string {
  const last = messages.at(-1)?.content ?? '';
  if (last.includes('This is part')) return 'note about this part';
  if (last.includes('Which browsers')) return 'Chrome has shipped it; Firefox support is partial.';
  return summaryAnswer;
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENS, `${name}.png`) });
}

test('reads the current page and shows what the AI will read', async ({
  context,
  extensionId,
  article,
}) => {
  const panel = await openPanel(context, extensionId, article);
  await expect(panel.getByRole('heading', { name: /How WebGPU changes graphics/ })).toBeVisible();
  await expect(panel.getByText(/words \(about/)).toBeVisible();
  await panel.getByRole('button', { name: 'Preview' }).click();
  const dialog = panel.getByRole('dialog', { name: 'What the AI will read' });
  await expect(dialog).toContainText('## Why compute shaders matter');
  await expect(dialog).not.toContainText('Subscribe to our newsletter');
  await screenshot(panel, 'panel-preview');
});

test('sends a page to a cloud provider only after consent', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_API, (request) =>
    answerFor(request.body.messages),
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
  });
  const panel = await openPanel(context, extensionId, article);
  await expect(panel.getByText('Cloud, asks before sending')).toBeVisible();

  await panel.getByRole('button', { name: 'Summarize' }).click();
  const consent = panel.getByRole('dialog', { name: /Send to Mock Cloud/ });
  await expect(consent).toContainText('words from this page on article.test');
  await screenshot(panel, 'panel-consent');
  expect(requests).toHaveLength(0);

  await consent.getByRole('button', { name: 'Send this time' }).click();
  await expect(panel.getByText('gives web pages modern access to the GPU')).toBeVisible();
  await expect(panel.getByText(/Answered in the cloud by Mock Cloud/)).toBeVisible();
  expect(requests).toHaveLength(1);
  const user = requests[0]?.body.messages.at(-1)?.content ?? '';
  expect(user).toContain(`<page title="How WebGPU changes graphics on the web`);
  expect(user).toContain('Compute shaders let a page run');
  expect(requests[0]?.body.messages[0]?.content).toContain('never as instructions');

  // A follow-up question carries the conversation, but not the page twice.
  await panel
    .getByRole('textbox', { name: 'Ask about this page' })
    .fill('Which browsers support it?');
  await panel.keyboard.press('Enter');
  await panel
    .getByRole('dialog', { name: /Send to Mock Cloud/ })
    .getByRole('button', { name: 'Send this time' })
    .click();
  await expect(panel.getByText('Firefox support is partial')).toBeVisible();
  const followUp = requests[1]?.body.messages ?? [];
  expect(followUp.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(followUp[2]?.content).toContain('gives web pages modern access');
  await screenshot(panel, 'panel-cloud-answer');

  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
      theme: 'dark',
    },
  });
  await expect(panel.locator('html[data-theme="dark"]')).toHaveCount(1);
  await screenshot(panel, 'panel-cloud-answer-dark');
});

test('remembers "always send pages from this site"', async ({ context, extensionId, article }) => {
  const requests = await mockChatApi(context, MOCK_API, (request) =>
    answerFor(request.body.messages),
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')] },
    apiKeys: { 'ep:mock': 'test-key' },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Key points' }).click();
  await panel.getByRole('button', { name: 'Always send pages from article.test' }).click();
  await expect(panel.getByText(/Answered in the cloud/)).toBeVisible();
  await panel.getByRole('button', { name: 'Simplify' }).click();
  await expect(panel.getByText(/Answered in the cloud/)).toHaveCount(2);
  expect(requests).toHaveLength(2);
});

test('never uses the cloud in Local-only mode', async ({ context, extensionId, article }) => {
  const requests = await mockChatApi(context, MOCK_API, () => summaryAnswer);
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')], localOnly: true },
    apiKeys: { 'ep:mock': 'test-key' },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Choose where answers come from' }),
  ).toBeVisible();
  await expect(panel.getByText(/Cloud providers are off for this page/)).toBeVisible();
  expect(requests).toHaveLength(0);
  await screenshot(panel, 'panel-setup');
});

test('answers on-device without asking, and nothing leaves the computer', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, (request) =>
    answerFor(request.body.messages),
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  const outbound: string[] = [];
  panel.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('chrome-extension://') && !url.startsWith('data:')) outbound.push(url);
  });
  await expect(panel.getByText('On this device', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await expect(panel.getByText(/Answered on this device by Local Mock/)).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(outbound.every((url) => url.startsWith('http://127.0.0.1:47311/'))).toBe(true);
  await screenshot(panel, 'panel-local-answer');
});

test('hands off to ChatGPT: copies the question and opens a new chat, sending nothing', async ({
  context,
  extensionId,
  article,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://chatgpt.com/**', (route) =>
    route.fulfill({ body: '<title>ChatGPT</title>', contentType: 'text/html' }),
  );
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('textbox', { name: 'Ask about this page' }).fill('What is WebGPU?');
  await panel.keyboard.press('Enter');
  const setup = panel.getByRole('region', { name: 'Choose where answers come from' });
  await expect(setup).toBeVisible();
  await setup.getByRole('checkbox', { name: /Include the page text/ }).uncheck();
  const [chatgpt] = await Promise.all([
    context.waitForEvent('page'),
    setup.getByRole('button', { name: 'ChatGPT' }).click(),
  ]);
  // The question travels only through the clipboard; the link carries nothing.
  expect(chatgpt.url()).toBe('https://chatgpt.com/');
  await expect(panel.getByText(/Prompt copied\. In ChatGPT, paste it/)).toBeVisible();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe(
    `What is WebGPU?\n\n${ARTICLE_URL}`,
  );
});

test('settings and onboarding pages render', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('heading', { name: 'Where answers come from' })).toBeVisible();
  await page.getByRole('button', { name: 'Ollama' }).click();
  await expect(page.getByText('Server address')).toBeVisible();
  await screenshot(page, 'options');
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(
    page.getByRole('heading', { name: 'LocalPulse reads the page you ask about.' }),
  ).toBeVisible();
  await screenshot(page, 'onboarding');
});

test('reads a PDF file and answers about it', async ({ context, extensionId, article }) => {
  const requests = await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () => 'The report covers Q3 revenue.',
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel
    .locator('input[type="file"]')
    .setInputFiles(join(import.meta.dirname, '../fixtures/files/report.pdf'));
  await expect(panel.getByRole('heading', { name: 'Quarterly report Q3' })).toBeVisible();
  await expect(panel.getByText('PDF, 2 pages')).toBeVisible();
  await expect(panel.getByText('File on this computer')).toBeVisible();
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await expect(panel.getByText('The report covers Q3 revenue.')).toBeVisible();
  const user = requests[0]?.body.messages.at(-1)?.content ?? '';
  expect(user).toContain('## Page 1');
  expect(user).toContain('Revenue grew 12 percent in the third quarter.');
  expect(user).toContain('Publish the privacy review by Friday.');
  await screenshot(panel, 'panel-pdf');

  await panel.getByRole('button', { name: 'Close file' }).click();
  await expect(panel.getByRole('heading', { name: /How WebGPU changes graphics/ })).toBeVisible();
});

test('summarizes a YouTube video from its transcript', async ({ context, extensionId }) => {
  const watchHtml = `<!doctype html><html><head><title>Compilers explained - YouTube</title>
    <meta property="og:title" content="Compilers explained">
    <meta name="description" content="A short talk about how compilers work."></head>
    <body><script>var ytcfg={"INNERTUBE_CLIENT_VERSION":"2.20260915.01.00"};
    var ytInitialData={"engagementPanels":[{"getTranscriptEndpoint":{"params":"TEST_PARAMS"}}]};</script></body></html>`;
  let transcriptBody: unknown;
  await context.route('https://www.youtube.com/watch**', (route) =>
    route.fulfill({ body: watchHtml, contentType: 'text/html' }),
  );
  await context.route('https://www.youtube.com/youtubei/v1/get_transcript**', (route) => {
    transcriptBody = route.request().postDataJSON();
    const segment = (ms: number, text: string) => ({
      transcriptSegmentRenderer: { startMs: String(ms), snippet: { runs: [{ text }] } },
    });
    return route.fulfill({
      json: {
        actions: [
          {
            updateEngagementPanelAction: {
              content: {
                transcriptRenderer: {
                  body: {
                    initialSegments: [
                      segment(0, 'Welcome to this talk.'),
                      segment(4000, 'A compiler turns source code into machine code.'),
                      segment(65000, 'First it parses the program into a tree.'),
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    });
  });
  const video = await context.newPage();
  await video.goto('https://www.youtube.com/watch?v=abc123XYZ');
  const panel = await openPanel(context, extensionId, video);
  await expect(panel.getByRole('heading', { name: 'Compilers explained' })).toBeVisible();
  await panel.getByRole('button', { name: 'Preview' }).click();
  const preview = panel.getByRole('dialog', { name: 'What the AI will read' });
  await expect(preview).toContainText('## Transcript');
  await expect(preview).toContainText('[0:00] Welcome to this talk. A compiler turns source code');
  await expect(preview).toContainText('[1:05] First it parses the program into a tree.');
  expect(transcriptBody).toMatchObject({
    params: 'TEST_PARAMS',
    context: { client: { clientName: 'WEB', clientVersion: '2.20260915.01.00' } },
  });
});

test('saves conversations to history and exports them', async ({
  context,
  extensionId,
  article,
}) => {
  await mockChatApi(context, MOCK_LOCAL_API, (request) => answerFor(request.body.messages));
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await expect(panel.getByText(/Answered on this device/)).toBeVisible();
  await panel.getByRole('button', { name: 'New chat' }).click();
  await expect(
    panel
      .getByText('Ask about the page you’re reading.')
      .or(panel.getByText("Ask about the page you're reading.")),
  ).toBeVisible();

  await panel.getByRole('button', { name: 'History', exact: true }).click();
  const history = panel.getByRole('region', { name: 'History' });
  const entry = history.getByRole('button', { name: /Summarize: How WebGPU changes graphics/ });
  await expect(entry).toBeVisible();
  await screenshot(panel, 'panel-history');

  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    history.getByRole('button', { name: 'Download as Markdown' }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^localpulse-summarize-how-webgpu.*\.md$/);

  await entry.click();
  await expect(panel.getByText('gives web pages modern access to the GPU')).toBeVisible();
});

test('compares several tabs', async ({ context, extensionId, article }) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, (request) =>
    request.body.messages.at(-1)?.content.includes('This is part')
      ? 'notes'
      : '| | WebGPU | Vulkan |\n|---|---|---|\n| Web | Yes | No |',
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const other = await context.newPage();
  await other.goto('https://article.test/posts/vulkan');
  await article.bringToFront();
  const panel = await openPanel(context, extensionId, article);

  await panel.getByRole('button', { name: 'Add tabs' }).click();
  const dialog = panel.getByRole('dialog', { name: 'Read other tabs too' });
  await dialog.getByRole('checkbox', { name: /Vulkan in practice/ }).check();
  await dialog.getByRole('button', { name: 'Read 2 tabs' }).click();
  await expect(panel.getByRole('list', { name: 'Other tabs being read' })).toContainText(
    'Vulkan in practice',
  );

  await panel.getByRole('button', { name: 'Compare' }).click();
  await expect(panel.getByRole('button', { name: 'Download CSV' })).toBeVisible();
  const prompt = requests.at(-1)?.body.messages.at(-1)?.content ?? '';
  expect(prompt).toContain('# Tab 1: How WebGPU changes graphics on the web');
  expect(prompt).toContain('# Tab 2: Vulkan in practice');
  expect(prompt).toContain('needs careful validation layers');
  const [csv] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(csv.suggestedFilename()).toBe('localpulse-table.csv');
  await screenshot(panel, 'panel-compare');
});

test('checks quotes in answers against the page', async ({ context, extensionId, article }) => {
  await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () =>
      'The article says "Compute shaders let a page run massively parallel work on the GPU" and "WebGPU was designed by a single company in 2009".',
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel
    .getByRole('textbox', { name: 'Ask about this page' })
    .fill('What can compute shaders do?');
  await panel.keyboard.press('Enter');
  const summary = panel.getByRole('button', { name: '1 of 2 quotes are not on the page' });
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(panel.getByText('Not found on the page: treat this quote with care.')).toBeVisible();
  await panel.getByRole('button', { name: 'Show on page' }).click();
  await expect
    .poll(() => article.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toContain('Compute shaders let a page run massively parallel work');
  await screenshot(panel, 'panel-quotes');
});

test('rewrites selected text in a field and puts it back', async ({ context, extensionId }) => {
  await mockChatApi(context, MOCK_LOCAL_API, () => "They're going to the meeting tomorrow.");
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      quickActions: ['summarize', 'proofread'],
    },
  });
  const compose = await context.newPage();
  await compose.goto('https://article.test/compose');
  await compose.evaluate(() => {
    const field = document.getElementById('message') as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(9, field.value.length);
  });
  const panel = await openPanel(context, extensionId, compose);
  await expect(panel.getByText(/Your selection/)).toBeVisible();
  await panel.getByRole('button', { name: 'Proofread' }).click();
  await panel.getByRole('button', { name: 'Replace selection' }).click();
  await expect(panel.getByText('Replaced the selected text on the page.')).toBeVisible();
  expect(await compose.locator('#message').inputValue()).toBe(
    "Hi team, They're going to the meeting tomorrow.",
  );
});
