import { describe, expect, it } from 'vitest';
import { checkQuotes, extractQuotes, normalizeForMatch } from '@/core/quotes';
import { toCsv } from '@/lib/csv';

const page = `WebGPU is a new web standard that gives pages direct, modern access to the graphics card.
Compute shaders let a page run massively parallel work on the GPU without drawing anything.`;

describe('quotes', () => {
  it('finds quotes in double quotes and blockquotes', () => {
    const answer = [
      'The article says “WebGPU is a new web standard that gives pages direct access”.',
      'Short "two words" are ignored.',
      '> Compute shaders let a page run massively parallel work',
      '> on the GPU without drawing anything.',
    ].join('\n');
    expect(extractQuotes(answer)).toEqual([
      'WebGPU is a new web standard that gives pages direct access',
      'Compute shaders let a page run massively parallel work on the GPU without drawing anything',
    ]);
  });

  it('marks quotes that are not on the page', () => {
    const answer =
      'It says "Compute shaders let a page run massively parallel work" and "WebGPU was invented in 1999 by aliens".';
    expect(checkQuotes(answer, page)).toEqual([
      { text: 'Compute shaders let a page run massively parallel work', found: true },
      { text: 'WebGPU was invented in 1999 by aliens', found: false },
    ]);
  });

  it('ignores typographic differences when matching', () => {
    expect(normalizeForMatch('It’s  a “test” — *really*')).toBe('its a test-really');
    expect(
      checkQuotes('"gives pages direct,  modern access to the graphics card"', page)[0]?.found,
    ).toBe(true);
  });
});

describe('quote pairs', () => {
  it('never takes the text between two quotes for a quote', () => {
    const answer =
      'It says "Yes," and then, about compute shaders and graphics cards, "they run massively parallel work".';
    expect(extractQuotes(answer)).toEqual(['they run massively parallel work']);
  });

  it('keeps quotes inside quotes whole, and reads German and French quotes', () => {
    expect(
      extractQuotes(
        [
          'It says “the so-called "fast path" is disabled by default” here.',
          'It says "the so-called “fast path” is disabled by default" here.',
          'Es heißt „Das ist ein langer deutscher Satz“.',
          'Il dit « C’est une longue phrase en français ».',
        ].join('\n'),
      ),
    ).toEqual([
      'the so-called "fast path" is disabled by default',
      'the so-called “fast path” is disabled by default',
      'Das ist ein langer deutscher Satz',
      'C’est une longue phrase en français',
    ]);
  });

  it('reads mixed pairs of straight and curly marks when the proper mark never comes', () => {
    expect(
      extractQuotes(
        'He wrote “the plan is bad" and then "we should stop the whole project now".\n' +
          'It says "the plan is really bad” and more.\n' +
          'It says “the 12" pizza is big and tasty” here.\n' +
          'It says "the budget is far too small” and "we should stop the project today".\n' +
          'He wrote “the design is so bad" and “we must stop the whole thing right now”.',
      ),
    ).toEqual([
      'the plan is bad',
      'we should stop the whole project now',
      'the plan is really bad',
      'the 12" pizza is big and tasty',
      'the budget is far too small',
      'we should stop the project today',
      'the design is so bad',
      'we must stop the whole thing right now',
    ]);
  });

  it('stays fast on an answer full of unmatched quote marks', () => {
    const start = performance.now();
    extractQuotes('“'.repeat(100_000) + '"'.repeat(100_000));
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('takes a " between Hebrew letters for an abbreviation, not the end of a quote', () => {
    expect(extractQuotes('נאמר "צה"ל הודיע כי המבצע הסתיים היום" בדיווח.')).toEqual([
      'צה"ל הודיע כי המבצע הסתיים היום',
    ]);
  });

  it('skips Japanese titles in 『』 and short terms in 「」', () => {
    expect(extractQuotes('『吾輩は猫である』という小説で「猫です」と書いた。')).toEqual([]);
    expect(extractQuotes('「吾輩は猫である。名前はまだ無い」')).toEqual([
      '吾輩は猫である。名前はまだ無い',
    ]);
  });
});

describe('quote matching', () => {
  it('keeps numbers, currency and math signs, which change the meaning', () => {
    expect(normalizeForMatch('1.5 million')).not.toBe(normalizeForMatch('15 million'));
    expect(normalizeForMatch('costs $5')).not.toBe(normalizeForMatch('costs 5'));
    expect(normalizeForMatch('rose 5%')).not.toBe(normalizeForMatch('rose 5'));
    expect(normalizeForMatch('x < 3')).toBe('x < 3');
    expect(normalizeForMatch('1,000.50, and more')).toBe('1,000.50 and more');
  });

  it('ignores the kind of dash, the spaces around it and invisible characters', () => {
    const words = normalizeForMatch('well-known');
    expect(normalizeForMatch('well – known')).toBe(words);
    expect(normalizeForMatch('well—known')).toBe(words);
    expect(normalizeForMatch('pass\u00ADword and pass\u200Bword')).toBe('password and password');
  });

  it('ignores the Markdown that starts lines of the page, and the kind of minus sign', () => {
    const page =
      '> We should ship the release on\n> Friday after the final review.\n\nIt was −40 °C.';
    expect(
      checkQuotes('"we should ship the release on Friday after the final review"', page)[0]?.found,
    ).toBe(true);
    expect(checkQuotes('"It was -40 °C that morning"', `${page} that morning`)[0]?.found).toBe(
      true,
    );
    expect(normalizeForMatch('- first item\n- second item')).toBe('first item second item');
  });

  it('reads line starts in PDF text as text: only Markdown lists and quotes have markers', () => {
    const pdf = [
      'Under Section\n5. The tenant shall pay the rent on time.',
      'The results\n- which surprised everyone -\nwere strong',
      'A trial with\n>50 participants in the study',
    ].join('\n\n');
    for (const quote of [
      'Under Section 5. The tenant shall pay the rent',
      'The results - which surprised everyone - were strong',
      'with >50 participants in the study',
    ]) {
      expect(checkQuotes(`"${quote}"`, pdf)[0]?.found).toBe(true);
    }
    const list = 'Steps:\n\n- Preheat the oven to 200 degrees\n- Mix the flour and the eggs';
    expect(checkQuotes('"Preheat the oven to 200 degrees Mix the flour"', list)[0]?.found).toBe(
      true,
    );
  });

  it('reads quoted email replies and quoted lists', () => {
    const reply =
      'John Smith wrote:\n> I think we should postpone the\n> release until all the tests pass.';
    expect(
      checkQuotes('"I think we should postpone the release until all the tests pass"', reply)[0]
        ?.found,
    ).toBe(true);
    const page = 'Steps:\n\n-   Preheat the oven to 200 degrees\n-   Mix the flour and the eggs';
    expect(
      checkQuotes('> - Preheat the oven to 200 degrees\n> - Mix the flour and the eggs', page)[0]
        ?.found,
    ).toBe(true);
  });

  it('never drops the number a quote starts with', () => {
    const page = 'Die Regel gilt ab dem 1. Juli 2024 für alle Betriebe in Bayern.';
    expect(checkQuotes('„2. Juli 2024 für alle Betriebe in Bayern“', page)[0]?.found).toBe(false);
    expect(checkQuotes('„1. Juli 2024 für alle Betriebe in Bayern“', page)[0]?.found).toBe(true);
  });

  it('ignores any spaces after a dash, even across lines', () => {
    expect(normalizeForMatch('well –  known')).toBe('well-known');
    const page = 'The results —\n\nwere strong in every region we measured.';
    expect(checkQuotes('"The results — were strong in every region"', page)[0]?.found).toBe(true);
  });

  it('matches Greek capitals and decomposed Korean', () => {
    expect(
      checkQuotes('"ο νομος του κρατους ισχυει σημερα"', 'Ο ΝΟΜΟΣ ΤΟΥ ΚΡΑΤΟΥΣ ΙΣΧΥΕΙ ΣΗΜΕΡΑ.')[0]
        ?.found,
    ).toBe(true);
    const korean = '오늘은 정말 좋은 하루였습니다 모두 감사합니다';
    expect(checkQuotes(`“${korean}”`, korean.normalize('NFD'))[0]?.found).toBe(true);
  });

  it("gives the page's own wording without the extractor's escapes", () => {
    const page = 'Always use snake\\_case names in every module of the project.';
    expect(checkQuotes('"use snake_case names in every module"', page)).toEqual([
      { text: 'use snake_case names in every module', found: true },
    ]);
    const mid = 'We met at 3. Then we left the party early that night.';
    expect(checkQuotes('"at 3. Then we left the party early"', mid)).toEqual([
      { text: 'at 3. Then we left the party early', found: true },
    ]);
  });

  it("gives the page's own wording of a found quote, without the Markdown", () => {
    const page = 'It’s a well-known fact that **cats** sleep 16 hours a _day_, the study says.';
    expect(checkQuotes('"It\'s a well—known fact that cats sleep 16 hours a day"', page)).toEqual([
      {
        text: "It's a well—known fact that cats sleep 16 hours a day",
        found: true,
        onPage: 'It’s a well-known fact that cats sleep 16 hours a day',
      },
    ]);
  });
});

describe('quotes across languages', () => {
  const email = '您收到此邮件是因为您在AirTCP申请了密码重置,如果不是您申请的,请忽略此邮件.';

  it("doesn't flag translated quotes as missing: they can't be looked up in the original", () => {
    const answer =
      'It says "You received this email because you requested a password reset on AirTCP".';
    expect(checkQuotes(answer, email)).toEqual([]);
  });

  it('reads 「」 quotes and ignores full-width punctuation differences', () => {
    expect(checkQuotes('它写着「您收到此邮件,是因为您在AirTCP申请了密码重置」。', email)).toEqual([
      {
        text: '您收到此邮件,是因为您在AirTCP申请了密码重置',
        found: true,
        // The page's own wording, for Show on page.
        onPage: '您收到此邮件是因为您在AirTCP申请了密码重置',
      },
    ]);
  });

  it('checks quotes in Chinese, which has no spaces between words', () => {
    expect(checkQuotes('它说“您收到此邮件是因为您在AirTCP申请了密码重置”。', email)).toEqual([
      { text: '您收到此邮件是因为您在AirTCP申请了密码重置', found: true },
    ]);
    expect(checkQuotes('它说“这封邮件来自您的银行客户经理”。', email)).toEqual([
      { text: '这封邮件来自您的银行客户经理', found: false },
    ]);
  });

  it('still checks English quotes on a page that mixes languages', () => {
    const page = `${'Compute shaders let a page run massively parallel work. '.repeat(3)}${email}`;
    expect(checkQuotes('"Compute shaders let a page run massively parallel work"', page)).toEqual([
      { text: 'Compute shaders let a page run massively parallel work', found: true },
    ]);
  });
});

describe('toCsv', () => {
  it('quotes cells with commas, quotes and newlines', () => {
    expect(
      toCsv([
        ['Browser', 'Status'],
        ['Chrome, Edge', 'Said "yes"'],
        ['Firefox', 'Line\nbreak'],
      ]),
    ).toBe('Browser,Status\r\n"Chrome, Edge","Said ""yes"""\r\nFirefox,"Line\nbreak"');
  });

  it('stops cells from running as spreadsheet formulas, but keeps plain numbers', () => {
    expect(toCsv([['=HYPERLINK("https://evil.example")', '+1+2', '@SUM(A1)', '-5', '+3.5%']])).toBe(
      `"'=HYPERLINK(""https://evil.example"")",'+1+2,'@SUM(A1),-5,+3.5%`,
    );
  });
});
