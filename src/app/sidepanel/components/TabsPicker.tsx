import { Layers, X } from 'lucide-react';
import { useState } from 'react';
import { browser } from '#imports';
import { Button, Dialog } from '@/components/ui';
import { originPattern } from '@/lib/text';
import { t } from '../../shared/i18n';
import { domainOf } from '../../shared/open';
import { usePanel, type ExtraTab } from '../store';

/**
 * Adds other open tabs to what the AI reads, e.g. to compare two articles.
 * Needs the optional "tabs" permission to list tab titles, asked the first time.
 */
export function TabsPicker() {
  const extraTabs = usePanel((state) => state.extraTabs);
  const setExtraTabs = usePanel((state) => state.setExtraTabs);
  const currentTabId = usePanel((state) => state.tab.tabId);
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<ExtraTab[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  const start = async () => {
    const granted = await browser.permissions.request({ permissions: ['tabs'] }).catch(() => false);
    if (!granted) return;
    const all = await browser.tabs.query({ currentWindow: true });
    setTabs(
      all
        .filter(
          (tab) =>
            tab.id !== undefined && tab.id !== currentTabId && /^https?:/.test(tab.url ?? ''),
        )
        .map((tab) => ({
          tabId: tab.id as number,
          title: tab.title || (tab.url as string),
          url: tab.url as string,
        })),
    );
    setChosen(new Set(extraTabs.map((tab) => tab.tabId)));
    setOpen(true);
  };

  const confirm = async () => {
    const selected = tabs.filter((tab) => chosen.has(tab.tabId));
    const origins = [
      ...new Set(
        selected
          .map((tab) => originPattern(tab.url))
          .filter((pattern): pattern is string => Boolean(pattern)),
      ),
    ];
    if (origins.length > 0) {
      const granted = await browser.permissions.request({ origins }).catch(() => false);
      if (!granted) return;
    }
    setExtraTabs(selected);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className="inline-flex items-center gap-1 rounded px-1 font-medium text-ink/80 hover:text-local"
      >
        <Layers className="h-3.5 w-3.5" aria-hidden />
        {extraTabs.length ? t('tabs.change') : t('tabs.add')}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('tabs.dialogTitle')}>
        <p className="text-[0.8rem] text-muted">{t('tabs.dialogNote')}</p>
        {tabs.length === 0 ? (
          <p className="mt-3 text-sm">{t('tabs.none')}</p>
        ) : (
          <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
            {tabs.map((tab) => (
              <li key={tab.tabId}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-line/40">
                  <input
                    type="checkbox"
                    checked={chosen.has(tab.tabId)}
                    onChange={(event) => {
                      const next = new Set(chosen);
                      if (event.target.checked) next.add(tab.tabId);
                      else next.delete(tab.tabId);
                      setChosen(next);
                    }}
                    className="mt-1 accent-[var(--color-local)]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{tab.title}</span>
                    <span className="block text-[0.74rem] text-muted">{domainOf(tab.url)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void confirm()}>
            {chosen.size === 0
              ? t('tabs.readOnlyThis')
              : t('tabs.readCount', { count: String(chosen.size + 1) })}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** The other tabs being read, with a way to remove each. */
export function ExtraTabsList() {
  const extraTabs = usePanel((state) => state.extraTabs);
  const setExtraTabs = usePanel((state) => state.setExtraTabs);
  if (extraTabs.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5 text-[0.76rem]" aria-label={t('tabs.listLabel')}>
      {extraTabs.map((tab) => (
        <li
          key={tab.tabId}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-line py-0.5 pl-2.5 pr-1"
        >
          <span className="max-w-[14rem] truncate">{tab.title}</span>
          <button
            type="button"
            aria-label={t('tabs.stopReading', { title: tab.title })}
            onClick={() => setExtraTabs(extraTabs.filter((item) => item.tabId !== tab.tabId))}
            className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
