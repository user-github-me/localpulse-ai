import { useEffect, useState } from 'react';
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

/** Browser-reported OS wins over user-agent compatibility strings. */
export async function platformIsMac(): Promise<boolean> {
  try {
    return (await browser.runtime.getPlatformInfo()).os === 'mac';
  } catch {
    return isMac();
  }
}
export function formatShortcut(shortcut: string, mac: boolean): string {
  if (!mac)
    return shortcut
      .replace(/MacCtrl/g, 'Ctrl')
      .replace(/Command/g, 'Ctrl')
      .replace(/Option/g, 'Alt');
  const symbols: Record<string, string> = {
    Command: '⌘',
    Ctrl: '⌘',
    MacCtrl: '⌃',
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
    Meta: '⌘',
  };
  return shortcut
    .split('+')
    .map((key) => symbols[key] ?? key)
    .join('');
}
export function usePanelShortcut(): string {
  const [shortcut, setShortcut] = useState(panelShortcut);
  useEffect(() => {
    let active = true;
    void Promise.all([platformIsMac(), browser.commands.getAll().catch(() => [])]).then(
      ([mac, commands]) => {
        const command = commands.find((command) => command.name === '_execute_action');
        const configured = command ? command.shortcut : 'Alt+Shift+L';
        if (active) setShortcut(configured ? formatShortcut(configured, mac) : '');
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return shortcut;
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
