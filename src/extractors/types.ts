export type PageKind = 'html' | 'pdf' | 'youtube';

export type ExtractSource =
  'readability' | 'fallback' | 'github-code' | 'github-diff' | 'youtube' | 'pdf' | 'empty';

/** What the extractor returns from the page. Must be structured-cloneable. */
export interface ExtractedPage {
  url: string;
  title: string;
  kind: PageKind;
  source: ExtractSource;
  markdown: string;
  wordCount: number;
  lang?: string;
  siteName?: string;
  byline?: string;
  /** Text the user had selected, if any. */
  selection?: string;
  /** True when the selection is inside a text field or editable area (it can be replaced). */
  selectionEditable?: boolean;
  /** True when the content was cut to the size limit. */
  truncated?: boolean;
  /** YouTube video id, for the transcript adapter. */
  videoId?: string;
  /** For YouTube: whether a transcript was found. */
  hasTranscript?: boolean;
  /** For PDFs: number of pages. */
  pages?: number;
}

/** Upper bound on extracted text, so huge pages don't stall the panel. */
export const MAX_EXTRACT_CHARS = 400_000;
