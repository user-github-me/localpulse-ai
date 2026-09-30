import { browser } from '#imports';

// Functions injected into the page with executeScript({ func }). They're serialized, so each must
// be self-contained: no imports and no outside variables.

function findAndSelect(quote: string): boolean {
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
  const words = quote.split(/\s+/);
  // The full quote first, then shorter openings in case formatting splits it on the page.
  for (const text of [quote, words.slice(0, 10).join(' '), words.slice(0, 6).join(' ')]) {
    if (text && find.call(window, text, false, false, true)) {
      window.getSelection()?.anchorNode?.parentElement?.scrollIntoView({ block: 'center' });
      return true;
    }
  }
  return false;
}

function replaceSelection(text: string): boolean {
  const active = document.activeElement as
    HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    const field = active as HTMLInputElement | HTMLTextAreaElement;
    const { selectionStart, selectionEnd } = field;
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd)
      return false;
    field.setRangeText(text, selectionStart, selectionEnd, 'select');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (active?.isContentEditable && !window.getSelection()?.isCollapsed) {
    // execCommand keeps the page's undo history and editor frameworks in sync.
    return document.execCommand('insertText', false, text);
  }
  return false;
}

/** Scrolls to a quote in the page and selects it, so the user can see it in context. */
export async function showQuoteInPage(tabId: number, quote: string): Promise<boolean> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: findAndSelect,
      args: [quote],
    });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}

/** Puts rewritten text back in place of the selection in the page's text field. */
export async function replaceSelectionInPage(tabId: number, text: string): Promise<boolean> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: replaceSelection,
      args: [text],
    });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}
