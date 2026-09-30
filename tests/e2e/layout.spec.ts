import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
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

// Chrome's side panel can be made this narrow; nothing may stick out or get cut off.
const NARROW = { width: 320, height: 720 };
const SCREENS = join(import.meta.dirname, '../../local/test-results/screens');
mkdirSync(SCREENS, { recursive: true });
const LONG_HOST = 'docs.a-rather-long-subdomain-name.example-company.test';

const longAnswer = [
  'The article says "Compute shaders let a page run massively parallel work on the GPU".',
  '',
  '| Browser | Status | Notes |',
  '| --- | --- | --- |',
  '| Chrome | Shipped | Available since version 113 on most desktop platforms |',
  '| Firefox | Partial | Behind a preference on some platforms |',
  '',
  '```js',
  'const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });',
  '```',
  '',
  'A very long word: Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft.',
].join('\n');

/** Elements that stick out of the panel, or scroll boxes that cut off their content sideways. */
function findOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const describe = (element: Element) =>
      `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim().slice(0, 60)}"`;
    const root = document.documentElement;
    const problems: string[] = [];
    if (root.scrollWidth > root.clientWidth)
      problems.push(`the page is ${root.scrollWidth}px wide`);
    for (const element of document.querySelectorAll('body *')) {
      // Code blocks and tables scroll sideways on purpose; fields scroll their own text.
      if (element.closest('pre, table, input, textarea, .sr-only')) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || style.textOverflow === 'ellipsis') continue;
      if (rect.left < -1 || rect.right > root.clientWidth + 1) {
        problems.push(`${describe(element)} sticks out of the panel`);
      } else if (style.overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1) {
        problems.push(`${describe(element)} cuts off its content`);
      }
    }
    return problems;
  });
}

async function openNarrowPanel(...args: Parameters<typeof openPanel>): Promise<Page> {
  const panel = await openPanel(...args);
  await panel.setViewportSize(NARROW);
  return panel;
}

test('the panel fits a narrow side panel', async ({ context, extensionId, article }) => {
  await mockChatApi(context, MOCK_LOCAL_API, () => longAnswer);
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'A local model with a long name')],
      onboardingComplete: true,
    },
  });
  const panel = await openNarrowPanel(context, extensionId, article);
  await expect(panel.getByRole('heading', { name: /How WebGPU changes graphics/ })).toBeVisible();
  expect(await findOverflow(panel)).toEqual([]);

  await panel.getByRole('button', { name: 'Preview' }).click();
  await expect(panel.getByRole('dialog', { name: 'What the AI will read' })).toBeVisible();
  expect(await findOverflow(panel)).toEqual([]);
  await panel.keyboard.press('Escape');

  await panel.getByRole('textbox', { name: 'Ask about this page' }).fill('What can it do?');
  await panel.keyboard.press('Enter');
  await expect(panel.getByText(/quote checked against the page/)).toBeVisible();
  await panel.getByRole('button', { name: 'Continue in…' }).click();
  await expect(panel.getByText('Ask in a chat app you already use')).toBeVisible();
  expect(await findOverflow(panel)).toEqual([]);
  await panel.screenshot({ path: join(SCREENS, 'narrow-handoff.png') });
});

test('the setup card fits a narrow side panel', async ({ context, extensionId, article }) => {
  const panel = await openNarrowPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Choose where answers come from' }),
  ).toBeVisible();
  expect(await findOverflow(panel)).toEqual([]);
});

test('the consent dialog fits a narrow side panel', async ({ context, extensionId }) => {
  const html = readFileSync(join(import.meta.dirname, '../fixtures/pages/article.html'), 'utf8');
  await context.route(`https://${LONG_HOST}/**`, (route) =>
    route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }),
  );
  await mockChatApi(context, MOCK_API, () => 'unused');
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:mock', MOCK_API, 'A cloud provider with a long name')],
      onboardingComplete: true,
    },
    apiKeys: { 'ep:mock': 'test-key' },
  });
  const page = await context.newPage();
  await page.goto(`https://${LONG_HOST}/guides/webgpu`);
  const panel = await openNarrowPanel(context, extensionId, page);
  await panel.getByRole('button', { name: 'Summarize' }).click();
  const consent = panel.getByRole('dialog', { name: /Send to/ });
  await expect(
    consent.getByRole('button', { name: `Always send pages from ${LONG_HOST}` }),
  ).toBeVisible();
  expect(await findOverflow(panel)).toEqual([]);
  await panel.screenshot({ path: join(SCREENS, 'narrow-consent.png') });
});

test('Arabic or Hebrew answers put bullets and quote bars on the right', async ({
  context,
  extensionId,
  article,
}) => {
  await mockChatApi(context, MOCK_LOCAL_API, () =>
    [
      '- مرحبا بالعالم، هذه قائمة',
      '- Hello world, this is a list',
      '',
      '> هذا اقتباس من الصفحة',
    ].join('\n'),
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      onboardingComplete: true,
    },
  });
  const panel = await openNarrowPanel(context, extensionId, article);
  await panel.getByRole('textbox', { name: 'Ask about this page' }).fill('Say hello');
  await panel.keyboard.press('Enter');
  await expect(panel.getByText('Hello world, this is a list')).toBeVisible();
  const sides = await panel.locator('.answer li, .answer blockquote').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return element.tagName === 'LI'
        ? { left: parseFloat(style.marginLeft) > 0, right: parseFloat(style.marginRight) > 0 }
        : {
            left: parseFloat(style.borderLeftWidth) > 0,
            right: parseFloat(style.borderRightWidth) > 0,
          };
    }),
  );
  expect(sides).toEqual([
    { left: false, right: true },
    { left: true, right: false },
    { left: false, right: true },
  ]);
  expect(await findOverflow(panel)).toEqual([]);
});
