import { describe, expect, it } from 'vitest';
import {
  canonicalHost,
  hasPlaceholder,
  isNeverCloudSite,
  normalizeSiteRule,
  redactPage,
  redactSensitive,
  Redactor,
  unnumberPlaceholders,
} from '@/core/privacy';

describe('redactSensitive', () => {
  it('hides email addresses', () => {
    const result = redactSensitive('Write to jane.doe+news@example.co.uk today.');
    expect(result.text).toBe('Write to [email 1] today.');
    expect(result.count).toBe(1);
  });

  it('hides card numbers that pass the Luhn check only', () => {
    expect(redactSensitive('Card 4111 1111 1111 1111 expires').text).toBe(
      'Card [card number 1] expires',
    );
    expect(redactSensitive('Order 1234 5678 9012 3456').text).toBe('Order 1234 5678 9012 3456');
  });

  it('hides phone numbers in common formats', () => {
    for (const phone of ['+1 (415) 555-0132', '+880 1712-345678', '020 7946 0958']) {
      expect(redactSensitive(`Call ${phone} now`).text).toBe('Call [phone 1] now');
    }
  });

  it('leaves dates, versions, years and plain numbers alone', () => {
    const text =
      'Released 2024-05-17, version 1.22.3.4, in 1999-2001, population 1,234,567 and 123456789.';
    const result = redactSensitive(text);
    expect(result.text).toBe(text);
    expect(result.count).toBe(0);
  });
});

describe('Redactor', () => {
  it('numbers placeholders, reuses them for the same value, and restores the answer', () => {
    const redactor = new Redactor();
    expect(redactor.redact('Mail ana@x.example, or ana@x.example, or bo@x.example.')).toBe(
      'Mail [email 1], or [email 1], or [email 2].',
    );
    expect(redactor.redact('Call 020 7946 0958.')).toBe('Call [phone 1].');
    // What the model wrote from the placeholders shows the real values again.
    expect(redactor.restore('Write to [Email 1] and call [phone 1]; not [email 9].')).toBe(
      'Write to ana@x.example and call 020 7946 0958; not [email 9].',
    );
    expect(redactor.count).toBe(4);
  });

  it('finds addresses next to Chinese or Japanese text without swallowing it', () => {
    expect(redactSensitive('请联系jane@example.com了解详情').text).toBe('请联系[email 1]了解详情');
    const long = `${'中'.repeat(80)}jane@example.com`;
    expect(redactSensitive(long).text).toBe(`${'中'.repeat(80)}[email 1]`);
  });

  it('hides phone numbers written with full-width or Bengali digits and Unicode dashes', () => {
    expect(redactSensitive('电话：０２０ ７９４６ ０９５８。').text).toBe('电话：[phone 1]。');
    expect(redactSensitive('ফোন: ০১৭১১-২৩৪৫৬৭').text).toBe('ফোন: [phone 1]');
    expect(redactSensitive('Tel 020‐7946‐0958').text).toBe('Tel [phone 1]');
  });

  it('hides phone numbers written right next to Japanese, Korean or Thai words', () => {
    expect(redactSensitive('お問い合わせは03-1234-5678まで').text).toBe(
      'お問い合わせは[phone 1]まで',
    );
    expect(redactSensitive('010-1234-5678로 연락').text).toBe('[phone 1]로 연락');
    expect(redactSensitive('โทร02-123-4567ค่ะ').text).toBe('โทร[phone 1]ค่ะ');
    // Latin letters next to digits still make them a code, not a phone number.
    expect(redactSensitive('SKU AB0207946095 and x020-7946-0958y').count).toBe(0);
  });

  it('hides card numbers after a dash, or next to another number', () => {
    expect(redactSensitive('Card—4111 1111 1111 1111').text).toBe('Card—[card number 1]');
    expect(redactSensitive('Card – 4111-1111-1111-1111').text).toBe('Card – [card number 1]');
    expect(redactSensitive('Card-4111 1111 1111 1111').text).toBe('Card-[card number 1]');
    expect(redactSensitive('Visa-4111-1111-1111-1111').text).toBe('Visa-[card number 1]');
    expect(redactSensitive('Card 4111 1111 1111 1111-').text).toBe('Card [card number 1]-');
    expect(redactSensitive('Qty 1 4111 1111 1111 1111').text).toBe('Qty 1 [card number 1]');
  });

  it('hides addresses stuck to long runs of Khmer, Lao, Myanmar or Hindi text', () => {
    for (const letter of ['ក', 'ສ', 'မ', 'क']) {
      const text = `${letter.repeat(77)}info@company.example`;
      expect(redactSensitive(text).text).toBe(`${letter.repeat(77)}[email 1]`);
    }
  });

  it('leaves ISBNs and codes with Cyrillic letters alone', () => {
    for (const text of [
      'Артикул АБ0207946095',
      'ISBN 978-0-306-40615-7',
      'ISBN: 0-306-40615-2',
      'See 978-0-306-40615-7.',
    ]) {
      expect(redactSensitive(text).text).toBe(text);
    }
  });

  it('hides addresses written in other scripts', () => {
    expect(redactSensitive('Пишите на иван@пример.рф').text).toBe('Пишите на [email 1]');
    expect(redactSensitive('Escribe a niño@ejemplo.es.').text).toBe('Escribe a [email 1].');
    expect(redactSensitive('ईमेल: राम@उदाहरण.भारत').text).toBe('ईमेल: [email 1]');
  });

  it('hides values it hid before word for word, even where the patterns miss them', () => {
    const redactor = new Redactor();
    expect(
      redactor.redact('Call 020 7946 0958now or 020 7946 0958now', [
        { kind: 'phone', value: '020 7946 0958' },
      ]),
    ).toBe('Call [phone 1]now or [phone 1]now');
    expect(redactor.count).toBe(2);
  });

  it('restores placeholders written in other forms, and unnumbers ones left in old answers', () => {
    const redactor = new Redactor();
    redactor.redact('Call 020 7946 0958');
    expect(redactor.restore('[PHONE_1], [phone １], [Phone 01]')).toBe(
      '020 7946 0958, 020 7946 0958, 020 7946 0958',
    );
    // A translated label can't be put back; Replace checks for the value itself (store.ts).
    expect(redactor.restore('[teléfono 1]')).toBe('[teléfono 1]');
    expect(unnumberPlaceholders('Billing is [email 2]; call [Phone 1].')).toBe(
      'Billing is [email]; call [Phone].',
    );
  });

  it('restores placeholders the model changed a little, but never inside a link', () => {
    const redactor = new Redactor();
    redactor.redact('Mail ana@x.example');
    expect(redactor.restore('[Email 1], ［email 1］, [ e-mail 1 ] (see https://x.example)')).toBe(
      'ana@x.example, ana@x.example, ana@x.example (see https://x.example)',
    );
    for (const link of [
      '[mail](mailto:[email 1])',
      '![x](https://img.example/[email 1].png)',
      'https://evil.example/?e=[email 1]',
      '<https://evil.example/[email 1]>',
      'www.evil.example/[email 1]',
    ]) {
      expect(redactor.restore(link)).toBe(link);
    }
  });

  it('lists the hidden values an answer refers to, and spots placeholders left in it', () => {
    const redactor = new Redactor();
    redactor.redact('Mail ana@x.example or call 020 7946 0958');
    expect(redactor.valuesIn('Write to [Email 1] or [email 1]; not [phone 7].')).toEqual([
      { kind: 'email', value: 'ana@x.example' },
    ]);
    expect(hasPlaceholder('see [Card number 2]')).toBe(true);
    expect(hasPlaceholder('see [2] and [emails]')).toBe(false);
  });
});

describe('never-cloud sites', () => {
  it('normalizes what users type', () => {
    expect(normalizeSiteRule('https://www.MyBank.com/login')).toBe('mybank.com');
    expect(normalizeSiteRule('*.mail.example.org')).toBe('mail.example.org');
    expect(normalizeSiteRule('.bank.com')).toBe('bank.com');
    expect(normalizeSiteRule('  ')).toBe('');
  });

  it('matches the site and its subdomains', () => {
    const rules = ['mybank.com'];
    expect(isNeverCloudSite('mybank.com', rules)).toBe(true);
    expect(isNeverCloudSite('secure.mybank.com', rules)).toBe(true);
    expect(isNeverCloudSite('www.mybank.com', rules)).toBe(true);
    expect(isNeverCloudSite('notmybank.com', rules)).toBe(false);
    expect(isNeverCloudSite(undefined, rules)).toBe(false);
  });

  it('matches hosts with a trailing dot and Unicode names written either way', () => {
    expect(canonicalHost('WWW.MyBank.com.')).toBe('mybank.com');
    expect(isNeverCloudSite('mybank.com.', ['mybank.com'])).toBe(true);
    expect(isNeverCloudSite('secure.mybank.com.', ['https://mybank.com/'])).toBe(true);
    // Browsers report Unicode hostnames in their ASCII (punycode) form.
    expect(isNeverCloudSite('xn--bcher-kva.de', ['bücher.de'])).toBe(true);
    expect(isNeverCloudSite('shop.xn--bcher-kva.de', ['*.Bücher.de'])).toBe(true);
  });
});

describe('redactPage', () => {
  it('hides addresses in the title and the URL too, as webmail titles contain them', () => {
    const { page, count } = redactPage({
      title: 'Inbox (3) - jane@example.com - Mail',
      url: 'https://mail.example.com/?to=bob%40example.org',
      text: 'Call 020 7946 0958.',
    });
    expect(page.title).toBe('Inbox (3) - [email 1] - Mail');
    expect(page.url).toBe('https://mail.example.com/?to=[email 2]');
    expect(page.text).toBe('Call [phone 1].');
    expect(count).toBe(3);
  });
});

describe('redaction speed', () => {
  it('stays fast on long text without an "@" (no quadratic backtracking)', () => {
    const text = 'a'.repeat(400_000);
    const start = performance.now();
    expect(redactSensitive(text).count).toBe(0);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
