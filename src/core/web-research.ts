export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
export function researchEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.length > 2048
    )
      return;
    return url.href.replace(/\/+$/, '');
  } catch {
    return;
  }
}
export function publicSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8000) return;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
/** Results are inert display data. Search pages never contribute code or permission grants. */
export function parseSearchResults(value: unknown): SearchResult[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { results?: unknown }).results)
  )
    throw new Error('research.failed');
  const results = (value as { results: unknown[] }).results;
  const seen = new Set<string>();
  return results
    .slice(0, 100)
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const result = item as Record<string, unknown>;
      const url = publicSourceUrl(result.url);
      if (!url || typeof result.title !== 'string' || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          url,
          title: result.title.slice(0, 300),
          snippet: typeof result.content === 'string' ? result.content.slice(0, 2000) : '',
        },
      ];
    })
    .slice(0, 20);
}
export async function boundedResponse(response: Response, maxBytes = 2_000_000): Promise<string> {
  if (!response.ok) throw new Error('research.failed');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('research.failed');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('research.limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
