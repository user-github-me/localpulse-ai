import { describe, expect, it } from 'vitest';
import { flashcardsToAnkiCsv, nextUnrated, parseFlashcards, shuffleCards } from '@/core/study';

const cards = [
  { front: 'What can the GPU compute?', back: 'Parallel workloads.' },
  { front: 'কেন GPU ব্যবহার করব?', back: 'অনেক কাজ একসাথে করতে।' },
];

describe('structured flashcards', () => {
  it('reads complete pure or fenced JSON while preserving Unicode and escaped content', () => {
    const value = { cards: [...cards, { front: ' Say "hello" ', back: 'first\nsecond\tline' }] };
    const text = JSON.stringify(value);
    expect(parseFlashcards(text)).toEqual([
      ...cards,
      { front: 'Say "hello"', back: 'first\nsecond\tline' },
    ]);
    expect(parseFlashcards(`  \n\`\`\`json\r\n${text}\r\n\`\`\`  `)).toEqual(parseFlashcards(text));
    expect(parseFlashcards(`\`\`\`\n${text}\n\`\`\``)).toEqual(parseFlashcards(text));
  });

  it('returns no deck for malformed, incomplete, mixed or ambiguous output', () => {
    const outputs = [
      '',
      '{"cards":[',
      JSON.stringify(cards),
      JSON.stringify({ cards: [] }),
      JSON.stringify({ cards: [{ front: 'Question only' }] }),
      JSON.stringify({ cards: [{ front: 'Question', back: 12 }] }),
      JSON.stringify({ cards: [{ front: 'Question', back: 'Answer', source: 'unexpected' }] }),
      JSON.stringify({ cards, note: 'additional text' }),
      JSON.stringify({ cards: [...cards, null] }),
      JSON.stringify({ cards: [...cards, { front: '   ', back: 'Answer' }] }),
      JSON.stringify({ cards: [{ front: '\u0000', back: 'Answer' }] }),
      `Here are your cards:\n${JSON.stringify({ cards })}`,
      `\`\`\`json\n${JSON.stringify({ cards })}\n\`\`\`\nSome extra notes`,
      '| Front | Back |\n| --- | --- |\n| Question | Answer |',
    ];
    for (const output of outputs) expect(parseFlashcards(output)).toBeUndefined();
  });

  it('rejects oversized output and fields without discarding individual cards', () => {
    expect(
      parseFlashcards(JSON.stringify({ cards: Array.from({ length: 50 }, () => cards[0]) })),
    ).toHaveLength(50);
    expect(
      parseFlashcards(JSON.stringify({ cards: Array.from({ length: 51 }, () => cards[0]) })),
    ).toBeUndefined();
    expect(
      parseFlashcards(JSON.stringify({ cards: [{ front: 'x'.repeat(4001), back: 'Answer' }] })),
    ).toBeUndefined();
    expect(parseFlashcards(' '.repeat(250001))).toBeUndefined();
  });
});

describe('study rounds', () => {
  it('visits every unrated card even after shuffled navigation, then ends the round', () => {
    const order = [4, 1, 3, 0, 2];
    expect(nextUnrated(order, 2, { 4: 'known', 1: 'known', 3: 'again' })).toBe(3);
    expect(nextUnrated(order, 4, { 2: 'known', 4: 'known', 1: 'again' })).toBe(2);
    expect(
      nextUnrated(order, 1, { 4: 'known', 1: 'known', 3: 'again', 0: 'known', 2: 'again' }),
    ).toBeUndefined();
    expect(nextUnrated([], 0, {})).toBeUndefined();
  });

  it('shuffles ids without mutating their source order or losing duplicates', () => {
    const order = [0, 1, 2, 3];
    const shuffled = shuffleCards(order, () => 0);
    expect(shuffled).toEqual([1, 2, 3, 0]);
    expect(order).toEqual([0, 1, 2, 3]);
    expect(shuffled.toSorted()).toEqual(order);
    expect(shuffleCards([0])).toEqual([0]);
  });
});

describe('local Anki export', () => {
  it('writes deterministic two-field CSV with explicit import settings and no heading card', () => {
    expect(flashcardsToAnkiCsv(cards)).toBe(
      [
        '#separator:comma',
        '#html:true',
        '"<span>What can the GPU compute?</span>","<span>Parallel workloads.</span>"',
        '"<span>কেন GPU ব্যবহার করব?</span>","<span>অনেক কাজ একসাথে করতে।</span>"',
        '',
      ].join('\r\n'),
    );
  });

  it('escapes HTML, quotes and multiline text while keeping formula prefixes inert', () => {
    const output = flashcardsToAnkiCsv([
      { front: '=SUM(1,2) "quoted" <img src=x onerror=alert(1)>', back: 'a&b\r\nnext\nlast\rline' },
      { front: '#separator:tab', back: '+danger' },
    ]);
    expect(output).toContain(
      '"<span>=SUM(1,2) &quot;quoted&quot; &lt;img src=x onerror=alert(1)&gt;</span>"',
    );
    expect(output).toContain('"<span>a&amp;b<br>next<br>last<br>line</span>"');
    expect(output).not.toContain('<img');
    expect(output.split('\r\n')).toHaveLength(5);
    expect(output.split('\r\n')[3]).toBe('"<span>#separator:tab</span>","<span>+danger</span>"');
  });
});
