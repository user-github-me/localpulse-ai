/** Latin letters, digits, punctuation and general symbols: about 4 characters per token. */
function isLatinLike(codePoint: number): boolean {
  return codePoint <= 0x024f || (codePoint >= 0x2000 && codePoint <= 0x206f);
}

/**
 * Scripts where tokenizers use about one token per character, or more: Indic scripts, Thai and
 * Lao, Hangul, kana and CJK ideographs. Guessing too few tokens overflows small models.
 */
function isDenseScript(codePoint: number): boolean {
  return (
    (codePoint >= 0x0900 && codePoint <= 0x0eff) ||
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x20000 && codePoint <= 0x3134f)
  );
}

/**
 * Rough token estimate for providers without a counter: about 4 characters per token for Latin
 * text, 1 for dense scripts such as Chinese, Japanese, Korean or Bengali, and 2 for other scripts.
 * It errs on the high side: an overestimate only means more, smaller parts.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let latin = 0;
  let dense = 0;
  let other = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isLatinLike(codePoint)) latin++;
    else if (isDenseScript(codePoint)) dense++;
    else other++;
  }
  return Math.ceil(latin / 4 + dense + other / 2);
}

const wordSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : undefined;

/**
 * Counts words in any language. The browser's word segmenter also splits Chinese, Japanese and
 * Thai, which don't put spaces between words; the pattern is a fallback for older browsers.
 */
export function countWords(text: string): number {
  if (wordSegmenter) {
    let count = 0;
    for (const segment of wordSegmenter.segment(text)) if (segment.isWordLike) count++;
    return count;
  }
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

const SCRIPTS: readonly [string, RegExp][] = [
  ['latin', /\p{Script=Latin}/u],
  ['han', /\p{Script=Han}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['bengali', /\p{Script=Bengali}/u],
  ['thai', /\p{Script=Thai}/u],
  ['greek', /\p{Script=Greek}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
];

/** How many letters of each writing system a text has, e.g. { han: 30, latin: 6 }. */
export function scriptCounts(text: string, maxLetters = 100_000): Record<string, number> {
  const counts: Record<string, number> = {};
  let letters = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    const script = SCRIPTS.find(([, test]) => test.test(char))?.[0] ?? 'other';
    counts[script] = (counts[script] ?? 0) + 1;
    if (++letters >= maxLetters) break;
  }
  return counts;
}

/** The writing system most of a text's letters are in. */
export function mainScript(text: string): string | undefined {
  const counts = Object.entries(scriptCounts(text));
  return counts.sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * The language of a text when its writing system gives it away: Chinese, Japanese, Korean,
 * Bengali, Thai, Greek or Hebrew. Undefined for scripts shared by many languages, such as Latin.
 */
export function guessLanguage(text: string): string | undefined {
  const counts = scriptCounts(text, 5_000);
  const letters = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (!letters) return undefined;
  const share = (script: string) => (counts[script] ?? 0) / letters;
  if (share('kana') > 0.05) return 'ja';
  const byScript: Record<string, string> = {
    han: 'zh',
    hangul: 'ko',
    bengali: 'bn',
    thai: 'th',
    greek: 'el',
    hebrew: 'he',
  };
  const main = mainScript(text);
  return main && share(main) > 0.5 ? byScript[main] : undefined;
}

/**
 * Collapses runs of spaces within lines and more than two blank lines. Leading indentation and
 * fenced code blocks are kept, so code and nested lists survive.
 */
export function normalizeWhitespace(text: string): string {
  let inFence = false;
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line.trimEnd();
      }
      if (inFence) return line.trimEnd();
      const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
      return (
        indent +
        line
          .slice(indent.length)
          .replace(/[^\S\n]+/g, ' ')
          .trimEnd()
      );
    });
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cuts text to roughly `maxTokens`, at a paragraph or sentence boundary when possible. */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTokens(text.slice(0, mid)) <= maxTokens) low = mid;
    else high = mid - 1;
  }
  const cut = text.slice(0, low);
  const boundary = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '));
  return (boundary > low * 0.6 ? cut.slice(0, boundary + 1) : cut).trimEnd();
}

export function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** `https://example.com/*` style match pattern for a URL's origin. */
export function originPattern(url: string): string | undefined {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return undefined;
    return `${protocol}//${hostname}/*`;
  } catch {
    return undefined;
  }
}

export function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export function randomId(prefix = ''): string {
  return prefix + crypto.randomUUID().slice(0, 8);
}
