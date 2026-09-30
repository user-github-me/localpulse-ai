import { estimateTokens } from '@/lib/text';

// A small English stop-word list; other languages still work because BM25's IDF
// downweights words that appear everywhere.
const STOP_WORDS = new Set(
  (
    'a an and are as at be but by can could did do does for from had has have he her his how i if ' +
    'in into is it its me my no not of on or our she should so such than that the their them then ' +
    'there these they this those to too was we were what when where which who why will with would ' +
    'you your about also any some more most other just only very'
  ).split(' '),
);

const wordSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : undefined;

/** Scripts where a single character is often a whole word. */
const IDEOGRAPHIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * The words of a text, lowercased. The browser's word segmenter also splits Chinese, Japanese and
 * Thai, which don't put spaces between words.
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = wordSegmenter
    ? [...wordSegmenter.segment(lower)]
        .filter((part) => part.isWordLike)
        .map((part) => part.segment)
    : (lower.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []);
  return words.filter(
    (token) => (token.length > 1 || IDEOGRAPHIC.test(token)) && !STOP_WORDS.has(token),
  );
}

/** Okapi BM25 score of each document for the query. */
export function bm25Scores(
  documents: readonly string[],
  query: string,
  k1 = 1.2,
  b = 0.75,
): number[] {
  const docTokens = documents.map(tokenize);
  const averageLength =
    docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(1, docTokens.length) || 1;
  const documentFrequency = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const terms = [...new Set(tokenize(query))];
  const total = documents.length;

  return docTokens.map((tokens) => {
    const frequency = new Map<string, number>();
    for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const f = frequency.get(term) ?? 0;
      if (!f) continue;
      const n = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * tokens.length) / averageLength));
    }
    return score;
  });
}

export interface RelevantSections {
  text: string;
  /** Indexes of the sections used, in page order. */
  indexes: number[];
  total: number;
}

/**
 * Picks the sections most relevant to a question that fit in `budgetTokens`, keeping page order.
 * The first section (usually the intro) is always included when it fits.
 */
export function selectRelevantSections(
  sections: readonly string[],
  query: string,
  budgetTokens: number,
  count: (text: string) => number = estimateTokens,
): RelevantSections {
  const scores = bm25Scores(sections, query);
  const hasMatches = scores.some((score) => score > 0);
  const byRelevance = sections
    .map((_, index) => index)
    .sort((a, b) => (hasMatches ? (scores[b] ?? 0) - (scores[a] ?? 0) : 0) || a - b);

  const chosen = new Set<number>();
  let used = 0;
  const tryAdd = (index: number) => {
    const tokens = count(sections[index] ?? '');
    if (used + tokens > budgetTokens) return;
    chosen.add(index);
    used += tokens;
  };

  if (sections.length > 0) tryAdd(0);
  for (const index of byRelevance) {
    if (!chosen.has(index)) tryAdd(index);
  }

  const indexes = [...chosen].sort((a, b) => a - b);
  const parts: string[] = [];
  indexes.forEach((index, position) => {
    const previous = indexes[position - 1];
    if (previous !== undefined && index !== previous + 1) parts.push('[…]');
    parts.push(sections[index] ?? '');
  });
  return { text: parts.join('\n\n'), indexes, total: sections.length };
}
