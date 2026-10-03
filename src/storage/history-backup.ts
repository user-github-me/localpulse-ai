import { UNKNOWN_SOURCE } from '@/core/conversation';
import type { Conversation, StoredItem } from './history';

/** Portable backups contain conversation text and labels, never provider credentials or consent. */
export const HISTORY_BACKUP_LIMITS = {
  bytes: 25 * 1024 * 1024,
  conversations: 1000,
  items: 20_000,
  text: 500_000,
} as const;

export type HistoryBackupErrorCode = 'tooLarge' | 'invalidFormat' | 'invalidData' | 'tooMany';

export class HistoryBackupError extends Error {
  constructor(readonly code: HistoryBackupErrorCode) {
    super(code);
    this.name = 'HistoryBackupError';
  }
}

function fail(code: HistoryBackupErrorCode): never {
  throw new HistoryBackupError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalidData');
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || value.length > max) fail('invalidData');
  return value;
}

function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 8.64e15)
    fail('invalidData');
  return value;
}

/** A title/address is descriptive data; imported files cannot create executable links. */
function address(value: unknown): string | undefined {
  const text = string(value, 8192, true);
  if (!text) return text;
  try {
    const parsed = new URL(text.replace(/^blob:/, ''));
    return ['https:', 'http:', 'file:'].includes(parsed.protocol) ? text : '';
  } catch {
    return '';
  }
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000)
    fail('invalidData');
  return value;
}

/** Explicit fields keep hidden page text, selections, instructions and runtime targets out. */
function portableItem(value: unknown): Omit<StoredItem, 'id'> {
  const input = record(value);
  if (input.role !== 'user' && input.role !== 'assistant') fail('invalidData');
  const item: Omit<StoredItem, 'id'> = {
    role: input.role,
    text: string(input.text, HISTORY_BACKUP_LIMITS.text)!,
  };
  for (const key of ['actionLabel', 'providerLabel'] as const) {
    const text = string(input[key], 500, true);
    if (text !== undefined) item[key] = text;
  }
  for (const key of ['error', 'notice'] as const) {
    const text = string(input[key], 10_000, true);
    if (text !== undefined) item[key] = text;
  }
  if (input.context !== undefined) {
    const context = record(input.context);
    if (context.source !== 'page' && context.source !== 'selection') fail('invalidData');
    item.context = {
      title: string(context.title, 2000)!,
      url: address(context.url) ?? '',
      source: context.source,
    };
  }
  if (input.state !== undefined) {
    if (!['streaming', 'done', 'stopped', 'error'].includes(String(input.state)))
      fail('invalidData');
    item.state = input.state === 'streaming' ? 'stopped' : (input.state as StoredItem['state']);
  }
  if (input.privacy !== undefined) {
    if (input.privacy !== 'on-device' && input.privacy !== 'cloud') fail('invalidData');
    item.privacy = input.privacy;
  }
  for (const key of ['partsUsed', 'partsTotal', 'redactions'] as const) {
    const number = optionalNumber(input[key]);
    if (number !== undefined) item[key] = number;
  }
  return item;
}

type PortableConversation = Omit<Conversation, 'id' | 'items'> & {
  items: Omit<StoredItem, 'id'>[];
};

function validateConversations(value: unknown): PortableConversation[] {
  if (!Array.isArray(value)) fail('invalidData');
  if (value.length > HISTORY_BACKUP_LIMITS.conversations) fail('tooMany');
  let items = 0;
  return value.map((value) => {
    const input = record(value);
    const title = string(input.title, 140)!;
    if (!title.trim() || !Array.isArray(input.items)) fail('invalidData');
    items += input.items.length;
    if (items > HISTORY_BACKUP_LIMITS.items) fail('tooMany');
    if (input.favorite !== undefined && typeof input.favorite !== 'boolean') fail('invalidData');
    const createdAt = timestamp(input.createdAt);
    const updatedAt = timestamp(input.updatedAt);
    if (updatedAt < createdAt) fail('invalidData');
    return {
      title,
      url: address(input.url),
      createdAt,
      updatedAt,
      favorite: input.favorite === true,
      // Imported names are deliberate. Continuing a chat keeps the imported title.
      renamed: true,
      items: input.items.map(portableItem),
    };
  });
}

/** Exports an allowlist, even when legacy stored items contain extra runtime fields. */
export function historyToJson(conversations: readonly Conversation[]): string {
  const json = JSON.stringify(
    {
      format: 'localpulse-history',
      version: 1,
      exportedAt: Date.now(),
      conversations: validateConversations(conversations),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(json).byteLength > HISTORY_BACKUP_LIMITS.bytes) fail('tooLarge');
  return json;
}

/** Validation finishes before storage starts. Every imported turn receives a new identity. */
export function parseHistoryBackup(json: string): Conversation[] {
  if (
    json.length > HISTORY_BACKUP_LIMITS.bytes ||
    new TextEncoder().encode(json).byteLength > HISTORY_BACKUP_LIMITS.bytes
  )
    fail('tooLarge');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail('invalidFormat');
  }
  const root = record(parsed);
  if (root.format !== 'localpulse-history' || root.version !== 1) fail('invalidFormat');
  return validateConversations(root.conversations).map((conversation) => ({
    ...conversation,
    id: `c:${crypto.randomUUID()}`,
    items: conversation.items.map((item) => ({
      ...item,
      id: `${item.role === 'user' ? 'u:' : 'a:'}${crypto.randomUUID()}`,
      // Address/provider labels are untrusted descriptions, never permission to send content.
      ...(item.role === 'assistant' ? { sources: [UNKNOWN_SOURCE] } : {}),
    })),
  }));
}
