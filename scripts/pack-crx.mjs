// Signs the current Chrome build as a CRX with local/key.pem, for "Verified CRX uploads" in the
// Chrome Web Store, then checks the result with verify-crx.mjs.
// Run after `corepack pnpm zip` (which builds local/build/chrome-mv3): node scripts/pack-crx.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(import.meta.dirname, '..');
const { version } = JSON.parse(
  execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], {
    cwd: root,
    encoding: 'utf8',
  }),
);
const build = join(root, 'local/build/chrome-mv3');
const key = join(root, 'local/key.pem');
const packed = `${build}.crx`;
const target = join(root, `local/build/localpulse-ai-${version}-chrome.crx`);

if (!existsSync(key)) throw new Error('local/key.pem is missing. Restore it from your backup.');
if (!existsSync(join(build, 'manifest.json'))) throw new Error('Run `corepack pnpm zip` first.');

if (JSON.parse(readFileSync(join(build, 'manifest.json'), 'utf8')).version !== version)
  throw new Error('The build version is stale. Run corepack pnpm zip first.');

// Chrome's own packer, from a Chrome that isn't your everyday browser, with a throwaway profile.
const candidates = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const chrome = candidates.find((path) => existsSync(path));
if (!chrome)
  throw new Error('No Chrome found. Run `corepack pnpm exec playwright install chromium`.');
const profile = mkdtempSync(join(tmpdir(), 'pack-profile-'));
rmSync(packed, { force: true });
try {
  execFileSync(chrome, [
    `--pack-extension=${build}`,
    `--pack-extension-key=${key}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--headless=new',
  ]);
} finally {
  rmSync(profile, { recursive: true, force: true });
}
renameSync(packed, target);
console.log(`Signed: ${target.replace(`${root}/`, '')}\n`);
execFileSync('node', [join(import.meta.dirname, 'verify-crx.mjs'), target], { stdio: 'inherit' });
