import { expect, it } from 'vitest';
import { composeEditors, isSupportedWebmail, tokenFromImageSource } from '@/core/webmail';
it('recognizes only explicit supported email hosts', () => {
  expect(isSupportedWebmail('https://mail.google.com/mail/u/0')).toBe(true);
  expect(isSupportedWebmail('https://mail.google.com.evil.test/')).toBe(false);
  expect(isSupportedWebmail('http://mail.google.com/')).toBe(false);
});
it('finds compose structure without reading message content', () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML =
    '<div class="Am" role="textbox" contenteditable="true">private message</div><input name="subject" value="private subject"><div contenteditable="true">not a mail editor</div>';
  expect(composeEditors(doc, 'mail.google.com')).toHaveLength(1);
  expect(composeEditors(doc, 'outlook.live.com')).toHaveLength(0);
});
it('recognizes direct and escaped proxy capabilities', () => {
  const token = 'abcdefghijklmnop1234567890';
  expect(tokenFromImageSource(`https://tracker.test/p/${token}.gif`)).toBe(token);
  expect(
    tokenFromImageSource(
      `https://proxy.test/i#${encodeURIComponent(`https://tracker.test/p/${token}.gif`)}`,
    ),
  ).toBe(token);
  expect(tokenFromImageSource('https://tracker.test/p/short.gif')).toBeUndefined();
});
