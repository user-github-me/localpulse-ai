import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { Button, Switch } from '@/components/ui';
import { normalizeSiteRule } from '@/core/privacy';
import { clearConsent, getConsent, type CloudConsent } from '@/storage/consent';
import { clearHistory } from '@/storage/history';
import { updateSettings, type Settings } from '@/storage/settings';
import { t } from '../shared/i18n';

function useConsent() {
  const [consent, setConsent] = useState<CloudConsent | null>(null);
  const reload = () => void getConsent().then(setConsent);
  useEffect(reload, []);
  return { consent, reload };
}

function useAllSitesAccess() {
  const [granted, setGranted] = useState(false);
  const check = () =>
    void browser.permissions.contains({ origins: ['<all_urls>'] }).then(setGranted);
  useEffect(() => {
    check();
    browser.permissions.onAdded.addListener(check);
    browser.permissions.onRemoved.addListener(check);
    return () => {
      browser.permissions.onAdded.removeListener(check);
      browser.permissions.onRemoved.removeListener(check);
    };
  }, []);
  return granted;
}

/** Privacy controls. */
export function PrivacySection({ settings }: { settings: Settings }) {
  const { consent, reload } = useConsent();
  const allSites = useAllSitesAccess();
  const [sites, setSites] = useState(settings.neverCloudSites.join('\n'));
  const [historyCleared, setHistoryCleared] = useState(false);
  const labels = new Map(settings.endpoints.map((endpoint) => [endpoint.id, endpoint.label]));
  const consentEntries = consent
    ? [
        ...consent.always.map((id) =>
          t('privacy.consentEvery', { provider: labels.get(id) ?? id }),
        ),
        ...Object.entries(consent.sites).flatMap(([host, ids]) =>
          ids.map((id) => t('privacy.consentSite', { provider: labels.get(id) ?? id, host })),
        ),
      ]
    : [];

  return (
    <div>
      <div className="divide-y divide-line rounded-[14px] border border-line bg-surface px-4">
        <Switch
          label={t('privacy.localOnly')}
          description={t('privacy.localOnlyNote')}
          checked={settings.localOnly}
          onChange={(localOnly) => void updateSettings({ localOnly })}
        />
        <Switch
          label={t('privacy.redact')}
          description={t('privacy.redactNote')}
          checked={settings.redactForCloud}
          onChange={(redactForCloud) => void updateSettings({ redactForCloud })}
        />
        <Switch
          label={t('privacy.fallback')}
          description={t('privacy.fallbackNote')}
          checked={settings.allowCloudFallback}
          onChange={(allowCloudFallback) => void updateSettings({ allowCloudFallback })}
        />
        <Switch
          label={t('privacy.history')}
          description={t('privacy.historyNote')}
          checked={settings.saveHistory}
          onChange={(saveHistory) => void updateSettings({ saveHistory })}
        />
        <Switch
          label={t('privacy.preferSelection')}
          description={t('privacy.preferSelectionNote')}
          checked={settings.preferSelection}
          onChange={(preferSelection) => void updateSettings({ preferSelection })}
        />
      </div>

      <label className="mt-6 block">
        <span className="text-sm font-semibold">{t('privacy.sites')}</span>
        <span className="mt-0.5 block text-[0.8rem] text-muted">{t('privacy.sitesNote')}</span>
        <textarea
          value={sites}
          onChange={(event) => setSites(event.target.value)}
          onBlur={() => {
            const rules = [
              ...new Set(
                sites
                  .split(/[\n,]+/)
                  .map(normalizeSiteRule)
                  .filter(Boolean),
              ),
            ];
            setSites(rules.join('\n'));
            void updateSettings({ neverCloudSites: rules });
          }}
          rows={4}
          placeholder={'mybank.com\nmail.google.com'}
          spellCheck={false}
          className="mt-2 w-full rounded-[10px] border border-line bg-surface p-3 font-mono text-[0.8rem] focus:border-local focus:outline-none"
        />
      </label>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">{t('privacy.consentTitle')}</h3>
        {consentEntries.length ? (
          <>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[0.84rem]">
              {consentEntries.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-2"
              onClick={async () => {
                await clearConsent();
                reload();
              }}
            >
              {t('privacy.askAgain')}
            </Button>
          </>
        ) : (
          <p className="mt-1 text-[0.84rem] text-muted">{t('privacy.consentNone')}</p>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">{t('privacy.historyTitle')}</h3>
        <p className="mt-1 text-[0.84rem] text-muted">{t('privacy.historyDeleteNote')}</p>
        <Button
          size="sm"
          variant="danger"
          className="mt-2"
          onClick={async () => {
            await clearHistory();
            setHistoryCleared(true);
          }}
        >
          {historyCleared ? t('privacy.historyDeleted') : t('privacy.deleteAll')}
        </Button>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">{t('privacy.readingTitle')}</h3>
        <p className="mt-1 text-[0.84rem] text-muted">
          {allSites ? t('privacy.allSitesOn') : t('privacy.allSitesOff')}
        </p>
        {allSites && (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => void browser.permissions.remove({ origins: ['<all_urls>'] })}
          >
            {t('privacy.stopAllSites')}
          </Button>
        )}
      </div>
    </div>
  );
}
