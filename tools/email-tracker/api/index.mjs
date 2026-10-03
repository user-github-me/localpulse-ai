/* global URL */
import { createTrackerHandler } from '../server.mjs';
import { landingPage, transparency } from '../transparency.mjs';
let handler;
export default async function serve(request, response) {
  const path = new URL(request.url, 'https://localhost').pathname;
  if (path === '/' || path === '/transparency' || path === '/api/status') {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.statusCode = 405;
      response.end();
      return;
    }
    response.setHeader(
      'Content-Type',
      path === '/' ? 'text/html; charset=utf-8' : 'application/json',
    );
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    response.end(
      request.method === 'HEAD'
        ? undefined
        : path === '/'
          ? landingPage()
          : JSON.stringify(transparency()),
    );
    return;
  }
  try {
    handler ??= createTrackerHandler();
    await (
      await handler
    )(request, response);
  } catch {
    handler = undefined;
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: 'Encrypted event queue is not configured.' }));
  }
}
