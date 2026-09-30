import { useState } from 'react';
import { t } from '../../shared/i18n';
import { showQuoteInPage } from '../page-actions';
import { usePanel, type ChatItem } from '../store';

/** Quotes in an answer, checked against the page. */
export function QuoteList({ item }: { item: ChatItem }) {
  const quotes = item.quotes ?? [];
  const tab = usePanel((state) => state.tab);
  const showToast = usePanel((state) => state.showToast);
  const [open, setOpen] = useState(false);
  const found = quotes.filter((quote) => quote.found).length;
  const missing = quotes.length - found;
  const onPage =
    tab.status === 'ready' && tab.page?.url === item.context?.url && tab.tabId !== undefined;

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
                  {quote.found && onPage && (
                    <button
                      type="button"
                      className="font-medium text-local underline underline-offset-2"
                      onClick={async () => {
                        const shown = await showQuoteInPage(tab.tabId as number, quote.text);
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
    </div>
  );
}
