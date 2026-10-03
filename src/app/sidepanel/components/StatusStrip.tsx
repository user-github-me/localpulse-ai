import { Bell, ChevronDown, History, Settings as SettingsIcon, SquarePen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui';
import type { Privacy } from '@/providers/types';
import { t } from '../../shared/i18n';
import { openSettings } from '../../shared/open';
import { usePanel, type ProviderSummary } from '../store';

export function toneOf(privacy: Privacy | undefined): string {
  if (privacy === 'cloud') return 'text-cloud';
  if (privacy === 'on-device') return 'text-local';
  return 'text-muted';
}

/** The top strip: where answers run, with the pulse lamp. */
export function StatusStrip({
  followupsOpen = false,
  onFollowups,
  onHistory,
}: {
  followupsOpen?: boolean;
  onFollowups?: () => void;
  onHistory?: () => void;
}) {
  const preview = usePanel((state) => state.preview);
  const busy = usePanel((state) => state.busy);
  const clear = usePanel((state) => state.clear);
  const historyOpen = usePanel((state) => state.historyOpen);
  const setHistoryOpen = usePanel((state) => state.setHistoryOpen);
  const streamingPrivacy = usePanel(
    (state) => state.items.findLast((item) => item.state === 'streaming')?.privacy,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const privacy = streamingPrivacy ?? preview?.privacy;
  const where = !preview
    ? t('status.checking')
    : preview.kind === 'setup'
      ? t('status.notSetUp')
      : preview.kind === 'consent'
        ? t('status.cloudAsks')
        : privacy === 'cloud'
          ? t('status.cloud')
          : t('status.onDevice');

  return (
    <header
      className={`relative flex items-center gap-1 border-b border-line px-2 py-1.5 transition-colors ${
        privacy === 'cloud' ? 'bg-cloud-soft' : 'bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-line/40"
      >
        <span className={`lamp ${toneOf(privacy)}`} data-active={busy} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={`block text-[0.72rem] font-semibold ${toneOf(privacy)}`}>{where}</span>
          <span className="block truncate text-sm font-medium">
            {preview?.label ?? t('status.chooseProvider')}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 flex-none text-muted" aria-hidden />
      </button>
      {onFollowups && (
        <IconButton label={t('followups.title')} aria-pressed={followupsOpen} onClick={onFollowups}>
          <Bell className="h-4 w-4" />
        </IconButton>
      )}
      <IconButton
        label={historyOpen ? t('status.closeHistory') : t('status.history')}
        aria-pressed={historyOpen}
        onClick={() => {
          onHistory?.();
          setHistoryOpen(!historyOpen);
        }}
      >
        <History className="h-4 w-4" />
      </IconButton>
      <IconButton
        label={t('status.newChat')}
        onClick={() => {
          onHistory?.();
          clear();
        }}
      >
        <SquarePen className="h-4 w-4" />
      </IconButton>
      <IconButton label={t('common.settings')} onClick={() => void openSettings()}>
        <SettingsIcon className="h-4 w-4" />
      </IconButton>
      {menuOpen && <ProviderMenu onClose={() => setMenuOpen(false)} />}
    </header>
  );
}

function stateText(summary: ProviderSummary): string {
  const { state } = summary;
  switch (state.kind) {
    case 'ready':
      return summary.privacy === 'cloud'
        ? t('providerState.readyCloud')
        : t('providerState.readyDevice');
    case 'needs-download':
      return t('providerState.needsDownload');
    case 'downloading':
      return t('providerState.downloading', { percent: String(Math.round(state.progress * 100)) });
    case 'needs-setup':
      return {
        'no-key': t('providerState.noKey'),
        'no-model': t('providerState.noModel'),
        'no-permission': t('providerState.noPermission'),
        'server-offline': t('providerState.noServer'),
      }[state.reason];
    case 'unsupported':
      return t('providerState.unsupported');
  }
}

function ProviderMenu({ onClose }: { onClose: () => void }) {
  const listProviders = usePanel((state) => state.listProviders);
  const makeDefault = usePanel((state) => state.makeDefault);
  const enableOnDevice = usePanel((state) => state.enableOnDevice);
  const [providers, setProviders] = useState<ProviderSummary[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listProviders().then(setProviders);
  }, [listProviders]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('status.menuLabel')}
      className="absolute left-2 right-2 top-full z-20 mt-1 rounded-[14px] border border-line bg-surface p-1.5 shadow-lg"
    >
      {!providers && (
        <p className="px-3 py-2 text-sm text-muted">{t('status.checkingProviders')}</p>
      )}
      {providers?.map((provider, index) => {
        const ready = provider.state.kind === 'ready';
        const first = index === 0;
        return (
          <div
            key={provider.id}
            role="none"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
          >
            <span
              className={`lamp ${ready ? toneOf(provider.privacy) : 'text-line'}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{provider.label}</span>
              <span className="block text-[0.75rem] text-muted">{stateText(provider)}</span>
            </span>
            {ready && first && (
              <span className="text-[0.75rem] text-muted">{t('status.default')}</span>
            )}
            {ready && !first && (
              <button
                type="button"
                role="menuitem"
                className="rounded-md px-2 py-1 text-[0.78rem] font-medium text-local hover:bg-local-soft"
                onClick={() => {
                  void makeDefault(provider.id);
                  onClose();
                }}
              >
                {t('status.makeDefault')}
              </button>
            )}
            {provider.state.kind === 'needs-download' && (
              <button
                type="button"
                role="menuitem"
                className="rounded-md px-2 py-1 text-[0.78rem] font-medium text-local hover:bg-local-soft"
                onClick={() => {
                  void enableOnDevice(provider.id);
                  onClose();
                }}
              >
                {t('status.turnOn')}
              </button>
            )}
          </div>
        );
      })}
      <div className="mt-1 border-t border-line pt-1">
        <button
          type="button"
          role="menuitem"
          className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium hover:bg-line/40"
          onClick={() => {
            void openSettings('providers');
            onClose();
          }}
        >
          {t('status.manageProviders')}
        </button>
      </div>
    </div>
  );
}
