import { browser } from '#imports';

type DataCollectionPermissions = {
  request(permissions: { data_collection: string[] }): Promise<boolean>;
  contains(permissions: { data_collection: string[] }): Promise<boolean>;
};

/**
 * Firefox: page content may only go to a cloud provider after the user grants the optional
 * "websiteContent" data-collection permission declared in the manifest. Firefox only shows the
 * prompt from a user action, so call this first thing in a click handler, before any await.
 */
export function requestFirefoxDataConsent(): Promise<boolean> {
  if (!import.meta.env.FIREFOX) return Promise.resolve(true);
  const permissions = browser.permissions as unknown as DataCollectionPermissions;
  return permissions.request({ data_collection: ['websiteContent'] }).catch(() => false);
}

/**
 * Firefox: whether page content may go to a cloud provider right now. The user can take the
 * permission back in about:addons at any time, so check it before every cloud request.
 */
export async function hasFirefoxDataConsent(): Promise<boolean> {
  if (!import.meta.env.FIREFOX) return true;
  const permissions = browser.permissions as unknown as DataCollectionPermissions;
  return permissions.contains({ data_collection: ['websiteContent'] }).catch(() => false);
}

/** Opens the Firefox sidebar or the Chrome side panel for the current window. From a click only. */
export async function openPanelFromPage(): Promise<void> {
  if (import.meta.env.FIREFOX) {
    const sidebar = (browser as unknown as { sidebarAction?: { open(): Promise<void> } })
      .sidebarAction;
    await sidebar?.open();
    return;
  }
  const current = await browser.windows.getCurrent();
  if (current.id !== undefined) await browser.sidePanel.open({ windowId: current.id });
}
