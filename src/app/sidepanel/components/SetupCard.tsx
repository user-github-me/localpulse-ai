import { X } from 'lucide-react';
import { Button, IconButton, ProgressBar } from '@/components/ui';
import { t, withNodes } from '../../shared/i18n';
import { openSettings } from '../../shared/open';
import { usePanel } from '../store';
import { HandoffButtons } from './HandoffMenu';

/** Shown when no provider is ready. */
export function SetupCard() {
  const setup = usePanel((state) => state.setup);
  const download = usePanel((state) => state.download);
  const enableOnDevice = usePanel((state) => state.enableOnDevice);
  const dismiss = usePanel((state) => state.dismissSetup);
  const retry = usePanel((state) => state.retrySetup);
  if (!setup) return null;
  const downloading = download && download.providerId === setup.downloadable?.id;

  return (
    <section
      id="setup-card"
      className="mt-4 scroll-mt-4 rounded-[14px] border border-line bg-surface p-4"
      aria-labelledby="setup-title"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 id="setup-title" className="text-[0.95rem] font-semibold">
            {t('setup.title')}
          </h2>
          <p className="mt-1 text-[0.8rem] text-muted">
            {/* Keep {request} in the message so withNodes can put the bold label there. */}
            {withNodes(t('setup.intro', { request: '{request}' }), {
              request: <span className="font-medium text-ink">{setup.pending.label}</span>,
            })}
          </p>
        </div>
        <IconButton label={t('common.close')} className="h-7 w-7" onClick={dismiss}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="mt-3 divide-y divide-line">
        {setup.downloadable && (
          <div className="py-3">
            <p className="text-sm font-medium">
              {setup.downloadable.id === 'webllm'
                ? setup.downloadable.label
                : t('setup.builtinTitle', { model: setup.downloadable.label })}
            </p>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {setup.downloadable.id === 'webllm' ? t('setup.webllmBody') : t('setup.builtinBody')}
            </p>
            {downloading && !download.error ? (
              <div className="mt-2 space-y-1">
                <ProgressBar
                  value={download.progress}
                  label={t('setup.turnOn', { model: setup.downloadable.label })}
                />
                <p className="text-[0.75rem] text-muted">
                  {t('setup.downloading', { percent: String(Math.round(download.progress * 100)) })}
                </p>
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                onClick={() => setup.downloadable && void enableOnDevice(setup.downloadable.id)}
              >
                {t('setup.turnOn', { model: setup.downloadable.label })}
              </Button>
            )}
            {download?.error && <p className="mt-1 text-[0.78rem] text-danger">{download.error}</p>}
          </div>
        )}
        <div className="py-3">
          <p className="text-sm font-medium">{t('setup.localTitle')}</p>
          <p className="mt-0.5 text-[0.8rem] text-muted">{t('setup.localBody')}</p>
          <Button size="sm" className="mt-2" onClick={() => void openSettings('providers')}>
            {t('setup.localButton')}
          </Button>
        </div>
        <div className="py-3">
          <p className="text-sm font-medium">{t('setup.keyTitle')}</p>
          <p className="mt-0.5 text-[0.8rem] text-muted">{t('setup.keyBody')}</p>
          <Button size="sm" className="mt-2" onClick={() => void openSettings('providers')}>
            {t('setup.keyButton')}
          </Button>
        </div>
        <div className="py-3">
          <p className="text-sm font-medium">{t('setup.handoffTitle')}</p>
          <p className="mt-0.5 text-[0.8rem] text-muted">{t('setup.handoffBody')}</p>
          <HandoffButtons
            instruction={setup.pending.instruction}
            contextUrl={setup.pending.contextUrl}
          />
        </div>
      </div>

      <Button size="sm" variant="ghost" className="mt-1" onClick={() => void retry()}>
        {t('common.tryAgain')}
      </Button>
      {setup.cloudBlocked && (
        <p className="mt-2 text-[0.78rem] text-muted">{t('setup.cloudBlocked')}</p>
      )}
      {setup.reasons.length > 0 && (
        <details className="mt-2 text-[0.78rem] text-muted">
          <summary className="cursor-pointer">{t('setup.why')}</summary>
          <ul className="mt-1 space-y-0.5">
            {setup.reasons.map((reason) => (
              <li key={reason.label}>
                {reason.label}: {reason.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
