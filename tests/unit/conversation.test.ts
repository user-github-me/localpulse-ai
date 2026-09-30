import { describe, expect, it } from 'vitest';
import {
  conversationHistory,
  sourceKey,
  UNKNOWN_SOURCE,
  type HistoryPolicy,
  type TurnItem,
} from '@/core/conversation';
import { Redactor } from '@/core/privacy';

function turn(
  question: string,
  answer: string,
  sources: string[] | undefined,
  providerKey = 'ep:local@http://localhost:11434',
): TurnItem[] {
  return [
    { role: 'user', text: question },
    { role: 'assistant', text: answer, state: 'done', sources, providerKey },
  ];
}

const GEMINI = 'ep:gemini@https://generativelanguage.googleapis.com';

const cloud = (overrides: Partial<HistoryPolicy> = {}): HistoryPolicy => ({
  providerId: 'ep:gemini',
  providerKey: GEMINI,
  cloud: true,
  current: ['news.example'],
  neverCloudSites: [],
  consent: { always: [], sites: {} },
  ...overrides,
});

const questions = (history: ReturnType<typeof conversationHistory>) =>
  history.messages.filter((message) => message.role === 'user').map((message) => message.content);

describe('sourceKey', () => {
  it('uses the hostname, the file address, or "unknown"', () => {
    expect(sourceKey('https://www.news.example/a?b')).toBe('www.news.example');
    expect(sourceKey('file:report.pdf')).toBe('file:report.pdf');
    expect(sourceKey('')).toBe(UNKNOWN_SOURCE);
    expect(sourceKey(undefined)).toBe(UNKNOWN_SOURCE);
    // A blob: address belongs to the site that made it.
    expect(sourceKey('blob:https://secure.mybank.com/1c9e-4f')).toBe('secure.mybank.com');
  });
});

describe('conversationHistory', () => {
  const items = [
    ...turn('What are the fees?', 'Fees are 3%.', ['mybank.com']),
    ...turn('Summarize the news', 'Rates went up.', ['news.example']),
    ...turn('And this post?', 'It is about gardens.', ['blog.example']),
  ];

  it('gives an on-device provider every earlier turn', () => {
    const history = conversationHistory(items, cloud({ providerId: 'ep:local', cloud: false }));
    expect(questions(history)).toEqual([
      'What are the fees?',
      'Summarize the news',
      'And this post?',
    ]);
    expect(history.leftOut).toBe(0);
  });

  it('gives a cloud provider only turns from the same site or sites it may have', () => {
    const history = conversationHistory(
      items,
      cloud({ consent: { always: [], sites: { 'blog.example': ['ep:gemini'] } } }),
    );
    expect(questions(history)).toEqual(['Summarize the news', 'And this post?']);
    expect(history.leftOut).toBe(1);
    expect(history.sources.sort()).toEqual(['blog.example', 'news.example']);
  });

  it('never sends turns from a never-send site, even with consent for every site', () => {
    const history = conversationHistory(
      items,
      cloud({ neverCloudSites: ['mybank.com'], consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(questions(history)).toEqual(['Summarize the news', 'And this post?']);
  });

  it('keeps out answers that were written from a blocked page in an earlier turn', () => {
    // The news answer repeated the bank summary, so the bank is one of its sources.
    const tainted = [
      ...turn('Summarize my statement', 'Balance: 1,200.', ['mybank.com']),
      ...turn('What did it say?', 'Your balance is 1,200.', ['news.example', 'mybank.com']),
    ];
    const history = conversationHistory(tainted, cloud({ neverCloudSites: ['mybank.com'] }));
    expect(history.messages).toEqual([]);
    expect(history.leftOut).toBe(2);
  });

  it('includes turns the same cloud provider wrote, since it has already seen them', () => {
    const history = conversationHistory(
      turn('Summarize', 'Short summary.', ['other.example'], GEMINI),
      cloud(),
    );
    expect(questions(history)).toEqual(['Summarize']);
  });

  it("doesn't count answers from the same provider slot on another server as its own", () => {
    // The endpoint's address was changed to another server after this answer.
    const history = conversationHistory(
      turn('Summarize', 'Short summary.', ['other.example'], 'ep:gemini@https://old.example'),
      cloud(),
    );
    expect(history.messages).toEqual([]);
    expect(history.leftOut).toBe(1);
  });

  it('keeps out answers of unknown origin, including those saved by older versions', () => {
    const history = conversationHistory(
      [...turn('Old', 'Old answer.', undefined), ...turn('Odd', 'Odd answer.', [UNKNOWN_SOURCE])],
      cloud({ consent: { always: ['ep:gemini'], sites: {} } }),
    );
    expect(history.messages).toEqual([]);
    expect(history.leftOut).toBe(2);
  });

  it('skips unanswered turns and hides emails and phone numbers for the cloud', () => {
    const history = conversationHistory(
      [
        { role: 'user', text: 'Stopped question' },
        { role: 'assistant', text: '', state: 'error', sources: ['news.example'] },
        ...turn('Who wrote it?', 'Write to ana@news.example or call +1 415 555 0100.', [
          'news.example',
        ]),
      ],
      cloud({ redactor: new Redactor() }),
    );
    expect(history.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(history.messages[1]?.content).toBe('Write to [email 1] or call [phone 1].');
    expect(history.redactions).toBe(2);
  });
});
