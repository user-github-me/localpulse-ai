import { useEffect, useState, type DragEvent } from 'react';
import { applyTheme } from '@/lib/theme';
import { ActionRow } from './components/ActionRow';
import { Composer } from './components/Composer';
import { ConsentDialog } from './components/ConsentDialog';
import { ContextCard } from './components/ContextCard';
import { Conversation } from './components/Conversation';
import { HistoryView } from './components/HistoryView';
import { StatusStrip } from './components/StatusStrip';
import { t } from '../shared/i18n';
import { usePanel } from './store';

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

export function SidePanel() {
  const init = usePanel((state) => state.init);
  const theme = usePanel((state) => state.settings?.theme);
  const toast = usePanel((state) => state.toast);
  const historyOpen = usePanel((state) => state.historyOpen);
  const openFile = usePanel((state) => state.openFile);
  const [dragging, setDragging] = useState(false);

  useEffect(() => init(), [init]);
  useEffect(() => (theme ? applyTheme(theme) : undefined), [theme]);

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-paper text-ink"
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <StatusStrip />
      {historyOpen ? (
        <HistoryView />
      ) : (
        <>
          <ContextCard />
          <ActionRow />
          <Conversation />
          <Composer />
        </>
      )}
      <ConsentDialog />
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-[14px] border-2 border-dashed border-local bg-paper/90">
          <p className="max-w-[24ch] text-center text-sm font-medium text-local">
            {t('files.drop')}
          </p>
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-3 bottom-20 z-30 flex justify-center transition-opacity ${
          toast ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {toast && (
          <p className="rounded-[10px] bg-ink px-3 py-2 text-center text-[0.8rem] text-paper shadow-lg">
            {toast}
          </p>
        )}
      </div>
    </div>
  );
}
