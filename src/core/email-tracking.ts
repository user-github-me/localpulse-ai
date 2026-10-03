/** Only HTTPS services or loopback development servers may receive tracking requests. */
export function normalizeTrackerUrl(value: string): string | undefined {
  if (
    value.length > 2048 ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) ||
    [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
  )
    return undefined;
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    )
      return undefined;
    return url.href.replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}
export function trackingPermissionPattern(base: string): string {
  const url = new URL(base);
  return `${url.protocol}//${url.hostname}/*`;
}
