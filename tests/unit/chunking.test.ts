import { describe, expect, it } from 'vitest';
import { chunkText, splitSections } from '@/core/chunking';
import { estimateTokens } from '@/lib/text';
import { lorem } from './helpers';

describe('splitSections', () => {
  it('splits at headings and keeps the intro', () => {
    const sections = splitSections('Intro text\n\n# One\nbody 1\n\n## Two\nbody 2');
    expect(sections).toEqual(['Intro text', '# One\nbody 1', '## Two\nbody 2']);
  });

  it('ignores headings inside code fences', () => {
    const sections = splitSections('# Title\n```sh\n# not a heading\n```\ntext');
    expect(sections).toHaveLength(1);
  });
});

describe('chunkText', () => {
  it('returns one chunk when the text fits', () => {
    expect(chunkText('small text', 100)).toEqual(['small text']);
  });

  it('keeps every chunk within the budget and preserves order', () => {
    const text = Array.from({ length: 12 }, (_, i) => `## Section ${i}\n${lorem(120)}`).join(
      '\n\n',
    );
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(estimateTokens(chunk)).toBeLessThanOrEqual(210);
    const joined = chunks.join('\n\n');
    expect(joined.indexOf('Section 0')).toBeLessThan(joined.indexOf('Section 11'));
  });

  it('splits a single huge paragraph by sentences and then by characters', () => {
    const sentences = 'This is a sentence about apples. '.repeat(200);
    const chunks = chunkText(sentences, 100);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(estimateTokens(chunk)).toBeLessThanOrEqual(110);

    const noPunctuation = 'x'.repeat(5000);
    const hard = chunkText(noPunctuation, 100);
    expect(hard.join('')).toHaveLength(5000);
  });

  it('keeps a fenced code block in one piece when it fits', () => {
    const code = '```js\nconst a = 1;\n\nconst b = 2;\n```';
    const chunks = chunkText(`${lorem(300)}\n\n${code}`, 120);
    expect(chunks.some((chunk) => chunk.includes(code))).toBe(true);
  });
});

describe('chunkText with big tables and code', () => {
  it('splits a big table by rows and repeats its header in every part', () => {
    const rows = Array.from(
      { length: 60 },
      (_, i) => `| Row ${i} | Value number ${i} for this row |`,
    );
    const table = ['| Name | Value |', '| --- | --- |', ...rows].join('\n');
    const chunks = chunkText(table, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.startsWith('| Name | Value |\n| --- | --- |')).toBe(true);
      expect(chunk.split('\n').every((line) => line.startsWith('|') && line.endsWith('|'))).toBe(
        true,
      );
    }
    expect(chunks.join('\n').match(/\| Row \d+ \|/g)).toHaveLength(60);
  });

  it('splits a big code block by lines and keeps every part fenced', () => {
    const code = [
      '```js',
      ...Array.from({ length: 80 }, (_, i) => `const value${i} = compute(${i}); // step ${i}.`),
      '```',
    ].join('\n');
    const chunks = chunkText(code, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.startsWith('```js\n')).toBe(true);
      expect(chunk.endsWith('\n```')).toBe(true);
    }
  });
});
