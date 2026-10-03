import { useEffect, useRef, useState } from 'react';
import { Button, ProgressBar } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { applyTheme } from '@/lib/theme';
import { BuiltinAIProvider } from '@/providers/builtin-ai';
import type { ProviderState } from '@/providers/types';
import { updateSettings } from '@/storage/settings';
import { getTrackerUrl } from '@/storage/email-tracker';
import { TrackerConnection } from '../shared/TrackerConnection';
import { openPanelFromPage } from '../shared/firefox';
import { t } from '../shared/i18n';
import { openSettings, panelShortcut } from '../shared/open';
import { useSettings } from '../shared/useSettings';

const builtin = new BuiltinAIProvider();

/** First run: disclosure, detection, recommendation, tips. */
export function Onboarding() {
  const settings = useSettings();
  const [step, setStep] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const theme = settings?.theme;
  useEffect(() => (theme ? applyTheme(theme) : undefined), [theme]);
  useEffect(() => {
    content.current?.querySelector('h1')?.focus();
  }, [step]);
  const steps = [
    t('onboarding.step1'),
    t('onboarding.step2'),
    t('onboarding.stepTracking'),
    t('onboarding.step3'),
  ];

  return (
    <main className="mx-auto max-w-xl px-6 py-14">
      <p className="text-sm font-semibold text-local">{t('extName')}</p>
      <ol className="mt-6 grid grid-cols-2 gap-3 text-[0.8rem]" aria-label={t('onboarding.steps')}>
        {steps.map((title, index) => (
          <li
            key={title}
            aria-current={index === step ? 'step' : undefined}
            className={index === step ? 'font-semibold text-ink' : 'text-muted'}
          >
            {index + 1}. {title}
          </li>
        ))}
      </ol>
      <div className="mt-8" ref={content}>
        {step === 0 && <Disclosure onNext={() => setStep(1)} />}
        {step === 1 && <ChooseProvider onNext={() => setStep(2)} />}
        {step === 2 && <TrackingSetup onNext={() => setStep(3)} />}
        {step === 3 && <Finish />}
      </div>
    </main>
  );
}

function Disclosure({ onNext }: { onNext: () => void }) {
  return (
    <section>
      <h1 tabIndex={-1} className="font-serif text-[2rem] leading-tight">
        {t('onboarding.readsTitle')}
      </h1>
      <div className="mt-6 space-y-4 text-[0.95rem] leading-relaxed">
        <p>{t('onboarding.reads1')}</p>
        <p>{t('onboarding.reads2')}</p>
        <p>{t('onboarding.reads3')}</p>
      </div>
      <Button variant="primary" className="mt-8" onClick={onNext}>
        {t('common.continue')}
      </Button>
    </section>
  );
}

function Option({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="py-4">
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{body}</p>
      {action}
    </li>
  );
}

function ChooseProvider({ onNext }: { onNext: () => void }) {
  const [state, setState] = useState<ProviderState | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void builtin.state().then(setState);
  }, []);

  const download = async () => {
    setError(undefined);
    setProgress(0);
    try {
      await builtin.prepare(setProgress);
      setState(await builtin.state());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const model = builtin.label;

  return (
    <section>
      <h1 tabIndex={-1} className="font-serif text-[2rem] leading-tight">
        {t('onboarding.chooseTitle')}
      </h1>

      {!state && <p className="mt-6 text-muted">{t('onboarding.checking')}</p>}

      {state?.kind === 'ready' && (
        <p className="mt-6 text-[0.95rem] leading-relaxed">
          <span className="font-semibold text-local">{t('onboarding.ready', { model })}</span>{' '}
          {t('onboarding.readyBody')}
        </p>
      )}

      {(state?.kind === 'needs-download' || state?.kind === 'downloading') && (
        <div className="mt-6 space-y-3 text-[0.95rem] leading-relaxed">
          <p>{t('onboarding.downloadBody', { model })}</p>
          {progress !== null ? (
            <div className="space-y-1">
              <ProgressBar value={progress} label={t('onboarding.download', { model })} />
              <p className="text-sm text-muted">
                {t('onboarding.downloading', { percent: String(Math.round(progress * 100)) })}
              </p>
            </div>
          ) : (
            <Button variant="primary" onClick={() => void download()}>
              {t('onboarding.download', { model })}
            </Button>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {state?.kind === 'unsupported' && (
        <p className="mt-6 text-[0.95rem] leading-relaxed">{t('onboarding.unsupported')}</p>
      )}

      {state && state.kind !== 'ready' && (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {!import.meta.env.FIREFOX && (
            <Option
              title={t('onboarding.inBrowserTitle')}
              body={t('onboarding.inBrowserBody')}
              action={
                <Button size="sm" className="mt-2" onClick={() => void openSettings('providers')}>
                  {t('onboarding.inBrowserButton')}
                </Button>
              }
            />
          )}
          <Option
            title={t('onboarding.localTitle')}
            body={t('onboarding.localBody')}
            action={
              <Button size="sm" className="mt-2" onClick={() => void openSettings('providers')}>
                {t('onboarding.localButton')}
              </Button>
            }
          />
          <Option
            title={t('onboarding.keyTitle')}
            body={t('onboarding.keyBody')}
            action={
              <Button size="sm" className="mt-2" onClick={() => void openSettings('providers')}>
                {t('onboarding.keyButton')}
              </Button>
            }
          />
          <Option title={t('onboarding.handoffTitle')} body={t('onboarding.handoffBody')} />
        </ul>
      )}

      <Button variant="primary" className="mt-8" onClick={onNext}>
        {t('common.continue')}
      </Button>
    </section>
  );
}

function TrackingSetup({ onNext }: { onNext: () => void }) {
  const [connected, setConnected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void getTrackerUrl()
      .then((url) => {
        if (active) setConnected(url);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="space-y-6">
      <div>
        <h1 tabIndex={-1} className="font-serif text-[2rem] leading-tight">
          {t('onboarding.trackingTitle')}
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed">{t('onboarding.trackingBody')}</p>
      </div>
      <TrackerConnection
        connected={connected}
        disabled={loading}
        onConnected={setConnected}
        onDisconnected={() => setConnected('')}
        onBusyChange={setBusy}
      />
      <p className="text-sm text-muted">{t('onboarding.trackingManual')}</p>
      <Button
        variant={connected ? 'primary' : 'secondary'}
        disabled={busy || loading}
        onClick={onNext}
      >
        {connected ? t('common.continue') : t('onboarding.trackingSkip')}
      </Button>
    </section>
  );
}

function Finish() {
  useEffect(() => {
    void updateSettings({ onboardingComplete: true });
  }, []);

  return (
    <section>
      <h1 tabIndex={-1} className="font-serif text-[2rem] leading-tight">
        {t('onboarding.doneTitle')}
      </h1>
      <ul className="mt-6 space-y-3 text-[0.95rem] leading-relaxed">
        <li>{t('onboarding.tip1', { shortcut: panelShortcut() })}</li>
        <li>{t('onboarding.tip2')}</li>
        <li>{t('onboarding.tip3')}</li>
        <li>{t('onboarding.tipTracking')}</li>
      </ul>
      <div className="mt-8 flex gap-2">
        <Button variant="primary" onClick={() => void openPanelFromPage()}>
          {t('onboarding.open')}
        </Button>
        <Button onClick={() => void openSettings()}>{t('common.settings')}</Button>
      </div>
    </section>
  );
}
