import { describe, expect, it } from 'vitest';
import { collectSegments, formatTranscript } from '@/extractors/youtube';
import { conversationTitle, conversationToMarkdown, type Conversation } from '@/storage/history';

describe('YouTube transcripts', () => {
  const response = {
    actions: [
      {
        panel: {
          segments: [
            {
              transcriptSegmentRenderer: {
                startMs: '0',
                snippet: { runs: [{ text: 'Hello ' }, { text: 'there.' }] },
              },
            },
            {
              transcriptSegmentRenderer: {
                startTimeText: { simpleText: '0:30' },
                snippet: { simpleText: 'Second  line.' },
              },
            },
            {
              transcriptSegmentRenderer: {
                startMs: '61000',
                snippet: { runs: [{ text: 'Next minute.' }] },
              },
            },
            {
              transcriptSegmentRenderer: {
                startMs: '3725000',
                snippet: { runs: [{ text: 'An hour in.' }] },
              },
            },
          ],
        },
      },
    ],
  };

  it('finds segments wherever they are nested', () => {
    expect(collectSegments(response)).toEqual([
      { seconds: 0, text: 'Hello there.' },
      { seconds: 30, text: 'Second line.' },
      { seconds: 61, text: 'Next minute.' },
      { seconds: 3725, text: 'An hour in.' },
    ]);
  });

  it('groups segments into minute-long paragraphs with times', () => {
    expect(formatTranscript(collectSegments(response))).toBe(
      '[0:00] Hello there. Second line.\n\n[1:01] Next minute.\n\n[1:02:05] An hour in.',
    );
  });
});

describe('history', () => {
  const conversation: Conversation = {
    id: 'c-1',
    title: 'Summarize: A post',
    url: 'https://example.com/post',
    createdAt: Date.UTC(2026, 8, 30),
    updatedAt: Date.UTC(2026, 8, 30),
    items: [
      {
        id: 'u',
        role: 'user',
        text: 'Summarize',
        actionLabel: 'Summarize',
        context: { title: 'A post', url: 'https://example.com/post', source: 'page' },
      },
      {
        id: 'a',
        role: 'assistant',
        text: 'It says hello.',
        state: 'done',
        providerLabel: 'Gemini Nano',
        privacy: 'on-device',
      },
    ],
  };

  it('titles a conversation by its first action and page', () => {
    expect(conversationTitle(conversation.items)).toBe('Summarize: A post');
    expect(conversationTitle([{ id: 'u', role: 'user', text: 'What is WebGPU?' }])).toBe(
      'What is WebGPU?',
    );
  });

  it('exports Markdown with where each answer was written', () => {
    const markdown = conversationToMarkdown(conversation);
    expect(markdown).toContain('# Summarize: A post');
    expect(markdown).toContain('Page: [A post](https://example.com/post)');
    expect(markdown).toContain('It says hello.');
    expect(markdown).toContain('_Answered on this device by Gemini Nano._');
  });
});
