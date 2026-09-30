import { Button, Dialog } from '@/components/ui';
import { requestFirefoxDataConsent } from '../../shared/firefox';
import { formatNumber, t } from '../../shared/i18n';
import { providerName } from '../../shared/open';
import { usePanel } from '../store';

/** Asked before page content goes to a cloud provider for the first time on a site. */
export function ConsentDialog() {
  const consent = usePanel((state) => state.consent);
  const answer = usePanel((state) => state.answerConsent);
  const label = consent?.providerLabel ?? '';
  // Firefox also needs its data-collection permission, asked from this click (see shared/firefox.ts).
  const send = (choice: 'once' | 'site' | 'always') => {
    void requestFirefoxDataConsent().then((granted) => answer(granted ? choice : 'cancel'));
  };
  const provider = providerName(label);
  const what =
    consent?.source === 'selection'
      ? t('consent.whatSelection', consent.words, { words: formatNumber(consent.words) })
      : consent?.tabCount
        ? t('consent.whatTabs', consent.words, {
            words: formatNumber(consent.words),
            count: String(consent.tabCount),
          })
        : consent?.source === 'page'
          ? t('consent.whatPage', consent.words, { words: formatNumber(consent.words) })
          : t('consent.whatQuestion');

  return (
    <Dialog
      open={Boolean(consent)}
      onClose={() => answer('cancel')}
      title={t('consent.title', { provider })}
    >
      {consent && (
        <>
          <p className="text-sm leading-relaxed">
            {consent.host
              ? t('consent.bodyHost', { what, host: consent.host, provider: label })
              : t('consent.body', { what, provider: label })}
          </p>
          {consent.dataNote && (
            <p className="mt-3 rounded-lg bg-cloud-soft px-3 py-2 text-[0.8rem] leading-snug">
              {consent.dataNote}
            </p>
          )}
          {consent.termsUrl && (
            <a
              href={consent.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[0.8rem] text-local underline underline-offset-2"
            >
              {t('consent.terms', { provider })}
            </a>
          )}
          <div className="mt-4 grid gap-2">
            <Button wrap variant="cloud" onClick={() => send('once')}>
              {t('consent.sendOnce')}
            </Button>
            {consent.host && consent.remember && (
              <Button wrap onClick={() => send('site')}>
                {t('consent.sendSite', { host: consent.host })}
              </Button>
            )}
            {consent.remember && (
              <Button wrap onClick={() => send('always')}>
                {t('consent.sendAlways', { provider })}
              </Button>
            )}
            {consent.alternative && (
              <Button wrap variant="primary" onClick={() => answer('use-alternative')}>
                {t('consent.useAlternative', { provider: consent.alternative.label })}
              </Button>
            )}
            <Button wrap variant="ghost" onClick={() => answer('cancel')}>
              {t('consent.dontSend')}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
