import { expect, openPanel, test } from './extension';

// Downloads a real in-browser model (about 0.7 GB) and summarizes a page with it on the GPU.
// Opt-in because of the download. Run: corepack pnpm webllm-libs && corepack pnpm build:e2e, then
// LOCALPULSE_REAL_WEBLLM=1 corepack pnpm exec playwright test webllm-real
test.skip(!process.env.LOCALPULSE_REAL_WEBLLM, 'Set LOCALPULSE_REAL_WEBLLM=1 to run');
test.setTimeout(15 * 60_000);

test('summarizes a page with a real in-browser model', async ({
  context,
  extensionId,
  article,
}) => {
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize' }).click();

  const setup = panel.getByRole('region', { name: 'Choose where answers come from' });
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /Turn on Llama 3.2 1B in the browser/ }).click();
  const outcome = panel.getByText(/Llama 3.2 1B in the browser is ready\.|couldn't load/);
  await expect(outcome).toBeVisible({ timeout: 12 * 60_000 });
  expect(await outcome.innerText()).toContain('is ready');

  await panel.getByRole('button', { name: 'Summarize' }).click();
  const provenance = panel.getByText(/Answered on this device by Llama 3.2 1B in the browser/);
  await expect(provenance).toBeVisible({ timeout: 3 * 60_000 });
  const answer = await panel.locator('.answer').last().innerText();
  console.log(`\nIn-browser summary (${answer.length} chars):\n${answer}\n`);
  expect(answer.length).toBeGreaterThan(80);
  expect(answer.toLowerCase()).toMatch(/webgpu|gpu|graphics/);
});
