import { describe, expect, it } from 'vitest';
import { readSSE } from '@/lib/sse';
import { sseBody } from './helpers';

async function collect(chunks: string[]): Promise<string[]> {
  const events: string[] = [];
  for await (const data of readSSE(sseBody(chunks))) events.push(data);
  return events;
}

describe('readSSE', () => {
  it('yields the data of each event', async () => {
    expect(await collect(['data: one\n\ndata: two\n\n'])).toEqual(['one', 'two']);
  });

  it('joins multi-line data and ignores comments and other fields', async () => {
    expect(await collect([': keep-alive\n', 'event: x\ndata: a\ndata: b\nid: 1\n\n'])).toEqual([
      'a\nb',
    ]);
  });

  it('handles events split across chunks, including a CRLF split in two', async () => {
    expect(await collect(['data: hel', 'lo\r', '\n\r\ndata: world\r\n\r\n'])).toEqual([
      'hello',
      'world',
    ]);
  });

  it('flushes a final event without a trailing blank line', async () => {
    expect(await collect(['data: last'])).toEqual(['last']);
  });

  it('keeps data without a space after the colon', async () => {
    expect(await collect(['data:[DONE]\n\n'])).toEqual(['[DONE]']);
  });
});
