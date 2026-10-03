import { extractArticle, extractFallback } from '@/extractors/generic';
import type { ExtractedPage } from '@/extractors/types';
import { MAX_EXTRACT_CHARS } from '@/extractors/types';
import { countWords } from '@/lib/text';

/** The PDF couldn't be fetched, most likely because LocalPulse has no access to the site. */
export class PdfAccessError extends Error {
  constructor(readonly url: string) {
    super(`No access to ${url}`);
    this.name = 'PdfAccessError';
  }
}

type Progress = (page: number, total: number) => void;

const pdfCache = new Map<
  string,
  Pick<ExtractedPage, 'markdown' | 'wordCount' | 'pages' | 'truncated' | 'title'>
>();

async function parsePdf(data: ArrayBuffer, onPage?: Progress) {
  const { pdfToMarkdown } = await import('@/extractors/pdf');
  return pdfToMarkdown(data, onPage);
}

function limit(markdown: string): { markdown: string; truncated: boolean } {
  return markdown.length > MAX_EXTRACT_CHARS
    ? { markdown: markdown.slice(0, MAX_EXTRACT_CHARS), truncated: true }
    : { markdown, truncated: false };
}

/**
 * Reads the text of the PDF shown in a tab. Chrome's PDF viewer can't be
 * scripted, so the panel downloads the file itself; results are cached per URL.
 */
export async function readPdfFromUrl(
  page: ExtractedPage,
  onPage?: Progress,
): Promise<ExtractedPage> {
  const cached = pdfCache.get(page.url);
  if (cached) return { ...page, ...cached, source: 'pdf', kind: 'pdf' };

  let response: Response;
  try {
    response = await fetch(page.url, { credentials: 'include' });
  } catch {
    throw new PdfAccessError(page.url);
  }
  if (!response.ok) throw new Error(`The PDF couldn't be downloaded (HTTP ${response.status}).`);
  const parsed = await parsePdf(await response.arrayBuffer(), onPage);
  const { markdown, truncated } = limit(parsed.markdown);
  const result = {
    markdown,
    wordCount: countWords(markdown),
    pages: parsed.pages,
    truncated: truncated || parsed.truncated,
    title: parsed.title ?? page.title,
  };
  pdfCache.set(page.url, result);
  if (pdfCache.size > 5) pdfCache.delete(pdfCache.keys().next().value as string);
  return { ...page, ...result, source: 'pdf', kind: 'pdf' };
}

const TEXT_FILE = /\.(txt|md|markdown|csv|tsv|json|xml|log|html?|srt|vtt)$/i;
export const FILE_TYPES = '.pdf,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.log,.html,.htm,.srt,.vtt';

export function canOpenFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    /\.pdf$/i.test(file.name) ||
    file.type.startsWith('text/') ||
    TEXT_FILE.test(file.name)
  );
}

/** Reads a file the user dropped or picked. It never leaves the panel unless sent to a cloud provider. */
export async function readFile(file: File, onPage?: Progress): Promise<ExtractedPage> {
  const base = { url: `file:${file.name}`, title: file.name, source: 'fallback' as const };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const parsed = await parsePdf(await file.arrayBuffer(), onPage);
    const { markdown, truncated } = limit(parsed.markdown);
    return {
      ...base,
      title: parsed.title ?? file.name,
      kind: 'pdf',
      source: 'pdf',
      markdown,
      wordCount: countWords(markdown),
      pages: parsed.pages,
      truncated: truncated || parsed.truncated,
    };
  }
  let text = await file.text();
  if (/\.html?$/i.test(file.name) || file.type === 'text/html') {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    text = extractArticle(doc)?.markdown ?? extractFallback(doc);
  }
  const { markdown, truncated } = limit(text);
  return { ...base, kind: 'html', markdown, wordCount: countWords(markdown), truncated };
}
