import { countWords, normalizeWhitespace } from '@/lib/text';
import { extractArticle, extractFallback } from './generic';
import { extractGitHub, isGitHubUrl } from './github';
import { MAX_EXTRACT_CHARS, type ExtractedPage } from './types';
import { fetchTranscript } from './youtube';

/** Selected text, including a selection inside a text field, and whether it can be edited. */
function readSelection(doc: Document): { text?: string; editable: boolean } {
  // Tag checks instead of instanceof, which fails for elements from another document.
  const active = doc.activeElement as HTMLTextAreaElement | HTMLInputElement | HTMLElement | null;
  // Never read what's typed in a password field, even when it's selected.
  if (active?.tagName === 'INPUT' && (active as HTMLInputElement).type === 'password') {
    return { editable: false };
  }
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    const { selectionStart, selectionEnd, value } = active as HTMLTextAreaElement;
    if (selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart) {
      const text = value.slice(selectionStart, selectionEnd).trim();
      return { text: text || undefined, editable: Boolean(text) };
    }
  }
  const text = doc.getSelection?.()?.toString().trim() || undefined;
  return { text, editable: Boolean(text && active?.isContentEditable) };
}

function metaContent(doc: Document, selector: string): string | undefined {
  return doc.querySelector<HTMLMetaElement>(selector)?.content?.trim() || undefined;
}

function youtubeVideoId(url: URL): string | undefined {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1) || undefined;
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return undefined;
  if (url.pathname === '/watch') return url.searchParams.get('v') ?? undefined;
  const shorts = url.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/);
  return shorts?.[1];
}

function finish(page: Omit<ExtractedPage, 'wordCount'>): ExtractedPage {
  let markdown = page.markdown;
  let truncated = page.truncated;
  if (markdown.length > MAX_EXTRACT_CHARS) {
    markdown = markdown.slice(0, MAX_EXTRACT_CHARS);
    truncated = true;
  }
  return { ...page, markdown, truncated, wordCount: countWords(markdown) };
}

/**
 * Runs inside the page (injected on request, never registered as a content script) and returns
 * the page as Markdown. Order: site adapter → Readability → fallback.
 */
export async function extractPage(doc: Document = document): Promise<ExtractedPage> {
  const href = doc.location?.href ?? '';
  const url = new URL(href || 'about:blank');
  const { text: selection, editable: selectionEditable } = readSelection(doc);
  const lang = doc.documentElement.lang || undefined;
  const siteName = metaContent(doc, 'meta[property="og:site_name"]');
  const base = {
    url: href,
    title: doc.title || url.hostname,
    lang,
    siteName,
    selection,
    selectionEditable,
  };

  if (doc.contentType === 'application/pdf') {
    return finish({ ...base, kind: 'pdf', source: 'pdf', markdown: '' });
  }

  const videoId = youtubeVideoId(url);
  if (videoId) {
    const description =
      metaContent(doc, 'meta[name="description"]') ??
      metaContent(doc, 'meta[property="og:description"]') ??
      '';
    const title = metaContent(doc, 'meta[property="og:title"]') ?? base.title;
    let transcript: string | undefined;
    try {
      transcript = await fetchTranscript(videoId);
    } catch {
      // Best effort: YouTube changes often.
    }
    const parts = [`Video: ${title}`, description && `Description:\n${description}`];
    parts.push(
      transcript
        ? `## Transcript\n\n${transcript}`
        : '(No transcript was available, so only the title and description can be used.)',
    );
    return finish({
      ...base,
      title,
      kind: 'youtube',
      source: 'youtube',
      videoId,
      hasTranscript: Boolean(transcript),
      markdown: normalizeWhitespace(parts.filter(Boolean).join('\n\n')),
    });
  }

  if (isGitHubUrl(url)) {
    try {
      const github = await extractGitHub(doc, url);
      if (github) {
        return finish({
          ...base,
          title: github.title,
          kind: 'html',
          source: github.source,
          markdown: github.markdown,
        });
      }
    } catch {
      // Fall through to the generic extractor.
    }
  }

  const article = extractArticle(doc);
  if (article) {
    return finish({
      ...base,
      title: article.title || base.title,
      lang: article.lang || lang,
      siteName: article.siteName || siteName,
      byline: article.byline,
      kind: 'html',
      source: 'readability',
      markdown: article.markdown,
    });
  }

  const fallback = extractFallback(doc);
  return finish({
    ...base,
    kind: 'html',
    source: fallback ? 'fallback' : 'empty',
    markdown: fallback,
  });
}
