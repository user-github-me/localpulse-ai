import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import { Button, Dialog, TextInput } from '@/components/ui';
import { normalizeTrackerUrl, trackingPermissionPattern } from '@/core/email-tracking';
import {
  collectReadActivity,
  connectTracker,
  createReadTracker,
  disconnectTracker,
  exportReadBackup,
  getTrackerUrl,
  importReadBackup,
  listReadTrackers,
  readTrackerHtml,
  removeReadTracker,
  type ReadTracker,
} from '@/storage/email-tracker';
import { downloadHistoryFile } from '@/storage/history-export';
import { t } from '../../shared/i18n';

export function EmailTracking({ onClose }: { onClose: () => void }) {
  const [base, setBase] = useState('');
  const [connected, setConnected] = useState('');
  const [trackers, setTrackers] = useState<ReadTracker[]>([]);
  const [selected, setSelected] = useState<ReadTracker>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [removing, setRemoving] = useState<ReadTracker>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([getTrackerUrl(), listReadTrackers()])
      .then(([url, list]) => {
        if (active) {
          setBase(url);
          setConnected(url);
          setTrackers(list);
        }
      })
      .catch(() => {
        if (active) setError(t('readTracking.failed'));
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : '';
      setError(
        t(
          code === 'password'
            ? 'readTracking.passwordError'
            : code === 'backupExists'
              ? 'readTracking.backupExists'
              : code === 'limit'
                ? 'readTracking.limit'
                : code === 'unavailable'
                  ? 'readTracking.unavailable'
                  : 'readTracking.failed',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function connect() {
    const url = normalizeTrackerUrl(base.trim());
    if (!url) {
      setError(t('tracking.invalidUrl'));
      return;
    }
    const permission = browser.permissions.request({ origins: [trackingPermissionPattern(url)] });
    void run(async () => {
      if (!(await permission)) throw new Error('permission');
      await connectTracker(url);
      setConnected(url);
      setBase(url);
      setTrackers(await listReadTrackers());
      setSelected(undefined);
      setNotice(t('readTracking.connected'));
    });
  }
  return (
    <Dialog open onClose={onClose} title={t('readTracking.title')}>
      <div
        className="max-h-[75vh] space-y-4 overflow-y-auto text-[0.82rem]"
        tabIndex={0}
        aria-label={t('readTracking.title')}
      >
        <p className="text-muted">{t('readTracking.note')}</p>
        <p className="rounded-lg border border-line bg-paper p-3 text-muted">
          {t('readTracking.privacy')}
        </p>
        <label className="block">
          {t('tracking.serverUrl')}
          <TextInput
            className="mt-1"
            type="url"
            value={base}
            maxLength={2048}
            disabled={busy}
            onChange={(event) => setBase(event.target.value)}
            placeholder="https://localpulse-email-tracker.vercel.app"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={connect}>
            {t('tracking.connect')}
          </Button>
          {connected && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await disconnectTracker();
                  setConnected('');
                  setTrackers([]);
                  setSelected(undefined);
                })
              }
            >
              {t('tracking.disconnect')}
            </Button>
          )}
        </div>
        {connected && (
          <>
            <a
              className="block break-all text-local underline"
              href={`${connected}/transparency`}
              target="_blank"
              rel="noreferrer"
            >
              {t('readTracking.transparency')}
            </a>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const tracker = await createReadTracker();
                  setSelected(tracker);
                  setTrackers(await listReadTrackers());
                  setNotice(t('readTracking.created'));
                })
              }
            >
              {t('readTracking.create')}
            </Button>
            {selected && (
              <section
                className="space-y-2 rounded-lg border border-line p-3"
                aria-label={t('readTracking.snippet')}
              >
                <h3 className="font-semibold">
                  {t('readTracking.image')} {selected.id.slice(0, 8)}
                </h3>
                <p className="text-muted">{t('readTracking.paste')}</p>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (!navigator.clipboard.write || typeof ClipboardItem === 'undefined')
                        throw new Error('clipboard');
                      await navigator.clipboard.write([
                        new ClipboardItem({
                          'text/html': new Blob([readTrackerHtml(selected)], { type: 'text/html' }),
                          'text/plain': new Blob([''], { type: 'text/plain' }),
                        }),
                      ]);
                      setNotice(t('readTracking.copied'));
                    })
                  }
                >
                  {t('tracking.copyRich')}
                </Button>{' '}
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(readTrackerHtml(selected));
                      setNotice(t('tracking.htmlCopied'));
                    })
                  }
                >
                  {t('tracking.copyHtml')}
                </Button>
                <details>
                  <summary>{t('tracking.viewHtml')}</summary>
                  <pre className="whitespace-pre-wrap break-all text-xs">
                    {readTrackerHtml(selected)}
                  </pre>
                </details>
              </section>
            )}
            <section
              className="space-y-2 border-t border-line pt-3"
              aria-label={t('readTracking.results')}
            >
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const next = await collectReadActivity();
                    setTrackers([...next]);
                    setSelected((current) => next.find((tracker) => tracker.id === current?.id));
                    setNotice(t('readTracking.collected'));
                  })
                }
              >
                {t('readTracking.collect')}
              </Button>
              <p className="text-muted">{t('readTracking.reliability')}</p>
              <ul className="space-y-3">
                {trackers.map((tracker) => (
                  <li className="rounded-lg border border-line p-3" key={tracker.id}>
                    <button
                      type="button"
                      className="font-medium text-local"
                      onClick={() => setSelected(tracker)}
                    >
                      {t('readTracking.image')} {tracker.id.slice(0, 8)}
                    </button>
                    <p>{t('readTracking.count', { count: tracker.reads.length })}</p>
                    <details>
                      <summary>{t('readTracking.times')}</summary>
                      <ul className="max-h-40 overflow-y-auto">
                        {tracker.reads
                          .slice(-100)
                          .reverse()
                          .map((read) => (
                            <li key={read.id}>{new Date(read.at).toLocaleString()}</li>
                          ))}
                      </ul>
                    </details>
                    <Button size="sm" disabled={busy} onClick={() => setRemoving(tracker)}>
                      {t('readTracking.remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <section
          className="space-y-2 border-t border-line pt-3"
          aria-label={t('readTracking.backup')}
        >
          <h3 className="font-semibold">{t('readTracking.backup')}</h3>
          <p className="text-muted">{t('readTracking.backupNote')}</p>
          <label className="block">
            {t('readTracking.password')}
            <TextInput
              className="mt-1"
              type="password"
              autoComplete="new-password"
              value={password}
              maxLength={1000}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || password.length < 12}
              onClick={() =>
                void run(async () => {
                  const content = await exportReadBackup(password);
                  downloadHistoryFile(content, 'localpulse-read-backup.json', 'application/json');
                  setPassword('');
                  setNotice(t('readTracking.backedUp'));
                })
              }
            >
              {t('readTracking.export')}
            </Button>
            <Button
              size="sm"
              disabled={busy || password.length < 12}
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
                setTrackers(await listReadTrackers());
                setPassword('');
                setNotice(t('readTracking.imported'));
              });
            }}
          />
        </section>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-muted">
            {notice}
          </p>
        )}
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
                  setTrackers(await listReadTrackers());
                  setSelected((current) => (current?.id === tracker.id ? undefined : current));
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
