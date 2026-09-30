import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/ui';
import { isLocalUrl } from '@/lib/text';
import { ENDPOINT_PRESETS, type EndpointPreset } from '@/providers/presets';
import { createProviders, orderProviders } from '@/providers/registry';
import type { Provider, ProviderState } from '@/providers/types';
import { updateSettings, type Settings } from '@/storage/settings';
import { t } from '../shared/i18n';
import { BuiltinDetails } from './BuiltinRow';
import { EndpointDetails, requestEndpointAccess } from './EndpointDetails';
import { WebLLMDetails } from './WebLLMDetails';

function stateLabel(state: ProviderState | undefined): string {
  if (!state) return t('status.checking');
  switch (state.kind) {
    case 'ready':
      return t('providerState.ready');
    case 'needs-download':
      return t('providerState.needsDownload');
    case 'downloading':
      return t('providerState.downloading', { percent: String(Math.round(state.progress * 100)) });
    case 'needs-setup':
      return {
        'no-key': t('providerState.noKey'),
        'no-model': t('providerState.noModelShort'),
        'no-permission': t('providerState.noPermission'),
        'server-offline': t('providerState.noServer'),
      }[state.reason];
    case 'unsupported':
      return t('providerState.unsupported');
  }
}

/** The ordered list of providers. */
export function ProvidersSection({ settings }: { settings: Settings }) {
  const all = createProviders(settings);
  const enabled = orderProviders(all, settings);
  const disabled = all.filter((provider) => settings.disabledProviders.includes(provider.id));
  const providers = [...enabled, ...disabled];
  const [states, setStates] = useState<Record<string, ProviderState>>({});
  const [open, setOpen] = useState<string | null>(null);
  const signature = JSON.stringify([
    settings.endpoints,
    settings.providerOrder,
    settings.disabledProviders,
  ]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      all.map(async (provider) => [provider.id, await provider.state()] as const),
    ).then((entries) => active && setStates(Object.fromEntries(entries)));
    return () => {
      active = false;
    };
    // `all` is rebuilt every render; the signature captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const move = (id: string, direction: -1 | 1) => {
    const ids = enabled.map((provider) => provider.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    void updateSettings({ providerOrder: ids });
  };

  const setEnabled = (id: string, on: boolean) =>
    void updateSettings((current) => ({
      disabledProviders: on
        ? current.disabledProviders.filter((providerId) => providerId !== id)
        : [...new Set([...current.disabledProviders, id])],
    }));

  return (
    <div>
      <p className="text-[0.84rem] text-muted">{t('options.providersIntro')}</p>
      <ul className="mt-4 divide-y divide-line rounded-[14px] border border-line bg-surface">
        {providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            settings={settings}
            state={states[provider.id]}
            position={enabled.indexOf(provider)}
            count={enabled.length}
            expanded={open === provider.id}
            onToggle={() => setOpen(open === provider.id ? null : provider.id)}
            onMove={(direction) => move(provider.id, direction)}
            onEnable={(on) => setEnabled(provider.id, on)}
          />
        ))}
      </ul>
      <AddProvider settings={settings} onAdded={setOpen} />
    </div>
  );
}

function ProviderRow({
  provider,
  settings,
  state,
  position,
  count,
  expanded,
  onToggle,
  onMove,
  onEnable,
}: {
  provider: Provider;
  settings: Settings;
  state?: ProviderState;
  position: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
  onEnable: (on: boolean) => void;
}) {
  const endpoint = settings.endpoints.find((item) => item.id === provider.id);
  const isEnabled = position >= 0;
  const tone = provider.privacy === 'cloud' ? 'text-cloud' : 'text-local';
  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`lamp ${isEnabled && state?.kind === 'ready' ? tone : 'text-line'}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{provider.label}</span>
            <span className="block text-[0.76rem] text-muted">
              {provider.privacy === 'cloud' ? t('options.cloud') : t('options.onDevice')},{' '}
              {stateLabel(state).toLocaleLowerCase()}
              {!isEnabled && `, ${t('options.turnedOff')}`}
            </span>
          </span>
          <ChevronRight
            className={`h-4 w-4 flex-none text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden
          />
        </button>
        {isEnabled && (
          <>
            <IconButton
              label={t('options.moveUp')}
              disabled={position === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={t('options.moveDown')}
              disabled={position === count - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="h-4 w-4" />
            </IconButton>
          </>
        )}
        <label className="ml-1 flex items-center gap-1.5 text-[0.76rem] text-muted">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => onEnable(event.target.checked)}
            className="accent-[var(--color-local)]"
          />
          {t('options.on')}
        </label>
      </div>
      {expanded && (
        <div className="border-t border-line px-4 py-4">
          {endpoint ? (
            <EndpointDetails endpoint={endpoint} />
          ) : provider.id === 'webllm' && !import.meta.env.FIREFOX ? (
            <WebLLMDetails settings={settings} />
          ) : (
            <BuiltinDetails />
          )}
        </div>
      )}
    </li>
  );
}

function AddProvider({ settings, onAdded }: { settings: Settings; onAdded: (id: string) => void }) {
  const add = async (preset: EndpointPreset) => {
    const taken = new Set(settings.endpoints.map((endpoint) => endpoint.id));
    let id = `ep:${preset.id}`;
    for (let n = 2; taken.has(id); n++) id = `ep:${preset.id}-${n}`;
    if (preset.kind === 'local') await requestEndpointAccess(preset.baseUrl);
    await updateSettings((current) => ({
      endpoints: [
        ...current.endpoints,
        {
          id,
          presetId: preset.id,
          label: preset.label,
          baseUrl: preset.baseUrl,
          model: '',
          contextTokens: preset.contextTokens,
        },
      ],
    }));
    onAdded(id);
  };

  const local = ENDPOINT_PRESETS.filter((preset) => preset.kind === 'local');
  const cloud = ENDPOINT_PRESETS.filter((preset) => preset.kind === 'cloud');

  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold">{t('options.addLocal')}</h3>
        <p className="mt-0.5 text-[0.8rem] text-muted">{t('options.addLocalNote')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {local.map((preset) => (
            <PresetButton key={preset.id} preset={preset} onClick={() => void add(preset)} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">{t('options.addCloud')}</h3>
        <p className="mt-0.5 text-[0.8rem] text-muted">{t('options.addCloudNote')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cloud.map((preset) => (
            <PresetButton key={preset.id} preset={preset} onClick={() => void add(preset)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PresetButton({ preset, onClick }: { preset: EndpointPreset; onClick: () => void }) {
  const local = preset.kind === 'local' || isLocalUrl(preset.baseUrl);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border border-line bg-surface px-3 py-1 text-[0.8rem] font-medium transition-colors ${
        local ? 'hover:border-local hover:text-local' : 'hover:border-cloud hover:text-cloud'
      }`}
    >
      {preset.label}
    </button>
  );
}
