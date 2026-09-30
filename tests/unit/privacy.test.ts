import { describe, expect, it } from 'vitest';
import {
  canonicalHost,
  isNeverCloudSite,
  normalizeSiteRule,
  redactPage,
  redactSensitive,
} from '@/core/privacy';

describe('redactSensitive', () => {
  it('hides email addresses', () => {
    const result = redactSensitive('Write to jane.doe+news@example.co.uk today.');
    expect(result.text).toBe('Write to [email] today.');
    expect(result.count).toBe(1);
  });

  it('hides card numbers that pass the Luhn check only', () => {
    expect(redactSensitive('Card 4111 1111 1111 1111 expires').text).toBe(
      'Card [card number] expires',
    );
    expect(redactSensitive('Order 1234 5678 9012 3456').text).toBe('Order 1234 5678 9012 3456');
  });

  it('hides phone numbers in common formats', () => {
    for (const phone of ['+1 (415) 555-0132', '+880 1712-345678', '020 7946 0958']) {
      expect(redactSensitive(`Call ${phone} now`).text).toBe('Call [phone] now');
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

describe('never-cloud sites', () => {
  it('normalizes what users type', () => {
    expect(normalizeSiteRule('https://www.MyBank.com/login')).toBe('mybank.com');
    expect(normalizeSiteRule('*.mail.example.org')).toBe('mail.example.org');
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
    expect(page.title).toBe('Inbox (3) - [email] - Mail');
    expect(page.url).toBe('https://mail.example.com/?to=[email]');
    expect(page.text).toBe('Call [phone].');
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
