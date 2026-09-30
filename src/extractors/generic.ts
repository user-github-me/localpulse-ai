import { isProbablyReaderable, Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { normalizeWhitespace } from '@/lib/text';

let turndown: TurndownService | undefined;

function getTurndown(): TurndownService {
  if (turndown) return turndown;
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
  });
  service.use(gfm);
  service.remove([
    'script',
    'style',
    'noscript',
    'iframe',
    'canvas',
    'template',
    'button',
    'select',
  ]);
  // Link URLs cost tokens and rarely help; keep the link text.
  service.addRule('link-text', {
    filter: 'a',
    replacement: (content) => content,
  });
  service.addRule('image-alt', {
    filter: 'img',
    replacement: (_content, node) => {
      const alt = (node as HTMLImageElement).getAttribute('alt')?.trim();
      return alt ? `[image: ${alt}]` : '';
    },
  });
  service.addRule('svg', {
    filter: (node) => node.nodeName.toLowerCase() === 'svg',
    replacement: () => '',
  });
  turndown = service;
  return service;
}

export function htmlToMarkdown(html: string): string {
  return normalizeWhitespace(getTurndown().turndown(html));
}

export interface Article {
  title: string;
  markdown: string;
  byline?: string;
  siteName?: string;
  lang?: string;
}

/** Main article of the page with Mozilla Readability, or undefined for pages that aren't articles. */
export function extractArticle(doc: Document): Article | undefined {
  if (!isProbablyReaderable(doc, { minContentLength: 140, minScore: 20 })) return undefined;
  const article = new Readability(doc.cloneNode(true) as Document, {
    charThreshold: 300,
    keepClasses: true,
  }).parse();
  if (!article?.content || (article.textContent ?? '').trim().length < 200) return undefined;
  return {
    title: article.title || doc.title,
    markdown: htmlToMarkdown(article.content),
    byline: article.byline ?? undefined,
    siteName: article.siteName ?? undefined,
    lang: article.lang ?? undefined,
  };
}

const BOILERPLATE = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'dialog',
  '[role=navigation]',
  '[role=banner]',
  '[role=contentinfo]',
  '[role=dialog]',
  '[aria-hidden=true]',
  '[hidden]',
].join(',');

/** For web apps where Readability finds no article: the main content minus navigation (§4.1). */
export function extractFallback(doc: Document): string {
  const main = doc.querySelector('main, [role=main], article');
  const source = main && (main.textContent ?? '').trim().length > 200 ? main : doc.body;
  if (!source) return '';
  const root = source.cloneNode(true) as HTMLElement;
  root.querySelectorAll(BOILERPLATE).forEach((element) => element.remove());
  return htmlToMarkdown(root.innerHTML);
}
