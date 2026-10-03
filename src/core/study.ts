export interface Flashcard {
  front: string;
  back: string;
}

const MAX_CARDS = 50;
const MAX_FIELD_CHARS = 4000;
const MAX_RESPONSE_CHARS = 250_000;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_FIELD_CHARS) return false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
  }
  return true;
}

/**
 * Only complete, bounded structured answers become study cards. We never recover a partial JSON
 * object or silently drop malformed cards; the caller keeps the original answer visible instead.
 */
export function parseFlashcards(text: string): readonly Flashcard[] | undefined {
  if (text.length > MAX_RESPONSE_CHARS) return undefined;
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  try {
    const value: unknown = JSON.parse(fenced ? (fenced[1] ?? '') : trimmed);
    if (!object(value) || Object.keys(value).length !== 1 || !Array.isArray(value.cards)) {
      return undefined;
    }
    if (value.cards.length === 0 || value.cards.length > MAX_CARDS) return undefined;
    const cards: Flashcard[] = [];
    for (const card of value.cards) {
      if (
        !object(card) ||
        Object.keys(card).length !== 2 ||
        !field(card.front) ||
        !field(card.back)
      ) {
        return undefined;
      }
      cards.push({ front: card.front.trim(), back: card.back.trim() });
    }
    return cards;
  } catch {
    return undefined;
  }
}

/** Copy a deck order before Fisher–Yates shuffling; ratings remain attached to original ids. */
export function shuffleCards(
  order: readonly number[],
  random: () => number = Math.random,
): number[] {
  const shuffled = [...order];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled;
}

export type CardRating = 'known' | 'again';
export type CardRatings = Readonly<Record<number, CardRating>>;

/** Find the next unrated card, wrapping once; undefined means the round is complete. */
export function nextUnrated(
  order: readonly number[],
  current: number,
  ratings: CardRatings,
): number | undefined {
  for (let offset = 1; offset <= order.length; offset++) {
    const index = (current + offset) % order.length;
    const id = order[index];
    if (id !== undefined && ratings[id] === undefined) return index;
  }
  return undefined;
}

/**
 * Anki reads the import directives, then two fields per record. Controlled HTML keeps line breaks
 * and literal markup, and makes every CSV cell start with '<' instead of a spreadsheet formula.
 * User content is escaped before it enters HTML; it can never add tags or import directives.
 */
export function flashcardsToAnkiCsv(cards: readonly Flashcard[]): string {
  const escape = (text: string) =>
    `<span>${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r\n?|\n/g, '<br>')}</span>`;
  const cell = (text: string) => `"${escape(text).replace(/"/g, '""')}"`;
  return [
    '#separator:comma',
    '#html:true',
    ...cards.map((card) => `${cell(card.front)},${cell(card.back)}`),
    '',
  ].join('\r\n');
}
