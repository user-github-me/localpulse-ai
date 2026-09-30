import Dexie, { type EntityTable } from 'dexie';

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
}

export interface Conversation {
  id: string;
  title: string;
  url?: string;
  createdAt: number;
  updatedAt: number;
  items: StoredItem[];
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
  return db().conversations.orderBy('updatedAt').reverse().limit(limit).toArray();
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
