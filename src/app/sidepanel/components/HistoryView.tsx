import { Download, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/components/ui';
import {
  clearHistory,
  conversationToMarkdown,
  deleteConversation,
  listConversations,
  type Conversation,
} from '@/storage/history';
import { t } from '../../shared/i18n';
import { domainOf, openSettings } from '../../shared/open';
import { usePanel } from '../store';

function when(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  if (minutes < 60 * 24) return format.format(-Math.round(minutes / 60), 'hour');
  return new Date(timestamp).toLocaleDateString();
}

/** Saves a conversation as a Markdown file. */
export function downloadMarkdown(conversation: Conversation): void {
  const blob = new Blob([conversationToMarkdown(conversation)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = conversation.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  link.href = url;
  link.download = `localpulse-${slug || 'conversation'}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Past conversations, stored only on this device. */
export function HistoryView() {
  const close = usePanel((state) => state.setHistoryOpen);
  const load = usePanel((state) => state.loadConversation);
  const saveHistory = usePanel((state) => state.settings?.saveHistory ?? true);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const reload = () => void listConversations().then(setConversations);

  useEffect(() => {
    let active = true;
    void listConversations().then((list) => active && setConversations(list));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-labelledby="history-title">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id="history-title" className="flex-1 text-sm font-semibold">
          {t('history.title')}
        </h2>
        <IconButton label={t('status.closeHistory')} onClick={() => close(false)}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
        tabIndex={0}
        aria-label={t('history.listLabel')}
      >
        {!saveHistory && (
          <p className="px-2 py-2 text-[0.8rem] text-muted">
            {t('history.off')}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => void openSettings('privacy')}
            >
              {t('history.changeInSettings')}
            </button>
          </p>
        )}
        {conversations?.length === 0 && (
          <p className="px-2 py-6 text-center text-[0.84rem] text-muted">{t('history.empty')}</p>
        )}
        <ul>
          {conversations?.map((conversation) => (
            <li
              key={conversation.id}
              className="group flex items-start gap-1 rounded-lg hover:bg-line/40"
            >
              <button
                type="button"
                onClick={() => void load(conversation.id)}
                className="min-w-0 flex-1 px-2 py-2 text-left"
              >
                <span className="line-clamp-2 text-[0.86rem] font-medium">
                  {conversation.title}
                </span>
                <span className="mt-0.5 block text-[0.74rem] text-muted">
                  {[domainOf(conversation.url), when(conversation.updatedAt)]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </button>
              <IconButton
                label={t('history.download')}
                className="mt-1.5 h-7 w-7"
                onClick={() => downloadMarkdown(conversation)}
              >
                <Download className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={t('history.delete')}
                className="mt-1.5 h-7 w-7"
                onClick={async () => {
                  await deleteConversation(conversation.id);
                  reload();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      </div>
      {conversations && conversations.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-[0.76rem] text-muted">{t('history.savedLocally')}</p>
          <Button
            size="sm"
            variant="danger"
            className="mt-2"
            onClick={async () => {
              await clearHistory();
              reload();
            }}
          >
            {t('history.deleteAll')}
          </Button>
        </div>
      )}
    </div>
  );
}
