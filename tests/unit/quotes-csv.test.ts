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

  it('reads mixed straight and curly marks, and German and French quotes', () => {
    expect(
      extractQuotes(
        [
          'It says “compute shaders run parallel work" here.',
          'Es heißt „Das ist ein langer deutscher Satz“.',
          'Il dit « C’est une longue phrase en français ».',
        ].join('\n'),
      ),
    ).toEqual([
      'compute shaders run parallel work',
      'Das ist ein langer deutscher Satz',
      'C’est une longue phrase en français',
    ]);
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
