import { Files, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Dialog, IconButton } from '@/components/ui';
import { workspacePrompt, workspaceWords } from '@/core/workspace';
import { t, formatNumber } from '../../shared/i18n';
import { usePanel } from '../store';
import { FILE_TYPES } from '../documents';

/** An explicit, temporary reading set. Captured sources never follow tab navigation. */
export function WorkspaceButton() {
  const [open, setOpen] = useState(false);
  const documents = usePanel((state) => state.documents);
  const active = usePanel((state) => state.workspaceActive);
  const loading = usePanel((state) => state.fileStatus);
  const busy = usePanel((state) => state.busy || state.consent !== null);
  const addFiles = usePanel((state) => state.addFiles);
  const capture = usePanel((state) => state.capturePage);
  const toggle = usePanel((state) => state.toggleDocument);
  const remove = usePanel((state) => state.removeDocument);
  const setActive = usePanel((state) => state.setWorkspaceActive);
  const clear = usePanel((state) => state.clearWorkspace);
  const input = useRef<HTMLInputElement>(null);
  const locked = busy || Boolean(loading);
  return (
    <>
      <IconButton label={t('workspace.title')} aria-pressed={active} onClick={() => setOpen(true)}>
        <Files className="h-4 w-4" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('workspace.title')}>
        <p className="text-[0.8rem] leading-relaxed text-muted">{t('workspace.intro')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={locked} onClick={() => input.current?.click()}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t('workspace.addFiles')}
          </Button>
          <Button size="sm" disabled={locked} onClick={() => void capture()}>
            {t('workspace.addPage')}
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept={FILE_TYPES}
          className="hidden"
          aria-label={t('workspace.addFiles')}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void addFiles(files);
            event.target.value = '';
          }}
        />
        {loading && (
          <p role="status" className="mt-3 text-sm text-muted">
            {loading}
          </p>
        )}
        {documents.length === 0 ? (
          <p className="my-4 text-sm text-muted">{t('workspace.empty')}</p>
        ) : (
          <ul
            className="mt-3 max-h-[38vh] space-y-2 overflow-y-auto"
            aria-label={t('workspace.sources')}
          >
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-start gap-2 rounded-lg border border-line p-2"
              >
                <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={document.enabled}
                    disabled={locked}
                    className="mt-1 accent-[var(--color-local)]"
                    onChange={() => toggle(document.id)}
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{document.title}</span>
                    <span className="block text-[0.74rem] text-muted">
                      {t('context.words', document.wordCount, [formatNumber(document.wordCount)])}
                      {document.truncated && ` · ${t('context.cutToFit')}`}
                    </span>
                  </span>
                </label>
                <IconButton
                  label={t('workspace.remove', { name: document.title })}
                  disabled={locked}
                  className="h-7 w-7"
                  onClick={() => remove(document.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[0.75rem] text-muted">{t('workspace.memoryNote')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={locked || !documents.some((document) => document.enabled)}
            onClick={() => {
              setActive(true);
              setOpen(false);
            }}
          >
            {t('workspace.use')}
          </Button>
          {active && (
            <Button
              size="sm"
              disabled={locked}
              onClick={() => {
                setActive(false);
                setOpen(false);
              }}
            >
              {t('workspace.usePage')}
            </Button>
          )}
          {documents.length > 0 && (
            <Button size="sm" variant="danger" disabled={locked} onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {t('workspace.clear')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function WorkspaceSummary() {
  const documents = usePanel((state) => state.documents);
  const locked = usePanel(
    (state) => state.busy || state.consent !== null || state.fileStatus !== null,
  );
  const setActive = usePanel((state) => state.setWorkspaceActive);
  const [preview, setPreview] = useState(false);
  const selected = documents.filter((document) => document.enabled);
  const words = workspaceWords(documents);
  return (
    <>
      <h1 className="font-serif text-[1.02rem]">
        {t('workspace.count', { count: String(selected.length) })}
      </h1>
      <p className="mt-1 line-clamp-2 text-[0.76rem] text-muted">
        {selected.map((document) => document.title).join(' · ') || t('workspace.chooseSources')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.76rem]">
        <span className="text-muted">{t('context.words', words, [formatNumber(words)])}</span>
        <button
          type="button"
          className="rounded font-medium text-local"
          disabled={!selected.length}
          onClick={() => setPreview(true)}
        >
          {t('common.preview')}
        </button>
        <button
          type="button"
          className="rounded font-medium text-muted"
          disabled={locked}
          onClick={() => setActive(false)}
        >
          {t('workspace.usePage')}
        </button>
      </div>
      <Dialog open={preview} onClose={() => setPreview(false)} title={t('context.previewTitle')}>
        <p className="text-[0.8rem] text-muted">{t('context.previewNote')}</p>
        <pre
          tabIndex={0}
          aria-label={t('context.previewLabel')}
          className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-paper p-3 text-[0.75rem]"
        >
          {workspacePrompt(documents)?.text}
        </pre>
        <Button className="mt-3" onClick={() => setPreview(false)}>
          {t('common.close')}
        </Button>
      </Dialog>
    </>
  );
}
