// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPage } from '@/extractors/page';

function load(name: string, url: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures/pages', name), 'utf8');
  return new JSDOM(html, { url }).window.document;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractPage', () => {
  it('turns an article into Markdown and drops navigation, footers and link URLs', async () => {
    const page = await extractPage(load('article.html', 'https://blog.example.com/posts/webgpu'));
    expect(page.source).toBe('readability');
    expect(page.kind).toBe('html');
    expect(page.title).toContain('How WebGPU changes graphics on the web');
    expect(page.siteName).toBe('Example Blog');
    expect(page.lang).toBe('en');
    expect(page.markdown).toContain('## Why compute shaders matter');
    expect(page.markdown).toContain('```');
    expect(page.markdown).toContain('const device = await adapter.requestDevice();');
    expect(page.markdown).toMatch(/\| Browser \| Status \|/);
    expect(page.markdown).toContain('[image: Diagram of the WebGPU pipeline]');
    expect(page.markdown).toContain('specification');
    expect(page.markdown).not.toContain('https://www.w3.org');
    expect(page.markdown).not.toContain('Subscribe to our newsletter');
    expect(page.markdown).not.toContain('All rights reserved');
    expect(page.wordCount).toBeGreaterThan(250);
  });

  it('falls back to the main content of web apps, without navigation', async () => {
    const page = await extractPage(load('app.html', 'https://mail.example.com/inbox'));
    expect(page.source).toBe('fallback');
    expect(page.markdown).toContain('Team offsite planning');
    expect(page.markdown).toContain('Book flights before June 3');
    expect(page.markdown).not.toContain('Spam');
    expect(page.markdown).not.toContain('Storage used');
    expect(page.markdown).not.toContain('Reply');
  });

  it('reads the full file from GitHub code views', async () => {
    const page = await extractPage(
      load('github-blob.html', 'https://github.com/owner/repo/blob/main/app.py'),
    );
    expect(page.source).toBe('github-code');
    expect(page.title).toBe('app.py · owner/repo');
    expect(page.markdown).toContain('```python');
    expect(page.markdown).toContain('    return f"Hello, {name}!"');
  });

  it('reads pull requests from the .diff view', async () => {
    const fetch = vi.fn(async () => new Response('diff --git a/x.ts b/x.ts\n+const a = 1;'));
    vi.stubGlobal('fetch', fetch);
    const doc = new JSDOM(
      '<html><head><title>PR</title></head><body><h1 class="js-issue-title">Add a</h1><div class="comment-body">Adds the constant.</div></body></html>',
      { url: 'https://github.com/owner/repo/pull/7/files' },
    ).window.document;
    const page = await extractPage(doc);
    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/owner/repo/pull/7.diff',
      expect.anything(),
    );
    expect(page.source).toBe('github-diff');
    expect(page.markdown).toContain('```diff');
    expect(page.markdown).toContain('+const a = 1;');
    expect(page.markdown).toContain('Adds the constant.');
  });

  it('recognizes YouTube videos and PDFs', async () => {
    const video = await extractPage(
      new JSDOM(
        '<html><head><title>Video - YouTube</title><meta name="description" content="A talk about compilers."></head><body></body></html>',
        { url: 'https://www.youtube.com/watch?v=abc123XYZ' },
      ).window.document,
    );
    expect(video).toMatchObject({ kind: 'youtube', videoId: 'abc123XYZ' });
    expect(video.markdown).toContain('A talk about compilers.');

    const pdfDoc = new JSDOM('<html><body></body></html>', { url: 'https://example.com/paper.pdf' })
      .window.document;
    Object.defineProperty(pdfDoc, 'contentType', { value: 'application/pdf' });
    expect(await extractPage(pdfDoc)).toMatchObject({ kind: 'pdf', source: 'pdf', markdown: '' });
  });

  it('includes the selected text, also inside text fields', async () => {
    const doc = load('article.html', 'https://blog.example.com/posts/webgpu');
    const paragraph = doc.querySelector('article h2 + p') as HTMLElement;
    const range = doc.createRange();
    range.selectNodeContents(paragraph);
    doc.getSelection()?.addRange(range);
    expect((await extractPage(doc)).selection).toContain('Compute shaders let a page run');

    const form = new JSDOM('<textarea>alpha beta gamma</textarea>', { url: 'https://e.com/' })
      .window.document;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(6, 10);
    expect((await extractPage(form)).selection).toBe('beta');
  });

  it('never reads a selection inside a password field', async () => {
    const form = new JSDOM('<input type="password" value="hunter2secret">', {
      url: 'https://e.com/',
    }).window.document;
    const input = form.querySelector('input') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, input.value.length);
    const page = await extractPage(form);
    expect(page.selection).toBeUndefined();
    expect(page.selectionEditable).toBe(false);
  });
});
