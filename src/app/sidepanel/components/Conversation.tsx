import { Check, Copy, Replace, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { stripPageTags } from '@/core/prompts';
import { parseFlashcards } from '@/core/study';
import { IconButton } from '@/components/ui';
import { t } from '../../shared/i18n';
import { domainOf, providerName } from '../../shared/open';
import { replaceSelectionInPage } from '../page-actions';
import { usePanel, type ChatItem } from '../store';
import { HandoffMenu } from './HandoffMenu';
import { QuoteList } from './QuoteList';
import { SetupCard } from './SetupCard';
import { StudyCards } from './StudyCards';
import { ReadAloud } from './ReadAloud';
import { toneOf } from './StatusStrip';

export function Conversation() {
  const items = usePanel((state) => state.items);
  const setup = usePanel((state) => state.setup);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastDone = items.findLast((item) => item.role === 'assistant' && item.state === 'done');

  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [items]);

  useEffect(() => {
    if (setup) document.getElementById('setup-card')?.scrollIntoView({ block: 'start' });
  }, [setup]);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40;
      }}
      className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4"
      role="region"
      aria-label={t('conversation.label')}
      tabIndex={0}
    >
      {items.length === 0 && !setup && <EmptyState />}
      {items.map((item) =>
        item.role === 'user' ? (
          <Question key={item.id} item={item} />
        ) : (
          <Answer key={item.id} item={item} />
        ),
      )}
      {setup && <SetupCard />}
      <div role="status" className="sr-only">
        {lastDone ? t('conversation.answerReady', { provider: lastDone.providerLabel ?? '' }) : ''}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-6 max-w-[34ch] text-center">
      <p className="font-serif text-[1.05rem]">{t('conversation.emptyTitle')}</p>
      <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">{t('conversation.emptyBody')}</p>
    </div>
  );
}

function Question({ item }: { item: ChatItem }) {
  return (
    <div className="mt-6 first:mt-0">
      <p dir="auto" className="whitespace-pre-wrap text-[0.9rem] font-semibold leading-snug">
        {item.actionLabel ?? item.text}
      </p>
      {item.context && (
        <p className="mt-0.5 truncate text-[0.74rem] text-muted">
          {item.context.documentCount
            ? t('workspace.count', { count: String(item.context.documentCount) })
            : item.context.tabCount
              ? t('tabs.count', { count: String(item.context.tabCount) })
              : item.context.source === 'selection'
                ? t('conversation.selectedTextOn', {
                    site: domainOf(item.context.url) || item.context.title,
                  })
                : domainOf(item.context.url) || item.context.title}
        </p>
      )}
    </div>
  );
}

function provenance(item: ChatItem): string {
  const cloud = item.privacy === 'cloud';
  const provider = item.providerLabel ?? '';
  switch (item.state) {
    case 'streaming':
      return cloud
        ? t('conversation.writingCloud', { provider })
        : t('conversation.writingOnDevice', { provider });
    case 'stopped':
      return cloud
        ? t('conversation.stoppedCloud', { provider })
        : t('conversation.stoppedOnDevice', { provider });
    case 'error':
      return t('conversation.failed', { provider });
    default:
      if (item.strategy === 'translator') return t('conversation.translatedOnDevice');
      return cloud
        ? t('conversation.answeredCloud', { provider })
        : t('conversation.answeredOnDevice', { provider });
  }
}

function strategyNote(item: ChatItem): string | undefined {
  if (item.state !== 'done') return undefined;
  const parts: string[] = [];
  if (item.strategy === 'map-reduce' || item.strategy === 'summarizer') {
    if ((item.partsTotal ?? 1) > 1) {
      parts.push(t('conversation.readInParts', { count: String(item.partsTotal) }));
    }
  } else if (item.strategy === 'retrieval') {
    parts.push(
      t('conversation.retrieval', { used: String(item.partsUsed), total: String(item.partsTotal) }),
    );
  }
  if (item.leftOut) {
    parts.push(
      t('conversation.leftOut', item.leftOut, { provider: providerName(item.providerLabel ?? '') }),
    );
  }
  if (item.redactions) {
    parts.push(t('conversation.redacted', item.redactions));
  }
  return parts.join(' ') || undefined;
}

/** Writing tools: put a rewrite back into the page's text field. */
function ReplaceButton({
  tabId,
  text,
  original,
  placeholder,
}: {
  tabId: number;
  text: string;
  original: { text: string; url: string };
  /** A hidden value couldn't be put back into the text. */
  placeholder: boolean;
}) {
  const showToast = usePanel((state) => state.showToast);
  return (
    <button
      type="button"
      onClick={async () => {
        if (placeholder) {
          showToast(t('conversation.replacePlaceholder'));
          return;
        }
        const result = await replaceSelectionInPage(tabId, text, original);
        // The field and its selection changed: read the tab again so the panel shows that.
        if (result === 'replaced') void usePanel.getState().refreshTab(tabId);
        showToast(
          result === 'replaced'
            ? t('conversation.replaced')
            : result === 'changed'
              ? t('conversation.replaceChanged')
              : t('conversation.replaceFailed'),
        );
      }}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[0.76rem] font-medium text-muted hover:bg-line/50 hover:text-ink"
    >
      <Replace className="h-3.5 w-3.5" aria-hidden />
      {t('conversation.replace')}
    </button>
  );
}

function Answer({ item }: { item: ChatItem }) {
  const retry = usePanel((state) => state.retry);
  const busy = usePanel((state) => state.busy);
  const [copied, setCopied] = useState(false);
  const streaming = item.state === 'streaming';
  const note = strategyNote(item);
  const cards =
    item.state === 'done' && item.recipeId === 'flashcards'
      ? parseFlashcards(stripPageTags(item.text))
      : undefined;

  return (
    <article className="mt-2.5" aria-busy={streaming}>
      {item.notice && (
        <p className="mb-2 rounded-lg bg-cloud-soft px-3 py-2 text-[0.78rem] leading-snug">
          {item.notice}
        </p>
      )}
      {cards ? (
        <>
          <StudyCards key={item.text} cards={cards} />
          <details className="mt-2 text-[0.76rem] text-muted">
            <summary className="cursor-pointer hover:text-ink">{t('study.original')}</summary>
            <Markdown text={stripPageTags(item.text)} />
          </details>
        </>
      ) : item.text ? (
        item.context?.editableTabId !== undefined ? (
          // Text that can replace the selection in a field: shown exactly as Replace inserts it.
          <p dir="auto" className="answer whitespace-pre-wrap">
            {stripPageTags(item.text)}
          </p>
        ) : (
          <Markdown text={stripPageTags(item.text)} lineBreaks={item.lineBreaks} />
        )
      ) : (
        streaming && (
          <p className="text-sm text-muted">{item.status ?? t('conversation.thinking')}</p>
        )
      )}
      {item.text && item.status && <p className="mt-2 text-[0.78rem] text-muted">{item.status}</p>}
      {item.state === 'error' && (
        <p className="mt-1 rounded-lg bg-danger-soft px-3 py-2 text-[0.82rem] leading-snug text-danger">
          {item.error}
        </p>
      )}
      <footer className="mt-2">
        <p className={`flex items-baseline gap-2 text-[0.74rem] ${toneOf(item.privacy)}`}>
          <span
            className={`lamp relative top-[0.05rem] ${toneOf(item.privacy)}`}
            data-active={streaming}
            aria-hidden
          />
          <span>{provenance(item)}</span>
        </p>
        {note && <p className="mt-1 text-[0.74rem] text-muted">{note}</p>}
        {!cards && item.quotes && item.quotes.length > 0 && <QuoteList item={item} />}
        {!streaming && (
          <div className="-ml-1.5 mt-1 flex flex-wrap items-center gap-0.5">
            {item.text && (
              <IconButton
                label={copied ? t('conversation.copied') : t('conversation.copy')}
                className="h-7 w-7"
                onClick={() => {
                  void navigator.clipboard.writeText(item.text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </IconButton>
            )}
            {item.state === 'done' && item.text && !cards && (
              <ReadAloud key={item.text} text={stripPageTags(item.text)} />
            )}
            <IconButton
              label={t('common.tryAgain')}
              className="h-7 w-7"
              disabled={busy}
              onClick={() => void retry(item.id)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </IconButton>
            {item.state === 'done' &&
              item.text &&
              item.context?.editableTabId !== undefined &&
              item.context.editableText !== undefined && (
                <ReplaceButton
                  tabId={item.context.editableTabId}
                  text={item.text}
                  original={{ text: item.context.editableText, url: item.context.url }}
                  placeholder={Boolean(item.unrestored)}
                />
              )}
            {item.instruction && (
              <HandoffMenu
                instruction={item.instruction}
                contextUrl={item.context?.url}
                selection={item.selection}
                workspaceDocumentIds={item.workspaceDocumentIds}
              />
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
