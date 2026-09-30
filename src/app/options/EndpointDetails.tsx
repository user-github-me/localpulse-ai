import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { Button, TextInput } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { isLocalUrl, originPattern } from '@/lib/text';
import { listModels, OpenAICompatibleProvider } from '@/providers/openai-compatible';
import { presetById, suggestModel } from '@/providers/presets';
import { revokeConsent } from '@/storage/consent';
import { getApiKey, isSessionOnlyKey, removeApiKey, setApiKey } from '@/storage/credentials';
import { updateSettings, type EndpointConfig } from '@/storage/settings';
import { t, withNodes } from '../shared/i18n';

function updateEndpoint(id: string, patch: Partial<EndpointConfig>) {
  return updateSettings((settings) => ({
    endpoints: settings.endpoints.map((endpoint) =>
      endpoint.id === id ? { ...endpoint, ...patch } : endpoint,
    ),
  }));
}

export async function removeEndpoint(id: string) {
  await removeApiKey(id);
  await revokeConsent(id);
  await updateSettings((settings) => ({
    endpoints: settings.endpoints.filter((endpoint) => endpoint.id !== id),
    providerOrder: settings.providerOrder.filter((providerId) => providerId !== id),
    disabledProviders: settings.disabledProviders.filter((providerId) => providerId !== id),
  }));
}

/** Asks for access to a local server; needed because extensions can't reach localhost otherwise. */
export async function requestEndpointAccess(baseUrl: string): Promise<boolean> {
  const pattern = originPattern(baseUrl);
  if (!pattern) return false;
  try {
    return await browser.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

/** Settings for one OpenAI-compatible endpoint: address, key, model, test. */
export function EndpointDetails({ endpoint }: { endpoint: EndpointConfig }) {
  const preset = presetById(endpoint.presetId);
  const local = isLocalUrl(endpoint.baseUrl);
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState(false);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [baseUrl, setBaseUrl] = useState(endpoint.baseUrl);
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();

  useEffect(() => {
    void getApiKey(endpoint.id).then((value) => setSavedKey(Boolean(value)));
    void isSessionOnlyKey(endpoint.id).then(setSessionOnly);
  }, [endpoint.id]);

  useEffect(() => {
    const pattern = originPattern(endpoint.baseUrl);
    if (!local || !pattern) return;
    void browser.permissions.contains({ origins: [pattern] }).then(setHasAccess);
  }, [endpoint.baseUrl, local]);

  /**
   * A different server gets neither the old server's API key nor the consent given for it: a key
   * sent to the wrong server is leaked, and consent was given to the old one.
   */
  const changeAddress = async (value: string) => {
    const originOf = (url: string) => {
      try {
        return new URL(url).origin;
      } catch {
        return url;
      }
    };
    if (originOf(value) !== originOf(endpoint.baseUrl)) {
      await revokeConsent(endpoint.id);
      if (savedKey) {
        await removeApiKey(endpoint.id);
        setSavedKey(false);
        setMessage({ tone: 'error', text: t('endpoint.keyRemoved') });
      }
    }
    await updateEndpoint(endpoint.id, { baseUrl: value });
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setMessage(undefined);
    try {
      const list = await listModels(endpoint.baseUrl, await getApiKey(endpoint.id));
      setModels(list);
      if (!list.length) setMessage({ tone: 'error', text: t('endpoint.noModels') });
      if (!endpoint.model && list.length) {
        const suggestion = suggestModel(list, preset);
        if (suggestion) await updateEndpoint(endpoint.id, { model: suggestion });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setLoadingModels(false);
    }
  };

  const saveKey = async () => {
    if (!key.trim()) return;
    await setApiKey(endpoint.id, key, { sessionOnly });
    setKey('');
    setSavedKey(true);
    await loadModels();
  };

  const test = async () => {
    setMessage(undefined);
    const provider = new OpenAICompatibleProvider(endpoint, {
      getKey: () => getApiKey(endpoint.id),
    });
    const state = await provider.state();
    if (state.kind !== 'ready') {
      setMessage({ tone: 'error', text: t('endpoint.finishSetup') });
      return;
    }
    try {
      let reply = '';
      for await (const chunk of provider.stream([
        { role: 'user', content: 'Reply with just the word: ready' },
      ])) {
        reply += chunk;
        if (reply.length > 80) break;
      }
      setMessage({
        tone: 'ok',
        text: t('endpoint.connected', { reply: reply.trim().slice(0, 80) }),
      });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-4 text-[0.84rem]">
      {preset?.setupNote && <p className="text-muted">{preset.setupNote}</p>}
      {preset?.dataNote && (
        <p className="rounded-lg bg-cloud-soft px-3 py-2 leading-snug">
          {preset.dataNote}
          {preset.termsUrl && (
            <>
              {' '}
              <a
                href={preset.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {t('endpoint.terms')}
              </a>
            </>
          )}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block font-medium">{t('endpoint.serverAddress')}</span>
        <TextInput
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          onBlur={() => {
            const value = baseUrl.trim().replace(/\/+$/, '');
            if (value !== endpoint.baseUrl) void changeAddress(value);
          }}
          placeholder="https://example.com/v1"
          spellCheck={false}
        />
      </label>

      {local && !hasAccess && (
        <div className="rounded-lg border border-line p-3">
          <p>{t('endpoint.needsPermission')}</p>
          <Button
            size="sm"
            variant="primary"
            className="mt-2"
            onClick={async () => {
              const granted = await requestEndpointAccess(endpoint.baseUrl);
              setHasAccess(granted);
              if (granted) await loadModels();
            }}
          >
            {t('endpoint.allowConnection')}
          </Button>
        </div>
      )}

      {!local && (
        <div>
          <span className="mb-1 block font-medium">{t('endpoint.apiKey')}</span>
          {savedKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">
                {sessionOnly ? t('endpoint.savedSession') : t('endpoint.savedLocal')}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await removeApiKey(endpoint.id);
                  setSavedKey(false);
                }}
              >
                {t('endpoint.removeKey')}
              </Button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveKey();
              }}
            >
              <div className="flex gap-2">
                <TextInput
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder={t('endpoint.pasteKey')}
                  spellCheck={false}
                />
                <Button type="submit" variant="primary" disabled={!key.trim()}>
                  {t('endpoint.save')}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  checked={sessionOnly}
                  onChange={(event) => setSessionOnly(event.target.checked)}
                  className="accent-[var(--color-local)]"
                />
                {t('endpoint.forgetKey')}
              </label>
              {preset?.keyUrl && (
                <p className="text-muted">
                  {withNodes(t('endpoint.getKey', { site: '{site}', provider: preset.label }), {
                    site: (
                      <a
                        href={preset.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {new URL(preset.keyUrl).hostname}
                      </a>
                    ),
                  })}
                </p>
              )}
            </form>
          )}
        </div>
      )}

      <div>
        <span className="mb-1 block font-medium">{t('endpoint.model')}</span>
        <div className="flex gap-2">
          {models && models.length > 0 ? (
            <select
              value={endpoint.model}
              onChange={(event) => void updateEndpoint(endpoint.id, { model: event.target.value })}
              className="h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm"
            >
              {!endpoint.model && <option value="">{t('endpoint.chooseModel')}</option>}
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <TextInput
              defaultValue={endpoint.model}
              key={endpoint.model}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== endpoint.model) void updateEndpoint(endpoint.id, { model: value });
              }}
              placeholder={t('endpoint.modelName')}
              spellCheck={false}
            />
          )}
          <Button onClick={() => void loadModels()} disabled={loadingModels}>
            {loadingModels ? t('endpoint.loadingModels') : t('endpoint.loadModels')}
          </Button>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-muted">{t('endpoint.advanced')}</summary>
        <label className="mt-2 block">
          <span className="mb-1 block font-medium">{t('endpoint.contextSize')}</span>
          <TextInput
            type="number"
            min={1024}
            step={1024}
            defaultValue={endpoint.contextTokens}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (value >= 1024) void updateEndpoint(endpoint.id, { contextTokens: value });
            }}
            className="max-w-40"
          />
          <span className="mt-1 block text-muted">{t('endpoint.contextNote')}</span>
        </label>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void test()}>{t('endpoint.test')}</Button>
        <Button variant="danger" onClick={() => void removeEndpoint(endpoint.id)}>
          {t('endpoint.remove')}
        </Button>
      </div>
      {message && (
        <p className={message.tone === 'ok' ? 'text-local' : 'text-danger'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
