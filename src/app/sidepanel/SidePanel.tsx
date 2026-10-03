import { useEffect, useState, type DragEvent } from 'react';
import { Mail, Library, PanelsTopLeft, ScanText, AudioLines, Search } from 'lucide-react';
import { applyTheme } from '@/lib/theme';
import { ActionRow } from './components/ActionRow';
import { Composer } from './components/Composer';
import { ConsentDialog } from './components/ConsentDialog';
import { ContextCard } from './components/ContextCard';
import { Conversation } from './components/Conversation';
import { HistoryView } from './components/HistoryView';
import { FollowupsView } from './components/FollowupsView';
import { WebResearch } from './components/WebResearch';
import { MediaTools } from './components/MediaTools';
import { TabOrganizer } from './components/TabOrganizer';
import { ResearchLibrary } from './components/ResearchLibrary';
import { EmailTracking } from './components/EmailTracking';
import { StatusStrip } from './components/StatusStrip';
import { t } from '../shared/i18n';
import { usePanel } from './store';

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

export function SidePanel() {
  const init = usePanel((state) => state.init);
  const theme = usePanel((state) => state.settings?.theme);
  const toast = usePanel((state) => state.toast);
  const historyOpen = usePanel((state) => state.historyOpen);
  const openFiles = usePanel((state) => state.openFiles);
  const [dragging, setDragging] = useState(false);
  const [followupsOpen, setFollowupsOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState<'ocr' | 'audio' | null>(null);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);

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
        const files = Array.from(event.dataTransfer.files);
        if (files.length) void openFiles(files);
      }}
    >
      <StatusStrip
        followupsOpen={followupsOpen}
        onFollowups={() => {
          usePanel.getState().setHistoryOpen(false);
          setFollowupsOpen((open) => !open);
        }}
        onHistory={() => setFollowupsOpen(false)}
      />
      <nav
        className="flex flex-wrap border-b border-line bg-surface px-3 py-1.5"
        aria-label={t('readTracking.tools')}
      >
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
          onClick={() => setTrackingOpen(true)}
        >
          <Mail className="h-4 w-4" aria-hidden />
          {t('readTracking.entry')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
          onClick={() => setLibraryOpen(true)}
        >
          <Library className="h-4 w-4" aria-hidden />
          {t('library.title')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
          onClick={() => setOrganizerOpen(true)}
        >
          <PanelsTopLeft className="h-4 w-4" aria-hidden />
          {t('tabOrganizer.title')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
          onClick={() => setMediaOpen('ocr')}
        >
          <ScanText className="h-4 w-4" aria-hidden />
          {t('media.ocr')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
          onClick={() => setMediaOpen('audio')}
        >
          <AudioLines className="h-4 w-4" aria-hidden />
          {t('media.audio')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
          onClick={() => setResearchOpen(true)}
        >
          <Search className="h-4 w-4" aria-hidden />
          {t('research.title')}
        </button>
      </nav>
      {followupsOpen ? (
        <FollowupsView
          onClose={() => setFollowupsOpen(false)}
          onTracking={() => setTrackingOpen(true)}
        />
      ) : historyOpen ? (
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
      {researchOpen && <WebResearch onClose={() => setResearchOpen(false)} />}
      {mediaOpen && <MediaTools kind={mediaOpen} onClose={() => setMediaOpen(null)} />}
      {organizerOpen && <TabOrganizer onClose={() => setOrganizerOpen(false)} />}
      {libraryOpen && <ResearchLibrary onClose={() => setLibraryOpen(false)} />}
      {trackingOpen && <EmailTracking onClose={() => setTrackingOpen(false)} />}
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
