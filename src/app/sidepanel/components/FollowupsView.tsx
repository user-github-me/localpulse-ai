import {
  CalendarDays,
  Check,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { browser } from '#imports';
import { Button, Dialog, IconButton, TextInput } from '@/components/ui';
import {
  filterFollowups,
  FollowupError,
  parseLocalDue,
  safeFollowupUrl,
  snoozeDue,
  toLocalDue,
  followupsToIcs,
  type Followup,
  type FollowupFilter,
} from '@/core/followups';
import {
  addFollowup,
  clearFollowups,
  deleteFollowup,
  listFollowups,
  updateFollowup,
} from '@/storage/followups';
import { t } from '../../shared/i18n';
import { domainOf } from '../../shared/open';
import { usePanel } from '../store';

interface Draft {
  id?: string;
  title: string;
  due: string;
  sourceUrl?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof FollowupError)
    return (t as (key: string) => string)(`followups.${error.code}`);
  return t('followups.operationFailed');
}

/** User-created reminders kept only in local storage; no message scraping or background tracking. */
export function FollowupsView({
  onClose,
  onTracking,
}: {
  onClose: () => void;
  onTracking?: () => void;
}) {
  const headingId = useId();
  const titleId = useId();
  const dueId = useId();
  const page = usePanel((state) => state.tab.page);
  const [tasks, setTasks] = useState<Followup[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FollowupFilter>('due');
  const [now, setNow] = useState(Date.now);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const visible = filterFollowups(tasks, query, filter, now);

  useEffect(() => {
    let active = true;
    void listFollowups()
      .then((values) => {
        if (active) {
          setTasks(values);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(t('followups.operationFailed'));
          setLoading(false);
        }
      });
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setTasks(await listFollowups());
      setNow(() => Date.now());
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const start = (usePage: boolean) => {
    setError('');
    setNotice('');
    setDraft({
      title: usePage ? (page?.title ?? '').slice(0, 160) : '',
      due: toLocalDue(snoozeDue(Date.now())),
      sourceUrl: usePage ? safeFollowupUrl(page?.url) : undefined,
    });
  };

  const save = async () => {
    if (!draft) return;
    const dueAt = parseLocalDue(draft.due);
    if (dueAt === undefined) throw new FollowupError('invalidDue');
    const fields = { title: draft.title, dueAt, sourceUrl: draft.sourceUrl };
    if (draft.id) await updateFollowup(draft.id, fields);
    else await addFollowup(fields);
    setDraft(null);
    setFilter(
      draft.id && tasks.find((task) => task.id === draft.id)?.status === 'done'
        ? 'done'
        : dueAt <= Date.now()
          ? 'due'
          : 'upcoming',
    );
    setNotice(t('followups.saved'));
  };

  const exportCalendar = async () => {
    const content = followupsToIcs(await listFollowups());
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'localpulse-followups.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(t('followups.exported'));
  };

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id={headingId} className="flex-1 text-sm font-semibold">
          {t('followups.title')}
        </h2>
        <IconButton label={t('followups.close')} onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
        tabIndex={0}
        aria-busy={busy || loading}
      >
        <p className="text-[0.78rem] text-muted">{t('followups.note')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => start(false)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t('followups.new')}
          </Button>
          <Button
            size="sm"
            disabled={busy || !page?.title || !safeFollowupUrl(page.url)}
            onClick={() => start(true)}
          >
            {t('followups.addPage')}
          </Button>
        </div>
        <TextInput
          type="search"
          aria-label={t('followups.search')}
          placeholder={t('followups.searchPlaceholder')}
          value={query}
          maxLength={500}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="flex items-center gap-2 text-[0.8rem]">
          <span>{t('followups.filter')}</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as FollowupFilter)}
            className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 text-sm"
          >
            <option value="due">{t('followups.due')}</option>
            <option value="upcoming">{t('followups.upcoming')}</option>
            <option value="done">{t('followups.done')}</option>
          </select>
        </label>
        {!draft && error && (
          <p role="alert" className="text-[0.8rem] text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-[0.8rem] text-muted">
            {notice}
          </p>
        )}
        <p role="status" className="text-[0.76rem] text-muted">
          {t('followups.count', { count: String(visible.length) })}
        </p>
        {loading ? (
          <p className="text-sm text-muted">{t('followups.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted">{t('followups.empty')}</p>
        ) : null}
        <ul className="space-y-2">
          {visible.map((task) => (
            <li key={task.id} className="rounded-[10px] border border-line bg-surface p-3">
              <h3 dir="auto" className="text-sm font-medium [overflow-wrap:anywhere]">
                {task.title}
              </h3>
              <time
                dateTime={new Date(task.dueAt).toISOString()}
                className="mt-1 block text-[0.78rem] text-muted"
              >
                {new Date(task.dueAt).toLocaleString()}
              </time>
              {task.sourceUrl && (
                <p className="mt-1 truncate text-[0.74rem] text-muted">
                  {domainOf(task.sourceUrl)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      updateFollowup(task.id, { status: task.status === 'done' ? 'open' : 'done' }),
                    )
                  }
                >
                  {task.status === 'done' ? (
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {t(task.status === 'done' ? 'followups.reopen' : 'followups.complete')}
                </Button>
                {task.status === 'open' && (
                  <IconButton
                    label={t('followups.snooze')}
                    disabled={busy}
                    onClick={() =>
                      void run(() => updateFollowup(task.id, { dueAt: snoozeDue(task.dueAt) }))
                    }
                  >
                    <CalendarDays className="h-4 w-4" aria-hidden />
                  </IconButton>
                )}
                <IconButton
                  label={t('followups.edit')}
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setDraft({
                      id: task.id,
                      title: task.title,
                      due: toLocalDue(task.dueAt),
                      sourceUrl: task.sourceUrl,
                    });
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </IconButton>
                {task.sourceUrl && (
                  <IconButton
                    label={t('followups.openSource')}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const url = safeFollowupUrl(task.sourceUrl);
                        if (!url) throw new FollowupError('invalidUrl');
                        await browser.tabs.create({ url });
                      })
                    }
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </IconButton>
                )}
                <IconButton
                  label={t('followups.delete')}
                  disabled={busy}
                  onClick={() => void run(() => deleteFollowup(task.id))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2 border-t border-line px-3 py-3">
        <p className="text-[0.74rem] text-muted">{t('followups.reminders')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            wrap
            disabled={busy || !tasks.some((task) => task.status === 'open')}
            onClick={() => void run(exportCalendar)}
          >
            {t('followups.export')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || tasks.length === 0}
            onClick={() => setClearing(true)}
          >
            {t('followups.clear')}
          </Button>
          {onTracking && (
            <Button size="sm" wrap disabled={busy} onClick={onTracking}>
              {t('followups.tracking')}
            </Button>
          )}
        </div>
      </div>
      <Dialog
        open={draft !== null}
        onClose={() => {
          if (!busy) setDraft(null);
        }}
        title={draft?.id ? t('followups.editTitle') : t('followups.addTitle')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(save);
          }}
          className="space-y-3"
        >
          <p className="text-[0.78rem] text-muted">{t('followups.formNote')}</p>
          <label htmlFor={titleId} className="block text-sm">
            {t('followups.name')}
            <TextInput
              id={titleId}
              value={draft?.title ?? ''}
              required
              maxLength={160}
              className="mt-1"
              onChange={(event) =>
                setDraft((value) => value && { ...value, title: event.target.value })
              }
            />
          </label>
          <label htmlFor={dueId} className="block text-sm">
            {t('followups.dueDate')}
            <TextInput
              id={dueId}
              type="datetime-local"
              value={draft?.due ?? ''}
              required
              className="mt-1"
              onChange={(event) =>
                setDraft((value) => value && { ...value, due: event.target.value })
              }
            />
          </label>
          <p className="text-[0.76rem] text-muted [overflow-wrap:anywhere]">
            {t('followups.source')}: {draft?.sourceUrl ?? t('followups.noSource')}
          </p>
          {error && (
            <p role="alert" className="text-[0.8rem] text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !draft?.title.trim()}>
              {t('followups.save')}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={clearing}
        onClose={() => {
          if (!busy) setClearing(false);
        }}
        title={t('followups.clear')}
      >
        <p className="text-sm">{t('followups.clearConfirm')}</p>
        {error && (
          <p role="alert" className="mt-2 text-[0.8rem] text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button disabled={busy} onClick={() => setClearing(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await clearFollowups();
                setClearing(false);
              })
            }
          >
            {t('followups.confirmClear')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
