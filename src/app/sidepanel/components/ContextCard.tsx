import { Eye, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, IconButton } from '@/components/ui';
import type { ExtractedPage } from '@/extractors/types';
import { countWords, estimateTokens, hostnameOf } from '@/lib/text';
import { updateSettings } from '@/storage/settings';
import { formatNumber, t } from '../../shared/i18n';
import { domainOf, panelShortcut } from '../../shared/open';
import { usePanel } from '../store';
import { ExtraTabsList, TabsPicker } from './TabsPicker';
import {
  requestAllSitesAccess,
  requestOriginAccess,
  requestSiteAccessInBrowser,
} from '../tab-context';

const FILE_TYPES = '.pdf,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.log,.html,.htm,.srt,.vtt';

/** What the AI will read: the page, the selected text, or a file. */
export function ContextCard() {
  const tab = usePanel((state) => state.tab);
  const file = usePanel((state) => state.file);
  const fileStatus = usePanel((state) => state.fileStatus);
  const refreshTab = usePanel((state) => state.refreshTab);

  let body: ReactNode;
  if (fileStatus) {
    body = <Muted busy>{fileStatus}</Muted>;
  } else if (file) {
    body = <PageSummary page={file} isFile />;
  } else if (tab.status === 'no-access') {
    body = <AccessNeeded tabId={tab.tabId} sitePattern={tab.sitePattern} />;
  } else if (tab.status === 'restricted' || tab.status === 'error') {
    body = (
      <>
        <p className="text-sm font-medium">
          {tab.status === 'restricted' ? t('context.cantRead') : t('context.couldntRead')}
        </p>
        <p className="mt-0.5 text-[0.8rem] text-muted">{tab.message}</p>
        {tab.status === 'error' && (
          <Button size="sm" className="mt-2" onClick={() => void refreshTab()}>
            {t('common.tryAgain')}
          </Button>
        )}
      </>
    );
  } else if (tab.status === 'loading' && (!tab.page || tab.message)) {
    body = <Muted busy>{tab.message ?? t('context.reading')}</Muted>;
  } else if (tab.page) {
    body = <PageSummary page={tab.page} />;
  } else {
    body = <Muted>{t('context.empty')}</Muted>;
  }

  return (
    <section className="relative border-b border-line bg-surface py-3 pl-4 pr-11">
      {body}
      <FilePicker />
    </section>
  );
}

function Muted({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <p className="text-sm text-muted" aria-busy={busy}>
      {children}
    </p>
  );
}

function FilePicker() {
  const openFile = usePanel((state) => state.openFile);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton
        label={t('context.openFile')}
        className="absolute right-2 top-2.5"
        onClick={() => input.current?.click()}
      >
        <Paperclip className="h-4 w-4" />
      </IconButton>
      <input
        ref={input}
        type="file"
        accept={FILE_TYPES}
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) void openFile(chosen);
          event.target.value = '';
        }}
      />
    </>
  );
}

function PageSummary({ page, isFile = false }: { page: ExtractedPage; isFile?: boolean }) {
  const preferSelection = usePanel((state) => state.settings?.preferSelection ?? true);
  const closeFile = usePanel((state) => state.closeFile);
  const [previewOpen, setPreviewOpen] = useState(false);

  const usingSelection = Boolean(!isFile && preferSelection && page.selection);
  const text = usingSelection ? (page.selection ?? '') : page.markdown;
  const words = usingSelection ? countWords(text) : page.wordCount;
  const tokens = estimateTokens(text);

  return (
    <>
      <h1 className="line-clamp-2 font-serif text-[1.02rem] leading-snug">{page.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.76rem] text-muted">
        <span>
          {isFile ? t('context.fileOnComputer') : domainOf(page.url) || hostnameOf(page.url)}
        </span>
        {page.kind === 'pdf' && page.pages !== undefined && (
          <span>{t('context.pdfPages', page.pages, [formatNumber(page.pages)])}</span>
        )}
        <span>
          {usingSelection
            ? t('context.selection', { words: t('context.words', words, [formatNumber(words)]) })
            : t('context.words', words, [formatNumber(words)])}
          {tokens > 0 && ` ${t('context.tokens', { tokens: formatTokens(tokens) })}`}
        </span>
        {page.truncated && <span>{t('context.cutToFit')}</span>}
        {page.kind === 'youtube' && !page.hasTranscript && <span>{t('context.noTranscript')}</span>}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-1 rounded px-1 font-medium text-ink/80 hover:text-local"
          disabled={!text}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          {t('common.preview')}
        </button>
        {!isFile && page.kind !== 'pdf' && <TabsPicker />}
        {isFile && (
          <button
            type="button"
            onClick={closeFile}
            className="inline-flex items-center gap-1 rounded px-1 font-medium text-ink/80 hover:text-danger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t('context.closeFile')}
          </button>
        )}
      </div>
      {!isFile && <ExtraTabsList />}
      {!isFile && page.selection && (
        <div
          className="mt-2 flex gap-1 text-[0.76rem]"
          role="group"
          aria-label={t('context.whatToRead')}
        >
          {[
            { value: true, label: t('context.selectedText') },
            { value: false, label: t('context.wholePage') },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={preferSelection === option.value}
              onClick={() => void updateSettings({ preferSelection: option.value })}
              className="rounded-full border border-line px-2.5 py-0.5 aria-pressed:border-local aria-pressed:bg-local-soft aria-pressed:text-local"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={t('context.previewTitle')}
      >
        <p className="text-[0.8rem] text-muted">{t('context.previewNote')}</p>
        <pre
          tabIndex={0}
          aria-label={t('context.previewLabel')}
          className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-paper p-3 font-mono text-[0.75rem] leading-relaxed"
        >
          {text}
        </pre>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => setPreviewOpen(false)}>{t('common.close')}</Button>
        </div>
      </Dialog>
    </>
  );
}

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function AccessNeeded({ tabId, sitePattern }: { tabId?: number; sitePattern?: string }) {
  const refreshTab = usePanel((state) => state.refreshTab);
  useEffect(() => {
    if (tabId !== undefined && !sitePattern) void requestSiteAccessInBrowser(tabId);
  }, [tabId, sitePattern]);

  if (sitePattern) {
    const host = sitePattern.replace(/^\w+:\/\//, '').replace(/\/\*$/, '');
    return (
      <>
        <p className="text-sm font-medium">{t('context.pdfAccessTitle', { host })}</p>
        <p className="mt-0.5 text-[0.8rem] text-muted">{t('context.pdfAccessBody')}</p>
        <Button
          size="sm"
          className="mt-2"
          onClick={async () => {
            if (await requestOriginAccess(sitePattern)) await refreshTab();
          }}
        >
          {t('context.allowHost', { host })}
        </Button>
      </>
    );
  }

  return (
    <>
      <p className="text-sm font-medium">{t('context.accessTitle')}</p>
      <p className="mt-0.5 text-[0.8rem] text-muted">
        {t('context.accessBody', { shortcut: panelShortcut() })}
      </p>
      <Button
        size="sm"
        className="mt-2"
        onClick={async () => {
          if (await requestAllSitesAccess()) await refreshTab();
        }}
      >
        {t('context.allowAllSites')}
      </Button>
    </>
  );
}
