import { hostnameOf } from '@/lib/text';
import type { ChatMessage } from '@/providers/types';
import { hasConsent, type CloudConsent } from '@/storage/consent';
import { isNeverCloudSite, redactSensitive } from './privacy';

/** Where content came from when it can't be told, e.g. an answer saved by an older version. */
export const UNKNOWN_SOURCE = '?';

/**
 * A key for where content came from: the site's hostname as the browser reports it (the form
 * consent is saved under), or the address of a file the user opened ("file:report.pdf").
 * Answers remember the keys of everything they were written from.
 */
export function sourceKey(url: string | undefined): string {
  if (!url) return UNKNOWN_SOURCE;
  if (url.startsWith('file:')) return url;
  return hostnameOf(url) ?? UNKNOWN_SOURCE;
}

/** The parts of a conversation item the history rules need. */
export interface TurnItem {
  role: 'user' | 'assistant';
  text: string;
  /** For questions: what was sent to the model. */
  instruction?: string;
  state?: 'streaming' | 'done' | 'stopped' | 'error';
  /** For answers: the sources of the page and of the earlier turns it was written from. */
  sources?: string[];
  /** For answers: the provider that wrote it. */
  providerId?: string;
}

export interface HistoryPolicy {
  /** The provider this turn goes to. */
  providerId: string;
  cloud: boolean;
  /** Sources of the content sent with this turn. */
  current: readonly string[];
  neverCloudSites: readonly string[];
  consent: CloudConsent;
  /** Hide emails, phone numbers and card numbers, as for the page. */
  redact: boolean;
}

export interface ConversationHistory {
  messages: ChatMessage[];
  /** Sources of the turns included; the new answer is written from them too. */
  sources: string[];
  /** Earlier turns left out because their content may not go to this provider. */
  leftOut: number;
  redactions: number;
}

/**
 * Earlier questions and answers for a follow-up question, without page content. An on-device
 * provider gets them all. A cloud provider only gets turns whose content may go to it: none from
 * a never-send site, and otherwise only from the sources of this turn, sites it has consent for,
 * or turns it wrote itself. Sources carry over from turn to turn, so a summary of a blocked page
 * can't reach the cloud through a later answer that repeated it.
 */
export function conversationHistory(
  items: readonly TurnItem[],
  policy: HistoryPolicy,
): ConversationHistory {
  const messages: ChatMessage[] = [];
  const sources = new Set<string>();
  let leftOut = 0;
  let question: TurnItem | undefined;
  for (const item of items) {
    if (item.role === 'user') {
      question = item;
      continue;
    }
    const asked = question;
    question = undefined;
    // Unanswered or failed turns are skipped, so roles keep alternating.
    if (!asked || item.state !== 'done' || !item.text) continue;
    if (policy.cloud && !mayGoToCloud(item, policy)) {
      leftOut++;
      continue;
    }
    for (const source of item.sources ?? [UNKNOWN_SOURCE]) sources.add(source);
    messages.push(
      { role: 'user', content: asked.instruction ?? asked.text },
      { role: 'assistant', content: item.text },
    );
  }

  let redactions = 0;
  if (policy.cloud && policy.redact) {
    for (const message of messages) {
      const redacted = redactSensitive(message.content);
      message.content = redacted.text;
      redactions += redacted.count;
    }
  }
  return { messages, sources: [...sources], leftOut, redactions };
}

function mayGoToCloud(item: TurnItem, policy: HistoryPolicy): boolean {
  // Saved by an older version, which didn't record where answers came from.
  if (!item.sources) return false;
  if (item.sources.some((source) => isNeverCloudSite(source, policy.neverCloudSites))) return false;
  // This provider wrote it, so its content already went there.
  if (item.providerId === policy.providerId) return true;
  // Content of unknown origin can't be checked against the never-send list, so it stays out.
  return item.sources.every(
    (source) =>
      source !== UNKNOWN_SOURCE &&
      (policy.current.includes(source) || hasConsent(policy.consent, policy.providerId, source)),
  );
}
