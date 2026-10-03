// Verify upload packages and graphics without opening local secrets or signing keys.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const release = join(root, `local/releases/v${version}`);
await mkdir(release, { recursive: true });
for (const kind of ['chrome.zip', 'chrome.crx', 'firefox.zip', 'sources.zip']) {
  const name = `localpulse-ai-${version}-${kind}`;
  await copyFile(join(root, 'local/build', name), join(release, name));
  if (!kind.endsWith('.zip')) continue;
  const path = join(release, name);
  execFileSync('unzip', ['-tq', path], { stdio: 'pipe' });
  const entries = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' }).trim().split('\n');
  assert(
    !entries.some((entry) =>
      /(^|\/)(local|node_modules|\.git|\.vercel)(\/|$)|(^|\/)\.env|\.(pem|crx|zip)$|\.DS_Store$/.test(
        entry,
      ),
    ),
    `${name}: private or generated files`,
  );
  assert(
    entries.every((entry) => !entry.startsWith('/') && !entry.split('/').includes('..')),
    `${name}: unsafe path`,
  );
  if (kind === 'sources.zip') {
    for (const file of [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'wxt.config.ts',
      'scripts/media-assets.mjs',
      'scripts/licenses/onnxruntime.txt',
    ])
      assert(entries.includes(file), `Reviewer source missing ${file}`);
    continue;
  }
  assert(entries.includes('manifest.json'), `${name}: missing root manifest`);
  const manifest = JSON.parse(
    execFileSync('unzip', ['-p', path, 'manifest.json'], { encoding: 'utf8' }),
  );
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.host_permissions ?? [], []);
  for (const optional of ['tabs', 'alarms', 'notifications']) {
    assert(manifest.optional_permissions.includes(optional));
    assert(!manifest.permissions.includes(optional));
  }
  assert.equal(manifest.content_scripts?.length ?? 0, 0);
  assert(!manifest.content_security_policy.extension_pages.includes("'unsafe-eval'"));
  const messages = JSON.parse(
    execFileSync('unzip', ['-p', path, '_locales/en/messages.json'], { encoding: 'utf8' }),
  );
  assert(messages.extName.message.length <= 75);
  assert(messages.extDescription.message.length <= 132);
}
execFileSync(
  'node',
  [join(root, 'scripts/verify-crx.mjs'), join(release, `localpulse-ai-${version}-chrome.crx`)],
  { stdio: 'inherit' },
);
const screenshots = (await readdir(join(release, 'screenshots'))).filter((name) =>
  name.startsWith('screenshot-'),
);
assert.equal(screenshots.length, 5);
for (const name of screenshots) {
  const info = await sharp(join(release, 'screenshots', name)).metadata();
  assert.equal(info.width, 1280);
  assert.equal(info.height, 800);
  assert.equal(info.hasAlpha, false);
}
for (const [name, width, height] of [
  ['tile-small-440x280.jpg', 440, 280],
  ['tile-marquee-1400x560.jpg', 1400, 560],
]) {
  const info = await sharp(join(release, 'screenshots', name)).metadata();
  assert.equal(info.width, width);
  assert.equal(info.height, height);
  assert.equal(info.hasAlpha, false);
}
assert((await readFile(join(release, 'reviewer-instructions.txt'), 'utf8')).trim().length <= 500);
assert((await readFile(join(release, 'store-description.txt'), 'utf8')).length <= 16000);
const files = (await readdir(release, { recursive: true })).filter(
  (name) => name !== 'SHA256SUMS.txt',
);
const hashes = [];
for (const name of files.sort()) {
  try {
    const bytes = await readFile(join(release, name));
    hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  } catch (error) {
    if (error.code !== 'EISDIR') throw error;
  }
}
await writeFile(join(release, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
console.log(
  `Verified production packages, CRX signature, private-file exclusion, graphics and text limits.\n${release}`,
);
