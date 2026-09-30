import { estimateTokens } from '@/lib/text';

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s/;

/** Splits Markdown at headings. Text before the first heading is its own section. */
export function splitSections(markdown: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = current.join('\n').trim();
    if (text) sections.push(text);
    current = [];
  };
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && HEADING.test(line)) flush();
    current.push(line);
  }
  flush();
  return sections;
}

/** Splits at blank lines, keeping fenced code blocks whole. */
function splitParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    const paragraph = current.join('\n').trim();
    if (paragraph) paragraphs.push(paragraph);
    current = [];
  };
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === '') flush();
    else current.push(line);
  }
  flush();
  return paragraphs;
}

function splitSentences(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    return [...segmenter.segment(text)].map((part) => part.segment).filter((s) => s.trim());
  }
  return text.split(/(?<=[.!?])\s+/);
}

/**
 * Splits a table or a fenced code block that is too big by lines, never inside a row or a line of
 * code. Each part repeats what makes it readable alone: the table's header, or the code fences.
 * Returns undefined for other text.
 */
function splitBlockLines(
  piece: string,
  maxTokens: number,
  count: (text: string) => number,
): string[] | undefined {
  const lines = piece.split('\n');
  const fenced = FENCE.test(lines[0] ?? '');
  const table = lines.length > 2 && lines.every((line) => line.trim().startsWith('|'));
  if (!fenced && !table) return undefined;
  const head = fenced ? lines.slice(0, 1) : lines.slice(0, 2);
  const closed = fenced && lines.length > 1 && FENCE.test(lines.at(-1) ?? '');
  const tail = fenced ? [closed ? (lines.at(-1) as string) : '```'] : [];
  const body = lines.slice(head.length, closed ? -1 : undefined);
  const frame = count([...head, ...tail].join('\n'));
  const parts: string[] = [];
  let current: string[] = [];
  let tokens = frame;
  for (const line of body) {
    const lineTokens = count(line) + 1;
    if (current.length && tokens + lineTokens > maxTokens) {
      parts.push([...head, ...current, ...tail].join('\n'));
      current = [];
      tokens = frame;
    }
    current.push(line);
    tokens += lineTokens;
  }
  if (current.length) parts.push([...head, ...current, ...tail].join('\n'));
  return parts;
}

function hardSplit(text: string, maxTokens: number, count: (text: string) => number): string[] {
  const parts: string[] = [];
  const approxChars = Math.max(1, Math.floor((text.length * maxTokens) / Math.max(1, count(text))));
  for (let start = 0; start < text.length; start += approxChars) {
    parts.push(text.slice(start, start + approxChars));
  }
  return parts;
}

/** Breaks text into pieces that each fit `maxTokens`, from coarse (sections) to fine (characters). */
function pieces(text: string, maxTokens: number, count: (text: string) => number): string[] {
  const out: string[] = [];
  const add = (piece: string, level: number) => {
    if (count(piece) <= maxTokens) {
      out.push(piece);
      return;
    }
    const finer =
      level === 0
        ? splitParagraphs(piece)
        : level === 1
          ? (splitBlockLines(piece, maxTokens, count) ?? splitSentences(piece))
          : hardSplit(piece, maxTokens, count);
    if (finer.length <= 1 && level < 2) {
      add(piece, level + 1);
      return;
    }
    for (const part of finer) {
      if (level >= 2) out.push(part);
      else add(part, level + 1);
    }
  };
  for (const section of splitSections(text)) add(section, 0);
  return out;
}

/**
 * Splits text into chunks of at most `maxTokens` (estimated), in order, packing small pieces
 * together. Used to summarize long pages in parts.
 */
export function chunkText(
  text: string,
  maxTokens: number,
  count: (text: string) => number = estimateTokens,
): string[] {
  const limit = Math.max(16, Math.floor(maxTokens));
  const chunks: string[] = [];
  let current = '';
  let currentTokens = 0;
  for (const piece of pieces(text, limit, count)) {
    const pieceTokens = count(piece);
    if (current && currentTokens + pieceTokens + 1 > limit) {
      chunks.push(current);
      current = '';
      currentTokens = 0;
    }
    current = current ? `${current}\n\n${piece}` : piece;
    currentTokens += pieceTokens + (currentTokens ? 1 : 0);
  }
  if (current) chunks.push(current);
  return chunks;
}
