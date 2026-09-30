import { useEffect, useState } from 'react';
import { Button, ProgressBar } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { BuiltinAIProvider, hasSummarizer } from '@/providers/builtin-ai';
import type { ProviderState } from '@/providers/types';
import { t, withNodes } from '../shared/i18n';

const builtin = new BuiltinAIProvider();

/** Status and one-time download of the browser's built-in model. */
export function BuiltinDetails() {
  const [chat, setChat] = useState<ProviderState | null>(null);
  const [summaries, setSummaries] = useState<ProviderState | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  const check = async () => {
    setChat(await builtin.state('chat'));
    setSummaries(hasSummarizer() ? await builtin.state('summarize') : null);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      builtin.state('chat'),
      hasSummarizer() ? builtin.state('summarize') : Promise.resolve(null),
    ]).then(([chatState, summaryState]) => {
      if (!active) return;
      setChat(chatState);
      setSummaries(summaryState);
    });
    return () => {
      active = false;
    };
  }, []);

  const download = async () => {
    setError(undefined);
    setProgress(0);
    try {
      await builtin.prepare(setProgress);
      setProgress(null);
      await check();
    } catch (err) {
      setProgress(null);
      setError(errorMessage(err));
    }
  };

  const canDownload =
    chat?.kind === 'needs-download' ||
    (chat?.kind === 'unsupported' && summaries?.kind === 'needs-download');

  return (
    <div className="space-y-2 text-[0.82rem] text-muted">
      <p>
        {chat?.kind === 'ready' && t('builtin.ready', { model: builtin.label })}
        {chat?.kind === 'needs-download' && t('builtin.needsDownload', { model: builtin.label })}
        {chat?.kind === 'downloading' && t('builtin.downloading', { model: builtin.label })}
        {chat?.kind === 'unsupported' && chat.reason}
        {!chat && t('builtin.checking')}
      </p>
      {chat?.kind === 'unsupported' && summaries?.kind === 'ready' && (
        <p>{t('builtin.summariesOnly')}</p>
      )}
      {progress !== null ? (
        <div className="space-y-1">
          <ProgressBar value={progress} label={t('builtin.download', { model: builtin.label })} />
          <p>{t('builtin.downloadingPercent', { percent: String(Math.round(progress * 100)) })}</p>
        </div>
      ) : (
        canDownload && (
          <Button variant="primary" size="sm" onClick={() => void download()}>
            {t('builtin.download', { model: builtin.label })}
          </Button>
        )
      )}
      {error && <p className="text-danger">{error}</p>}
      <details>
        <summary className="cursor-pointer">{t('builtin.requirements')}</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>{t('builtin.req1')}</li>
          <li>{t('builtin.req2')}</li>
          <li>{t('builtin.req3')}</li>
          <li>
            {withNodes(t('builtin.req4', { url: '{url}' }), {
              url: <code className="font-mono">chrome://on-device-internals</code>,
            })}
          </li>
          <li>{t('builtin.req5')}</li>
        </ul>
      </details>
    </div>
  );
}
