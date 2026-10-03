/* global process */
const SOURCE = 'https://github.com/user-github-me/localpulse-ai';
export function transparency() {
  const durableQueue = Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
  const commit = /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '')
    ? process.env.VERCEL_GIT_COMMIT_SHA
    : null;
  return {
    service: 'localpulse-email-tracker',
    version: 3,
    ready: Boolean(
      process.env.LOCALPULSE_TRACKER_PUBLIC_URL &&
      process.env.LOCALPULSE_TRACKER_SIGNING_SECRET &&
      (!process.env.VERCEL || durableQueue),
    ),
    purpose: 'Encrypted image-request counts and timestamps only.',
    source: `${SOURCE}/tree/${commit ?? 'main'}/tools/email-tracker`,
    commit,
    collected: [
      'Random mailbox ID',
      'Random event ID',
      'Ephemeral public key',
      'AES-GCM nonce and encrypted image-request timestamp',
    ],
    neverAccepted: [
      'Email subject',
      'Email body',
      'Email content',
      'Recipient address',
      'Destination links',
    ],
    applicationLogs: false,
    cookies: false,
    analytics: false,
    privateKeyLocation:
      'Only in the user extension and password-encrypted backups. Never sent to this server.',
    deletion:
      'Events are deleted only after a signed acknowledgement from the user extension. No time-based expiry.',
    limits: { queuedEventsPerMailbox: 1000, eventsPerFetch: 100 },
    reliability:
      'Image requests can come from mail proxies and scanners. They do not prove a human read or delivery.',
    visibility:
      'Code and policy are public. Encrypted events are accessible to anyone with the mailbox capability; no public mailbox directory.',
    hosting: {
      compute: process.env.VERCEL ? 'Vercel' : 'Self-hosted Node',
      queue: durableQueue
        ? 'Upstash Redis'
        : process.env.VERCEL
          ? 'Not configured; tracking unavailable'
          : 'Development memory; lost on restart',
    },
    hostingMetadata:
      'Hosting providers handle network addresses, request timing and URLs under their own policies. Encryption does not hide traffic patterns.',
    links: {
      vercelPrivacy: 'https://vercel.com/legal/privacy-policy',
      upstashPrivacy: 'https://upstash.com/trust/privacy.pdf',
    },
  };
}
export function landingPage() {
  const info = transparency();
  const escape = (text) =>
    String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LocalPulse · Open email activity service</title><style>body{margin:0;background:#f5f4ed;color:#20382e;font:17px/1.6 system-ui}main{max-width:760px;margin:auto;padding:64px 24px}a{color:#087751}h1{font-size:clamp(32px,6vw,52px);line-height:1.1}section{border-top:1px solid #bac9bf;padding:24px 0}.badge{font-size:13px;letter-spacing:.1em;text-transform:uppercase}code{overflow-wrap:anywhere}li{margin:8px 0}</style><main><p class="badge">LocalPulse · Open source · MIT</p><h1>Know what this server does.</h1><p>This optional service records only requests for a tracking image. It encrypts each request timestamp for your extension; your extension decrypts timestamps and counts them.</p><section><h2>Your email content stays out</h2><p>The API rejects subjects, bodies, recipient addresses, message text and destination links. Your private encryption and signing keys stay in your extension. Backups are encrypted with your password.</p></section><section><h2>Encrypted while waiting. Deleted when collected.</h2><p>Queued values contain random IDs, an ephemeral public key, a nonce and encrypted timestamp. The extension saves decrypted results locally, then signs an acknowledgement that deletes those events. Tracking images and uncollected events have no expiry. Up to 1,000 events can wait per image; a full queue can miss activity.</p><p>Code and policies are public. Anyone with a mailbox capability can inspect its encrypted events. There is no browsable mailbox directory. Publishing ciphertext everywhere would still expose timing and traffic patterns.</p></section><section><h2>Activity is an estimate</h2><p>Mail apps can preload images, block them or serve cached copies. An image request cannot prove that a person read an email, identify a recipient or prove delivery.</p></section><section><h2>Hosting is part of the privacy picture</h2><p>Runtime: ${escape(info.hosting.compute)}. Queue: ${escape(info.hosting.queue)}. This application sets no cookies, analytics or access logs. Hosting providers still handle network metadata and may retain platform logs under their policies.</p><p><a href="https://vercel.com/legal/privacy-policy">Vercel privacy</a> · <a href="https://upstash.com/trust/privacy.pdf">Upstash privacy</a></p></section><section><h2>Inspect the implementation</h2><p><a href="${escape(info.source)}">Public source for this deployment</a> · <a href="/transparency">Machine-readable disclosure</a> · <a href="${SOURCE}/commits/main/tools/email-tracker">Change history</a></p><p>Commit: <code>${escape(info.commit ?? 'Development; no Git deployment commit')}</code></p></section></main></html>`;
}
