import { browser } from '#imports';
import type { ExtractedPage } from '@/extractors/types';
import { errorMessage } from '@/lib/errors';
import { t } from '../shared/i18n';

export type TabStatus = 'idle' | 'loading' | 'ready' | 'no-access' | 'restricted' | 'error';

export interface TabContext {
  status: TabStatus;
  tabId?: number;
  page?: ExtractedPage;
  /** Plain-language reason for restricted and error states, or progress while loading. */
  message?: string;
  /** Match pattern to request when access to one site is needed (e.g. to download a PDF). */
  sitePattern?: string;
}

/**
 * End-to-end tests open the panel as a normal tab and pass the tab to read as `?tab=<id>`.
 * Only in the e2e build; production builds drop this code.
 */
export function forcedTabId(): number | undefined {
  if (import.meta.env.MODE !== 'e2e') return undefined;
  const value = new URLSearchParams(location.search).get('tab');
  return value ? Number(value) : undefined;
}

export async function activeTabId(): Promise<number | undefined> {
  const forced = forcedTabId();
  if (forced !== undefined) return forced;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

const RESTRICTED =
  /chrome:\/\/|edge:\/\/|brave:\/\/|opera:\/\/|vivaldi:\/\/|about:|chrome-extension:\/\/|moz-extension:\/\/|extensions gallery|webstore|view-source:|devtools:|chrome-search:/i;

/** Classifies an executeScript failure. */
export function classifyInjectionError(message: string): Pick<TabContext, 'status' | 'message'> {
  if (/file:\/\//i.test(message)) {
    return {
      status: 'restricted',
      message: t('context.restrictedFile'),
    };
  }
  if (RESTRICTED.test(message)) {
    return {
      status: 'restricted',
      message: t('context.restrictedPage'),
    };
  }
  if (/cannot access|permission|not allowed/i.test(message)) return { status: 'no-access' };
  if (/no tab with id|frame with id|tab was closed/i.test(message)) {
    return { status: 'idle' };
  }
  return { status: 'error', message };
}

/** Injects the extractor into the tab and returns what it read. */
export async function readTab(tabId: number): Promise<TabContext> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      files: ['/extractor.js'],
    });
    const page = injection?.result as ExtractedPage | undefined;
    if (!page || typeof page !== 'object') {
      return { status: 'error', tabId, message: t('context.noContent') };
    }
    return { status: 'ready', tabId, page };
  } catch (error) {
    return { tabId, ...classifyInjectionError(errorMessage(error)) };
  }
}

/** Shows a request for this site in the browser's own UI (Chrome 133+), if available. */
export async function requestSiteAccessInBrowser(tabId: number): Promise<void> {
  const permissions = browser.permissions as typeof browser.permissions & {
    addHostAccessRequest?: (request: { tabId: number }) => Promise<void>;
  };
  try {
    await permissions.addHostAccessRequest?.({ tabId });
  } catch {
    // Not supported or already granted.
  }
}

export async function requestAllSitesAccess(): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

export async function requestOriginAccess(pattern: string): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}
