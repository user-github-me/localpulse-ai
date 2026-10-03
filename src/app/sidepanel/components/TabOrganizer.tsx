import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { Button, Dialog, TextInput } from '@/components/ui';
import {
  duplicateTabIds,
  safeSessionTab,
  tabDomainGroups,
  type OrganizerTab,
  type TabSession,
} from '@/core/tabs';
import { deleteTabSession, listTabSessions, saveTabSession } from '@/storage/tab-sessions';
import { t } from '../../shared/i18n';
export function TabOrganizer({ onClose }: { onClose: () => void }) {
  const [tabs, setTabs] = useState<OrganizerTab[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [sessions, setSessions] = useState<TabSession[]>([]);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [restore, setRestore] = useState<string | null>(null);
  useEffect(() => {
    void listTabSessions()
      .then(setSessions)
      .catch(() => setMessage(t('tabOrganizer.failed')));
  }, []);
  async function refresh() {
    const all = await browser.tabs.query({ currentWindow: true });
    setTabs(
      all
        .flatMap((tab) => {
          const safe = safeSessionTab(tab);
          return safe && tab.id !== undefined && !tab.incognito
            ? [{ ...safe, id: tab.id, pinned: Boolean(tab.pinned) }]
            : [];
        })
        .slice(0, 500),
    );
    setChosen(new Set());
    setConfirm(false);
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      setSessions(await listTabSessions());
    } catch {
      setMessage(t('tabOrganizer.failed'));
    } finally {
      setBusy(false);
    }
  }
  const selected = tabs.filter((tab) => chosen.has(tab.id));
  return (
    <Dialog open onClose={onClose} title={t('tabOrganizer.title')}>
      <p className="text-sm text-muted">{t('tabOrganizer.intro')}</p>
      <Button
        className="mt-3"
        disabled={busy}
        onClick={() => {
          const permission = browser.permissions.request({ permissions: ['tabs'] });
          void perform(async () => {
            if (!(await permission)) throw new Error('permission');
            await refresh();
          });
        }}
      >
        {t('tabOrganizer.load')}
      </Button>
      {tabs.length > 0 && (
        <>
          <TextInput
            className="mt-3"
            aria-label={t('tabOrganizer.filter')}
            placeholder={t('tabOrganizer.filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="my-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setChosen(new Set(duplicateTabIds(tabs)))}>
              {t('tabOrganizer.duplicates')}
            </Button>
            <Button size="sm" onClick={() => setChosen(new Set(tabs.map((tab) => tab.id)))}>
              {t('tabOrganizer.selectAll')}
            </Button>
            <Button size="sm" onClick={() => setChosen(new Set())}>
              {t('tabOrganizer.selectNone')}
            </Button>
          </div>
          <ul className="max-h-[28vh] space-y-1 overflow-auto" aria-label={t('tabOrganizer.tabs')}>
            {tabs
              .filter((tab) =>
                (tab.title + ' ' + tab.url)
                  .toLocaleLowerCase()
                  .includes(filter.toLocaleLowerCase()),
              )
              .map((tab) => (
                <li key={tab.id}>
                  <label className="flex items-start gap-2 p-1 text-sm">
                    <input
                      className="mt-1 accent-[var(--color-local)]"
                      type="checkbox"
                      checked={chosen.has(tab.id)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(tab.id);
                        else next.delete(tab.id);
                        setChosen(next);
                        setConfirm(false);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block break-words">{tab.title}</span>
                      <span className="block text-xs text-muted">
                        {new URL(tab.url).hostname}
                        {tab.pinned ? ` · ${t('tabOrganizer.pinned')}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
          </ul>
          <p className="my-2 text-xs text-muted">
            {t('tabOrganizer.selected', { count: String(selected.length) })}
          </p>
          <TextInput
            aria-label={t('tabOrganizer.name')}
            placeholder={t('tabOrganizer.name')}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="my-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !name.trim() || !selected.length || selected.length > 100}
              onClick={() =>
                void perform(async () => {
                  await saveTabSession(name, selected);
                  setName('');
                  setMessage(t('tabOrganizer.saved'));
                })
              }
            >
              {t('tabOrganizer.save')}
            </Button>
            {!import.meta.env.FIREFOX && (
              <Button
                size="sm"
                disabled={busy || !selected.length}
                onClick={() => {
                  const permission = browser.permissions.request({ permissions: ['tabGroups'] });
                  void perform(async () => {
                    if (!(await permission)) throw new Error('permission');
                    for (const [host, group] of tabDomainGroups(
                      selected.filter((tab) => !tab.pinned),
                    )) {
                      const id = await (
                        browser.tabs as unknown as {
                          group(options: { tabIds: number[] }): Promise<number>;
                        }
                      ).group({ tabIds: group.map((tab) => tab.id) });
                      await browser.tabGroups.update(id, { title: host, collapsed: false });
                    }
                    setMessage(t('tabOrganizer.grouped'));
                  });
                }}
              >
                {t('tabOrganizer.group')}
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              disabled={busy || !selected.length}
              onClick={() => setConfirm(true)}
            >
              {t('tabOrganizer.closeSelected')}
            </Button>
          </div>
          {confirm && (
            <div className="my-2">
              <p className="text-xs text-danger">{t('tabOrganizer.closeNote')}</p>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    // Recheck IDs and URLs: never close a tab that navigated after the preview.
                    const current = await browser.tabs.query({ currentWindow: true });
                    const safe = selected.filter((tab) =>
                      current.some(
                        (now) => now.id === tab.id && now.url === tab.url && !now.pinned,
                      ),
                    );
                    if (safe.length) await browser.tabs.remove(safe.map((tab) => tab.id));
                    await refresh();
                    setMessage(t('tabOrganizer.closed'));
                  })
                }
              >
                {t('tabOrganizer.confirmClose')}
              </Button>
              <Button size="sm" onClick={() => setConfirm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </>
      )}
      <p className="my-3 text-xs text-muted">{t('tabOrganizer.policy')}</p>
      <ul className="max-h-[20vh] space-y-2 overflow-auto" aria-label={t('tabOrganizer.sessions')}>
        {sessions.map((session) => (
          <li key={session.id} className="rounded-lg border border-line p-2">
            <p className="break-words text-sm font-medium">
              {session.name} · {session.tabs.length}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => setRestore(session.id)}>
                {t('tabOrganizer.restore')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                variant="danger"
                onClick={() => void perform(() => deleteTabSession(session.id))}
              >
                {t('common.delete')}
              </Button>
            </div>
            {restore === session.id && (
              <>
                <p className="my-2 text-xs text-muted">
                  {t('tabOrganizer.restoreNote', { count: String(session.tabs.length) })}
                </p>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      for (const tab of session.tabs) {
                        const safe = safeSessionTab(tab);
                        if (safe) await browser.tabs.create({ url: safe.url, active: false });
                      }
                      setRestore(null);
                    })
                  }
                >
                  {t('tabOrganizer.confirmRestore')}
                </Button>
                <Button size="sm" onClick={() => setRestore(null)}>
                  {t('common.cancel')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <p className="my-2 text-sm" role="status">
          {message}
        </p>
      )}
      <Button className="mt-3" onClick={onClose}>
        {t('common.close')}
      </Button>
    </Dialog>
  );
}
