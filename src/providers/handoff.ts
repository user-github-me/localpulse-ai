import { browser } from '#imports';
import targets from './handoff-targets.json';

/**
 * Hand-off: copies the prompt and opens the chat site's new-chat page, where the user pastes it
 * and presses Send. No links that fill in a prompt (some sites send those at once), no automation,
 * no permissions for those sites, and their answers are never read.
 */
export interface HandoffTarget {
  id: string;
  label: string;
  newChatUrl: string;
}

export interface HandoffInput {
  instruction: string;
  page?: { title: string; url: string; text: string; source: 'page' | 'selection' };
}

export const HANDOFF_TARGETS: readonly HandoffTarget[] = targets as HandoffTarget[];

const MAX_CLIPBOARD_CHARS = 60_000;

/** The full prompt, with the page text, for the clipboard. */
export function buildHandoffPrompt(input: HandoffInput): string {
  if (!input.page) return input.instruction;
  const { title, url, source } = input.page;
  let text = input.page.text;
  if (text.length > MAX_CLIPBOARD_CHARS) text = `${text.slice(0, MAX_CLIPBOARD_CHARS)}\n[…]`;
  const intro = source === 'selection' ? 'Text I selected on' : 'The page';
  return `${input.instruction}\n\n${intro} "${title}" (${url}):\n\n${text}`;
}

/** Instruction plus the page link, never the page text. Enough for public pages. */
export function buildLinkPrompt(input: HandoffInput): string {
  return input.page ? `${input.instruction}\n\n${input.page.url}` : input.instruction;
}

/**
 * "content" copies the prompt with the page text; "link" copies only the instruction and the
 * page's address. Either way nothing is sent until the user sends it on that site.
 */
export async function handOff(
  target: HandoffTarget,
  input: HandoffInput,
  mode: 'content' | 'link',
): Promise<{ copied: boolean }> {
  const prompt = mode === 'content' ? buildHandoffPrompt(input) : buildLinkPrompt(input);
  let copied = false;
  try {
    await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch {
    // The clipboard can be unavailable; the site still opens.
  }
  await browser.tabs.create({ url: target.newChatUrl });
  return { copied };
}
