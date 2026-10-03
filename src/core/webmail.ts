export const WEBMAIL_ORIGINS = [
  'https://mail.google.com/*',
  'https://outlook.live.com/*',
  'https://outlook.office.com/*',
  'https://outlook.office365.com/*',
];
export const WEBMAIL_HOSTS = WEBMAIL_ORIGINS.map((value) => new URL(value).hostname);
export function isSupportedWebmail(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && WEBMAIL_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
/** Site adapters read editor identity/structure only, never its contents or addressing fields. */
export function composeEditors(root: Document, host: string): HTMLElement[] {
  const selector =
    host === 'mail.google.com'
      ? '.Am[contenteditable="true"][role="textbox"], [g_editable="true"][contenteditable="true"]'
      : '[contenteditable="true"][role="textbox"][aria-multiline="true"], [contenteditable="true"][aria-label="Message body"]';
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (editor) => !editor.closest('[data-localpulse-tools]'),
  );
}
export function tokenFromImageSource(source: string): string | undefined {
  // Gmail/Outlook proxy URLs can contain the original escaped image URL in a suffix.
  let text = source;
  for (let attempt = 0; attempt < 3; attempt++) {
    const match = /\/p\/([a-zA-Z0-9_-]{16,3000})\.gif(?:[?#&]|$)/.exec(text);
    if (match) return match[1];
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch {
      break;
    }
  }
  return;
}
