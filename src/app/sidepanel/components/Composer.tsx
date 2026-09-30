import { ArrowUp, Square } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../shared/i18n';
import { usePanel } from '../store';

export function Composer() {
  const [text, setText] = useState('');
  const busy = usePanel((state) => state.busy);
  const ask = usePanel((state) => state.ask);
  const stop = usePanel((state) => state.stop);
  const hasPage = usePanel((state) => state.tab.status === 'ready');

  const submit = () => {
    if (!text.trim() || busy) return;
    void ask(text);
    setText('');
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-t border-line bg-surface p-3"
    >
      <div className="flex items-end gap-2 rounded-[12px] border border-line bg-paper py-1.5 pl-3 pr-1.5 focus-within:border-local">
        <textarea
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={hasPage ? t('composer.askPage') : t('composer.askAnything')}
          aria-label={hasPage ? t('composer.askPage') : t('composer.askAnything')}
          className="max-h-40 min-h-[1.75rem] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none [field-sizing:content] placeholder:text-muted/70"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            aria-label={t('composer.stop')}
            title={t('composer.stop')}
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-ink text-paper"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label={t('composer.send')}
            title={t('composer.send')}
            disabled={!text.trim()}
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-local text-white transition-opacity disabled:opacity-35 dark:text-paper"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}
