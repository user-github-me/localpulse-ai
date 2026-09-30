import { normalizeWhitespace } from '@/lib/text';

export interface PdfText {
  markdown: string;
  pages: number;
  title?: string;
  /** True when only the first `maxPages` pages were read. */
  truncated: boolean;
}

/**
 * Extracts a PDF's text with pdf.js, loaded only when a PDF is opened.
 * Runs in the side panel: Chrome's PDF viewer can't be scripted, so the panel reads the file itself.
 * Each page becomes a "## Page n" section, which lets long PDFs be summarized page by page.
 */
export async function pdfToMarkdown(
  data: ArrayBuffer,
  onPage?: (page: number, total: number) => void,
  maxPages = 500,
): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    useWasm: false,
    disableFontFace: true,
    stopAtErrors: false,
  });
  const document = await task.promise;

  try {
    const total = Math.min(document.numPages, maxPages);
    const sections: string[] = [];
    for (let number = 1; number <= total; number++) {
      onPage?.(number, document.numPages);
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str;
        if (item.hasEOL) text += '\n';
      }
      page.cleanup();
      const clean = normalizeWhitespace(text);
      if (clean) sections.push(`## Page ${number}\n\n${clean}`);
    }
    const metadata = await document.getMetadata().catch(() => undefined);
    const title = (metadata?.info as { Title?: unknown } | undefined)?.Title;
    return {
      markdown: sections.join('\n\n'),
      pages: document.numPages,
      title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
      truncated: document.numPages > total,
    };
  } finally {
    await task.destroy();
  }
}
