import { checkQuotes, type CheckedQuote } from './quotes';
import type { PromptPage } from './prompts';
import type { ExtractedPage } from '@/extractors/types';
import { countWords, randomId } from '@/lib/text';
import { sourceKey } from './conversation';

/** Explicitly captured content, held in panel memory and never in chat history. */
export interface WorkspaceDocument extends ExtractedPage {
  id: string;
  enabled: boolean;
}

export const MAX_WORKSPACE_DOCUMENTS = 12;
export const MAX_WORKSPACE_CHARS = 2_000_000;
export const MAX_WORKSPACE_FILE_BYTES = 25 * 1024 * 1024;

export function captureDocument(page: ExtractedPage): WorkspaceDocument {
  const { selection: _selection, selectionEditable: _editable, ...content } = page;
  return {
    ...content,
    title: page.title.replace(/[\r\n]+/g, ' ').slice(0, 300),
    id: randomId('doc-'),
    enabled: true,
  };
}

export function workspaceFits(
  existing: readonly WorkspaceDocument[],
  incoming: readonly WorkspaceDocument[],
): boolean {
  const all = [...existing, ...incoming];
  return (
    all.length <= MAX_WORKSPACE_DOCUMENTS &&
    all.reduce((sum, document) => sum + document.markdown.length, 0) <= MAX_WORKSPACE_CHARS
  );
}

/** Two local files with the same name are separate disclosures, even within one panel session. */
export function workspaceSourceKey(document: WorkspaceDocument): string {
  return document.url.startsWith('file:') ? `file:${document.id}` : sourceKey(document.url);
}

/** Frames the reading set and retains independent parts for budget-aware splitting in runTurn. */
export function workspacePrompt(documents: readonly WorkspaceDocument[]): PromptPage | undefined {
  const chosen = documents.filter((document) => document.enabled && document.markdown.trim());
  if (!chosen.length) return undefined;
  const text = chosen
    .map((document, index) => {
      const label = `Document ${index + 1}: ${document.title.replace(/[\r\n]+/g, ' ').slice(0, 300)}`;
      return `# ${label}\n\n${document.markdown}`;
    })
    .join('\n\n');
  return {
    title: chosen.length === 1 ? (chosen[0]?.title ?? '') : `${chosen.length} documents`,
    // Privacy is determined from every document's URL separately, never from this display URL.
    url: chosen[0]?.url ?? '',
    text,
    source: 'page',
    sourceParts: chosen.map((document, index) => ({
      title: `Document ${index + 1}: ${document.title.replace(/[\r\n]+/g, ' ').slice(0, 300)}`,
      text: document.markdown,
    })),
    lang: chosen.length === 1 ? chosen[0]?.lang : undefined,
  };
}

export interface SourceQuote extends CheckedQuote {
  sourceTitle?: string;
  sourceUrl?: string;
}

/** Source names are assigned from actual quote matches, independently of what the model claims. */
export function checkWorkspaceQuotes(
  answer: string,
  documents: readonly WorkspaceDocument[],
): SourceQuote[] {
  const chosen = documents.filter((document) => document.enabled);
  const quotes = new Map<string, SourceQuote>();
  for (const document of chosen) {
    for (const quote of checkQuotes(answer, document.markdown)) {
      const existing = quotes.get(quote.text);
      if (!existing || (!existing.found && quote.found)) {
        quotes.set(
          quote.text,
          quote.found
            ? {
                ...quote,
                sourceTitle: document.title,
                sourceUrl: document.url,
              }
            : quote,
        );
      }
    }
  }
  return [...quotes.values()];
}

export function workspaceWords(documents: readonly WorkspaceDocument[]): number {
  return documents
    .filter((document) => document.enabled)
    .reduce((sum, document) => sum + countWords(document.markdown), 0);
}
