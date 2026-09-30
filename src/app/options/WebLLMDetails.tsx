import { useEffect, useState } from 'react';
import { Button, ProgressBar } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { deleteModel, hasWebGPU, isModelDownloaded, WebLLMProvider } from '@/providers/webllm';
import { DEFAULT_WEBLLM_MODEL, WEBLLM_MODELS } from '@/providers/webllm-models';
import { updateSettings, type Settings } from '@/storage/settings';
import { t } from '../shared/i18n';

/** The in-browser model manager: pick, download and delete models. */
export function WebLLMDetails({ settings }: { settings: Settings }) {
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<{ id: string; value: number } | null>(null);
  const [error, setError] = useState<string>();
  const selected = settings.webllmModel || DEFAULT_WEBLLM_MODEL;

  const refresh = async () => {
    const entries = await Promise.all(
      WEBLLM_MODELS.map(async (model) => [model.id, await isModelDownloaded(model.id)] as const),
    );
    setDownloaded(Object.fromEntries(entries));
  };

  useEffect(() => {
    let active = true;
    void hasWebGPU().then(async (supported) => {
      if (!active) return;
      setGpu(supported);
      if (!supported) return;
      const entries = await Promise.all(
        WEBLLM_MODELS.map(async (model) => [model.id, await isModelDownloaded(model.id)] as const),
      );
      if (active) setDownloaded(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, []);

  const download = async (id: string) => {
    setError(undefined);
    setProgress({ id, value: 0 });
    try {
      await new WebLLMProvider(id).prepare((value) => setProgress({ id, value }));
      await updateSettings({ webllmModel: id });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const remove = async (id: string) => {
    setError(undefined);
    try {
      await deleteModel(id);
      if (settings.webllmModel === id) await updateSettings({ webllmModel: '' });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (gpu === null) return <p className="text-[0.82rem] text-muted">{t('webllm.checking')}</p>;
  if (!gpu) {
    return <p className="text-[0.82rem] text-muted">{t('webllm.noGpu')}</p>;
  }

  return (
    <div className="space-y-3 text-[0.82rem]">
      <p className="text-muted">{t('webllm.intro')}</p>
      <ul className="divide-y divide-line rounded-[10px] border border-line">
        {WEBLLM_MODELS.map((model) => {
          const isDownloaded = downloaded[model.id];
          const isSelected = selected === model.id;
          const loading = progress?.id === model.id;
          return (
            <li key={model.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-start gap-2">
                  <input
                    type="radio"
                    name="webllm-model"
                    checked={isSelected}
                    disabled={!isDownloaded}
                    onChange={() => void updateSettings({ webllmModel: model.id })}
                    className="mt-1 accent-[var(--color-local)]"
                  />
                  <span>
                    <span className="block font-medium">{model.label}</span>
                    <span className="block text-muted">
                      {t('webllm.size', {
                        download: model.downloadGB.toLocaleString(),
                        memory: model.memoryGB.toLocaleString(),
                      })}{' '}
                      {(t as (key: string) => string)(`webllm.notes.${model.key}`) || model.note}
                    </span>
                  </span>
                </label>
                {isDownloaded ? (
                  <Button size="sm" variant="ghost" onClick={() => void remove(model.id)}>
                    {t('common.delete')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={model.id === DEFAULT_WEBLLM_MODEL ? 'primary' : 'secondary'}
                    disabled={progress !== null}
                    onClick={() => void download(model.id)}
                  >
                    {t('webllm.download')}
                  </Button>
                )}
              </div>
              {loading && (
                <div className="mt-2 space-y-1">
                  <ProgressBar value={progress.value} label={model.label} />
                  <p className="text-muted">
                    {t('webllm.downloading', { percent: String(Math.round(progress.value * 100)) })}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
