# Public encrypted email read service

This optional MIT-licensed Node/Vercel service accepts **only public cryptographic keys and random
tracking capabilities**. It records requests for a 1×1 tracking image. Every request timestamp is
encrypted for the user's extension before it reaches the queue. The extension decrypts timestamps,
counts image requests and saves the results locally.

**No email subjects, bodies, content, recipient addresses or destination links are accepted.** The
API rejects extra fields. There is no email sending, inbox access or link-click tracking. Image
requests are estimated read activity: mail clients and scanners can preload, cache or block images.
They cannot prove human reading, delivery, location or recipient identity.

## Public source and transparency

The public source is [user-github-me/localpulse-ai](https://github.com/user-github-me/localpulse-ai/tree/main/tools/email-tracker).
The deployment's `/` page and `/transparency` disclose the protocol, stored fields, hosting providers,
limits and exact Git commit. Vercel deploys this directory from that GitHub repository.
The public deployment address is https://localpulse-email-tracker.vercel.app.
Its `/api/status` reports `ready: false` when the durable encrypted queue is not configured;
the extension refuses to connect in that state instead of silently losing pending events.

Anyone with a tracking mailbox capability can fetch its encrypted events. There is no public
mailbox directory. The ciphertext is encrypted to the user's public key; the private decryption key
and private deletion-signing key remain in the extension. Public source and ciphertext do not hide
network timing, queue sizes or request URLs from hosting providers.

## Stored data and deletion

The durable queue holds a random mailbox ID and encrypted event values:

```json
{
  "id": "random UUID",
  "ephemeralPublicKey": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "iv": "...",
  "ciphertext": "..."
}
```

The encrypted payload contains only `{ "type": "image-request", "at": timestamp }`. No plaintext
counts, read times, IP addresses, User-Agent, referrers, cookies or email content are written by this
application. Vercel and Upstash handle requests and network metadata under their own policies:
[Vercel](https://vercel.com/legal/privacy-policy), [Upstash](https://upstash.com/trust/privacy.pdf).
This application has no access logging, analytics, telemetry or log drains. Platform logs and
provider retention are outside its control; do not claim that hosts see nothing.

The extension saves decrypted events locally **before** sending a signed acknowledgement. The
server deletes precisely those event IDs. A failed acknowledgement is retried; duplicate fetches
are not counted twice. A concurrent new event survives deletion of an earlier batch.

**There is no time-based expiry for tracking images or uncollected encrypted events.** The queue
holds up to 1,000 events per image; each fetch retrieves up to 100. A full queue or exhausted hosting
quota can miss activity. Images continue serving if recording fails. Collect regularly. Previously
sent images can generate new events after their local tracking entry is removed; export a key and
image backup before removal if future access is needed. Permanent revocation would require retained
revocation state and is not implemented. Rotating the server wrapping secret invalidates old images;
keep it stable and private.

The extension stores keys, image capabilities and results locally until explicitly removed or the
extension is uninstalled. Export a password-encrypted backup first. Backups use AES-256-GCM with a
PBKDF2-SHA-256 key (310,000 iterations, random salt). A lost private key or backup password cannot be
recovered by the server.

## Cryptographic protocol

The extension creates two P-256 key pairs: ECDH for decryption and ECDSA for signed deletion. The
server creates an ephemeral ECDH key per event, derives AES-256-GCM with HKDF-SHA-256, and authenticates
both the mailbox and event IDs as associated data. Only the encrypted event and ephemeral public
key go to storage. The image capability is authenticated/encrypted using an independent server
wrapping secret; it contains public keys and a random mailbox ID only. No private user key is ever
sent to the server. Cryptography protects queued payloads; the service sees request time while
processing and can generate artificial events, so this is not a trusted human-read certificate.

## Run locally

Use Node.js 24 (22.22.2 or later also works). No packages are needed.

```sh
cd tools/email-tracker
export LOCALPULSE_TRACKER_PUBLIC_URL=http://127.0.0.1:8787
export LOCALPULSE_TRACKER_SIGNING_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
node server.mjs
```

Local development uses memory; pending encrypted events disappear on process restart. For durable
use configure an Upstash Redis REST endpoint. Vercel requires it and refuses to use memory as
production persistence. The server requires no global user/admin token; event deletion requires
proof from each user's private key.

## Deploy from GitHub to Vercel

1. Import the public GitHub repository into Vercel. Set project root to `tools/email-tracker`,
   framework **Other**, Node **24.x**. The checked-in `vercel.json` routes requests to the shared handler.
2. Add `LOCALPULSE_TRACKER_PUBLIC_URL` with the stable production HTTPS URL.
3. Add `LOCALPULSE_TRACKER_SIGNING_SECRET` as a sensitive environment variable, independently
   generated from 32 random bytes. Keep this secret stable; never commit or print it.
4. Connect Upstash Redis on the **free** plan with `autoUpgrade=false` and `eviction=false`. Set
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Vercel Marketplace's `KV_REST_API_URL`
   and `KV_REST_API_TOKEN` are also supported). No TTL is set. Provider quotas still apply.
5. Deploy the GitHub commit to production. Public image routes must be accessible without Vercel
   deployment authentication. Keep analytics, speed insights, log drains and request debug logs off.
6. Open `/` and `/transparency`; verify the published Git commit matches the source. Connect the
   URL in the extension, create a private tracking image, and test your own inbox.

CLI commands, after Vercel sign-in and browser acceptance of Upstash marketplace terms:

```sh
vercel link --cwd tools/email-tracker --project localpulse-email-tracker --yes
vercel git connect https://github.com/user-github-me/localpulse-ai.git --cwd tools/email-tracker --yes
vercel integration add upstash/upstash-kv --cwd tools/email-tracker --plan free --name localpulse-tracker-encrypted --metadata primaryRegion=iad1 --metadata autoUpgrade=false --metadata eviction=false --metadata prodPack=false --no-env-pull
```

GitHub/Vercel integration shows source and deployment history. It does not make credentials,
private keys or a recipient activity directory public. Public deployment is optional; users can
run their own service with the same code.

## API

- `GET /` and `GET /transparency`: public human/machine-readable disclosure.
- `GET /api/status`: service/version discovery, no private configuration.
- `POST /api/readers` with only `{ encryptionKey, verificationKey }`: returns `{ mailbox, token, pixelUrl }`.
- `GET /p/:token.gif`: encrypts one image-request timestamp and appends it. HEAD and invalid tokens
  serve a GIF without recording. Cookies and referrer are never stored.
- `POST /api/events` with `{ token }`: returns `{ mailbox, events }`; no deletion. Any capability
  holder can inspect ciphertext, but cannot decrypt without the owner's private key.
- `POST /api/events/ack` with `{ token, ids, signature }`: verifies ECDSA ownership, deletes exact
  event IDs and returns 204. Sign `{ v: 1, mailbox, ids: sortedIds }` encoded as UTF-8 JSON.

Bodies are capped at 32 KB; up to 100 IDs can be acknowledged at once. Website origins are rejected
for API writes; extension origins and native requests are allowed. Public-key registration is
anonymous. Redis/provider capacity is finite, and traffic can exhaust free quotas; no automatic
paid upgrade is enabled.

## Docker and tests

```sh
docker build -t localpulse-email-tracker tools/email-tracker
docker run --rm -p 127.0.0.1:8787:8787 --env LOCALPULSE_TRACKER_SIGNING_SECRET --env LOCALPULSE_TRACKER_PUBLIC_URL --env UPSTASH_REDIS_REST_URL --env UPSTASH_REDIS_REST_TOKEN localpulse-email-tracker
node --test tools/email-tracker/server.test.mjs
```

Tests cover content rejection, owner-only decryption/deletion, ciphertext tampering, exact
acknowledgement with concurrent arrivals, no time expiry, queue failures and public disclosure.
[MIT license](../../LICENSE).
