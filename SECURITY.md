# Security policy

## Reporting a problem

Please report security problems privately through GitHub: on this repository, open **Security →
Report a vulnerability**. Don't open a public issue for a security problem.

Include what you found, how to reproduce it, and which browser and version you used. You'll get a
reply within a week. Fixes for confirmed issues ship in a new release, and reporters are credited
unless they prefer not to be.

## What counts

We especially want to hear about:

- **Page content leaving the device without consent**: any way content reaches a cloud provider
  when Local-only mode is on, for a site on the never-send list, or without the user agreeing.
- **Prompt injection that leaks data or acts for the user**: a web page that makes LocalPulse send
  data somewhere, for example through links or images in an answer.
- **Script injection (XSS)** in the side panel, settings or welcome pages.
- **API keys exposed** to web pages, other extensions or logs.
- **Optional tracking server:** private-key exposure, malformed capabilities, unauthorized event
  deletion, cryptographic tampering, email content accepted outside the strict public-key/event
  API, unintended plaintext timestamp or recipient metadata storage, or unbounded requests.

AI Local-only mode governs AI requests. A user's explicitly connected email read tracker is a
separate network feature. Image activity can come from proxies or scanners and is not a verified
read receipt. The server accepts only public keys and event capabilities, encrypts timestamps
before queue storage, and requires owner signatures to delete exact event IDs. Public code and
machine-readable deployment disclosures allow review. Private keys stay in browser-local storage
and password-encrypted backups; local storage itself is not password-encrypted. Hosting metadata,
finite queues, no expiry and provider quotas remain part of the threat model. See
[the service implementation and deployment policy](tools/email-tracker/README.md).

Only the latest release is supported.
