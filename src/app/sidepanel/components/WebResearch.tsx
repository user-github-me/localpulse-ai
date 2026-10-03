import { useRef, useState } from 'react';
import { browser } from '#imports';
import { Button, Dialog, TextInput } from '@/components/ui';
import {
  boundedResponse,
  parseSearchResults,
  publicSourceUrl,
  researchEndpoint,
  type SearchResult,
} from '@/core/web-research';
import { captureDocument } from '@/core/workspace';
import { extractArticle, extractFallback } from '@/extractors/generic';
import { countWords, originPattern } from '@/lib/text';
import { t } from '../../shared/i18n';
import { usePanel } from '../store';
export function WebResearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [custom, setCustom] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | undefined>(undefined);
  const locked = usePanel((s) => s.busy || s.consent !== null || s.fileStatus !== null);
  async function request(action: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    controller.current = new AbortController();
    try {
      await action(controller.current.signal);
    } catch {
      setMessage(t('research.failed'));
    } finally {
      setBusy(false);
      controller.current = undefined;
    }
  }
  function search() {
    const text = query.trim();
    if (!text) return;
    const base = custom ? researchEndpoint(endpoint.trim()) : 'https://en.wikipedia.org';
    if (!base) {
      setMessage(t('research.invalidUrl'));
      return;
    }
    const permission = browser.permissions.request({ origins: [originPattern(base)!] });
    void request(async (signal) => {
      if (!(await permission)) throw new Error();
      const url = custom
        ? `${base}/search?q=${encodeURIComponent(text)}&format=json`
        : `${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&srlimit=10&format=json&origin=*`;
      const response = await fetch(url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      const data = JSON.parse(await boundedResponse(response, 500000));
      if (custom) setResults(parseSearchResults(data));
      else {
        const entries = data?.query?.search;
        if (!Array.isArray(entries)) throw new Error();
        setResults(
          entries.slice(0, 10).flatMap((entry: unknown) => {
            if (!entry || typeof entry !== 'object') return [];
            const item = entry as Record<string, unknown>;
            if (typeof item.title !== 'string' || typeof item.snippet !== 'string') return [];
            const doc = new DOMParser().parseFromString(item.snippet, 'text/html');
            return [
              {
                title: item.title.slice(0, 300),
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
                snippet: doc.body.textContent?.slice(0, 2000) ?? '',
              },
            ];
          }),
        );
      }
      setMessage(t('research.searched'));
    });
  }
  function add(result: SearchResult) {
    const source = publicSourceUrl(result.url);
    if (!source) return;
    const permission = browser.permissions.request({ origins: [originPattern(source)!] });
    void request(async (signal) => {
      if (!(await permission)) throw new Error();
      const response = await fetch(source, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      if (!(response.headers.get('content-type') ?? '').includes('text/html')) throw new Error();
      const html = await boundedResponse(response);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const base = doc.createElement('base');
      base.href = source;
      doc.head.append(base);
      const extracted = extractArticle(doc);
      const markdown = (extracted?.markdown ?? extractFallback(doc)).slice(0, 400000);
      if (!markdown.trim()) throw new Error();
      if (
        !usePanel.getState().loadDocuments(
          [
            captureDocument({
              title: result.title,
              url: source,
              kind: 'html',
              source: 'readability',
              markdown,
              wordCount: countWords(markdown),
            }),
          ],
          true,
        )
      )
        throw new Error();
      setMessage(t('research.added'));
    });
  }
  return (
    <Dialog
      open
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      title={t('research.title')}
    >
      <div className="max-h-[70vh] space-y-3 overflow-auto">
        <p className="text-sm text-muted">{t('research.intro')}</p>
        <label className="block text-sm">
          {t('research.query')}
          <TextInput
            className="mt-1"
            value={query}
            maxLength={250}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <details open={custom} onToggle={(e) => setCustom(e.currentTarget.open)}>
          <summary className="cursor-pointer text-xs text-muted">{t('research.custom')}</summary>
          <label className="mt-2 block text-sm">
            {t('research.endpoint')}
            <TextInput
              className="mt-1"
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://search.example.org"
              maxLength={2048}
            />
          </label>
          <p className="mt-2 text-xs text-muted">{t('research.customNote')}</p>
        </details>
        <p className="text-xs text-muted">
          {t('research.disclosure', {
            host: custom ? researchEndpoint(endpoint) || t('research.custom') : 'en.wikipedia.org',
          })}
        </p>
        <Button wrap className="w-full" disabled={busy || !query.trim()} onClick={search}>
          {t('research.search')}
        </Button>
        <a
          href={`https://duckduckgo.com/?q=${encodeURIComponent(query.trim())}`}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-local underline"
        >
          {t('research.browser')}
        </a>
        <p className="text-xs text-muted">{t('research.browserNote')}</p>
        <ul className="space-y-3">
          {results.map((result) => (
            <li key={result.url} className="rounded-lg border border-line p-3">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="break-words text-sm font-medium text-local underline"
              >
                {result.title}
              </a>
              <p className="my-2 text-xs text-muted">{result.snippet}</p>
              <Button size="sm" disabled={busy || locked} onClick={() => add(result)}>
                {t('research.add')}
              </Button>
            </li>
          ))}
        </ul>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {busy && (
          <Button size="sm" onClick={() => controller.current?.abort()}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            controller.current?.abort();
            onClose();
          }}
        >
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  );
}
