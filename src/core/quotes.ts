/**
 * Checked citations: quotes in an answer are checked against the page, so
 * a made-up quote is flagged instead of trusted.
 */

import { countWords, mainScript, scriptCounts } from '@/lib/text';

export interface CheckedQuote {
  text: string;
  found: boolean;
  /** For a quote that was found: the page's own wording of it, to look it up in the page. */
  onPage?: string;
  /** Verified local context; never taken from model-generated source labels. */
  location?: { before: string; match: string; after: string; page?: number; heading?: string };
}

/** Quote marks, Markdown emphasis and invisible characters: they never decide a match. */
const IGNORED = /^[\p{Cf}"'`*_~«»‹›“”„‟‘’‚‛「」『』〝〞〟＂＇]+$/u;
const DIGIT = /^\p{Nd}$/u;

interface Normalized {
  text: string;
  /** Where each character of `text` came from in the original: start and end offsets. */
  starts: number[];
  ends: number[];
}

const MARK = /^\p{M}$/u;

/** Whether the line after the one at `index` starts with ">". */
function nextLineQuoted(text: string, index: number): boolean {
  const end = text.indexOf('\n', index);
  return end !== -1 && /^[ \t]*>/.test(text.slice(end + 1, end + 16));
}

/** Hangul vowel and final-consonant jamo: in decomposed text they belong to the syllable before. */
function isJamoTail(code: number): boolean {
  return (code >= 0x1160 && code <= 0x11ff) || (code >= 0xd7b0 && code <= 0xd7ff);
}

/**
 * Makes small differences not count: letter case, full-width forms, quote marks, emphasis, the
 * kind of dash and the spaces around it, punctuation such as commas in any language, and the quote
 * bars and bullets that start Markdown lines. Numbers keep their decimal points ("1.5" isn't
 * "15"), and currency and math signs stay.
 */
function normalize(original: string): Normalized {
  const out: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const push = (chars: string, start: number, end: number) => {
    for (let k = 0; k < chars.length; k++) {
      out.push(chars[k] as string);
      starts.push(start);
      ends.push(end);
    }
  };
  const dropSpace = () => {
    if (out[out.length - 1] !== ' ') return;
    out.pop();
    starts.pop();
    ends.pop();
  };
  const codeAt = (index: number) => original.codePointAt(index) ?? 0;
  let previous = '';
  let afterDash = false;
  let lineStart = true;
  // Markdown quote bars and bullets start a line after a blank line or another such line. Text
  // from a PDF breaks lines anywhere, so elsewhere a "-" or ">" at the start of a line is text.
  let markerAllowed = true;
  let lineHasText = false;
  let lineWasMarker = false;
  let i = 0;
  while (i < original.length) {
    const start = i;
    const code = codeAt(i);
    i += code > 0xffff ? 2 : 1;
    // A character with its combining marks, so "é" written either way normalizes the same.
    while (
      i < original.length &&
      codeAt(i) >= 0x300 &&
      (MARK.test(String.fromCodePoint(codeAt(i))) || isJamoTail(codeAt(i)))
    )
      i += codeAt(i) > 0xffff ? 2 : 1;
    const raw = original.slice(start, i);
    const ascii = code < 0x80 && i - start === 1;
    if (lineStart && !/^\s$/.test(raw)) {
      lineStart = false;
      // Also a quoted email: lines that start with ">" one after another.
      const marker =
        markerAllowed || (raw === '>' && nextLineQuoted(original, start))
          ? /^(?:>[ \t]?)+(?:[-*+](?=[ \t]))?|^[-*+](?=[ \t])/.exec(
              original.slice(start, start + 16),
            )
          : null;
      if (marker) {
        i = start + marker[0].length;
        lineWasMarker = true;
        previous = ' ';
        continue;
      }
      lineHasText = true;
    }
    if (ascii && /[a-z0-9]/i.test(raw)) {
      push(raw.toLowerCase(), start, i);
      afterDash = false;
      previous = raw;
      continue;
    }
    const char = ascii ? raw : raw.normalize('NFKC').toLowerCase().replace(/ς/g, 'σ');
    if (/^\s+$/.test(char)) {
      // Spaces after a dash don't count, however many.
      if (out.length && !afterDash && out[out.length - 1] !== ' ') push(' ', start, i);
      if (raw === '\n') {
        markerAllowed = !lineHasText || lineWasMarker;
        lineStart = true;
        lineHasText = false;
        lineWasMarker = false;
      }
      previous = raw;
      continue;
    } else if (IGNORED.test(char)) {
      previous = raw;
      continue;
    } else if (/^\p{Pd}$/u.test(char) || char === '−') {
      // "well-known", "well—known" and "well – known" are the same words, and "−40" is "-40".
      dropSpace();
      push('-', start, i);
      afterDash = true;
      previous = raw;
      continue;
    } else if (char === '%' || char === '‰') {
      push(char, start, i);
    } else if (/^\p{P}+$/u.test(char)) {
      const next = String.fromCodePoint(codeAt(i));
      if (DIGIT.test(previous) && i < original.length && DIGIT.test(next)) push(char, start, i);
    } else if (/^[\p{Sk}\p{So}]+$/u.test(char)) {
      previous = raw;
      continue;
    } else {
      push(char, start, i);
    }
    afterDash = false;
    previous = raw;
  }
  dropSpace();
  return { text: out.join(''), starts, ends };
}

export function normalizeForMatch(text: string): string {
  return normalize(text).text;
}

/** Closing marks for each opening quote mark. */
const CLOSERS: Record<string, string> = {
  '"': '"',
  '“': '”',
  '„': '“”',
  '«': '»',
  '「': '」',
  '＂': '＂',
};

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** A " between two Hebrew letters marks an abbreviation (צה"ל), not a quotation. */
function isGershayim(text: string, index: number): boolean {
  return (
    text[index] === '"' &&
    /\p{Script=Hebrew}/u.test(text[index - 1] ?? '') &&
    /\p{Script=Hebrew}/u.test(text[index + 1] ?? '')
  );
}

/** For each position, how many times `mark` comes later on the same line. */
function laterOnLine(text: string, mark: string): number[] {
  const later = new Array<number>(text.length).fill(0);
  for (let i = text.length - 2; i >= 0; i--) {
    const next = text[i + 1];
    later[i] = next === '\n' ? 0 : (later[i + 1] ?? 0) + (next === mark ? 1 : 0);
  }
  return later;
}

/** Quotes nest a few levels at most; deeper marks are ignored, which keeps the reading linear. */
const MAX_DEPTH = 8;

/**
 * Text between quote marks, read from left to right, so a closing mark never opens a quote. A
 * quote inside a quote (the "fast path" in “the so-called "fast path" is off”) stays part of it.
 * Models sometimes mix marks (“like this"): a straight mark closes a curly quote when the curly
 * marks after it on the line pair up among themselves, and a ” closes a straight quote when the
 * straight marks after it do.
 */
function quotedSpans(answer: string): { text: string; mark: string }[] {
  const spans: { text: string; mark: string }[] = [];
  const open: { mark: string; start: number }[] = [];
  const openLater = laterOnLine(answer, '“');
  const closeLater = laterOnLine(answer, '”');
  const straightLater = laterOnLine(answer, '"');
  const close = (level: number, end: number) => {
    const closed = open[level];
    open.length = level;
    if (level === 0 && closed)
      spans.push({ text: answer.slice(closed.start, end), mark: closed.mark });
  };
  for (let i = 0; i < answer.length; i++) {
    const char = answer[i] ?? '';
    if (char === '\n') {
      open.length = 0;
      continue;
    }
    if (isGershayim(answer, i)) continue;
    // The innermost open quote that this mark closes, if any.
    let level = open.length - 1;
    while (level >= 0 && !CLOSERS[open[level]?.mark ?? '']?.includes(char)) level--;
    const top = open.at(-1)?.mark;
    if (level >= 0) {
      close(level, i);
    } else if (char === '"' && top === '“' && openLater[i] === closeLater[i]) {
      close(open.length - 1, i);
    } else if (char === '”' && top === '"' && (straightLater[i] ?? 0) % 2 === 0) {
      close(open.length - 1, i);
    } else if (char in CLOSERS && open.length < MAX_DEPTH) {
      open.push({ mark: char, start: i + 1 });
    }
  }
  return spans;
}

/** Quotations in an answer: text in quote marks or in Markdown blockquotes, at least 4 words. */
export function extractQuotes(answer: string): string[] {
  const quotes = new Set<string>();
  const add = (raw: string) => {
    const text = raw
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.…\s]+|[.…\s]+$/g, '');
    if (countWords(text) >= 4 && text.length <= 400) quotes.add(text);
  };
  for (const { text, mark } of quotedSpans(answer)) {
    // 「」 also mark names and terms in Japanese; 『』, titles, aren't taken at all.
    const shortest = mark === '「' ? 8 : CJK.test(text) ? 6 : 12;
    if (text.length >= shortest) add(text);
  }
  const blockquote: string[] = [];
  for (const line of [...answer.split('\n'), '']) {
    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) {
      // A quoted list: its bullets aren't part of the quote.
      blockquote.push((quoted[1] ?? '').replace(/^[-*+][ \t]+/, ''));
    } else if (blockquote.length) {
      add(blockquote.join(' ').replace(/^["“]|["”]$/g, ''));
      blockquote.length = 0;
    }
  }
  return [...quotes].slice(0, 12);
}

/** Page text without the Markdown the extractor added, closer to what the page shows. */
function asShown(markdown: string): string {
  return (
    markdown
      .replace(/\*\*|__|~~|`+/g, '')
      .replace(/(^|[\s(])[_*]+(?=\S)|(?<=\S)[_*]+(?=$|[\s.,;:!?)])/gm, '$1')
      // Quote bars and list bullets where a line starts inside the quote (the quote's own start
      // is past them).
      .replace(/\n[ \t]*(?:>[ \t]*)*(?:(?:#{1,6}|[-*+]|\d{1,3}[.)])[ \t]+)?/g, '\n')
      // The extractor's escapes: "snake\_case".
      .replace(/\\([\\`*_{}[\]()#+\-.!>|~<])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Checks each quote against the page text. A quote in another writing system than the page, such
 * as an English translation of a Chinese email, can't be looked up in it, so it isn't checked
 * rather than wrongly flagged as missing.
 */
export function checkQuotes(answer: string, pageText: string, locate = false): CheckedQuote[] {
  const quotes = extractQuotes(answer);
  if (!quotes.length) return [];
  const scripts = scriptCounts(pageText);
  const letters = Object.values(scripts).reduce((sum, count) => sum + count, 0);
  const inPageScript = (quote: string) => {
    const script = mainScript(quote);
    const count = script ? (scripts[script] ?? 0) : letters;
    return count >= 200 || count >= letters * 0.25;
  };
  const page = normalize(pageText);
  return quotes.filter(inPageScript).map((text) => {
    const needle = normalizeForMatch(text);
    const index = needle ? page.text.indexOf(needle) : -1;
    if (index < 0) return { text, found: false };
    const start = page.starts[index] ?? 0;
    const end = page.ends[index + needle.length - 1] ?? pageText.length;
    const onPage = asShown(pageText.slice(start, end));
    const result: CheckedQuote =
      onPage && onPage !== text ? { text, found: true, onPage } : { text, found: true };
    if (locate) {
      const headings = [...pageText.slice(0, start).matchAll(/^#{1,6} (.+)$/gm)];
      const pageHeadings = headings.filter((h) => /^Page [1-9][0-9]*$/.test(h[1] ?? ''));
      const pageNumber = pageHeadings.at(-1)?.[1]?.slice(5);
      result.location = {
        before: pageText.slice(Math.max(0, start - 240), start),
        match: pageText.slice(start, end),
        after: pageText.slice(end, end + 240),
        ...(pageNumber && { page: Number(pageNumber) }),
        ...(headings.at(-1)?.[1] && { heading: headings.at(-1)?.[1] }),
      };
    }
    return result;
  });
}
