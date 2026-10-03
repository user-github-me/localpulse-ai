/* global Buffer, fetch, Response */
import assert from 'node:assert/strict';
import { randomBytes, webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { createTrackerServer } from './server.mjs';
import {
  createMemoryActivityStore,
  createRedisActivityStore,
  APPEND_SCRIPT,
  READ_SCRIPT,
  ACK_SCRIPT,
} from './activity-store.mjs';
import { transparency } from './transparency.mjs';
const crypto = webcrypto;
async function keys() {
  const encryption = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const encryptionKey = await crypto.subtle.exportKey('jwk', encryption.publicKey),
    verificationKey = await crypto.subtle.exportKey('jwk', signing.publicKey);
  const publicOnly = ({ kty, crv, x, y }) => ({ kty, crv, x, y });
  return {
    encryption,
    signing,
    encryptionKey: publicOnly(encryptionKey),
    verificationKey: publicOnly(verificationKey),
  };
}
async function fixture(operation, options = {}) {
  const store = createMemoryActivityStore();
  const server = await createTrackerServer({
    publicUrl: 'http://127.0.0.1:8787',
    signingSecret: randomBytes(32).toString('base64url'),
    store,
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  try {
    await operation({ store, base, post });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
async function decrypt(owner, mailbox, event) {
  const ephemeral = await crypto.subtle.importKey(
    'jwk',
    event.ephemeralPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeral },
    owner.encryption.privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: Buffer.from(mailbox),
      info: Buffer.from(`localpulse-read-v1:${event.id}`),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  return JSON.parse(
    Buffer.from(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: Buffer.from(event.iv, 'base64url'),
          additionalData: Buffer.from(`${mailbox}:${event.id}`),
        },
        key,
        Buffer.from(event.ciphertext, 'base64url'),
      ),
    ).toString('utf8'),
  );
}
async function proof(owner, mailbox, ids) {
  return Buffer.from(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      owner.signing.privateKey,
      Buffer.from(JSON.stringify({ v: 1, mailbox, ids: [...ids].sort() })),
    ),
  ).toString('base64url');
}
test('read-only schema rejects email content, subjects, destinations and private keys', async () =>
  fixture(async ({ post }) => {
    const owner = await keys();
    for (const extra of [
      { subject: 'private subject' },
      { body: 'private body' },
      { recipient: 'person@example.com' },
      { links: [{ url: 'https://secret.test' }] },
    ]) {
      assert.equal(
        (
          await post('/api/readers', {
            encryptionKey: owner.encryptionKey,
            verificationKey: owner.verificationKey,
            ...extra,
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await post('/api/readers', {
          encryptionKey: { ...owner.encryptionKey, subject: 'private subject' },
          verificationKey: owner.verificationKey,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post('/api/readers', {
          encryptionKey: await crypto.subtle.exportKey('jwk', owner.encryption.privateKey),
          verificationKey: owner.verificationKey,
        })
      ).status,
      400,
    );
  }));
test('timestamps are encrypted, only owner decrypts, public fetch does not delete, owner acknowledgement deletes', async () =>
  fixture(async ({ base, post, store }) => {
    const owner = await keys(),
      wrong = await keys();
    const response = await post('/api/readers', {
      encryptionKey: owner.encryptionKey,
      verificationKey: owner.verificationKey,
    });
    assert.equal(response.status, 201);
    const reader = await response.json();
    await (await fetch(`${base}/p/${reader.token}.gif`)).arrayBuffer();
    const result = await (await post('/api/events', { token: reader.token })).json();
    assert.equal(result.events.length, 1);
    const event = result.events[0];
    assert.deepEqual(Object.keys(event).sort(), ['ciphertext', 'ephemeralPublicKey', 'id', 'iv']);
    assert.ok(!JSON.stringify(await store.read(reader.mailbox)).includes('image-request'));
    const decoded = await decrypt(owner, reader.mailbox, event);
    assert.equal(decoded.type, 'image-request');
    assert.ok(Number.isSafeInteger(decoded.at));
    await assert.rejects(decrypt(wrong, reader.mailbox, event));
    const ids = [event.id];
    assert.equal(
      (
        await post('/api/events/ack', {
          token: reader.token,
          ids,
          signature: await proof(wrong, reader.mailbox, ids),
        })
      ).status,
      403,
    );
    assert.equal((await store.read(reader.mailbox)).length, 1);
    assert.equal(
      (
        await post('/api/events/ack', {
          token: reader.token,
          ids,
          signature: await proof(owner, reader.mailbox, ids),
        })
      ).status,
      204,
    );
    assert.deepEqual(await store.read(reader.mailbox), []);
  }));
test('no link or event time expiry; exact acknowledgement preserves concurrently arriving events', async () => {
  let now = 1;
  await fixture(
    async ({ base, post, store }) => {
      const owner = await keys();
      const reader = await (
        await post('/api/readers', {
          encryptionKey: owner.encryptionKey,
          verificationKey: owner.verificationKey,
        })
      ).json();
      await (await fetch(`${base}/p/${reader.token}.gif`)).arrayBuffer();
      const first = await store.read(reader.mailbox);
      now = 4102444800000;
      assert.equal((await store.read(reader.mailbox)).length, 1);
      await (await fetch(`${base}/p/${reader.token}.gif`)).arrayBuffer();
      const ids = first.map((event) => event.id);
      await post('/api/events/ack', {
        token: reader.token,
        ids,
        signature: await proof(owner, reader.mailbox, ids),
      });
      const remaining = await store.read(reader.mailbox);
      assert.equal(remaining.length, 1);
      assert.equal((await decrypt(owner, reader.mailbox, remaining[0])).at, now);
    },
    { now: () => now },
  );
});
test('tampering and website requests fail; HEAD and unknown pixels do not create events', async () =>
  fixture(async ({ base, post, store }) => {
    const owner = await keys();
    const reader = await (
      await post('/api/readers', {
        encryptionKey: owner.encryptionKey,
        verificationKey: owner.verificationKey,
      })
    ).json();
    assert.equal(
      (await post('/api/events', { token: `${reader.token.slice(0, -4)}aaaa` })).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/api/readers`, {
          method: 'POST',
          headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    await fetch(`${base}/p/${reader.token}.gif`, { method: 'HEAD' });
    await fetch(`${base}/p/${randomBytes(32).toString('base64url')}.gif`);
    assert.deepEqual(await store.read(reader.mailbox), []);
  }));
test('queue pressure does not break image delivery and oversized content is rejected', async () =>
  fixture(
    async ({ base, post }) => {
      const owner = await keys();
      const reader = await (
        await post('/api/readers', {
          encryptionKey: owner.encryptionKey,
          verificationKey: owner.verificationKey,
        })
      ).json();
      assert.equal((await fetch(`${base}/p/${reader.token}.gif`)).status, 200);
      assert.equal(
        (
          await fetch(`${base}/api/readers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'x'.repeat(32001),
          })
        ).status,
        413,
      );
    },
    {
      store: {
        append: async () => {
          throw new Error('Full');
        },
        read: async () => [],
        acknowledge: async () => {},
      },
    },
  ));
test('Redis scripts preserve encrypted values across instances with no TTL and exact deletion', async () => {
  const data = new Map();
  const commands = [];
  const fetchImpl = async (_url, options) => {
    const command = JSON.parse(options.body);
    commands.push(command);
    const [, script, , key, ...args] = command;
    let result;
    const entries = data.get(key) ?? new Map();
    if (script === APPEND_SCRIPT) {
      entries.set(args[0], args[1]);
      data.set(key, entries);
      result = 1;
    } else if (script === READ_SCRIPT) result = [...entries.values()].slice(0, args[0]);
    else if (script === ACK_SCRIPT) {
      for (const id of args) entries.delete(id);
      result = 1;
    }
    return new Response(JSON.stringify({ result }));
  };
  const options = { url: 'https://queue.test', token: 'private-fake-token', fetchImpl };
  const first = createRedisActivityStore(options),
    second = createRedisActivityStore(options);
  const event = { id: 'event-id', ciphertext: 'ciphertext-only' };
  await first.append('mailbox', event);
  assert.deepEqual(await second.read('mailbox'), [event]);
  await second.acknowledge('mailbox', ['event-id']);
  assert.deepEqual(await first.read('mailbox'), []);
  assert.ok(!commands.some((command) => /EXPIRE|TTL/.test(command[1])));
});
test('public transparency exposes source and policy, never configuration secrets', () => {
  const value = transparency();
  assert.equal(value.version, 3);
  assert.ok(value.neverAccepted.includes('Email subject'));
  assert.equal(value.privateKeyLocation.includes('Never sent'), true);
  assert.ok(!JSON.stringify(value).includes('signingSecret'));
});
