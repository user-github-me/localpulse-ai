/* global chrome, document */
// Captures the real LocalPulse side panel and settings page for the store screenshots and the
// README, with AI providers answered by Playwright routes (nothing leaves this computer).
// Run after `corepack pnpm build:e2e`: node scripts/capture-store.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(import.meta.dirname, '..');
const extensionPath = join(root, 'local/build/chrome-mv3-e2e');
const raw = join(root, 'local/web-store-content/raw');
mkdirSync(raw, { recursive: true });

const ARTICLE_URL = 'https://blog.example.com/posts/webgpu';
const COMPOSE_URL = 'https://mail.example.com/compose';
const OLLAMA = 'http://localhost:11434/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';
// Sizes of the areas in the slides' browser frame (slides.html), so nothing is scaled.
const PANEL = { width: 400, height: 708 };
const PAGE = { width: 340, height: 708 };
const SETTINGS = { width: 740, height: 708 };

// Example response for deterministic screenshots, served locally by a fixture route.
const REAL_SUMMARY = `WebGPU: A New Standard for Graphics

WebGPU is a new web standard that provides direct, modern access to the graphics card. It replaces WebGL with an API designed around how modern GPUs work. This means better multithreading, lower overhead, and general-purpose compute shaders that run next to rendering.

Why Compute Shaders Matter

Compute shaders let a page run massively parallel work on the GPU without drawing anything. This is useful for machine learning inference, physics simulations, image processing, and video effects. The smallest useful setup involves requesting an adapter and a device, which can be done together.`;

const QUOTES_ANSWER = `Heavy parallel work without drawing anything. The main example is AI: "libraries can now run language models in the browser at useful speeds". The article also names "Physics simulations, image processing and video effects", and says WebGPU "was designed by a single company in 2009".`;

const DRAFT = `Hi team,

we're meeting tomorow at 10 in the big room. Please bring you're laptops so we can go threw the new design together.

Thanks,
Sam`;

const PROOFREAD = `Hi team,

We're meeting tomorrow at 10 in the big room. Please bring your laptops so we can go through the new design together.

Thanks,
Sam`;

const ARTICLE_STYLE = `<style>
  body { margin: 0; background: #fff; color: #1f2522; font: 17px/1.62 Charter, Georgia, serif; }
  header { display: flex; align-items: center; padding: 14px 28px; border-bottom: 1px solid #e7eae8;
    font: 500 13px/1 -apple-system, system-ui, sans-serif; white-space: nowrap; }
  header::before { content: 'Example Blog'; font-weight: 700; font-size: 15px; margin-right: auto; }
  header nav { display: flex; gap: 16px; }
  header a { color: #4d5753; text-decoration: none; }
  header a:last-child { display: none; }
  main { padding: 26px 28px 40px; }
  h1 { font-size: 29px; line-height: 1.15; margin: 0 0 10px; letter-spacing: -0.01em; }
  .byline { margin: 0 0 22px; color: #6a736f; font: 13px -apple-system, system-ui, sans-serif; }
  h2 { font-size: 20px; margin: 30px 0 8px; }
  a { color: inherit; }
  pre { background: #f3f5f4; padding: 12px 14px; border-radius: 8px; font-size: 12.5px; overflow: hidden; }
  table { border-collapse: collapse; font: 14px -apple-system, system-ui, sans-serif; }
  th, td { border-bottom: 1px solid #e7eae8; padding: 6px 18px 6px 0; text-align: left; }
  img { display: none; }
</style>`;

const COMPOSE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>New message</title><style>
  body { margin: 0; background: #f2f4f3; color: #1f2522; font: 15px/1.5 -apple-system, system-ui, sans-serif; }
  .bar { background: #fff; border-bottom: 1px solid #e3e7e5; padding: 14px 22px; font-weight: 700; }
  .card { margin: 20px; background: #fff; border: 1px solid #e3e7e5; border-radius: 12px; overflow: hidden; }
  .row { padding: 11px 18px; border-bottom: 1px solid #eef1ef; color: #69726e; }
  .row b { color: #1f2522; font-weight: 500; margin-left: 8px; }
  textarea { display: block; box-sizing: border-box; width: 100%; height: 330px; border: 0; resize: none;
    padding: 16px 18px; font: 15px/1.6 -apple-system, system-ui, sans-serif; color: #1f2522; outline: none; }
  .send { display: inline-block; margin: 0 18px 18px; padding: 8px 20px; border-radius: 8px;
    background: #2f5bd3; color: #fff; font-weight: 600; }
</style></head><body>
  <div class="bar">Mail</div>
  <div class="card">
    <div class="row">To<b>team@example.com</b></div>
    <div class="row">Subject<b>Tomorrow's meeting</b></div>
    <textarea id="message">${DRAFT}</textarea>
    <span class="send">Send</span>
  </div>
</body></html>`;

const article = readFileSync(join(root, 'tests/fixtures/pages/article.html'), 'utf8')
  .replace('By Ada Lovelace', 'By Sam Rivera · 6 min read')
  .replace('</head>', `${ARTICLE_STYLE}</head>`);

const ollama = {
  id: 'ep:ollama',
  presetId: 'ollama',
  label: 'Ollama',
  baseUrl: OLLAMA,
  model: 'llama3.2:1b',
  contextTokens: 8000,
};
const gemini = {
  id: 'ep:gemini',
  presetId: 'gemini',
  label: 'Google Gemini',
  baseUrl: GEMINI,
  model: 'gemini-flash-lite-latest',
  contextTokens: 25000,
};

/** An OpenAI-compatible API answered by a route, streamed word by word like a real server. */
async function mockApi(context, baseUrl, models, answer) {
  await context.route(`${baseUrl}/**`, async (route) => {
    const request = route.request();
    if (request.url().endsWith('/models')) {
      await route.fulfill({ json: { data: models.map((id) => ({ id })) } });
      return;
    }
    const body = request.postDataJSON();
    const text = answer(body.messages.at(-1)?.content ?? '');
    const events = text
      .split(/(?<= )/)
      .map((word) => `data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: `${events}data: [DONE]\n\n`,
    });
  });
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
  colorScheme: 'light',
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
// Anything not answered below must not reach the network.
await context.route(
  /^https?:\/\/(?!blog\.example\.com|mail\.example\.com|localhost:11434|generativelanguage\.googleapis\.com)/,
  (route) => {
    const url = route.request().url();
    return url.startsWith('chrome-extension://') ? route.continue() : route.abort();
  },
);
await context.route('https://blog.example.com/**', (route) =>
  route.fulfill({ body: article, contentType: 'text/html; charset=utf-8' }),
);
await context.route('https://mail.example.com/**', (route) =>
  route.fulfill({ body: COMPOSE_HTML, contentType: 'text/html; charset=utf-8' }),
);
await mockApi(context, OLLAMA, ['llama3.2:1b', 'qwen3:4b'], (prompt) => {
  if (prompt.includes('What can compute shaders do?')) return QUOTES_ANSWER;
  if (prompt.includes('Fix spelling, grammar')) return PROOFREAD;
  return REAL_SUMMARY;
});
await mockApi(context, GEMINI, ['gemini-flash-lite-latest', 'gemini-flash-latest'], () => 'unused');

const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;
for (const page of context.pages()) await page.close();

async function seed(values) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(async (items) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(items);
  }, values);
  await page.close();
}

async function openPanel(target) {
  const probe = await context.newPage();
  await probe.goto(`chrome-extension://${extensionId}/options.html`);
  const tabId = await probe.evaluate(
    async (url) => (await chrome.tabs.query({ url }))[0]?.id,
    target.url(),
  );
  await probe.close();
  const panel = await context.newPage();
  await panel.setViewportSize(PANEL);
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  return panel;
}

async function scrollConversation(panel, where) {
  await panel.evaluate((to) => {
    const box = document.querySelector('[aria-label="Conversation"]');
    if (box) box.scrollTop = to === 'top' ? 0 : box.scrollHeight;
  }, where);
  await panel.waitForTimeout(150);
}

const shot = (page, name) => page.screenshot({ path: join(raw, `${name}.png`) });

// 1. A summary written on this device.
await seed({
  settings: { endpoints: [ollama, gemini], onboardingComplete: true },
  apiKeys: { 'ep:gemini': 'demo-key' },
});
const page = await context.newPage();
await page.setViewportSize(PAGE);
await page.goto(ARTICLE_URL);
await shot(page, 'page-article');
let panel = await openPanel(page);
await panel.getByRole('heading', { name: /How WebGPU changes graphics/ }).waitFor();
await panel.getByRole('button', { name: 'Summarize' }).click();
await panel.getByText('Answered on this device by Ollama').waitFor();
await scrollConversation(panel, 'top');
await shot(panel, 'panel-summary');
await panel.close();

// 2. A question, with its quotes checked against the page.
panel = await openPanel(page);
await panel.getByRole('heading', { name: /How WebGPU changes graphics/ }).waitFor();
await panel
  .getByRole('textbox', { name: 'Ask about this page' })
  .fill('What can compute shaders do?');
await panel.keyboard.press('Enter');
await panel.getByRole('button', { name: /quotes? (is|are) not on the page/ }).click();
await panel.getByText('Not found on the page').waitFor();
await scrollConversation(panel, 'bottom');
await shot(panel, 'panel-quotes');
await panel.close();

// 3. Asked before a page goes to the cloud.
await seed({
  settings: { endpoints: [gemini], onboardingComplete: true },
  apiKeys: { 'ep:gemini': 'demo-key' },
});
panel = await openPanel(page);
await panel.getByRole('heading', { name: /How WebGPU changes graphics/ }).waitFor();
await panel.getByRole('button', { name: 'Summarize' }).click();
await panel.getByRole('dialog', { name: /Send to Google Gemini/ }).waitFor();
await panel.waitForTimeout(200);
await shot(panel, 'panel-consent');
await panel.close();

// 4. Proofreading text in a form, ready to put back.
await seed({
  settings: {
    endpoints: [ollama, gemini],
    onboardingComplete: true,
  },
  apiKeys: { 'ep:gemini': 'demo-key' },
});
const compose = await context.newPage();
await compose.setViewportSize(PAGE);
await compose.goto(COMPOSE_URL);
const selectDraft = () =>
  compose.evaluate(() => {
    const field = document.getElementById('message');
    field.focus();
    field.setSelectionRange(0, field.value.length);
  });
await selectDraft();
panel = await openPanel(compose);
await panel.getByText(/Your selection/).waitFor();
await panel.getByRole('button', { name: 'Proofread' }).click();
await panel.getByRole('button', { name: 'Replace selection' }).waitFor();
// The slide is about putting the text back: show the Replace button.
await scrollConversation(panel, 'bottom');
await shot(panel, 'panel-proofread');
await compose.bringToFront();
await selectDraft();
await shot(compose, 'page-compose');
await panel.close();

// 5. The privacy settings, with two sites that never go to the cloud.
await seed({
  settings: {
    endpoints: [ollama, gemini],
    onboardingComplete: true,
    neverCloudSites: ['bank.example', 'intranet.example'],
  },
  apiKeys: { 'ep:gemini': 'demo-key' },
});
const options = await context.newPage();
await options.setViewportSize(SETTINGS);
await options.goto(`chrome-extension://${extensionId}/options.html`);
await options.getByRole('heading', { name: 'Where answers come from' }).waitFor();
await options.evaluate(() => document.getElementById('privacy')?.scrollIntoView());
await options.waitForTimeout(600);
await shot(options, 'options-privacy');

await context.close();
console.log(`Saved to ${raw}`);
