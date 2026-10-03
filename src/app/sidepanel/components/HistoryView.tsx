import { Download, Pencil, Star, Trash2, X } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Button, Dialog, IconButton, TextInput } from '@/components/ui';
import {
  clearHistory,
  conversationToMarkdown,
  deleteConversation,
  importHistoryBackup,
  listConversations,
  searchConversations,
  updateConversationMetadata,
  type Conversation,
} from '@/storage/history';
import { HISTORY_BACKUP_LIMITS, HistoryBackupError, historyToJson } from '@/storage/history-backup';
import { conversationsToMarkdown, downloadHistoryFile } from '@/storage/history-export';
import { t } from '../../shared/i18n';
import { domainOf, openSettings } from '../../shared/open';
import { usePanel } from '../store';

const PAGE_SIZE = 50;

function when(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  if (minutes < 60 * 24) return format.format(-Math.round(minutes / 60), 'hour');
  return new Date(timestamp).toLocaleDateString();
}

/** Saves a conversation as a Markdown file. */
export function downloadMarkdown(conversation: Conversation): void {
  const slug = conversation.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  downloadHistoryFile(
    conversationToMarkdown(conversation),
    `localpulse-${slug || 'conversation'}.md`,
    'text/markdown',
  );
}

function backupError(error: unknown): string {
  if (error instanceof HistoryBackupError) {
    switch (error.code) {
      case 'tooLarge':
        return t('history.importTooLarge');
      case 'tooMany':
        return t('history.importTooMany');
      case 'invalidFormat':
        return t('history.importInvalidFormat');
      case 'invalidData':
        return t('history.importInvalidData');
    }
  }
  return t('history.operationFailed');
}

/** Searchable, portable conversations stored only on this device. */
export function HistoryView() {
  const close = usePanel((state) => state.setHistoryOpen);
  const load = usePanel((state) => state.loadConversation);
  const saveHistory = usePanel((state) => state.settings?.saveHistory ?? true);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ conversations: Conversation[]; total: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [title, setTitle] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => {
    let active = true;
    void searchConversations({ query: search, favoritesOnly, limit })
      .then((next) => {
        if (active) {
          setResult(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(t('history.loadFailed'));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [search, favoritesOnly, limit, revision]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      setError(backupError(failure));
    } finally {
      setBusy(false);
    }
  }

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
      <div className="space-y-2 border-b border-line px-4 py-3">
        <TextInput
          type="search"
          aria-label={t('history.search')}
          placeholder={t('history.searchPlaceholder')}
          value={query}
          maxLength={500}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[0.8rem]">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(event) => {
                setFavoritesOnly(event.target.checked);
                setLimit(PAGE_SIZE);
              }}
            />
            {t('history.favoritesOnly')}
          </label>
          {result && (
            <p className="text-[0.76rem] text-muted" role="status">
              {t('history.count', { count: result.total })}
            </p>
          )}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
        tabIndex={0}
        aria-label={t('history.listLabel')}
        aria-busy={loading || busy}
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
        {error && (
          <p role="alert" className="px-2 py-2 text-[0.8rem] text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="px-2 py-2 text-[0.8rem] text-muted">
            {notice}
          </p>
        )}
        {loading && (
          <p role="status" className="px-2 py-6 text-center text-[0.84rem] text-muted">
            {t('history.loading')}
          </p>
        )}
        {result?.total === 0 && (
          <p className="px-2 py-6 text-center text-[0.84rem] text-muted">
            {t(query || favoritesOnly ? 'history.noMatches' : 'history.empty')}
          </p>
        )}
        <ul>
          {result?.conversations.map((conversation) => (
            <li
              key={conversation.id}
              className="group flex items-start gap-0.5 rounded-lg hover:bg-line/40"
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => load(conversation.id))}
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
                label={t(conversation.favorite ? 'history.unfavorite' : 'history.favorite')}
                aria-pressed={conversation.favorite === true}
                className="mt-1.5 h-7 w-7 shrink-0"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await updateConversationMetadata(conversation.id, {
                      favorite: !conversation.favorite,
                    });
                    reload();
                  })
                }
              >
                <Star
                  className={`h-3.5 w-3.5 ${conversation.favorite ? 'fill-current text-local' : ''}`}
                />
              </IconButton>
              <IconButton
                label={t('history.rename')}
                className="mt-1.5 h-7 w-7 shrink-0"
                disabled={busy}
                onClick={() => {
                  setRenaming(conversation);
                  setTitle(conversation.title);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={t('history.download')}
                className="mt-1.5 h-7 w-7 shrink-0"
                disabled={busy}
                onClick={() => {
                  try {
                    downloadMarkdown(conversation);
                  } catch {
                    setError(t('history.operationFailed'));
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={t('history.delete')}
                className="mt-1.5 h-7 w-7 shrink-0"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await deleteConversation(conversation.id);
                    reload();
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
        {result && result.conversations.length < result.total && (
          <Button
            size="sm"
            className="mx-2 my-2"
            disabled={busy}
            onClick={() => setLimit((value) => value + PAGE_SIZE)}
          >
            {t('history.showMore')}
          </Button>
        )}
      </div>
      <div className="border-t border-line px-4 py-3">
        <p className="text-[0.76rem] text-muted">{t('history.savedLocally')}</p>
        <p className="mt-1 text-[0.74rem] text-muted">{t('history.backupNote')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => importInput.current?.click()}>
            {t('history.import')}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const all = await listConversations(Number.MAX_SAFE_INTEGER);
                downloadHistoryFile(
                  historyToJson(all),
                  'localpulse-history.json',
                  'application/json',
                );
              })
            }
          >
            {t('history.backup')}
          </Button>
          <Button
            size="sm"
            disabled={busy || !result?.total}
            onClick={() =>
              void run(async () => {
                const matching = await searchConversations({
                  query: search,
                  favoritesOnly,
                  limit: Number.MAX_SAFE_INTEGER,
                });
                downloadHistoryFile(
                  conversationsToMarkdown(matching.conversations),
                  'localpulse-conversations.md',
                  'text/markdown',
                );
              })
            }
          >
            {t('history.exportResults')}
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => setDeletingAll(true)}>
            {t('history.deleteAll')}
          </Button>
        </div>
        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t('history.import')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void run(async () => {
              if (file.size > HISTORY_BACKUP_LIMITS.bytes) throw new HistoryBackupError('tooLarge');
              const count = await importHistoryBackup(await file.text());
              setNotice(t('history.imported', { count }));
              reload();
            });
          }}
        />
      </div>
      <Dialog
        open={renaming !== null}
        onClose={() => {
          if (!busy) setRenaming(null);
        }}
        title={t('history.rename')}
        labelledBy="history-rename-title"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!renaming) return;
            void run(async () => {
              await updateConversationMetadata(renaming.id, { title });
              setRenaming(null);
              reload();
            });
          }}
        >
          <label htmlFor="history-conversation-name" className="text-sm">
            {t('history.name')}
          </label>
          <TextInput
            id="history-conversation-name"
            className="mt-2"
            value={title}
            maxLength={140}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setRenaming(null)}>
              {t('history.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
              {t('history.save')}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={deletingAll}
        onClose={() => {
          if (!busy) setDeletingAll(false);
        }}
        title={t('history.deleteAll')}
        labelledBy="history-delete-title"
      >
        <p className="text-sm">{t('history.deleteAllConfirm')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={busy} onClick={() => setDeletingAll(false)}>
            {t('history.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await clearHistory();
                setDeletingAll(false);
                reload();
              })
            }
          >
            {t('history.confirmDeleteAll')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
