import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chromium,
  test as base,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';

// The `chrome` API inside page.evaluate() callbacks, which run in extension pages.
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
  tabs: { query(query: { url: string }): Promise<{ id?: number }[]> };
};

const EXTENSION_PATH = join(import.meta.dirname, '../../local/build/chrome-mv3-e2e');
export const ARTICLE_URL = 'https://article.test/posts/webgpu';
export const MOCK_API = 'https://llm.test/v1';
export const MOCK_LOCAL_API = 'http://127.0.0.1:47311/v1';

/** More pages on the test site, by path. Everything else serves the WebGPU article. */
const EXTRA_PAGES: Record<string, string> = {
  '/posts/vulkan': `<!doctype html><html lang="en"><head><title>Vulkan in practice</title></head><body><main><article>
    <h1>Vulkan in practice</h1>
    <p>${'Vulkan is a low-level graphics API for native apps. It gives engines explicit control over memory and synchronization. '.repeat(12)}</p>
    <p>${'Unlike WebGPU, Vulkan is not available to web pages and needs careful validation layers during development. '.repeat(10)}</p>
  </article></main></body></html>`,
  '/compose': `<!doctype html><html lang="en"><head><title>Compose</title></head><body>
    <h1>New message</h1><textarea id="message" rows="4" cols="60">Hi team, their going to the meeting tomorow.</textarea>
  </body></html>`,
};

export interface MockRequest {
  url: string;
  body: { model: string; messages: { role: string; content: string }[] };
}

/** An OpenAI-compatible API served from Playwright routes; records what it was sent. */
export async function mockChatApi(
  context: BrowserContext,
  baseUrl: string,
  answer: (request: MockRequest) => string,
): Promise<MockRequest[]> {
  const requests: MockRequest[] = [];
  await context.route(`${baseUrl}/**`, async (route: Route) => {
    const request = route.request();
    if (request.url().endsWith('/models')) {
      await route.fulfill({ json: { data: [{ id: 'mock-model' }] } });
      return;
    }
    const body = request.postDataJSON() as MockRequest['body'];
    const entry = { url: request.url(), body };
    requests.push(entry);
    const text = answer(entry);
    const words = text.split(/(?<= )/);
    const events = words
      .map((word) => `data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: `${events}data: [DONE]\n\n`,
    });
  });
  return requests;
}

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
  article: Page;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      // Stable screenshots: dialogs skip their fade-in with reduced motion.
      reducedMotion: 'reduce',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    const html = readFileSync(join(import.meta.dirname, '../fixtures/pages/article.html'), 'utf8');
    await context.route('https://article.test/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        body: EXTRA_PAGES[path] ?? html,
        contentType: 'text/html; charset=utf-8',
      });
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
  article: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto(ARTICLE_URL);
    await use(page);
  },
});

export const expect = test.expect;

/** Writes extension storage from an extension page (WXT's "local:x" keys are stored as "x"). */
export async function seedStorage(
  context: BrowserContext,
  extensionId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(async (items) => {
    await chrome.storage.local.set(items);
  }, values);
  await page.close();
}

/** Opens the side panel page as a tab that reads the given tab. */
export async function openPanel(
  context: BrowserContext,
  extensionId: string,
  target: Page,
): Promise<Page> {
  const probe = await context.newPage();
  await probe.goto(`chrome-extension://${extensionId}/options.html`);
  const tabId = await probe.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return tab?.id;
  }, target.url());
  await probe.close();
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 820 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  return panel;
}

export function endpoint(id: string, baseUrl: string, label: string) {
  return { id, presetId: 'custom', label, baseUrl, model: 'mock-model', contextTokens: 8000 };
}
