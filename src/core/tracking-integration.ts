import { browser, type Browser } from '#imports';
import { WEBMAIL_HOSTS, WEBMAIL_ORIGINS, isSupportedWebmail } from './webmail';
import {
  allocateDraftTracker,
  collectReadActivity,
  getTrackerUrl,
  listReadTrackers,
  reserveFirstTracker,
} from '@/storage/email-tracker';
import {
  getTrackingOptions,
  setTrackingOptions,
  trackingOptionsItem,
} from '@/storage/tracking-options';
import { READ_UUID } from './tracker-crypto';
import { t } from '@/app/shared/i18n';
const SCRIPT_ID = 'localpulse-webmail';
const ALARM = 'localpulse-read-activity';
const RULE_START = 5000;
function onReadActivityAlarm(alarm: { name: string }): void {
  if (alarm.name === ALARM) void collectAndNotify().catch(() => {});
}
/** Chrome exposes optional API namespaces only after the permission has been granted. */
function registerAlarmListener(): void {
  const event = browser.alarms?.onAlarm;
  if (event && !event.hasListener(onReadActivityAlarm)) event.addListener(onReadActivityAlarm);
}
let syncing = Promise.resolve();
/** Blocks direct/proxied image loads initiated by the owner's supported webmail pages. */
export async function syncOwnerPixelRules(): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  if (!dnr?.updateDynamicRules) return;
  const trackers = await listReadTrackers();
  const old = await dnr.getDynamicRules();
  await dnr.updateDynamicRules({
    removeRuleIds: old
      .filter((rule) => rule.id >= RULE_START && rule.id < RULE_START + 100)
      .map((rule) => rule.id),
    addRules: trackers.slice(0, 100).map(
      (tracker, index) =>
        ({
          id: RULE_START + index,
          priority: 2,
          action: { type: 'block' },
          condition: {
            urlFilter: tracker.token,
            initiatorDomains: WEBMAIL_HOSTS,
            resourceTypes: ['image'],
          },
        }) as unknown as Browser.declarativeNetRequest.Rule,
    ),
  });
}
export function syncTrackingIntegration(): Promise<void> {
  syncing = syncing
    .catch(() => {})
    .then(() =>
      navigator.locks.request('localpulse-tracking-integration', async () => {
        const options = await getTrackingOptions();
        const connected = await getTrackerUrl();
        const scripts = await browser.scripting.getRegisteredContentScripts();
        const registered = scripts.some((s) => s.id === SCRIPT_ID);
        const allowed =
          options.automatic &&
          Boolean(connected) &&
          (await browser.permissions.contains({ origins: WEBMAIL_ORIGINS }));
        if (allowed && !registered) {
          await browser.scripting.registerContentScripts([
            {
              id: SCRIPT_ID,
              matches: WEBMAIL_ORIGINS,
              js: ['webmail.js'],
              runAt: 'document_idle',
              persistAcrossSessions: true,
            },
          ]);
          const tabs = await browser.tabs.query({});
          for (const tab of tabs)
            if (tab.id !== undefined && tab.url && isSupportedWebmail(tab.url) && !tab.incognito)
              await browser.scripting
                .executeScript({ target: { tabId: tab.id }, files: ['/webmail.js'] })
                .catch(() => {});
        } else if (!allowed && registered)
          await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
        await syncOwnerPixelRules();
        if (
          connected &&
          (options.automatic || options.notifications) &&
          (await browser.permissions.contains({ permissions: ['alarms'] }))
        ) {
          registerAlarmListener();
          await browser.alarms.create(ALARM, { periodInMinutes: 15 });
        } else await browser.alarms?.clear(ALARM);
      }),
    );
  return syncing;
}
export async function enableAutomaticTracking(): Promise<void> {
  await reserveFirstTracker();
  await setTrackingOptions({ automatic: true });
  await syncTrackingIntegration();
}
let lastCollection = 0;
let collecting: Promise<void> | undefined;
export function collectAndNotify(): Promise<void> {
  if (collecting) return collecting;
  if (Date.now() - lastCollection < 10000) return Promise.resolve();
  collecting = (async () => {
    const options = await getTrackingOptions();
    if ((!options.automatic && !options.notifications) || !(await getTrackerUrl())) return;
    const before = await listReadTrackers();
    const after = await collectReadActivity();
    lastCollection = Date.now();
    const count = after.reduce(
      (n, t) =>
        n + Math.max(0, t.reads.length - (before.find((b) => b.id === t.id)?.reads.length ?? 0)),
      0,
    );
    if (
      count &&
      options.notifications &&
      (await browser.permissions.contains({ permissions: ['notifications'] }))
    )
      await browser.notifications?.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icons/128.png'),
        title: t('trackingAuto.notificationTitle'),
        message: t('trackingAuto.notificationBody', { count: String(count) }),
      });
  })().finally(() => {
    collecting = undefined;
  });
  return collecting;
}
export function registerTrackingBackground(): void {
  trackingOptionsItem.watch(() => void syncTrackingIntegration().catch(() => {}));
  browser.permissions.onRemoved.addListener(() => void syncTrackingIntegration().catch(() => {}));
  browser.permissions.onAdded.addListener(() => void syncTrackingIntegration().catch(() => {}));
  registerAlarmListener();
  browser.runtime.onMessage.addListener(async (message: unknown, sender) => {
    if (!message || typeof message !== 'object') return;
    const data = message as Record<string, unknown>;
    if (data.type !== 'localpulse:webmail') return;
    if (
      sender.id !== browser.runtime.id ||
      !sender.url ||
      !isSupportedWebmail(sender.url) ||
      sender.tab?.incognito
    )
      return { ok: false };
    const options = await getTrackingOptions();
    if (
      !options.automatic ||
      !(await getTrackerUrl()) ||
      !(await browser.permissions.contains({ origins: WEBMAIL_ORIGINS }))
    )
      return { ok: false, disabled: true };
    try {
      if (
        data.action === 'allocate' &&
        Object.keys(data).length === 3 &&
        typeof data.draftId === 'string' &&
        READ_UUID.test(data.draftId)
      ) {
        const tracker = await allocateDraftTracker(data.draftId);
        await syncOwnerPixelRules();
        return { ok: true, ...tracker };
      }
      if (
        data.action === 'status' &&
        Object.keys(data).length === 3 &&
        Array.isArray(data.tokens) &&
        data.tokens.length <= 100 &&
        data.tokens.every(
          (token) => typeof token === 'string' && /^[a-zA-Z0-9_-]{16,3000}$/.test(token),
        )
      ) {
        const tokens = new Set(data.tokens);
        return {
          ok: true,
          activity: (await listReadTrackers())
            .filter((t) => tokens.has(t.token))
            .map((t) => ({
              token: t.token,
              count: t.reads.length,
              lastAt: t.reads.at(-1)?.at ?? null,
            })),
        };
      }
      if (
        data.action === 'refresh' &&
        Object.keys(data).length === 3 &&
        typeof data.token === 'string' &&
        (await listReadTrackers()).some((tracker) => tracker.token === data.token)
      ) {
        await collectAndNotify();
        return { ok: true };
      }
      if (data.action === 'ready' && Object.keys(data).length === 2) return { ok: true };
      return { ok: false };
    } catch {
      return { ok: false, error: true };
    }
  });
  void syncTrackingIntegration().catch(() => {});
}
