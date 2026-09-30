/**
 * Privacy rules for cloud providers: sites that never go to the cloud,
 * and hiding emails, phone numbers and card numbers before a cloud call.
 */

/**
 * A hostname in the form browsers report it: lowercase ASCII (Unicode names become punycode),
 * without "www." or a trailing dot. So "WWW.Bücher.de." and "xn--bcher-kva.de" are the same site.
 */
export function canonicalHost(host: string): string {
  let value = host.trim().toLowerCase();
  if (!value) return '';
  try {
    value = new URL(`http://${value}`).hostname;
  } catch {
    // Not a valid hostname; compare it as typed.
  }
  return value.replace(/\.+$/, '').replace(/^www\./, '');
}

/** Normalizes user input like "https://www.Bank.com/x" or "*.bank.com" to "bank.com". */
export function normalizeSiteRule(rule: string): string {
  let value = rule.trim().toLowerCase();
  if (!value) return '';
  try {
    if (/^[a-z]+:\/\//.test(value)) value = new URL(value).hostname;
  } catch {
    // Keep the raw value.
  }
  return canonicalHost(value.replace(/^\*?\.+/, '').replace(/\/.*$/, ''));
}

/** True if `host` is a listed site or a subdomain of one. */
export function isNeverCloudSite(host: string | undefined, rules: readonly string[]): boolean {
  if (!host) return false;
  const target = canonicalHost(host);
  if (!target) return false;
  return rules.some((rule) => {
    const site = normalizeSiteRule(rule);
    return site !== '' && (target === site || target.endsWith(`.${site}`));
  });
}

export interface RedactionResult {
  text: string;
  count: number;
}

// Emails: an ASCII name (so it starts right after Chinese, Japanese or other text with no space in
// between), a domain in any script, and a Latin top-level domain. Starting only where a run of
// name characters starts, with bounded parts, keeps it linear on long text.
const EMAIL =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){0,8}\.[A-Za-z]{2,24}/gu;
// Digits in any script (full-width, Bengali, Arabic-Indic…) and any kind of dash.
const DASHES = '\\-\u2010-\u2015\u2212\uFF0D';
const CARD_CANDIDATE = new RegExp(
  `(?<![\\p{Nd}${DASHES}])(?:\\p{Nd}[ ${DASHES}]?){12,18}\\p{Nd}(?![\\p{Nd}${DASHES}])`,
  'gu',
);
const PHONE_CANDIDATE = new RegExp(
  `(?<![\\p{L}\\p{N}_+])(?:\\+|00)?\\p{Nd}[\\p{Nd} ()./${DASHES}]{6,}\\p{Nd}(?![\\p{L}\\p{N}_])`,
  'gu',
);

// The zero of each run of ten digits, for scripts whose digits pages use.
const DIGIT_ZEROS = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6,
  0xe50, 0xed0, 0xf20, 0x1040, 0x1090, 0x17e0, 0x1810, 0xff10,
];

/** Writes digits of any script as 0-9 and every dash as "-", so the shape checks below work. */
function asciiShape(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const zero = DIGIT_ZEROS.find((start) => code >= start && code < start + 10);
      if (zero !== undefined) return String(code - zero);
      return /[\u2010-\u2015\u2212\uFF0D]/.test(char) ? '-' : char;
    })
    .join('');
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function looksLikePhone(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return false;
  // Dates, version numbers and plain large numbers are not phone numbers.
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(match)) return false;
  if (/^\d{1,3}(\.\d+){2,}$/.test(match)) return false;
  if (/^\d{1,3}(,\d{3})+$/.test(match)) return false;
  if (/^\d+$/.test(match) && !match.startsWith('0')) return false;
  const hasPhoneShape = /^(\+|00)/.test(match) || /[ ()-]/.test(match) || match.startsWith('0');
  return hasPhoneShape;
}

type SensitiveKind = 'email' | 'phone' | 'card number';

/**
 * Hides emails, card numbers (Luhn-checked) and phone numbers behind numbered placeholders, such
 * as "[email 1]", before text goes to a cloud provider. It remembers what each one stood for, so
 * the answer can show the real values again on this computer. The same value always gets the same
 * placeholder, across the page and the earlier turns of one request.
 */
export class Redactor {
  /** How many values were hidden, counting repeats. */
  count = 0;
  private readonly originals = new Map<string, string>();
  private readonly labels = new Map<string, string>();
  private readonly numbers: Partial<Record<SensitiveKind, number>> = {};

  private label(kind: SensitiveKind, value: string): string {
    const key = `${kind}\u0000${value}`;
    let label = this.labels.get(key);
    if (!label) {
      const number = (this.numbers[kind] ?? 0) + 1;
      this.numbers[kind] = number;
      label = `[${kind} ${number}]`;
      this.labels.set(key, label);
      this.originals.set(label, value);
    }
    this.count++;
    return label;
  }

  redact(text: string): string {
    let result = text.replace(EMAIL, (match) => this.label('email', match));
    result = result.replace(CARD_CANDIDATE, (match) => {
      const digits = asciiShape(match).replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
      return this.label('card number', match);
    });
    return result.replace(PHONE_CANDIDATE, (match) =>
      looksLikePhone(asciiShape(match).trim()) ? this.label('phone', match) : match,
    );
  }

  /** Puts the real values back where an answer uses the placeholders. */
  restore(text: string): string {
    if (this.originals.size === 0) return text;
    return text.replace(
      /\[(email|phone|card number) (\d+)\]/gi,
      (match, kind: string, number: string) =>
        this.originals.get(`[${kind.toLowerCase()} ${number}]`) ?? match,
    );
  }
}

/** Replaces emails, card numbers and phone numbers with numbered placeholders. */
export function redactSensitive(text: string): RedactionResult {
  const redactor = new Redactor();
  const redacted = redactor.redact(text);
  return { text: redacted, count: redactor.count };
}

/** Decodes a percent-encoded address, so "bob%40mail.com" can be seen (and hidden) as an email. */
export function decodeAddress(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/**
 * Redacts a page for a cloud request: its text, and its title and address too, since those can
 * hold an email address (webmail titles, links with an address in them).
 */
export function redactPage<T extends { title: string; url: string; text: string }>(
  page: T,
  redactor = new Redactor(),
): { page: T; count: number } {
  const before = redactor.count;
  const redacted = {
    ...page,
    title: redactor.redact(page.title),
    url: redactor.redact(decodeAddress(page.url)),
    text: redactor.redact(page.text),
  };
  return { page: redacted, count: redactor.count - before };
}
