/* global process, Buffer, URL */
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createMemoryActivityStore, createRedisActivityStore } from './activity-store.mjs';
import { transparency, landingPage } from './transparency.mjs';

const crypto = webcrypto;
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const EXTENSION_ORIGIN =
  /^(?:chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-zA-Z0-9-]{16,64})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const b64 = (value) => Buffer.from(value).toString('base64url');
const decode = (value, max = 12000) => {
  if (typeof value !== 'string' || value.length > max || !/^[a-zA-Z0-9_-]+$/.test(value))
    throw new HttpError(400, 'Invalid cryptographic value.');
  return Buffer.from(value, 'base64url');
};
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function publicKey(value) {
  exact(value, ['kty', 'crv', 'x', 'y']);
  if (
    !value ||
    value.kty !== 'EC' ||
    value.crv !== 'P-256' ||
    typeof value.x !== 'string' ||
    typeof value.y !== 'string' ||
    decode(value.x, 43).length !== 32 ||
    decode(value.y, 43).length !== 32 ||
    value.d !== undefined
  )
    throw new HttpError(400, 'Provide only a P-256 public key.');
  return { kty: 'EC', crv: 'P-256', x: value.x, y: value.y };
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new HttpError(400, 'Only documented cryptographic fields are accepted.');
}
function noCache(response) {
  response.setHeader('Cache-Control', 'no-store, private, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}
async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? ''))
    throw new HttpError(415, 'Use application/json.');
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
    throw new HttpError(415, 'Compressed bodies are not accepted.');
  // The Vercel Node adapter may parse JSON before invoking the handler. Native Node uses
  // the bounded stream below; both adapters apply the same strict route schemas.
  if (request.body !== undefined) {
    const encoded = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(encoded) > 32000) throw new HttpError(413, 'Request exceeds 32 KB.');
    try {
      return JSON.parse(encoded);
    } catch {
      throw new HttpError(400, 'Invalid JSON.');
    }
  }
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    let complete = false;
    const fail = (error) => {
      if (!complete) {
        complete = true;
        reject(error);
        request.resume();
      }
    };
    if (Number(request.headers['content-length'] ?? 0) > 32000) {
      fail(new HttpError(413, 'Request exceeds 32 KB.'));
      return;
    }
    request.on('data', (chunk) => {
      if (complete) return;
      size += chunk.length;
      if (size > 32000) fail(new HttpError(413, 'Request exceeds 32 KB.'));
      else chunks.push(chunk);
    });
    request.once('error', () => fail(new HttpError(400, 'Upload interrupted.')));
    request.once('end', () => {
      if (complete) return;
      complete = true;
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
  });
}
function baseAddress(value) {
  const url = new URL(value);
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Configure a public HTTPS origin (loopback HTTP for development).');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

/** All durable event content is encrypted to the user's public key before it reaches the queue. */
export async function encryptReadEvent(owner, mailbox, at) {
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const recipient = await crypto.subtle.importKey(
    'jwk',
    publicKey(owner),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipient },
    ephemeral.privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const id = randomUUID();
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: Buffer.from(mailbox),
      info: Buffer.from(`localpulse-read-v1:${id}`),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: Buffer.from(`${mailbox}:${id}`) },
    key,
    Buffer.from(JSON.stringify({ type: 'image-request', at })),
  );
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
  const ephemeralPublicKey = publicKey({ kty, crv, x, y });
  return { id, ephemeralPublicKey, iv: b64(iv), ciphertext: b64(ciphertext) };
}

export async function createTrackerHandler({
  publicUrl = process.env.LOCALPULSE_TRACKER_PUBLIC_URL,
  signingSecret = process.env.LOCALPULSE_TRACKER_SIGNING_SECRET,
  store,
  now = Date.now,
} = {}) {
  const address = baseAddress(publicUrl);
  if (
    typeof signingSecret !== 'string' ||
    !/^[a-zA-Z0-9_-]{43,256}$/.test(signingSecret) ||
    new Set(signingSecret).size < 12
  )
    throw new Error('Configure a strong independent signing secret privately.');
  const wrappingKey = await crypto.subtle.importKey(
    'raw',
    createHash('sha256').update(signingSecret).digest(),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  const queue =
    store ??
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
      ? createRedisActivityStore()
      : process.env.VERCEL
        ? undefined
        : createMemoryActivityStore());
  if (!queue) throw new Error('Vercel requires a durable encrypted-event queue.');
  async function wrap(capsule) {
    const iv = randomBytes(12);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: Buffer.from('localpulse-pixel-v1') },
      wrappingKey,
      Buffer.from(JSON.stringify(capsule)),
    );
    return b64(Buffer.concat([iv, Buffer.from(encrypted)]));
  }
  async function unwrap(token) {
    try {
      const bytes = decode(token, 3000);
      const plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: bytes.subarray(0, 12),
          additionalData: Buffer.from('localpulse-pixel-v1'),
        },
        wrappingKey,
        bytes.subarray(12),
      );
      const value = JSON.parse(Buffer.from(plaintext).toString('utf8'));
      if (value.v !== 1 || !UUID.test(value.mailbox)) throw new Error();
      return {
        v: 1,
        mailbox: value.mailbox,
        encryptionKey: publicKey(value.encryptionKey),
        verificationKey: publicKey(value.verificationKey),
      };
    } catch {
      throw new HttpError(400, 'Invalid tracking capability.');
    }
  }
  return async function handler(request, response) {
    noCache(response);
    try {
      const parsed = new URL(request.url, 'http://localhost');
      const prefix = address.pathname.replace(/\/$/, '');
      const path =
        prefix && parsed.pathname.startsWith(`${prefix}/`)
          ? parsed.pathname.slice(prefix.length)
          : parsed.pathname;
      if (path === '/' || path === '/transparency' || path === '/api/status') {
        if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Use GET.');
        if (path === '/') {
          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          });
          response.end(request.method === 'HEAD' ? undefined : landingPage());
        } else json(response, 200, { ...transparency(), ready: true });
        return;
      }
      if (path.startsWith('/api/')) {
        const origin = request.headers.origin;
        if (origin !== undefined && !EXTENSION_ORIGIN.test(origin))
          throw new HttpError(403, 'Use the extension.');
        if (origin) {
          response.setHeader('Access-Control-Allow-Origin', origin);
          response.setHeader('Vary', 'Origin');
        }
        if (request.method === 'OPTIONS') {
          response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          response.writeHead(204);
          response.end();
          return;
        }
        if (path === '/api/readers' && request.method === 'POST') {
          const input = await body(request);
          exact(input, ['encryptionKey', 'verificationKey']);
          const encryptionKey = publicKey(input.encryptionKey),
            verificationKey = publicKey(input.verificationKey);
          await crypto.subtle.importKey(
            'jwk',
            encryptionKey,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            [],
          );
          await crypto.subtle.importKey(
            'jwk',
            verificationKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          );
          const mailbox = randomUUID();
          const token = await wrap({ v: 1, mailbox, encryptionKey, verificationKey });
          json(response, 201, {
            mailbox,
            token,
            pixelUrl: new URL(`p/${token}.gif`, address).href,
          });
          return;
        }
        if (path === '/api/events' && request.method === 'POST') {
          const input = await body(request);
          exact(input, ['token']);
          const capsule = await unwrap(input.token);
          json(response, 200, {
            mailbox: capsule.mailbox,
            events: await queue.read(capsule.mailbox, 100),
          });
          return;
        }
        if (path === '/api/events/ack' && request.method === 'POST') {
          const input = await body(request);
          exact(input, ['token', 'ids', 'signature']);
          const capsule = await unwrap(input.token);
          if (
            !Array.isArray(input.ids) ||
            input.ids.length < 1 ||
            input.ids.length > 100 ||
            input.ids.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
            new Set(input.ids).size !== input.ids.length
          )
            throw new HttpError(400, 'Invalid event IDs.');
          const ids = [...input.ids].sort();
          const key = await crypto.subtle.importKey(
            'jwk',
            capsule.verificationKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          );
          const signature = decode(input.signature, 100);
          const valid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            signature,
            Buffer.from(JSON.stringify({ v: 1, mailbox: capsule.mailbox, ids })),
          );
          if (!valid) throw new HttpError(403, 'Deletion requires your private signing key.');
          await queue.acknowledge(capsule.mailbox, ids);
          response.writeHead(204);
          response.end();
          return;
        }
        throw new HttpError(405, 'Unsupported route.');
      }
      const pixel = /^\/p\/([a-zA-Z0-9_-]{16,3000})\.gif$/.exec(path);
      if (pixel && ['GET', 'HEAD'].includes(request.method)) {
        if (request.method === 'GET') {
          try {
            const capsule = await unwrap(pixel[1]);
            const event = await encryptReadEvent(capsule.encryptionKey, capsule.mailbox, now());
            await queue.append(capsule.mailbox, event);
          } catch {
            /* Image delivery remains available if recording fails. */
          }
        }
        response.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': PIXEL.length });
        response.end(request.method === 'HEAD' ? undefined : PIXEL);
        return;
      }
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      if (response.destroyed) return;
      request.resume();
      if (error instanceof HttpError && error.status === 413)
        response.setHeader('Connection', 'close');
      json(response, error instanceof HttpError ? error.status : 503, {
        error:
          error instanceof HttpError ? error.message : 'Encrypted activity service unavailable.',
      });
    }
  };
}
export async function createTrackerServer(options) {
  const handler = await createTrackerHandler(options);
  const server = createServer((request, response) => {
    request.on('error', () => {});
    void handler(request, response);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  return server;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  createTrackerServer()
    .then((server) => {
      server.listen(
        Number(process.env.LOCALPULSE_TRACKER_PORT ?? 8787),
        process.env.LOCALPULSE_TRACKER_HOST ?? '127.0.0.1',
      );
    })
    .catch(() => {
      process.stderr.write('Configure the tracker URL, signing secret and optional queue.\n');
      process.exitCode = 1;
    });
}
