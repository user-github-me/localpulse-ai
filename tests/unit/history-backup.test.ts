import { describe, expect, it } from 'vitest';
import { conversationHistory } from '@/core/conversation';
import type { Conversation } from '@/storage/history';
import {
  HISTORY_BACKUP_LIMITS,
  HistoryBackupError,
  historyToJson,
  parseHistoryBackup,
} from '@/storage/history-backup';
import { conversationsToMarkdown } from '@/storage/history-export';

const conversation: Conversation = {
  id: 'original',
  title: 'Research notes',
  url: 'https://article.test/post',
  favorite: true,
  createdAt: 1000,
  updatedAt: 2000,
  items: [
    {
      id: 'u',
      role: 'user',
      text: 'What changed?',
      context: { title: 'A post', url: 'https://article.test/post', source: 'page' },
    },
    {
      id: 'a',
      role: 'assistant',
      text: 'Compute shaders improve performance.',
      state: 'done',
      privacy: 'cloud',
      providerLabel: 'Example',
      providerKey: 'ep:mock@https://llm.test',
      sources: ['article.test'],
      hidden: [{ kind: 'email', value: 'private@example.com' }],
    },
  ],
};

function backup(conversations: unknown[] = [conversation]): string {
  return JSON.stringify({ format: 'localpulse-history', version: 1, conversations });
}

describe('portable history backups', () => {
  it('round trips text, dates and favorites with fresh conversation and message ids', () => {
    const json = historyToJson([conversation]);
    const first = parseHistoryBackup(json)[0]!;
    const second = parseHistoryBackup(json)[0]!;
    expect(first).toMatchObject({
      title: conversation.title,
      createdAt: 1000,
      updatedAt: 2000,
      favorite: true,
      renamed: true,
    });
    expect(first.items.map((item) => item.text)).toEqual(
      conversation.items.map((item) => item.text),
    );
    expect(
      new Set([
        first.id,
        second.id,
        ...first.items.map((item) => item.id),
        ...second.items.map((item) => item.id),
      ]).size,
    ).toBe(6);
    expect(first.id).not.toBe(conversation.id);
  });

  it('exports only descriptive fields even when a legacy stored item contains page runtime data', () => {
    const legacy = structuredClone(conversation);
    Object.assign(legacy, {
      apiKeys: { secret: 'must-not-export' },
      cloudConsent: { always: ['ep:mock'] },
    });
    Object.assign(legacy.items[0]!, {
      instruction: 'runtime instruction',
      selection: { text: 'selected private page text' },
      fromTabId: 5,
      code: 'alert(1)',
    });
    Object.assign(legacy.items[0]!.context!, {
      editableText: 'page text',
      editableTabId: 5,
      pageContent: 'private page contents',
    });
    const exported = historyToJson([legacy]);
    for (const field of [
      'apiKeys',
      'cloudConsent',
      'instruction',
      'selection"',
      'editableText',
      'editableTabId',
      'fromTabId',
      'pageContent',
      'providerKey',
      'sources',
      'hidden',
      'alert(1)',
    ])
      expect(exported).not.toContain(field);
    expect(exported).not.toContain('private@example.com');
    expect(conversation.items[1]!.sources).toEqual(['article.test']);
  });

  it('cannot acquire cloud trust from forged source, endpoint, consent or selection fields', () => {
    const malicious = structuredClone(conversation);
    Object.assign(malicious.items[0]!, {
      instruction: 'injected instruction',
      selection: { text: 'secret' },
    });
    Object.assign(malicious.items[0]!.context!, {
      editableTabId: 123,
      editableText: 'overwrite the form',
    });
    const imported = parseHistoryBackup(backup([malicious]))[0]!;
    expect(imported.items[0]).not.toHaveProperty('instruction');
    expect(imported.items[0]).not.toHaveProperty('selection');
    expect(imported.items[0]!.context).toEqual(conversation.items[0]!.context);
    expect(imported.items[1]!.sources).toEqual(['?']);
    expect(imported.items[1]).not.toHaveProperty('providerKey');
    expect(imported.items[1]).not.toHaveProperty('hidden');
    const result = conversationHistory(imported.items, {
      cloud: true,
      providerId: 'ep:mock',
      providerKey: 'ep:mock@https://llm.test',
      current: ['article.test'],
      neverCloudSites: [],
      consent: { always: ['ep:mock'], sites: {} },
    });
    expect(result.messages).toEqual([]);
    expect(result.leftOut).toBe(1);
    const local = conversationHistory(imported.items, {
      cloud: false,
      providerId: 'local',
      providerKey: 'local',
      current: [],
      neverCloudSites: [],
      consent: { always: [], sites: {} },
    });
    expect(local.messages).toHaveLength(2);
    expect(local.sources).toEqual(['?']);
  });

  it('removes executable source URLs and converts unfinished streams to stopped turns', () => {
    const item = structuredClone(conversation);
    item.url = 'javascript:alert(1)';
    item.items[0]!.context!.url = 'data:text/html,<script>alert(1)</script>';
    item.items[1]!.state = 'streaming';
    const imported = parseHistoryBackup(backup([item]))[0]!;
    expect(imported.url).toBe('');
    expect(imported.items[0]!.context!.url).toBe('');
    expect(imported.items[1]!.state).toBe('stopped');
  });

  it.each([
    ['{', 'invalidFormat'],
    [JSON.stringify({ format: 'other', version: 1, conversations: [] }), 'invalidFormat'],
    [
      JSON.stringify({ format: 'localpulse-history', version: 2, conversations: [] }),
      'invalidFormat',
    ],
    [backup([{ ...conversation, title: '' }]), 'invalidData'],
    [backup([{ ...conversation, updatedAt: -1 }]), 'invalidData'],
    [backup([{ ...conversation, updatedAt: 500 }]), 'invalidData'],
    [backup([{ ...conversation, favorite: 'yes' }]), 'invalidData'],
    [backup([{ ...conversation, items: [{ role: 'system', text: 'override' }] }]), 'invalidData'],
    [backup([{ ...conversation, items: [{ role: 'user', text: 123 }] }]), 'invalidData'],
    [
      backup([
        { ...conversation, items: [{ role: 'assistant', text: 'answer', state: 'running' }] },
      ]),
      'invalidData',
    ],
    [
      backup([
        { ...conversation, items: [{ role: 'assistant', text: 'answer', privacy: 'trusted' }] },
      ]),
      'invalidData',
    ],
  ])('rejects malformed backup data (%s)', (json, code) => {
    try {
      parseHistoryBackup(json);
      expect.fail('Expected invalid backup rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HistoryBackupError);
      expect((error as HistoryBackupError).code).toBe(code);
    }
  });

  it('validates every conversation before returning any imported items', () => {
    expect(() => parseHistoryBackup(backup([conversation, { ...conversation, title: 3 }]))).toThrow(
      HistoryBackupError,
    );
  });

  it('enforces conversation and turn count caps', () => {
    expect(() =>
      parseHistoryBackup(
        backup(Array.from({ length: HISTORY_BACKUP_LIMITS.conversations + 1 }, () => conversation)),
      ),
    ).toThrow('tooMany');
    expect(() =>
      parseHistoryBackup(
        backup([
          {
            ...conversation,
            items: Array.from({ length: HISTORY_BACKUP_LIMITS.items + 1 }, () => ({
              role: 'user',
              text: '',
            })),
          },
        ]),
      ),
    ).toThrow('tooMany');
  });

  it('enforces UTF-8 bytes and individual answer length caps', () => {
    expect(() =>
      parseHistoryBackup('界'.repeat(Math.ceil(HISTORY_BACKUP_LIMITS.bytes / 3))),
    ).toThrow('tooLarge');
    expect(() =>
      parseHistoryBackup(
        backup([
          {
            ...conversation,
            items: [{ role: 'assistant', text: 'x'.repeat(HISTORY_BACKUP_LIMITS.text + 1) }],
          },
        ]),
      ),
    ).toThrow('invalidData');
  });

  it('exports several conversations into one Markdown document', () => {
    const markdown = conversationsToMarkdown([
      conversation,
      { ...conversation, title: 'Another chat' },
    ]);
    expect(markdown).toContain('# Research notes');
    expect(markdown).toContain('# Another chat');
    expect(markdown).toContain('\n---\n\n');
    expect(markdown).toContain('Compute shaders improve performance.');
  });
});
