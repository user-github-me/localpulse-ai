import { describe, expect, it } from 'vitest';
import { redactSensitive } from '@/core/privacy';

// Every value below must be hidden in every context: a change to the patterns that lets one
// through fails here.
const PHONES = [
  '+1 (415) 555-0132',
  '415-555-0132',
  '(415) 555-0132',
  '415.555.0132',
  '1-800-555-0199',
  '+1-800-555-0199',
  '020 7946 0958',
  '+44 20 7946 0958',
  '0171 1234567',
  '+880 1712-345678',
  '01712-345678',
  '03-1234-5678',
  '+81 3-1234-5678',
  '010-1234-5678',
  '+82 10-1234-5678',
  '+7 495 123-45-67',
  '06 12 34 56 78',
  '+33 6 12 34 56 78',
  '0612345678',
  '+4930123456',
  '030 1234567',
  '+49 30 1234567',
  '+91 98765 43210',
  '(02) 1234 5678',
  '0800 123 4567',
  '+61 2 1234 5678',
  '+55 11 91234-5678',
  '0501234567',
  '+972 50-123-4567',
  '+971 50 123 4567',
  '(0 30) 12 34 56 7',
  '+86 138 0013 8000',
  '+62 812-3456-7890',
  '+234 803 123 4567',
];
const CARDS = [
  '4111 1111 1111 1111',
  '4111-1111-1111-1111',
  '4111111111111111',
  '5500 0000 0000 0004',
  '3782 822463 10005',
  '378282246310005',
  '6011 1111 1111 1117',
  '3056 930902 5904',
  '4012888888881881',
  '5555 5555 5555 4444',
  '6200 0000 0000 0005',
];
const EMAILS = [
  'jane.doe@example.com',
  'j.doe+tag@mail.example.co.uk',
  'user_name@sub.domain.org',
  'x@y.io',
  'first-last@company-name.com',
  'имя@пример.рф',
  'müller@beispiel.de',
];
const CONTEXTS: [string, string][] = [
  ['', ''],
  ['Call ', '.'],
  ['Tel: ', ' (office)'],
  ['(', ')'],
  ['电话：', '。'],
  ['お問い合わせは', 'まで'],
  ['연락처 ', '로'],
  ['โทร', 'ค่ะ'],
  ['phone=', '&x=1'],
  ['<', '>'],
  ['"', '"'],
  ['Kontakt: ', ', danke'],
  ['ל', ''],
  ['ب', ''],
  ['No.', ''],
  ['#', ''],
  ['tel:', ''],
  ['[', ']'],
  ['—', '—'],
  ['-', '-'],
  ['/', '/'],
  ['=', ';'],
  ['**', '**'],
  ['_', '_'],
  ['`', '`'],
  ['\n', '\n'],
  ['Card: ', ' exp 12/27'],
  ['Order 1234 ', ''],
  ['ID ', ' x'],
  ['•', ''],
  ['|', '|'],
  ['\t', '\t'],
  ['à ', ' ou'],
  ['Tél. ', ''],
  ['Тел.: ', ''],
  ['電話', ''],
  ['联系', '了解'],
  ["'", "'"],
];

function leftIn(output: string, value: string): boolean {
  if (value.includes('@')) return output.includes(value);
  // The last seven digits of a number are enough to call it leaked.
  const digits = value.replace(/\D/g, '');
  return output.replace(/\D/g, '').includes(digits.slice(-7));
}

describe('redaction corpus', () => {
  it.each(['phone', 'card', 'email'] as const)('hides every %s in every context', (kind) => {
    const values = { phone: PHONES, card: CARDS, email: EMAILS }[kind];
    const leaked: string[] = [];
    for (const value of values) {
      for (const [before, after] of CONTEXTS) {
        const text = before + value + after;
        if (leftIn(redactSensitive(text).text, value)) leaked.push(text);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('hides two numbers in one run, and Chinese mobile numbers written without spaces', () => {
    expect(redactSensitive('Tel. +49 30 1234567 / 030 7654321').text).toBe(
      'Tel. [phone 1] / [phone 2]',
    );
    expect(redactSensitive('(415) 555-0132 (415) 555-0133').text).toBe('[phone 1] [phone 2]');
    expect(redactSensitive('手机：13800138000').text).toBe('手机：[phone 1]');
    // Without Chinese around it, an 11-digit number could be anything.
    expect(redactSensitive('Order 13800138000').count).toBe(0);
    // "_" inside a word still marks a code.
    expect(redactSensitive('user_0207946095 and 0207946095_v2').count).toBe(0);
  });
});
