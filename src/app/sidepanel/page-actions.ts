import { browser } from '#imports';

// Functions injected into the page with executeScript({ func }). They're serialized, so each must
// be self-contained: no imports and no outside variables.

function findAndSelect(quotes: string[]): boolean {
  const find = (
    window as Window & {
      find?: (
        text: string,
        caseSensitive?: boolean,
        backwards?: boolean,
        wrap?: boolean,
      ) => boolean;
    }
  ).find;
  if (!find) return false;
  window.getSelection()?.removeAllRanges();
  // Each full quote first, then shorter openings in case formatting splits it on the page.
  const openings = quotes.flatMap((quote) => {
    const words = quote.split(/\s+/);
    return [words.slice(0, 10).join(' '), words.slice(0, 6).join(' ')];
  });
  for (const text of [...quotes, ...openings]) {
    if (text && find.call(window, text, false, false, true)) {
      window.getSelection()?.anchorNode?.parentElement?.scrollIntoView({ block: 'center' });
      return true;
    }
  }
  return false;
}

function replaceSelection(
  text: string,
  expectedText: string,
  expectedUrl: string,
): 'replaced' | 'changed' | 'failed' {
  const same = (a: string, b: string) =>
    a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
  // Only on the page the answer was written for, and only over the text it was written from.
  if (location.href.split('#')[0] !== expectedUrl.split('#')[0]) return 'changed';
  // Keep the spaces and line breaks around the selection, so lines and paragraphs don't merge.
  const fitted = (selected: string) =>
    (/^\s*/.exec(selected)?.[0] ?? '') + text.trim() + (/\s*$/.exec(selected)?.[0] ?? '');
  const active = document.activeElement as
    HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    const field = active as HTMLInputElement | HTMLTextAreaElement;
    const { selectionStart, selectionEnd } = field;
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd)
      return 'failed';
    const selected = field.value.slice(selectionStart, selectionEnd);
    if (!same(selected, expectedText)) return 'changed';
    field.setRangeText(fitted(selected), selectionStart, selectionEnd, 'select');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return 'replaced';
  }
  const selection = window.getSelection();
  if (active?.isContentEditable && selection && !selection.isCollapsed) {
    const selected = selection.toString();
    if (!same(selected, expectedText)) return 'changed';
    // execCommand keeps the page's undo history and editor frameworks in sync.
    return document.execCommand('insertText', false, fitted(selected)) ? 'replaced' : 'failed';
  }
  return 'failed';
}

/** Scrolls to a quote in the page and selects it, so the user can see it in context. */
export async function showQuoteInPage(tabId: number, quotes: string[]): Promise<boolean> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: findAndSelect,
      args: [quotes],
    });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}

/**
 * Puts rewritten text back in place of the selection in the page's text field. It refuses
 * ("changed") when the tab shows another page or the field holds a different selection now.
 */
export async function replaceSelectionInPage(
  tabId: number,
  text: string,
  original: { text: string; url: string },
): Promise<'replaced' | 'changed' | 'failed'> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: replaceSelection,
      args: [text, original.text, original.url],
    });
    return result?.result ?? 'failed';
  } catch {
    return 'failed';
  }
}
