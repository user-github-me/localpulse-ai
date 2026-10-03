import Dexie, { type EntityTable } from 'dexie';
import type { HiddenValue } from '@/core/privacy';
import { parseHistoryBackup } from './history-backup';

/** A chat turn as stored. Page content is not stored, only questions, answers and page titles. */
export interface StoredItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actionLabel?: string;
  instruction?: string;
  recipeId?: string;
  context?: { title: string; url: string; source: 'page' | 'selection' };
  state?: 'streaming' | 'done' | 'stopped' | 'error';
  providerLabel?: string;
  privacy?: 'on-device' | 'cloud';
  error?: string;
  notice?: string;
  strategy?: string;
  partsUsed?: number;
  partsTotal?: number;
  redactions?: number;
  /** Locally recorded provenance; portable imports never inherit this trust. */
  sources?: string[];
  providerKey?: string;
  hidden?: HiddenValue[];
}

export interface Conversation {
  id: string;
  title: string;
  url?: string;
  createdAt: number;
  updatedAt: number;
  items: StoredItem[];
  favorite?: boolean;
  /** Keeps a title chosen by the user when another answer is saved. */
  renamed?: boolean;
}

/** Chat history in IndexedDB, only on this device. */
class HistoryDatabase extends Dexie {
  conversations!: EntityTable<Conversation, 'id'>;

  constructor() {
    super('localpulse');
    this.version(1).stores({ conversations: 'id, updatedAt' });
  }
}

let database: HistoryDatabase | undefined;
const db = () => (database ??= new HistoryDatabase());

export async function saveConversation(conversation: Conversation): Promise<void> {
  await db().conversations.put(conversation);
}

export async function listConversations(limit = 100): Promise<Conversation[]> {
  const collection = db().conversations.orderBy('updatedAt').reverse();
  // IndexedDB's getAll count is unsigned 32-bit; an unlimited export must omit the count.
  return limit >= 0xffff_ffff ? collection.toArray() : collection.limit(limit).toArray();
}

/** Searches every saved question, answer, title and address, before applying pagination. */
export async function searchConversations({
  query = '',
  favoritesOnly = false,
  offset = 0,
  limit = 50,
}: {
  query?: string;
  favoritesOnly?: boolean;
  offset?: number;
  limit?: number;
} = {}): Promise<{ conversations: Conversation[]; total: number }> {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  const matches = await db()
    .conversations.orderBy('updatedAt')
    .reverse()
    .filter((conversation) => {
      if (favoritesOnly && !conversation.favorite) return false;
      if (!terms.length) return true;
      const text = [
        conversation.title,
        conversation.url,
        ...conversation.items.flatMap((item) => [
          item.text,
          item.actionLabel,
          item.context?.title,
          item.context?.url,
          item.providerLabel,
        ]),
      ]
        .join('\n')
        .toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .toArray();
  const start = Math.max(0, Math.trunc(offset));
  return {
    conversations: matches.slice(start, start + Math.max(0, Math.trunc(limit))),
    total: matches.length,
  };
}

/** Updates list metadata without rewriting turns or their privacy provenance. */
export async function updateConversationMetadata(
  id: string,
  changes: { title?: string; favorite?: boolean },
): Promise<void> {
  const patch: Partial<Conversation> = {};
  if (changes.title !== undefined) {
    const title = changes.title.trim();
    if (!title || title.length > 140) throw new Error('Invalid conversation title');
    patch.title = title;
    patch.renamed = true;
  }
  if (changes.favorite !== undefined) patch.favorite = changes.favorite;
  await db().conversations.update(id, patch);
}

/** All-or-nothing import with newly generated ids: no existing conversation can be replaced. */
export async function importHistoryBackup(json: string): Promise<number> {
  const conversations = parseHistoryBackup(json);
  await db().transaction('rw', db().conversations, async () => {
    await db().conversations.bulkAdd(conversations);
  });
  return conversations.length;
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  return db().conversations.get(id);
}

export async function deleteConversation(id: string): Promise<void> {
  await db().conversations.delete(id);
}

export async function clearHistory(): Promise<void> {
  await db().conversations.clear();
}

/** A title for the history list: the first question or quick action and the page. */
export function conversationTitle(items: readonly StoredItem[]): string {
  const first = items.find((item) => item.role === 'user');
  if (!first) return 'Conversation';
  const what = first.actionLabel ?? first.text;
  const page = first.context?.title;
  return (page && first.actionLabel ? `${what}: ${page}` : what).slice(0, 140);
}

/** The conversation as a Markdown document, for export. */
export function conversationToMarkdown(conversation: Conversation): string {
  const lines = [
    `# ${conversation.title}`,
    '',
    `_${new Date(conversation.createdAt).toLocaleString()}_`,
  ];
  for (const item of conversation.items) {
    if (item.role === 'user') {
      lines.push('', `## ${item.actionLabel ?? item.text}`);
      if (item.context) {
        const source = item.context.source === 'selection' ? 'Selected text from' : 'Page:';
        lines.push('', `${source} [${item.context.title}](${item.context.url})`);
      }
    } else {
      const where = item.privacy === 'cloud' ? 'in the cloud' : 'on this device';
      lines.push(
        '',
        item.text || item.error || '',
        '',
        `_Answered ${where} by ${item.providerLabel ?? 'unknown'}._`,
      );
    }
  }
  return `${lines.join('\n').trim()}\n`;
}
