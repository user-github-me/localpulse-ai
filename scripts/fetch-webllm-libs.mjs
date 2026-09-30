// Downloads the WebAssembly libraries for the in-browser models into local/webllm-libs/, so the
// build can bundle them (the Chrome Web Store doesn't allow loading WebAssembly from elsewhere).
// The URLs come from the installed @mlc-ai/web-llm version. They point at a branch that can change,
// and the files ship as code, so each one must match its SHA-256 in scripts/webllm-libs.sha256.
// Run: corepack pnpm webllm-libs (build and zip run it). After updating @mlc-ai/web-llm or the
// model list, run `corepack pnpm webllm-libs --update-hashes` and review the change to the hashes.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'local/webllm-libs');
const hashFile = join(root, 'scripts/webllm-libs.sha256');
const updateHashes = process.argv.includes('--update-hashes');
const source = await readFile(join(root, 'src/providers/webllm-models.ts'), 'utf8');
const ids = [...source.matchAll(/id: '([^']+-MLC)'/g)].map((match) => match[1]);

// One "<sha256>  <file name>" per line, the format of `shasum -a 256`.
const pinned = new Map(
  (existsSync(hashFile) ? await readFile(hashFile, 'utf8') : '')
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([hash, name]) => hash && name)
    .map(([hash, name]) => [name, hash]),
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const relative = (file) => file.replace(`${root}/`, '');

async function download(url, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`retry ${url} (${error.message})`);
      await new Promise((done) => setTimeout(done, 2000 * attempt));
    }
  }
}

await mkdir(output, { recursive: true });
const hashes = new Map();
for (const id of ids) {
  const entry = prebuiltAppConfig.model_list.find((model) => model.model_id === id);
  if (!entry) throw new Error(`${id} is not in this version of @mlc-ai/web-llm`);
  const name = entry.model_lib.split('/').pop();
  const file = join(output, name);
  if (existsSync(file)) {
    const hash = sha256(await readFile(file));
    if (!updateHashes && hash === pinned.get(name)) {
      console.log(`have  ${relative(file)}`);
      hashes.set(name, hash);
      continue;
    }
    // Changed, damaged or not pinned: never bundle it; download it again below.
    await rm(file);
  }
  const bytes = await download(entry.model_lib);
  const hash = sha256(bytes);
  if (!updateHashes && hash !== pinned.get(name)) {
    throw new Error(
      `${name} has SHA-256 ${hash}, but scripts/webllm-libs.sha256 lists ` +
        `${pinned.get(name) ?? 'no hash for it'}. If you updated @mlc-ai/web-llm or the model ` +
        'list, run "corepack pnpm webllm-libs --update-hashes" and review the change.',
    );
  }
  await writeFile(file, bytes);
  hashes.set(name, hash);
  console.log(`saved ${relative(file)} (${(bytes.length / 1e6).toFixed(1)} MB, sha256 ${hash})`);
}

if (updateHashes) {
  const lines = [...hashes].sort(([a], [b]) => a.localeCompare(b));
  await writeFile(hashFile, lines.map(([name, hash]) => `${hash}  ${name}\n`).join(''));
  console.log(`updated ${relative(hashFile)}`);
}

// Remove libraries of models no longer offered, so they don't end up in the build.
for (const name of await readdir(output)) {
  if (name.endsWith('.wasm') && !hashes.has(name)) {
    await rm(join(output, name));
    console.log(`removed ${relative(join(output, name))}`);
  }
}
