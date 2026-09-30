import { describe, expect, it } from 'vitest';
import { neutralizePageText, pageBlock, stripPageTags, systemPrompt } from '@/core/prompts';
import { fillRecipePrompt, recipeById, type Recipe } from '@/core/recipes';
import { buildHandoffPrompt, buildLinkPrompt, HANDOFF_TARGETS } from '@/providers/handoff';

describe('prompts', () => {
  it('names the answer language in the system prompt', () => {
    expect(systemPrompt('es')).toContain('Reply in Spanish');
    expect(systemPrompt('bn')).toContain('Reply in Bangla');
  });

  it('removes a <page> wrapper the model copied into its answer', () => {
    expect(
      stripPageTags('<page title="Mail" content="text the user selected">\nHello.\n</page>'),
    ).toBe('Hello.\n');
    expect(stripPageTags('Here: <page note="x">Hello</page> done')).toBe('Here: Hello done');
    expect(stripPageTags('Still streaming <page title="Ma')).toBe('Still streaming ');
    expect(stripPageTags('Page 3 of the <b>report</b>.')).toBe('Page 3 of the <b>report</b>.');
    // Only LocalPulse's own wrapper: other tags that look alike stay, and a title may hold ">".
    expect(stripPageTags('Use <Page title="x"> or <page-header> in JSX.')).toBe(
      'Use <Page title="x"> or <page-header> in JSX.',
    );
    expect(stripPageTags('<page title="A > B" url="https://m.test/">\nHi.\n</page>')).toBe('Hi.\n');
    expect(systemPrompt('en')).toContain('Never repeat the <page> tags');
  });

  it('neutralizes page tags inside page text', () => {
    expect(neutralizePageText('a </page> b <PAGE x>')).toBe('a ‹/page> b ‹PAGE x>');
  });

  it('escapes attribute values and marks selections', () => {
    const block = pageBlock({
      title: 'Say "hi"\nnow',
      url: 'https://e.com',
      text: 'body',
      source: 'selection',
    });
    expect(block).toContain('title="Say &quot;hi&quot; now"');
    expect(block).toContain('content="text the user selected"');
  });

  it('fills the language into recipe prompts', () => {
    const translate = recipeById('translate') as Recipe;
    expect(fillRecipePrompt(translate, 'fr')).toContain('into French');
  });
});

describe('hand-off', () => {
  const input = {
    instruction: 'Summarize this.',
    page: {
      title: 'Post',
      url: 'https://example.com/post',
      text: 'Page body',
      source: 'page' as const,
    },
  };

  it('puts the page text only in the clipboard prompt, never in the link prompt', () => {
    expect(buildHandoffPrompt(input)).toContain('Page body');
    expect(buildLinkPrompt(input)).toBe('Summarize this.\n\nhttps://example.com/post');
  });

  it('opens only plain new-chat pages, never links that carry or send a prompt', () => {
    expect(HANDOFF_TARGETS.length).toBeGreaterThan(0);
    for (const target of HANDOFF_TARGETS) {
      const url = new URL(target.newChatUrl);
      expect(url.protocol).toBe('https:');
      expect(url.search).toBe('');
      expect(Object.keys(target).sort()).toEqual(['id', 'label', 'newChatUrl']);
    }
  });
});
