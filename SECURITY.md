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

Only the latest release is supported.
