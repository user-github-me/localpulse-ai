/**
 * Checked citations: quotes in an answer are checked against the page, so
 * a made-up quote is flagged instead of trusted.
 */

import { countWords, mainScript, scriptCounts } from '@/lib/text';

export interface CheckedQuote {
  text: string;
  found: boolean;
}

/**
 * Makes small differences not count: letter case, full-width forms, and punctuation (commas, quote
 * marks, dashes) in any language. Only the words and their order decide a match.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
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
  // Pairs are read from left to right, so a closing quote mark never starts the next quote.
  for (const match of answer.matchAll(
    /"([^"\n]*)"|“([^“”\n]*)”|「([^「」\n]*)」|『([^『』\n]*)』/g,
  )) {
    const text = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
    if (
      text.length >= 12 ||
      (text.length >= 6 &&
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text))
    )
      add(text);
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
