import { describe, expect, it } from 'vitest';
import {
  captureDocument,
  checkWorkspaceQuotes,
  workspaceFits,
  workspacePrompt,
  MAX_WORKSPACE_CHARS,
} from '@/core/workspace';
import type { ExtractedPage } from '@/extractors/types';
import { sourceKey, conversationHistory } from '@/core/conversation';
import { redactPage } from '@/core/privacy';
import { FakeProvider, lorem } from './helpers';
import { runTurn } from '@/core/run';
import { questionRecipe } from '@/core/recipes';

function document(title: string, markdown: string, url = `file:${title}.txt`) {
  return captureDocument({
    title,
    url,
    markdown,
    kind: 'html',
    source: 'fallback',
    wordCount: 100,
  } satisfies ExtractedPage);
}

describe('document workspace', () => {
  it('never verifies a quote assembled across the boundary of two documents', () => {
    const quotes = checkWorkspaceQuotes('“The project started in January and ended in December.”', [
      document('Start', 'The project started in January'),
      document('End', 'and ended in December.'),
    ]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.found).toBe(false);
  });
  it('keeps independent sources and excludes deselected documents from prompts', () => {
    const a = document('Quarter one', 'Revenue was 12 million.');
    const b = { ...document('Quarter two', 'Revenue was 15 million.'), enabled: false };
    const page = workspacePrompt([a, b]);
    expect(page?.text).toContain('Document 1: Quarter one');
    expect(page?.text).not.toContain('Quarter two');
    expect(workspacePrompt([b])).toBeUndefined();
  });

  it('does not capture editable selections or selection contents', () => {
    const captured = captureDocument({
      ...document('Article', 'Public article.'),
      selection: 'private draft',
      selectionEditable: true,
    });
    expect(captured).not.toHaveProperty('selection');
    expect(captured).not.toHaveProperty('selectionEditable');
  });

  it('enforces source and total character limits', () => {
    const small = document('Small', 'hello');
    expect(
      workspaceFits(
        Array.from({ length: 12 }, () => small),
        [small],
      ),
    ).toBe(false);
    expect(workspaceFits([], [document('Big', 'x'.repeat(MAX_WORKSPACE_CHARS + 1))])).toBe(false);
    expect(workspaceFits([small], [small])).toBe(true);
  });

  it('retains document identity in retrieved late sections of a large source', async () => {
    const provider = new FakeProvider('test', { budget: 1600 });
    const page = workspacePrompt([
      document('Bird report', `${lorem(3000)}\n\n## Nesting\nPeregrine nesting begins in March.`),
    ]);
    await runTurn(
      provider,
      {
        page,
        recipe: questionRecipe('When does peregrine nesting begin?'),
        instruction: 'When does peregrine nesting begin?',
        history: [],
        language: 'en',
      },
      { onText() {} },
    );
    const prompt = provider.calls.at(-1)?.at(-1)?.content ?? '';
    expect(prompt).toContain('Peregrine nesting begins in March.');
    expect(prompt).toContain('Document 1: Bird report');
  });

  it('redacts independent source parts before cloud retrieval sees them', async () => {
    const provider = new FakeProvider('cloud', { privacy: 'cloud', budget: 1500 });
    const original = workspacePrompt([
      document(
        'Contacts',
        `${lorem(3000)}\n\n## Email\nContact support@example.com about peregrine nesting.`,
      ),
    ])!;
    const page = redactPage(original).page;
    expect(JSON.stringify(page.sourceParts)).not.toContain('support@example.com');
    await runTurn(
      provider,
      {
        page,
        recipe: questionRecipe('peregrine contact email'),
        instruction: 'peregrine contact email',
        history: [],
        language: 'en',
      },
      { onText() {} },
    );
    expect(JSON.stringify(provider.calls)).not.toContain('support@example.com');
    expect(provider.calls.at(-1)?.at(-1)?.content).toContain('Document 1: Contacts');
  });

  it('assigns source labels only when quotes really match that document', () => {
    const quotes = checkWorkspaceQuotes(
      '“Revenue grew by twelve percent.” Also “A made up quote with no source.”',
      [
        document('First', 'Costs were stable throughout the year.'),
        document('Second', 'Revenue grew by twelve percent.'),
      ],
    );
    expect(quotes.find((quote) => quote.found)?.sourceTitle).toBe('Second');
    expect(quotes.find((quote) => !quote.found)?.sourceTitle).toBeUndefined();
  });

  it('tracks every source so local-file and blocked-site answers cannot leak through follow-ups', () => {
    const sources = [sourceKey('file:private.txt'), sourceKey('https://bank.test/account')];
    const result = conversationHistory(
      [
        { role: 'user', text: 'Compare' },
        { role: 'assistant', text: 'Private analysis', state: 'done', sources },
      ],
      {
        cloud: true,
        providerId: 'cloud',
        providerKey: 'cloud',
        current: ['public.test'],
        neverCloudSites: ['bank.test'],
        consent: { always: ['cloud'], sites: {} },
      },
    );
    expect(result.messages).toEqual([]);
    expect(result.leftOut).toBe(1);
  });
});
