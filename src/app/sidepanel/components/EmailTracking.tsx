import { browser } from '#imports';
import { WEBMAIL_ORIGINS } from '@/core/webmail';
import { enableAutomaticTracking, syncTrackingIntegration } from '@/core/tracking-integration';
import {
  getTrackingOptions,
  setTrackingOptions,
  type TrackingOptions,
} from '@/storage/tracking-options';
import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Dialog, TextInput } from '@/components/ui';
import {
  collectReadActivity,
  createReadTracker,
  exportReadBackup,
  getTrackerUrl,
  importReadBackup,
  listReadTrackers,
  readTrackerHtml,
  removeReadTracker,
  renameReadTracker,
  testTrackingService,
  type ReadTracker,
} from '@/storage/email-tracker';
import { downloadHistoryFile } from '@/storage/history-export';
import { TrackerConnection, trackerErrorMessage } from '../../shared/TrackerConnection';
import { t } from '../../shared/i18n';

export function EmailTracking({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<TrackingOptions>({
    automatic: false,
    notifications: false,
  });
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string }>();
  const [query, setQuery] = useState('');
  useEffect(() => {
    void getTrackingOptions().then(setOptions);
  }, []);
  const [connected, setConnected] = useState('');
  const [loading, setLoading] = useState(true);
  const [trackers, setTrackers] = useState<ReadTracker[]>([]);
  const [selected, setSelected] = useState<ReadTracker>();
  const imageName =
    nameDraft?.id === selected?.id ? (nameDraft?.value ?? '') : (selected?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [backupOpen, setBackupOpen] = useState(false);
  const [removing, setRemoving] = useState<ReadTracker>();
  const input = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([getTrackerUrl(), listReadTrackers()])
      .then(([url, list]) => {
        if (active) {
          setConnected(url);
          setTrackers(list);
          setSelected(list[0]);
        }
      })
      .catch((failure) => {
        if (active) setError(trackerErrorMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function refreshLocal() {
    const list = await listReadTrackers();
    setTrackers(list);
    setSelected((current) => list.find((tracker) => tracker.id === current?.id) ?? list[0]);
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      setError(trackerErrorMessage(failure));
      // A failed acknowledgement can follow a successful local save; show those saved reads.
      await refreshLocal().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function openBackup() {
    setBackupOpen(true);
    requestAnimationFrame(() => {
      passwordInput.current?.focus();
    });
  }
  const locked = busy || loading;
  return (
    <Dialog open onClose={onClose} title={t('readTracking.title')}>
      <div
        className="max-h-[75vh] space-y-4 overflow-y-auto text-sm"
        tabIndex={0}
        aria-label={t('readTracking.title')}
      >
        <p className="text-muted">{t('readTracking.intro')}</p>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-danger"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg border border-line bg-paper p-3 text-local">
            {notice}
          </p>
        )}
        {connected ? (
          <>
            <div className="space-y-2 rounded-lg bg-paper px-3 py-2">
              <span className="flex items-center gap-2 text-xs text-local">
                <ShieldCheck className="h-4 w-4 flex-none" aria-hidden />
                {t('readTracking.ready')}
              </span>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">
                  {t('readTracking.serviceSettings')}
                </summary>
                <div className="mt-3">
                  <TrackerConnection
                    connected={connected}
                    disabled={locked}
                    onConnected={async (url) => {
                      setConnected(url);
                      setOptions(await getTrackingOptions());
                      await refreshLocal();
                    }}
                    onDisconnected={() => {
                      setConnected('');
                      setTrackers([]);
                      setSelected(undefined);
                    }}
                  />
                </div>
              </details>
            </div>
            <section
              className="space-y-2 rounded-lg border border-line p-3"
              aria-label={t('trackingAuto.title')}
            >
              <h3 className="font-semibold">{t('trackingAuto.title')}</h3>
              <p className="text-xs text-muted">{t('trackingAuto.intro')}</p>
              <Button
                wrap
                className="w-full"
                disabled={locked}
                onClick={() => {
                  const permission = options.automatic
                    ? Promise.resolve(true)
                    : browser.permissions.request({
                        origins: WEBMAIL_ORIGINS,
                        permissions: ['alarms'],
                      });
                  void run(async () => {
                    if (!(await permission)) throw new Error('permission');
                    if (options.automatic) {
                      await setTrackingOptions({ automatic: false });
                      await syncTrackingIntegration();
                    } else await enableAutomaticTracking();
                    setOptions(await getTrackingOptions());
                    await refreshLocal();
                  });
                }}
              >
                {t(options.automatic ? 'trackingAuto.disable' : 'trackingAuto.enable')}
              </Button>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={options.notifications}
                  disabled={locked}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    const permission = enabled
                      ? browser.permissions.request({ permissions: ['notifications', 'alarms'] })
                      : Promise.resolve(true);
                    void run(async () => {
                      if (!(await permission)) throw new Error('permission');
                      await setTrackingOptions({ notifications: enabled });
                      await syncTrackingIntegration();
                      setOptions(await getTrackingOptions());
                    });
                  }}
                />
                <span>{t('trackingAuto.notifications')}</span>
              </label>
              <p className="text-xs text-muted">{t('trackingAuto.notificationNote')}</p>
              <details>
                <summary className="cursor-pointer text-xs text-muted">
                  {t('trackingAuto.test')}
                </summary>
                <p className="my-2 text-xs text-muted">{t('trackingAuto.testNote')}</p>
                <Button
                  size="sm"
                  disabled={locked}
                  onClick={() =>
                    void run(async () => {
                      await testTrackingService();
                      await refreshLocal();
                      setNotice(t('trackingAuto.testSuccess'));
                    })
                  }
                >
                  {t('trackingAuto.test')}
                </Button>
              </details>
            </section>
            <details open={!options.automatic}>
              <summary className="cursor-pointer font-medium text-muted">
                {t('trackingAuto.manual')}
              </summary>
              <section className="mt-3 space-y-3" aria-label={t('readTracking.createStep')}>
                <h3 className="font-semibold">{t('readTracking.createStep')}</h3>
                <p className="text-xs text-muted">{t('readTracking.createHelp')}</p>
                <Button
                  variant="primary"
                  className="w-full"
                  wrap
                  disabled={locked}
                  onClick={() =>
                    void run(async () => {
                      const tracker = await createReadTracker();
                      setTrackers(await listReadTrackers());
                      setSelected(tracker);
                      setNotice(t('readTracking.created'));
                    })
                  }
                >
                  <Plus className="h-4 w-4 flex-none" aria-hidden />
                  {t('readTracking.create')}
                </Button>
                {selected && (
                  <section
                    className="space-y-3 rounded-xl border border-line bg-paper p-3"
                    aria-label={t('readTracking.snippet')}
                  >
                    <p className="font-medium">
                      {selected.name ||
                        t('readTracking.imageName', { number: selected.id.slice(0, 8) })}
                    </p>
                    <label className="block text-xs">
                      {t('trackingAuto.localName')}
                      <TextInput
                        className="mt-1"
                        maxLength={120}
                        value={imageName}
                        onChange={(e) => setNameDraft({ id: selected.id, value: e.target.value })}
                      />
                    </label>
                    <Button
                      size="sm"
                      disabled={locked}
                      onClick={() =>
                        void run(async () => {
                          await renameReadTracker(selected.id, imageName);
                          await refreshLocal();
                        })
                      }
                    >
                      {t('trackingAuto.saveName')}
                    </Button>
                    <p className="text-xs text-muted">{t('trackingAuto.nameNote')}</p>
                    <p className="text-xs text-muted">{t('readTracking.paste')}</p>
                    <Button
                      className="w-full"
                      wrap
                      disabled={locked}
                      onClick={() =>
                        void run(async () => {
                          if (!navigator.clipboard.write || typeof ClipboardItem === 'undefined')
                            throw new Error('clipboard');
                          await navigator.clipboard.write([
                            new ClipboardItem({
                              'text/html': new Blob([readTrackerHtml(selected)], {
                                type: 'text/html',
                              }),
                              'text/plain': new Blob([''], { type: 'text/plain' }),
                            }),
                          ]);
                          setNotice(t('readTracking.copied'));
                        })
                      }
                    >
                      <Copy className="h-4 w-4 flex-none" aria-hidden />
                      {t('tracking.copyRich')}
                    </Button>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted">
                        {t('readTracking.htmlOptions')}
                      </summary>
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={locked}
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(readTrackerHtml(selected));
                            setNotice(t('tracking.htmlCopied'));
                          })
                        }
                      >
                        {t('tracking.copyHtml')}
                      </Button>
                      <pre className="mt-2 whitespace-pre-wrap break-all">
                        {readTrackerHtml(selected)}
                      </pre>
                    </details>
                    <button
                      type="button"
                      disabled={locked}
                      className="text-xs text-local underline"
                      onClick={openBackup}
                    >
                      {t('readTracking.backupReminder')}
                    </button>
                  </section>
                )}
              </section>
            </details>
            <section
              className="space-y-3 border-t border-line pt-4"
              aria-label={t('readTracking.results')}
            >
              <h3 className="font-semibold">{t('readTracking.results')}</h3>
              <Button
                className="w-full"
                wrap
                disabled={locked || !trackers.length}
                onClick={() =>
                  void run(async () => {
                    await collectReadActivity();
                    await refreshLocal();
                    setNotice(t('readTracking.collected'));
                  })
                }
              >
                <RefreshCw
                  className={`h-4 w-4 flex-none ${busy ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                {busy ? t('readTracking.checking') : t('readTracking.collect')}
              </Button>
              <p className="text-xs text-muted">{t('readTracking.savedThenDeleted')}</p>
              {!trackers.length && (
                <p className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">
                  {t('readTracking.empty')}
                </p>
              )}
              <TextInput
                aria-label={t('trackingAuto.search')}
                placeholder={t('trackingAuto.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul className="space-y-2">
                {trackers
                  .filter(
                    (tracker) =>
                      !tracker.diagnostic &&
                      !tracker.reserved &&
                      (tracker.name || tracker.id)
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()),
                  )
                  .map((tracker) => (
                    <li className="space-y-2 rounded-xl border border-line p-3" key={tracker.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <button
                          type="button"
                          className="font-medium text-local underline"
                          onClick={() => setSelected(tracker)}
                        >
                          {tracker.name ||
                            t('readTracking.imageName', { number: tracker.id.slice(0, 8) })}
                        </button>
                        <span className="font-semibold">
                          {t('readTracking.requests', tracker.reads.length, [
                            tracker.reads.length.toLocaleString(),
                          ])}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {tracker.reads.length
                          ? t('readTracking.lastActivity', {
                              time: new Date(tracker.reads.at(-1)!.at).toLocaleString(),
                            })
                          : t('readTracking.noActivity')}
                      </p>
                      {tracker.reads.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted">
                            {t('readTracking.times')}
                          </summary>
                          <ul className="mt-2 max-h-40 overflow-y-auto">
                            {tracker.reads
                              .slice(-100)
                              .reverse()
                              .map((read) => (
                                <li key={read.id}>{new Date(read.at).toLocaleString()}</li>
                              ))}
                          </ul>
                        </details>
                      )}
                      <button
                        type="button"
                        disabled={locked}
                        className="text-xs text-muted underline"
                        onClick={() => setRemoving(tracker)}
                      >
                        {t('readTracking.remove')}
                      </button>
                    </li>
                  ))}
              </ul>
              <p className="text-xs text-muted">{t('readTracking.reliabilityShort')}</p>
            </section>
          </>
        ) : (
          <section className="space-y-3" aria-label={t('readTracking.connectStep')}>
            <h3 className="font-semibold">{t('readTracking.connectStep')}</h3>
            <TrackerConnection
              automatic
              connected=""
              disabled={locked}
              onConnected={async (url) => {
                setConnected(url);
                setOptions(await getTrackingOptions());
                await refreshLocal();
                setNotice(t('readTracking.connectionComplete'));
              }}
            />
          </section>
        )}
        <details
          open={backupOpen}
          onToggle={(event) => setBackupOpen(event.currentTarget.open)}
          className="border-t border-line pt-3"
        >
          <summary className="cursor-pointer font-medium">{t('readTracking.backup')}</summary>
          <section className="mt-3 space-y-3" aria-label={t('readTracking.backup')}>
            <p className="text-xs text-muted">{t('readTracking.backupSimple')}</p>
            <label className="block text-xs">
              {t('readTracking.password')}
              <TextInput
                ref={passwordInput}
                className="mt-1"
                type="password"
                autoComplete="new-password"
                value={password}
                maxLength={1000}
                disabled={locked}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                wrap
                disabled={locked || password.length < 12}
                onClick={() =>
                  void run(async () => {
                    downloadHistoryFile(
                      await exportReadBackup(password),
                      'localpulse-read-backup.json',
                      'application/json',
                    );
                    setPassword('');
                    setNotice(t('readTracking.backedUp'));
                  })
                }
              >
                {t('readTracking.export')}
              </Button>
              <Button
                size="sm"
                wrap
                disabled={locked || password.length < 12}
                onClick={() => input.current?.click()}
              >
                {t('readTracking.import')}
              </Button>
            </div>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void run(async () => {
                  if (file.size > 7000000) throw new Error('backup');
                  await importReadBackup(await file.text(), password);
                  await refreshLocal();
                  setPassword('');
                  setNotice(t('readTracking.imported'));
                });
              }}
            />
          </section>
        </details>
        <details className="border-t border-line pt-3 text-xs">
          <summary className="cursor-pointer text-muted">
            {t('readTracking.privacyDetails')}
          </summary>
          <div className="mt-3 space-y-3 text-muted">
            <p>{t('readTracking.note')}</p>
            <p>{t('readTracking.privacy')}</p>
            <p>{t('readTracking.reliability')}</p>
            <p>{t('readTracking.hostingNote')}</p>
          </div>
        </details>
        <Button size="sm" className="w-full" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(undefined)}
        title={t('readTracking.remove')}
      >
        <p className="text-sm">{t('readTracking.removeNote')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setRemoving(undefined)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              const tracker = removing;
              if (tracker)
                void run(async () => {
                  await removeReadTracker(tracker.id);
                  await refreshLocal();
                  setRemoving(undefined);
                });
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
