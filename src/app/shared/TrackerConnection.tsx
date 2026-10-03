import { useState } from 'react';
import { Check, Globe, ShieldCheck } from 'lucide-react';
import { browser } from '#imports';
import { Button, TextInput } from '@/components/ui';
import {
  DEFAULT_TRACKER_URL,
  normalizeTrackerUrl,
  trackingPermissionPattern,
} from '@/core/email-tracking';
import { connectTracker, disconnectTracker } from '@/storage/email-tracker';
import { t } from './i18n';

export function trackerErrorMessage(failure: unknown): string {
  const code = failure instanceof Error ? failure.message : '';
  switch (code) {
    case 'password':
      return t('readTracking.passwordError');
    case 'backupExists':
      return t('readTracking.backupExists');
    case 'limit':
      return t('readTracking.limit');
    case 'unavailable':
      return t('readTracking.unavailable');
    case 'permission':
      return t('readTracking.permissionError');
    case 'clipboard':
      return t('readTracking.clipboardError');
    default:
      return t('readTracking.failed');
  }
}

/** Explicit opt-in connection, shared by first-run setup and the tracking panel. No fetch on mount. */
export function TrackerConnection({
  connected,
  disabled = false,
  onConnected,
  onDisconnected,
  onBusyChange,
}: {
  connected: string;
  disabled?: boolean;
  onConnected: (base: string) => Promise<void> | void;
  onDisconnected?: () => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [draft, setBase] = useState<string>();
  const base = draft ?? (connected || DEFAULT_TRACKER_URL);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = normalizeTrackerUrl(base.trim());
  const locked = disabled || busy;

  function connect() {
    const url = normalizeTrackerUrl(base.trim());
    if (!url) {
      setError(t('tracking.invalidUrl'));
      return;
    }
    // Permission requests must originate directly from the user's click, before awaiting.
    const permission = browser.permissions.request({ origins: [trackingPermissionPattern(url)] });
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    void (async () => {
      try {
        if (!(await permission)) throw new Error('permission');
        await connectTracker(url);
        setBase(undefined);
        await onConnected(url);
      } catch (failure) {
        setError(trackerErrorMessage(failure));
      } finally {
        setBusy(false);
        onBusyChange?.(false);
      }
    })();
  }

  return (
    <section
      className="space-y-3 rounded-xl border border-line bg-paper p-3"
      aria-label={t('readTracking.connection')}
    >
      <div className="flex items-start gap-2.5">
        {connected ? (
          <Check className="mt-0.5 h-4 w-4 flex-none text-local" aria-hidden />
        ) : (
          <Globe className="mt-0.5 h-4 w-4 flex-none text-local" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="font-medium">
            {connected ? t('readTracking.connected') : t('readTracking.publicService')}
          </p>
          <p className="break-all text-xs text-muted">
            {connected || (custom ? selected : DEFAULT_TRACKER_URL)}
          </p>
        </div>
      </div>
      {!connected && <p className="text-sm text-muted">{t('readTracking.connectionNote')}</p>}
      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-local" aria-hidden />
        <span>{t('readTracking.contentStays')}</span>
      </p>
      <details open={custom} onToggle={(event) => setCustom(event.currentTarget.open)}>
        <summary className="cursor-pointer text-xs text-muted">
          {t('readTracking.customServer')}
        </summary>
        <label className="mt-3 block text-sm">
          {t('tracking.serverUrl')}
          <TextInput
            className="mt-1"
            type="url"
            value={base}
            maxLength={2048}
            disabled={locked}
            onChange={(event) => setBase(event.target.value)}
          />
        </label>
        <Button
          size="sm"
          className="mt-2"
          disabled={locked}
          onClick={() => setBase(DEFAULT_TRACKER_URL)}
        >
          {t('readTracking.usePublic')}
        </Button>
      </details>
      {selected && (
        <a
          className="block text-xs text-local underline"
          href={`${selected}/`}
          target="_blank"
          rel="noreferrer"
        >
          {t('readTracking.transparency')}
        </a>
      )}
      <div className="flex flex-wrap gap-2">
        {(!connected || base.trim() !== connected) && (
          <Button variant="primary" className="w-full" wrap disabled={locked} onClick={connect}>
            {busy ? t('readTracking.connecting') : t('readTracking.enable')}
          </Button>
        )}
        {connected && onDisconnected && (
          <Button
            size="sm"
            disabled={locked}
            onClick={() => {
              setBusy(true);
              onBusyChange?.(true);
              setError('');
              void disconnectTracker()
                .then(() => setBase(undefined))
                .then(onDisconnected)
                .catch((failure) => setError(trackerErrorMessage(failure)))
                .finally(() => {
                  setBusy(false);
                  onBusyChange?.(false);
                });
            }}
          >
            {t('tracking.disconnect')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
