import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, TextInput } from '@/components/ui';
import {
  collectionMatches,
  exportLibrary,
  MAX_LIBRARY_BACKUP_BYTES,
  parseLibraryBackup,
  type ResearchCollection,
} from '@/core/library';
import { captureDocument } from '@/core/workspace';
import { downloadText } from '@/lib/download';
import {
  deleteCollection,
  listCollections,
  renameCollection,
  saveCollections,
} from '@/storage/library';
import { t } from '../../shared/i18n';
import { usePanel } from '../store';
export function ResearchLibrary({ onClose }: { onClose: () => void }) {
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const documents = usePanel((s) => s.documents);
  const file = usePanel((s) => s.file);
  const locked = usePanel((s) => s.busy || s.consent !== null || s.fileStatus !== null);
  const selected = documents.filter((d) => d.enabled);
  const sources = selected.length ? selected : file ? [captureDocument(file)] : [];
  useEffect(() => {
    void listCollections()
      .then(setCollections)
      .catch(() => setMessage(t('library.failed')));
  }, []);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      setCollections(await listCollections());
    } catch (error) {
      const key = error instanceof Error ? error.message : '';
      setMessage(
        t(
          key === 'library.invalidBackup'
            ? 'library.invalidBackup'
            : key === 'library.invalidName'
              ? 'library.invalidName'
              : key === 'library.limit'
                ? 'library.limit'
                : 'library.failed',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onClose={onClose} title={t('library.title')}>
      <p className="text-sm text-muted">{t('library.intro')}</p>
      <div className="mt-3 space-y-2">
        <TextInput
          aria-label={t('library.name')}
          placeholder={t('library.name')}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          wrap
          disabled={busy || locked || (!editing && !sources.length) || !name.trim()}
          onClick={() =>
            void perform(async () => {
              if (editing) {
                await renameCollection(editing, name);
                setEditing(null);
              } else await saveCollections([{ name, documents: sources }]);
              setName('');
              setMessage(t('library.saved'));
            })
          }
        >
          {t(editing ? 'library.rename' : 'library.save')}
        </Button>
        {editing && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setName('');
            }}
          >
            {t('common.cancel')}
          </Button>
        )}
        <p className="text-xs text-muted">
          {t('library.selection', { count: String(sources.length) })}
        </p>
        <TextInput
          aria-label={t('library.search')}
          placeholder={t('library.search')}
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul
        className="my-3 max-h-[38vh] space-y-3 overflow-y-auto"
        aria-label={t('library.collections')}
      >
        {collections
          .filter((c) => collectionMatches(c, query))
          .map((collection) => (
            <li key={collection.id} className="rounded-lg border border-line p-3">
              <h3 className="break-words text-sm font-medium">{collection.name}</h3>
              <p className="my-1 text-xs text-muted">
                {t('library.selection', { count: String(collection.documents.length) })}
              </p>
              <p className="line-clamp-2 break-words text-xs text-muted">
                {collection.documents.map((d) => d.title).join(' · ')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={locked || busy}
                  onClick={() => {
                    if (usePanel.getState().loadDocuments(collection.documents)) onClose();
                    else setMessage(t('library.failed'));
                  }}
                >
                  {t('library.open')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEditing(collection.id);
                    setName(collection.name);
                  }}
                >
                  {t('library.rename')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    downloadText(
                      exportLibrary([collection]),
                      'localpulse-collection.json',
                      'application/json',
                    )
                  }
                >
                  {t('library.exportOne')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => setDeleting(collection.id)}
                >
                  {t('library.delete')}
                </Button>
              </div>
              {deleting === collection.id && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-danger">{t('library.deleteNote')}</p>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await deleteCollection(collection.id);
                        setDeleting(null);
                      })
                    }
                  >
                    {t('library.confirmDelete')}
                  </Button>
                  <Button size="sm" onClick={() => setDeleting(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
            </li>
          ))}
      </ul>
      {!collections.length && <p className="my-3 text-sm text-muted">{t('library.empty')}</p>}
      <p className="text-xs leading-relaxed text-muted">{t('library.backupNote')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !collections.length}
          onClick={() =>
            downloadText(exportLibrary(collections), 'localpulse-library.json', 'application/json')
          }
        >
          {t('library.export')}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {t('library.import')}
        </Button>
        <Button size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      <input
        className="hidden"
        ref={input}
        type="file"
        accept=".json"
        aria-label={t('library.import')}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = '';
          if (chosen)
            void perform(async () => {
              if (chosen.size > MAX_LIBRARY_BACKUP_BYTES) throw new Error('library.limit');
              await saveCollections(parseLibraryBackup(await chosen.text()));
              setMessage(t('library.imported'));
            });
        }}
      />
      {message && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
    </Dialog>
  );
}
