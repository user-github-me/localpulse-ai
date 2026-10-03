import { registerTrackingBackground, syncTrackingIntegration } from '@/core/tracking-integration';
import { i18n } from '#i18n';
import { browser, defineBackground, type Browser } from '#imports';
import { syncLocalOriginRules } from '@/providers/local-origin';
import { pendingActionItem, type PendingAction } from '@/storage/pending';
import { getSettings, watchSettings } from '@/storage/settings';

/** Right-click menu items and the quick action each one runs. */
const MENU_ITEMS = [
  {
    id: 'lp-summarize-page',
    title: 'menu.summarizePage',
    contexts: ['page'],
    recipeId: 'summarize',
  },
  { id: 'lp-explain', title: 'menu.explain', contexts: ['selection'], recipeId: 'explain' },
  {
    id: 'lp-summarize-selection',
    title: 'menu.summarize',
    contexts: ['selection'],
    recipeId: 'summarize',
  },
  { id: 'lp-simplify', title: 'menu.simplify', contexts: ['selection'], recipeId: 'simplify' },
  { id: 'lp-rewrite', title: 'menu.rewrite', contexts: ['selection'], recipeId: 'rewrite' },
  { id: 'lp-proofread', title: 'menu.proofread', contexts: ['selection'], recipeId: 'proofread' },
  { id: 'lp-translate', title: 'menu.translate', contexts: ['selection'], recipeId: 'translate' },
] as const;

export default defineBackground(() => {
  // Keep private keys/settings inaccessible to isolated content scripts on Chromium.
  const localStorage = browser.storage.local as unknown as {
    setAccessLevel?: (options: { accessLevel: string }) => Promise<void>;
  };
  void localStorage.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  registerTrackingBackground();
  // Open the panel from our own click handler: that click also grants activeTab for the tab.
  // openPanelOnActionClick would open it without tab access.
  if (!import.meta.env.FIREFOX) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }

  browser.action.onClicked.addListener((tab) => {
    openPanel(tab);
    notifyPanel(tab);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'summarize-page' || !tab) return;
    openPanel(tab);
    void queueAction({ recipeId: 'summarize', tabId: tab.id, windowId: tab.windowId });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const item = MENU_ITEMS.find((menu) => menu.id === info.menuItemId);
    if (!item || !tab) return;
    openPanel(tab);
    const selection = item.contexts[0] === 'selection' ? info.selectionText : undefined;
    void queueAction({
      recipeId: item.recipeId,
      tabId: tab.id,
      windowId: tab.windowId,
      selection,
      // The selection's own address decides the never-send list and consent, whatever the panel
      // is showing. A frame from another site is checked together with the page around it.
      url: selection ? (info.frameUrl ?? info.pageUrl) : undefined,
      pageUrl: selection ? info.pageUrl : undefined,
    });
  });

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    await createMenus();
    await syncLocalOriginRules((await getSettings()).endpoints);
    if (reason === 'install') {
      await browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    await syncTrackingIntegration();
    await syncLocalOriginRules((await getSettings()).endpoints);
  });

  watchSettings((settings) => void syncLocalOriginRules(settings.endpoints).catch(() => {}));
});

/** Must run synchronously inside the user's click, or the browser refuses to open the panel. */
function openPanel(tab: Browser.tabs.Tab): void {
  if (import.meta.env.FIREFOX) {
    const sidebar = (browser as unknown as { sidebarAction?: { open(): Promise<void> } })
      .sidebarAction;
    void sidebar?.open().catch(() => {});
    return;
  }
  if (tab.windowId === undefined) return;
  void browser.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
}

/** Tells an open panel that it may now read this tab. */
function notifyPanel(tab: Browser.tabs.Tab): void {
  void browser.runtime
    .sendMessage({ type: 'localpulse:tab-access', tabId: tab.id, windowId: tab.windowId })
    .catch(() => {
      // No panel is listening yet; it reads the tab when it opens.
    });
}

async function queueAction(action: Omit<PendingAction, 'id' | 'createdAt'>) {
  await pendingActionItem.setValue({ ...action, id: crypto.randomUUID(), createdAt: Date.now() });
}

async function createMenus(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: 'lp-root',
    title: i18n.t('menu.root'),
    contexts: ['page', 'selection'],
  });
  for (const item of MENU_ITEMS) {
    browser.contextMenus.create({
      id: item.id,
      parentId: 'lp-root',
      // Titles are looked up here, not at load: WXT also imports this file in Node while building.
      title: i18n.t(item.title),
      contexts: [...item.contexts],
    });
  }
}
