import { ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { HANDOFF_TARGETS, handOff, type HandoffInput } from '@/providers/handoff';
import { t } from '../../shared/i18n';
import { isMac } from '../../shared/open';
import { usePanel, type SelectionSource } from '../store';
import { workspacePrompt } from '@/core/workspace';

/**
 * Builds the hand-off input: the text chosen from the context menu, or else the current tab, if
 * it's still the page the answer was about.
 */
function handoffInput(
  instruction: string,
  contextUrl?: string,
  chosen?: SelectionSource,
  workspaceDocumentIds?: string[],
): HandoffInput {
  if (chosen) {
    const url = chosen.url ?? contextUrl ?? '';
    return { instruction, page: { title: url, url, text: chosen.text, source: 'selection' } };
  }
  const { tab, settings, file, documents } = usePanel.getState();
  if (workspaceDocumentIds) {
    const chosen = workspaceDocumentIds.flatMap((id) => {
      const document = documents.find((document) => document.id === id);
      return document ? [{ ...document, enabled: true }] : [];
    });
    // Never substitute a different reading set for an answer whose original sources are gone.
    return {
      instruction,
      page: chosen.length === workspaceDocumentIds.length ? workspacePrompt(chosen) : undefined,
    };
  }
  if (file && file.url === contextUrl) {
    return {
      instruction,
      page: { title: file.title, url: file.url, text: file.markdown, source: 'page' },
    };
  }
  const page = tab.status === 'ready' ? tab.page : undefined;
  if (!page || (contextUrl && page.url !== contextUrl)) {
    return {
      instruction,
      page: contextUrl
        ? { title: contextUrl, url: contextUrl, text: '', source: 'page' }
        : undefined,
    };
  }
  const selection = settings?.preferSelection ? page.selection : undefined;
  return {
    instruction,
    page: {
      title: page.title,
      url: page.url,
      text: selection ?? page.markdown,
      source: selection ? 'selection' : 'page',
    },
  };
}

/** "Continue in ChatGPT / Claude / …". The user presses Send there. */
export function HandoffButtons({
  instruction,
  contextUrl,
  selection,
  workspaceDocumentIds,
}: {
  instruction: string;
  contextUrl?: string;
  selection?: SelectionSource;
  workspaceDocumentIds?: string[];
}) {
  const showToast = usePanel((state) => state.showToast);
  const [includeText, setIncludeText] = useState(true);

  const go = async (targetId: string) => {
    const target = HANDOFF_TARGETS.find((item) => item.id === targetId);
    if (!target) return;
    const input = handoffInput(instruction, contextUrl, selection, workspaceDocumentIds);
    const hasText = Boolean(input.page?.text);
    const { copied } = await handOff(target, input, includeText && hasText ? 'content' : 'link');
    const paste = isMac() ? '⌘V' : 'Ctrl+V';
    showToast(
      copied
        ? t('handoff.copied', { target: target.label, paste })
        : t('handoff.opened', { target: target.label }),
    );
  };

  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HANDOFF_TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => void go(target.id)}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[0.78rem] font-medium hover:border-ink/40"
          >
            {target.label}
            <ExternalLink className="h-3 w-3 text-muted" aria-hidden />
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-[0.76rem] text-muted">
        <input
          type="checkbox"
          checked={includeText}
          onChange={(event) => setIncludeText(event.target.checked)}
          className="accent-[var(--color-local)]"
        />
        {t('handoff.includeText')}
      </label>
    </div>
  );
}

/**
 * "Continue in…" under an answer. The chat apps open below the answer's buttons, in the flow of the
 * conversation, so they fit the narrowest panel and are never cut off by its scrolling.
 */
export function HandoffMenu({
  instruction,
  contextUrl,
  selection,
  workspaceDocumentIds,
}: {
  instruction: string;
  contextUrl?: string;
  selection?: SelectionSource;
  workspaceDocumentIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[0.76rem] font-medium text-muted hover:bg-line/50 hover:text-ink"
      >
        {t('handoff.continueIn')}
      </button>
      {open && (
        <div
          id={id}
          ref={(node) => node?.scrollIntoView({ block: 'nearest' })}
          className="order-last mb-1 ml-1.5 mt-1 basis-[calc(100%-0.375rem)] rounded-[14px] border border-line bg-surface p-3"
        >
          <p className="text-[0.8rem] font-medium">{t('handoff.menuTitle')}</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">{t('handoff.menuBody')}</p>
          <HandoffButtons
            instruction={instruction}
            contextUrl={contextUrl}
            selection={selection}
            workspaceDocumentIds={workspaceDocumentIds}
          />
        </div>
      )}
    </>
  );
}
