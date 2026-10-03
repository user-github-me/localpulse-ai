import { test, expect, openPanel } from './extension';
import { mkdir, writeFile } from 'node:fs/promises';
// Real models, opt-in because these tests download public model data and run CPU inference.
test('real bundled OCR recognizes a local image without uploading it', async ({
  context,
  extensionId,
  article,
}) => {
  test.skip(!process.env.LOCALPULSE_REAL_MEDIA, 'Downloads OCR language data for real inference.');
  test.setTimeout(180000);
  const panel = await openPanel(context, extensionId, article);
  const image = await panel.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1000, 180);
    ctx.fillStyle = 'black';
    ctx.font = '48px Arial';
    ctx.fillText('Private research stays on this device.', 30, 100);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const requests: { url: string; method: string }[] = [];
  context.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push({ url: r.url(), method: r.method() });
  });
  await panel.getByRole('button', { name: 'Image and PDF text', exact: true }).click();
  const dialog = panel.getByRole('dialog', { name: 'Image and PDF text' });
  await dialog.getByRole('button', { name: 'Download model data and enable' }).click();
  await expect(dialog.getByText('Model ready on this device.')).toBeVisible({ timeout: 120000 });
  await dialog.getByLabel('Choose a local file').setInputFiles({
    name: 'private-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await dialog.getByRole('button', { name: 'Recognize text locally' }).click();
  await expect(dialog.getByLabel('Review and correct text')).toHaveValue(
    /Private research stays on this device/i,
    { timeout: 60000 },
  );
  expect(
    requests.every(
      (r) =>
        r.method === 'GET' &&
        r.url.startsWith('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/'),
    ),
  ).toBe(true);
  await mkdir('local/screens', { recursive: true });
  await panel.screenshot({ path: 'local/screens/ocr-v1.1.png' });
  // Exercise the PDF renderer as well as images, using a synthetic two-page document.
  await dialog.getByLabel('Choose a local file').setInputFiles('tests/fixtures/files/report.pdf');
  await dialog.getByRole('button', { name: 'Recognize text locally' }).click();
  await expect(dialog.getByLabel('Review and correct text')).toHaveValue(
    /## Page 1[\s\S]*## Page 2/,
    {
      timeout: 60000,
    },
  );
  expect(await dialog.getByLabel('Review and correct text').inputValue()).toMatch(/revenue/i);
  // Reopening after the first download must work with the network blocked.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await context.route('https://raw.githubusercontent.com/**', (route) => route.abort());
  await panel.getByRole('button', { name: 'Image and PDF text', exact: true }).click();
  await dialog.getByRole('button', { name: 'Download model data and enable' }).click();
  await expect(dialog.getByText('Model ready on this device.')).toBeVisible({ timeout: 30000 });
});
test('real bundled Whisper transcribes a local recording without uploads', async ({
  context,
  extensionId,
  article,
}) => {
  test.skip(!process.env.LOCALPULSE_REAL_MEDIA, 'Downloads Whisper model data for real inference.');
  test.setTimeout(240000);
  const panel = await openPanel(context, extensionId, article);
  const requests: { url: string; method: string }[] = [];
  context.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push({ url: r.url(), method: r.method() });
  });
  await panel.getByRole('button', { name: 'Audio transcript', exact: true }).click();
  const dialog = panel.getByRole('dialog', { name: 'Audio transcript' });
  await dialog.getByRole('button', { name: 'Download model data and enable' }).click();
  await expect(dialog.getByText('Model ready on this device.')).toBeVisible({ timeout: 180000 });
  await dialog.getByLabel('Choose a local file').setInputFiles('local/fixtures/voice-test.wav');
  await dialog.getByRole('button', { name: 'Transcribe locally' }).click();
  await expect(dialog.getByLabel('Review and correct text')).toHaveValue(
    /private|research|device/i,
    { timeout: 60000 },
  );
  expect(
    requests.every(
      (r) => r.method === 'GET' && /huggingface\.co|hf\.co/.test(new URL(r.url).hostname),
    ),
  ).toBe(true);
  await writeFile(
    'local/fixtures/whisper-transcript.txt',
    await dialog.getByLabel('Review and correct text').inputValue(),
  );
  await panel.screenshot({ path: 'local/screens/audio-transcript-v1.1.png' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await context.route(/^https:\/\/.*(huggingface\.co|hf\.co)/, (route) => route.abort());
  await panel.getByRole('button', { name: 'Audio transcript', exact: true }).click();
  await dialog.getByRole('button', { name: 'Download model data and enable' }).click();
  await expect(dialog.getByText('Model ready on this device.')).toBeVisible({ timeout: 30000 });
});
