import { memo, useRef } from 'react';
import { t } from '@/app/shared/i18n';
import { tableRows, toCsv } from '@/lib/csv';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

function domainOf(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Tables get a "Download CSV" button. */
function TableWithExport({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  return (
    <div>
      <table ref={ref}>{children}</table>
      <button
        type="button"
        className="mt-1 font-sans text-[0.74rem] font-medium text-muted underline underline-offset-2 hover:text-ink"
        onClick={() => {
          if (!ref.current) return;
          const blob = new Blob([toCsv(tableRows(ref.current))], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'localpulse-table.csv';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        {t('markdown.downloadCsv')}
      </button>
    </div>
  );
}

const components: Components = {
  table: ({ children }) => <TableWithExport>{children}</TableWithExport>,
  // Links open in a new tab and show their real domain, so an injected link can't hide where it goes.
  a: ({ href, children }) => {
    const domain = domainOf(href);
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={href}>
        {children}
        {domain && <span className="ml-1 font-sans text-[0.75em] text-muted">({domain})</span>}
      </a>
    );
  },
  // Remote images never load: loading one could send page data to an attacker's server
  // through its URL. They're shown as links instead.
  img: ({ src, alt }) => {
    const href = typeof src === 'string' ? src : undefined;
    const domain = domainOf(href);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        className="font-sans text-[0.85em]"
      >
        {alt ? t('markdown.imageAlt', { alt }) : t('markdown.image')}
        {domain && ` (${domain})`}
      </a>
    );
  },
};

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

/**
 * Raw HTML from the model is shown as text, never rendered. Dropping it isn't safe either: an HTML
 * block runs to the next blank line, so a stray tag would hide the answer text after it.
 */
function remarkHtmlAsText() {
  const visit = (node: MarkdownNode) => {
    if (node.type === 'html') {
      node.type = /^<br\s*\/?>$/i.test(node.value?.trim() ?? '') ? 'break' : 'text';
    }
    node.children?.forEach(visit);
  };
  return visit;
}

/** Turns single line breaks into real ones, as in an email's sign-off ("Thanks,↵Sam"). */
function remarkLineBreaks() {
  const visit = (node: MarkdownNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) =>
      child.type === 'text' && child.value?.includes('\n')
        ? child.value
            .split('\n')
            .flatMap((part, index) => [
              ...(index > 0 ? [{ type: 'break' }] : []),
              { type: 'text', value: part },
            ])
        : [child],
    );
    node.children.forEach(visit);
  };
  return visit;
}

/**
 * Renders model output as Markdown. Raw HTML shows as text and unsafe URLs are removed.
 * `lineBreaks` keeps single line breaks, for rewritten or translated text.
 */
export const Markdown = memo(function Markdown({
  text,
  lineBreaks = false,
}: {
  text: string;
  lineBreaks?: boolean;
}) {
  const plugins = lineBreaks
    ? [remarkGfm, remarkHtmlAsText, remarkLineBreaks]
    : [remarkGfm, remarkHtmlAsText];
  return (
    <div className="answer">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
