export interface TrackerKeys {
  encryptionPrivateKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  signingPrivateKey: JsonWebKey;
  signingPublicKey: JsonWebKey;
}
export interface EncryptedReadEvent {
  id: string;
  ephemeralPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
}
export const READ_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encode = (value: string) => new TextEncoder().encode(value);
export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const array = new Uint8Array(bytes);
  let text = '';
  for (let offset = 0; offset < array.length; offset += 8192)
    text += String.fromCharCode(...array.subarray(offset, offset + 8192));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64url(value: string, max = 10000): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > max || !/^[a-zA-Z0-9_-]+$/.test(value))
    throw new Error('crypto');
  const text = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}
export function onlyPublicKey(key: JsonWebKey): JsonWebKey {
  if (
    key.kty !== 'EC' ||
    key.crv !== 'P-256' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    fromBase64url(key.x, 43).length !== 32 ||
    fromBase64url(key.y, 43).length !== 32 ||
    key.d !== undefined
  )
    throw new Error('crypto');
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}
export async function generateTrackerKeys(): Promise<TrackerKeys> {
  const encryption = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  return {
    encryptionPrivateKey: await crypto.subtle.exportKey('jwk', encryption.privateKey),
    encryptionPublicKey: onlyPublicKey(await crypto.subtle.exportKey('jwk', encryption.publicKey)),
    signingPrivateKey: await crypto.subtle.exportKey('jwk', signing.privateKey),
    signingPublicKey: onlyPublicKey(await crypto.subtle.exportKey('jwk', signing.publicKey)),
  };
}
export async function validateTrackerKeys(keys: TrackerKeys): Promise<void> {
  const encryption = onlyPublicKey(keys.encryptionPublicKey),
    signing = onlyPublicKey(keys.signingPublicKey);
  for (const [privateKey, publicKey] of [
    [keys.encryptionPrivateKey, encryption],
    [keys.signingPrivateKey, signing],
  ]) {
    if (
      !privateKey?.d ||
      privateKey.x !== publicKey?.x ||
      privateKey.y !== publicKey?.y ||
      fromBase64url(privateKey.d, 43).length !== 32
    )
      throw new Error('crypto');
  }
  const privateEncryption = await crypto.subtle.importKey(
    'jwk',
    keys.encryptionPrivateKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publicEncryption = await crypto.subtle.importKey(
    'jwk',
    encryption,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const challenge = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
  const expected = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicEncryption },
      challenge.privateKey,
      256,
    ),
  );
  const actual = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: challenge.publicKey },
      privateEncryption,
      256,
    ),
  );
  if (actual.some((value, index) => value !== expected[index])) throw new Error('crypto');
  const privateSigning = await crypto.subtle.importKey(
    'jwk',
    keys.signingPrivateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const publicSigning = await crypto.subtle.importKey(
    'jwk',
    signing,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const proof = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateSigning,
    encode('localpulse-backup-key-check'),
  );
  if (
    !(await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicSigning,
      proof,
      encode('localpulse-backup-key-check'),
    ))
  )
    throw new Error('crypto');
}
export async function decryptReadEvent(
  keys: TrackerKeys,
  mailbox: string,
  event: EncryptedReadEvent,
): Promise<number> {
  if (!READ_UUID.test(mailbox) || !READ_UUID.test(event.id)) throw new Error('crypto');
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    keys.encryptionPrivateKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const ephemeral = await crypto.subtle.importKey(
    'jwk',
    onlyPublicKey(event.ephemeralPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeral },
    privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encode(mailbox),
      info: encode(`localpulse-read-v1:${event.id}`),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const iv = fromBase64url(event.iv, 16);
  if (iv.length !== 12) throw new Error('crypto');
  const decoded = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encode(`${mailbox}:${event.id}`) },
    key,
    fromBase64url(event.ciphertext, 1024),
  );
  const value = JSON.parse(new TextDecoder().decode(decoded));
  if (
    value.type !== 'image-request' ||
    !Number.isSafeInteger(value.at) ||
    value.at < 0 ||
    value.at > 8.64e15
  )
    throw new Error('crypto');
  return value.at;
}
export async function signAcknowledgement(
  keys: TrackerKeys,
  mailbox: string,
  ids: string[],
): Promise<string> {
  if (!READ_UUID.test(mailbox) || ids.some((id) => !READ_UUID.test(id))) throw new Error('crypto');
  const key = await crypto.subtle.importKey(
    'jwk',
    keys.signingPrivateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return base64url(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encode(JSON.stringify({ v: 1, mailbox, ids: [...ids].sort() })),
    ),
  );
}
async function backupKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  if (password.length < 12 || password.length > 1000) throw new Error('password');
  const material = await crypto.subtle.importKey('raw', encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}
export async function encryptTrackerBackup(value: unknown, password: string): Promise<string> {
  const content = JSON.stringify(value);
  if (content.length > 5000000) throw new Error('backup');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(password, salt, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encode('localpulse-read-backup-v1') },
    key,
    encode(content),
  );
  return JSON.stringify({
    format: 'localpulse-read-backup',
    version: 1,
    salt: base64url(salt),
    iv: base64url(iv),
    ciphertext: base64url(encrypted),
  });
}
export async function decryptTrackerBackup(content: string, password: string): Promise<unknown> {
  if (content.length > 7000000) throw new Error('backup');
  const value = JSON.parse(content);
  if (value.format !== 'localpulse-read-backup' || value.version !== 1) throw new Error('backup');
  const salt = fromBase64url(value.salt, 24),
    iv = fromBase64url(value.iv, 16);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('backup');
  const key = await backupKey(password, salt, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encode('localpulse-read-backup-v1') },
    key,
    fromBase64url(value.ciphertext, 6800000),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
