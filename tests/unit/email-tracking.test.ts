import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeTrackerUrl } from '@/core/email-tracking';
import {
  decryptReadEvent,
  decryptTrackerBackup,
  encryptTrackerBackup,
  generateTrackerKeys,
  signAcknowledgement,
  validateTrackerKeys,
} from '@/core/tracker-crypto';
import {
  collectReadActivity,
  connectTracker,
  createReadTracker,
  listReadTrackers,
} from '@/storage/email-tracker';
// @ts-expect-error Native companion deliberately has no TS declarations.
import { encryptReadEvent } from '../../tools/email-tracker/server.mjs';
const base = 'https://tracker.test';
const mailbox = 'be499e7d-8434-46c1-a97a-f17a7e329830';
const token = 'a'.repeat(200);
const permissions = fakeBrowser.permissions as unknown as {
  contains(details: { origins: string[] }): Promise<boolean>;
};
beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.stubGlobal('crypto', webcrypto);
});
describe('private read tracking', () => {
  it('requires HTTPS except loopback and refuses URL credentials', () => {
    expect(normalizeTrackerUrl(`${base}/`)).toBe(base);
    expect(normalizeTrackerUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    for (const value of [
      'https://name:password@tracker.test',
      'http://tracker.test',
      'https://tracker.test/?key=secret',
      'javascript:alert(1)',
    ])
      expect(normalizeTrackerUrl(value)).toBeUndefined();
  });
  it('refuses a deployment whose durable queue is not configured', async () => {
    vi.spyOn(permissions, 'contains').mockResolvedValue(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'localpulse-email-tracker',
          version: 3,
          ready: false,
        }),
      ),
    );
    await expect(connectTracker(base)).rejects.toThrow('unavailable');
  });
  it('decrypts server ciphertext only with owner keys and rejects tampering', async () => {
    const keys = await generateTrackerKeys(),
      other = await generateTrackerKeys();
    await validateTrackerKeys(keys);
    await expect(
      validateTrackerKeys({
        ...keys,
        encryptionPrivateKey: { ...keys.encryptionPrivateKey, d: other.encryptionPrivateKey.d },
      }),
    ).rejects.toThrow();
    const event = await encryptReadEvent(keys.encryptionPublicKey, mailbox, 123456);
    expect(await decryptReadEvent(keys, mailbox, event)).toBe(123456);
    await expect(decryptReadEvent(other, mailbox, event)).rejects.toThrow();
    await expect(
      decryptReadEvent(keys, mailbox, {
        ...event,
        ciphertext: `${event.ciphertext.slice(0, -4)}aaaa`,
      }),
    ).rejects.toThrow();
    expect(JSON.stringify(event)).not.toContain('123456');
    expect(await signAcknowledgement(keys, mailbox, [event.id])).toBeTruthy();
  });
  it('password-encrypts backups and refuses a wrong password', async () => {
    const keys = await generateTrackerKeys();
    const data = { keys, results: [123456] };
    const backup = await encryptTrackerBackup(data, 'a strong backup password');
    expect(backup).not.toContain(keys.encryptionPrivateKey.d);
    expect(backup).not.toContain('123456');
    expect(await decryptTrackerBackup(backup, 'a strong backup password')).toEqual(data);
    await expect(decryptTrackerBackup(backup, 'wrong backup password')).rejects.toThrow();
  });
  it('sends only public keys; saves decrypted results before deletion and retries acknowledgement without double counting', async () => {
    vi.spyOn(permissions, 'contains').mockResolvedValue(true);
    const fetcher = vi.spyOn(globalThis, 'fetch');
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ service: 'localpulse-email-tracker', version: 3 })),
    );
    await connectTracker(base);
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ mailbox, token, pixelUrl: `${base}/p/${token}.gif` })),
    );
    await createReadTracker();
    const createBody = JSON.parse(fetcher.mock.calls.at(-1)?.[1]?.body as string);
    expect(Object.keys(createBody).sort()).toEqual(['encryptionKey', 'verificationKey']);
    expect(createBody.encryptionKey.d).toBeUndefined();
    expect(createBody.verificationKey.d).toBeUndefined();
    const event = await encryptReadEvent(createBody.encryptionKey, mailbox, 123456);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ mailbox, events: [event] })));
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(collectReadActivity()).rejects.toThrow();
    expect(await listReadTrackers()).toMatchObject([
      { reads: [{ id: event.id, at: 123456 }], pendingAcknowledgements: [event.id] },
    ]);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ mailbox, events: [] })));
    expect(await collectReadActivity()).toMatchObject([
      { reads: [{ id: event.id, at: 123456 }], pendingAcknowledgements: [] },
    ]);
    const sent = fetcher.mock.calls
      .filter((call) => call[1]?.body)
      .map((call) => JSON.parse(call[1]?.body as string));
    expect(
      sent.some((value) => value.subject || value.body || value.recipient || value.links),
    ).toBe(false);
  });
});

it('keeps private names local and inside encrypted backups', async () => {
  const { renameReadTracker, exportReadBackup, importReadBackup } =
    await import('@/storage/email-tracker');
  vi.spyOn(permissions, 'contains').mockResolvedValue(true);
  const calls: unknown[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push(body);
    return new Response(
      JSON.stringify(
        body?.encryptionKey
          ? { mailbox, token, pixelUrl: `${base}/p/${token}.gif` }
          : { service: 'localpulse-email-tracker', version: 3, ready: true },
      ),
    );
  });
  await connectTracker(base);
  await createReadTracker();
  await renameReadTracker(mailbox, 'Private project name');
  expect(JSON.stringify(calls)).not.toContain('Private project name');
  const backup = await exportReadBackup('owner backup password');
  expect(backup).not.toContain('Private project name');
  await fakeBrowser.storage.local.remove('readTrackerVault');
  await importReadBackup(backup, 'owner backup password');
  expect((await listReadTrackers())[0]?.name).toBe('Private project name');
});
