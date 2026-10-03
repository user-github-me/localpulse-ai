// Verifies a signed CRX3 package on its own terms: format, RSA signature, that it was signed with
// local/key.pem, its extension ID, and that its files match the store ZIP byte for byte.
// Run: node scripts/verify-crx.mjs [path/to/file.crx]
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const crxPath = process.argv[2] ?? join(root, `local/build/localpulse-ai-${version}-chrome.crx`);
const zipPath = join(root, `local/build/localpulse-ai-${version}-chrome.zip`);
let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
};

/** Reads protobuf fields: tag → list of values (varints as numbers, length-delimited as Buffers). */
function fields(buffer) {
  const out = new Map();
  let offset = 0;
  const varint = () => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = buffer[offset++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
    }
  };
  while (offset < buffer.length) {
    const key = varint();
    const tag = Number(key >> 3n);
    const type = Number(key & 7n);
    let value;
    if (type === 0) value = Number(varint());
    else if (type === 2) {
      const length = Number(varint());
      value = buffer.subarray(offset, offset + length);
      offset += length;
    } else throw new Error(`Unexpected protobuf wire type ${type}`);
    out.set(tag, [...(out.get(tag) ?? []), value]);
  }
  return out;
}

const crx = readFileSync(crxPath);
report(crx.subarray(0, 4).toString('latin1') === 'Cr24', 'CRX magic number', 'Cr24');
report(crx.readUInt32LE(4) === 3, 'CRX format version', String(crx.readUInt32LE(4)));
const headerLength = crx.readUInt32LE(8);
const header = fields(crx.subarray(12, 12 + headerLength));
const archive = crx.subarray(12 + headerLength);

const signedHeaderData = header.get(10000)?.[0];
const crxId = signedHeaderData && fields(signedHeaderData).get(1)?.[0];
const proofs = (header.get(2) ?? []).map((proof) => {
  const parts = fields(proof);
  return { publicKey: parts.get(1)?.[0], signature: parts.get(2)?.[0] };
});
report(proofs.length > 0, 'RSA signature proofs', String(proofs.length));

// What Chrome signs: a fixed prefix, the signed header's length and bytes, then the ZIP archive.
const lengthBytes = Buffer.alloc(4);
lengthBytes.writeUInt32LE(signedHeaderData?.length ?? 0);
const signedData = Buffer.concat([
  Buffer.from('CRX3 SignedData\x00', 'latin1'),
  lengthBytes,
  signedHeaderData ?? Buffer.alloc(0),
  archive,
]);
const ourKey = createPublicKey(readFileSync(join(root, 'local/key.pub.pem'))).export({
  type: 'spki',
  format: 'der',
});
for (const [index, proof] of proofs.entries()) {
  const key = createPublicKey({ key: proof.publicKey, format: 'der', type: 'spki' });
  report(verify('sha256', signedData, key, proof.signature), `signature ${index + 1} is valid`);
  report(
    Buffer.compare(proof.publicKey, ourKey) === 0,
    `signature ${index + 1} uses local/key.pem`,
  );
}

const expectedId = createHash('sha256').update(ourKey).digest().subarray(0, 16);
report(crxId && Buffer.compare(crxId, expectedId) === 0, 'CRX id matches the key');
const extensionId = [...expectedId.toString('hex')]
  .map((digit) => String.fromCharCode(97 + parseInt(digit, 16)))
  .join('');
console.log(`      extension ID for this key: ${extensionId}`);

// The files inside must be exactly the store ZIP's.
const scratch = mkdtempSync(join(tmpdir(), 'crx-'));
const inner = join(scratch, 'inner.zip');
writeFileSync(inner, archive);
const list = (zip) =>
  execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'))
    .sort();
const crxFiles = list(inner);
const zipFiles = list(zipPath);
report(crxFiles.includes('manifest.json'), 'manifest.json at the root of the CRX');
report(
  JSON.stringify(crxFiles) === JSON.stringify(zipFiles),
  'same files as the store ZIP',
  `${crxFiles.length} files`,
);
/** A file's bytes, or undefined when it can't be read (a damaged archive fails its CRC check). */
const read = (zip, name) => {
  try {
    return execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 28, stdio: 'pipe' });
  } catch {
    return undefined;
  }
};
const differing = crxFiles.filter((name) => {
  const [ours, store] = [read(inner, name), read(zipPath, name)];
  return !ours || !store || Buffer.compare(ours, store) !== 0;
});
report(differing.length === 0, 'same bytes as the store ZIP', differing.join(', ') || 'all equal');
const manifest = JSON.parse(
  execFileSync('unzip', ['-p', inner, 'manifest.json'], { encoding: 'utf8' }),
);
report(manifest.version === version, 'manifest version', manifest.version);
report(!crxFiles.some((name) => /\.pem$|key/i.test(name)), 'no key inside the CRX');

console.log(
  failures ? `\n${failures} problem(s)` : '\nThe CRX is correctly signed with local/key.pem.',
);
rmSync(scratch, { recursive: true, force: true });
process.exitCode = failures ? 1 : 0;
