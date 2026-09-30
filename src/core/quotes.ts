/**
 * Checked citations: quotes in an answer are checked against the page, so
 * a made-up quote is flagged instead of trusted.
 */

import { countWords, mainScript, scriptCounts } from '@/lib/text';

export interface CheckedQuote {
  text: string;
  found: boolean;
}

/** Lowercases and flattens quotes, dashes and whitespace so small typographic differences match. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quotations in an answer: text in double quotes or in Markdown blockquotes, at least 4 words. */
export function extractQuotes(answer: string): string[] {
  const quotes = new Set<string>();
  const add = (raw: string) => {
    const text = raw
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.…\s]+|[.…\s]+$/g, '');
    if (countWords(text) >= 4 && text.length <= 400) quotes.add(text);
  };
  for (const match of answer.matchAll(/["“]([^"“”\n]{12,400})["”]/g)) {
    if (match[1]) add(match[1]);
  }
  const blockquote: string[] = [];
  for (const line of [...answer.split('\n'), '']) {
    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) {
      blockquote.push(quoted[1] ?? '');
    } else if (blockquote.length) {
      add(blockquote.join(' ').replace(/^["“]|["”]$/g, ''));
      blockquote.length = 0;
    }
  }
  return [...quotes].slice(0, 12);
}

/**
 * Checks each quote against the page text. A quote in another writing system than the page, such
 * as an English translation of a Chinese email, can't be looked up in it, so it isn't checked
 * rather than wrongly flagged as missing.
 */
export function checkQuotes(answer: string, pageText: string): CheckedQuote[] {
  const page = normalizeForMatch(pageText);
  const scripts = scriptCounts(pageText);
  const letters = Object.values(scripts).reduce((sum, count) => sum + count, 0);
  const inPageScript = (quote: string) => {
    const script = mainScript(quote);
    const count = script ? (scripts[script] ?? 0) : letters;
    return count >= 200 || count >= letters * 0.25;
  };
  return extractQuotes(answer)
    .filter(inPageScript)
    .map((text) => ({ text, found: page.includes(normalizeForMatch(text)) }));
}
