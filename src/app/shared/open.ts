import { browser } from '#imports';

/** Opens the settings page, optionally at a section (e.g. "providers"). */
export async function openSettings(section?: string): Promise<void> {
  const url = browser.runtime.getURL(`/options.html${section ? `#${section}` : ''}`);
  await browser.tabs.create({ url });
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** The panel shortcut as users see it on their platform. */
export function panelShortcut(): string {
  return isMac() ? '⌥⇧L' : 'Alt+Shift+L';
}

/** "Google Gemini (gemini-x)" → "Google Gemini", for use in sentences and buttons. */
export function providerName(label: string): string {
  return label.replace(/ \([^)]*\)$/, '');
}

export function domainOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
