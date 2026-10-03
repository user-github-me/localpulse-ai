/* global document */
// Render current, synthetic-data UI captures into upload-sized store assets.
// Run scripts/capture-store.mjs and the screenshot-producing browser tests first.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'local/releases/v1.1.0');
const graphics = join(output, 'screenshots');
await mkdir(graphics, { recursive: true });
const dataImage = async (path) =>
  `data:image/png;base64,${(await readFile(join(root, path))).toString('base64')}`;
const icon = await dataImage('public/icons/128.png');
const images = {
  summary: await dataImage('local/web-store-content/raw/panel-summary.png'),
  quotes: await dataImage('local/web-store-content/raw/panel-quotes.png'),
  consent: await dataImage('local/web-store-content/raw/panel-consent.png'),
  library: await dataImage('local/screens/research-library-v1.1.png'),
  tracking: await dataImage('local/screens/mail.google.com-dashboard-v1.1.png'),
  ocr: await dataImage('local/screens/ocr-v1.1.png'),
  audio: await dataImage('local/screens/audio-transcript-v1.1.png'),
};
const slides = [
  [
    '1-workspace',
    'Read. Understand.<br>Keep your privacy.',
    'Summarize pages, compare documents and choose from 24 actions. Every answer shows where it was written.',
    ['summary'],
    'Example response · current extension interface',
  ],
  [
    '2-tracking',
    'Email activity.<br>One choice to enable.',
    'Automatic Gmail and Outlook draft images, per-draft controls and local read counts. Email content never enters the tracking service.',
    ['tracking'],
    'Synthetic test data · image requests estimate reads',
  ],
  [
    '3-research',
    'Your research.<br>Saved on your device.',
    'Save chosen sources, search their text and reopen a collection. Export or delete it whenever you choose.',
    ['library'],
    'Synthetic collection · no automatic page saving',
  ],
  [
    '4-local-media',
    'Turn files into text.<br>On your computer.',
    'Read images and scanned PDFs. Transcribe English audio. Download model data once, then review the text locally.',
    ['ocr', 'audio'],
    'Actual OCR and Whisper results · synthetic local files',
  ],
  [
    '5-evidence',
    'Check the source.<br>Choose what leaves.',
    'Inspect checked quotations and source excerpts. Cloud AI asks for consent; local tools stay on your device.',
    ['quotes', 'consent'],
    'Example responses · actual quote checking and consent interface',
  ],
];
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const style = `<style>
*{box-sizing:border-box}body{margin:0;background:#103b2e;color:#f6f8f5;font-family:-apple-system,system-ui,'Segoe UI',sans-serif}main{width:1280px;height:800px;position:relative;overflow:hidden;padding:64px}.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:650}.brand img{width:34px;height:34px}.version{margin-left:10px;border:1px solid #668f7c;border-radius:30px;font-size:14px;padding:5px 10px}.copy{position:absolute;left:64px;top:210px;width:450px}h1{margin:0;font:600 51px/1.13 Charter,Georgia,serif;letter-spacing:-1px}p{color:#c2d9cb;font-size:21px;line-height:1.55;margin-top:25px}.free{color:#86d4b1;position:absolute;left:64px;bottom:112px;font-weight:600;font-size:17px}.note{position:absolute;left:64px;bottom:59px;color:#b8cdc0;font-size:13px;max-width:450px;line-height:1.5}.shots{position:absolute;left:588px;right:42px;top:46px;bottom:30px;display:flex;align-items:center;justify-content:center;gap:18px}.shots img{max-width:100%;max-height:724px;width:auto;object-fit:contain;border-radius:14px;box-shadow:0 20px 60px #001b1680}.shots.double img{width:calc(50% - 9px);max-height:710px}.tile{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:24px}.tile img{width:68px;height:68px}.tile h1{font-size:38px;margin:18px 0 0}.tile p{font-size:17px;margin:14px 0 0}.marquee h1{font-size:68px}.marquee img{width:92px;height:92px}.marquee p{font-size:25px}
</style>`;
for (const [name, title, description, keys, note] of slides) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(
    `${style}<main><div class="brand"><img src="${icon}" alt="">LocalPulse AI<span class="version">v1.1</span></div><div class="copy"><h1>${title}</h1><p>${description}</p></div><div class="free">Free · Open source · MIT</div><div class="note">${note}</div><div class="shots ${keys.length > 1 ? 'double' : ''}">${keys.map((key) => `<img src="${images[key]}" alt="Current LocalPulse interface">`).join('')}</div></main>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: join(graphics, `screenshot-${name}.jpg`),
    type: 'jpeg',
    quality: 94,
  });
}
for (const [width, height, name] of [
  [440, 280, 'tile-small-440x280.jpg'],
  [1400, 560, 'tile-marquee-1400x560.jpg'],
]) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `${style}<div class="tile ${width > 440 ? 'marquee' : ''}" style="width:${width}px;height:${height}px"><img src="${icon}" alt=""><h1>LocalPulse AI</h1><p>Private tools for your browser.<br>Free and open source.</p></div>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(graphics, name), type: 'jpeg', quality: 94 });
}
await browser.close();
await copyFile(join(root, 'public/icons/128.png'), join(output, 'store-icon-128.png'));
await copyFile(join(root, 'docs/releases/v1.1.0.md'), join(output, 'release-notes.md'));
await copyFile(join(root, 'docs/store/v1.1.0.md'), join(output, 'store-submission.md'));
await mkdir(join(root, 'docs/screenshots'), { recursive: true });
for (const [input, name] of [
  ['local/web-store-content/raw/panel-summary.png', 'summary'],
  ['local/web-store-content/raw/panel-quotes.png', 'quotes'],
  ['local/web-store-content/raw/panel-consent.png', 'consent'],
  ['local/screens/mail.google.com-dashboard-v1.1.png', 'email-tracking-v1.1'],
  ['local/screens/research-library-v1.1.png', 'research-library-v1.1'],
  ['local/screens/ocr-v1.1.png', 'ocr-v1.1'],
])
  await sharp(join(root, input))
    .png({ compressionLevel: 9 })
    .toFile(join(root, 'docs/screenshots', `${name}.png`));
const submission = await readFile(join(root, 'docs/store/v1.1.0.md'), 'utf8');
const listing = await readFile(join(root, 'docs/store/store-listing-v1.1.0.md'), 'utf8');
const description = listing.match(
  /<!-- DESCRIPTION START -->\n([\s\S]*?)\n<!-- DESCRIPTION END -->/,
)?.[1];
if (!description?.trim() || description.length > 16000)
  throw new Error('Store description must contain between 1 and 16,000 characters.');
await writeFile(join(output, 'store-description.txt'), description.trim() + '\n');
await writeFile(
  join(output, 'reviewer-instructions.txt'),
  submission
    .split('## Reviewer instructions (under 500 characters)\n\n')[1]
    .split('\n## Images and packages')[0]
    .replace(/\n/g, ' ')
    .trim() + '\n',
);
console.log(`Store assets prepared: ${output}`);
