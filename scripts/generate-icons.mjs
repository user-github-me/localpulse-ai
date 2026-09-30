// Renders assets/icon.svg to the PNG sizes browsers and stores need. Run: corepack pnpm icons
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets/icon.svg');
const output = join(root, 'public/icons');

await mkdir(output, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(source, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(output, `${size}.png`));
  console.log(`public/icons/${size}.png`);
}
