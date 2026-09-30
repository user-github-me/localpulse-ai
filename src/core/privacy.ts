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
  return canonicalHost(value.replace(/^\*\./, '').replace(/\/.*$/, ''));
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

// Starts only where a run of address characters starts, with bounded parts, so it stays linear:
// an unbounded local part made long text without an "@" take quadratic time.
const EMAIL =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){0,8}\.\p{L}{2,24}/gu;
const CARD_CANDIDATE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;
const PHONE_CANDIDATE = /(?<![\w+])(?:\+|00)?\d[\d ()./-]{6,}\d(?!\w)/g;

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

/** Replaces emails, card numbers (Luhn-checked) and phone numbers with placeholders. */
export function redactSensitive(text: string): RedactionResult {
  let count = 0;
  let result = text.replace(EMAIL, () => {
    count++;
    return '[email]';
  });
  result = result.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    count++;
    return '[card number]';
  });
  result = result.replace(PHONE_CANDIDATE, (match) => {
    if (!looksLikePhone(match.trim())) return match;
    count++;
    return '[phone]';
  });
  return { text: result, count };
}

/**
 * Redacts a page for a cloud request: its text, and its title and address too, since those can
 * hold an email address (webmail titles, links with an address in them).
 */
export function redactPage<T extends { title: string; url: string; text: string }>(
  page: T,
): { page: T; count: number } {
  let url = page.url;
  try {
    url = decodeURIComponent(url);
  } catch {
    // Keep the address as it is.
  }
  const parts = [page.title, url, page.text].map(redactSensitive);
  const [title, address, text] = parts as [RedactionResult, RedactionResult, RedactionResult];
  return {
    page: { ...page, title: title.text, url: address.text, text: text.text },
    count: parts.reduce((sum, part) => sum + part.count, 0),
  };
}
