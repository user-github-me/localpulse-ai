import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import type { CheckedQuote } from '@/core/quotes';
import { t } from '../../shared/i18n';
import { showQuoteInPage } from '../page-actions';
import { usePanel, type ChatItem } from '../store';

/** Quotes in an answer, checked against the page. */
export function QuoteList({ item }: { item: ChatItem }) {
  const quotes = item.quotes ?? [];
  const tab = usePanel((state) => state.tab);
  const showToast = usePanel((state) => state.showToast);
  const [excerpt, setExcerpt] = useState<CheckedQuote | null>(null);
  const [open, setOpen] = useState(false);
  const found = quotes.filter((quote) => quote.found).length;
  const missing = quotes.length - found;

  return (
    <div className="mt-1 text-[0.74rem]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`underline decoration-dotted underline-offset-2 ${missing ? 'text-danger' : 'text-muted'}`}
      >
        {missing
          ? quotes.length === 1
            ? t('quotes.missing', 1)
            : t('quotes.missingOf', missing, { total: String(quotes.length) })
          : t('quotes.checked', found)}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {quotes.map((quote) => (
            <li key={quote.text} className="flex items-start gap-2">
              <span className={quote.found ? 'text-local' : 'text-danger'} aria-hidden>
                {quote.found ? '✓' : '!'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-serif text-[0.8rem] italic text-ink/85">“{quote.text}”</span>
                <span className="block text-muted">
                  {quote.found ? t('quotes.found') : t('quotes.notFound')}{' '}
                  {'sourceTitle' in quote && quote.sourceTitle && (
                    <span>{t('workspace.quoteSource', { name: quote.sourceTitle })} </span>
                  )}
                  {quote.found && quote.location && (
                    <button
                      type="button"
                      className="mr-2 font-medium text-local underline underline-offset-2"
                      onClick={() => setExcerpt(quote)}
                    >
                      {t('citations.open')}
                    </button>
                  )}
                  {quote.found &&
                    tab.status === 'ready' &&
                    tab.tabId !== undefined &&
                    tab.page?.url ===
                      ('sourceUrl' in quote ? quote.sourceUrl : item.context?.url) &&
                    !item.context?.tabCount && (
                      <button
                        type="button"
                        className="font-medium text-local underline underline-offset-2"
                        onClick={async () => {
                          const shown = await showQuoteInPage(
                            tab.tabId as number,
                            quote.onPage ? [quote.onPage, quote.text] : [quote.text],
                          );
                          if (!shown) showToast(t('quotes.showFailed'));
                        }}
                      >
                        {t('quotes.show')}
                      </button>
                    )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={excerpt !== null} onClose={() => setExcerpt(null)} title={t('citations.title')}>
        <p className="text-xs text-muted">
          {excerpt && 'sourceTitle' in excerpt ? String(excerpt.sourceTitle) : item.context?.title}
        </p>
        {excerpt?.location?.page && (
          <p className="mt-1 text-sm font-medium">
            {t('citations.page', { page: String(excerpt.location.page) })}
          </p>
        )}
        <p className="my-3 text-xs text-muted">{t('citations.note')}</p>
        <pre
          tabIndex={0}
          className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line p-3 text-sm"
        >
          {excerpt?.location?.before}
          <mark className="bg-local/20 text-ink">{excerpt?.location?.match}</mark>
          {excerpt?.location?.after}
        </pre>
        {(() => {
          const url =
            excerpt && 'sourceUrl' in excerpt ? String(excerpt.sourceUrl) : item.context?.url;
          if (!url || !/^https?:\/\//i.test(url)) return null;
          const target = new URL(url);
          if (excerpt?.location?.page) target.hash = `page=${excerpt.location.page}`;
          return (
            <a
              className="mt-3 inline-block text-sm text-local underline"
              href={target.href}
              target="_blank"
              rel="noreferrer"
            >
              {t('citations.source')}
            </a>
          );
        })()}
        <Button className="mt-3" onClick={() => setExcerpt(null)}>
          {t('common.close')}
        </Button>
      </Dialog>
    </div>
  );
}
