import { captureDocument, workspaceFits, type WorkspaceDocument } from './workspace';
import { countWords } from '@/lib/text';

export const MAX_COLLECTIONS = 50;
export const MAX_LIBRARY_CHARS = 20_000_000;
export const MAX_LIBRARY_BACKUP_BYTES = 25 * 1024 * 1024;
export interface ResearchCollection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  documents: WorkspaceDocument[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export function collectionName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 120) throw new Error('library.invalidName');
  return name;
}
/** Explicit fields only: backups cannot restore editable targets or cloud permissions. */
export function validateDocuments(value: unknown): WorkspaceDocument[] {
  if (!Array.isArray(value) || !value.length || value.length > 12)
    throw new Error('library.invalidBackup');
  const documents = value.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.title !== 'string' ||
      typeof item.markdown !== 'string' ||
      !item.markdown.trim() ||
      typeof item.url !== 'string' ||
      item.url.length > 8000 ||
      !['html', 'pdf', 'youtube'].includes(String(item.kind))
    )
      throw new Error('library.invalidBackup');
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      throw new Error('library.invalidBackup');
    }
    if (!['https:', 'http:', 'file:'].includes(url.protocol) || url.username || url.password)
      throw new Error('library.invalidBackup');
    return captureDocument({
      title: item.title,
      markdown: item.markdown,
      url: url.href,
      kind: item.kind as WorkspaceDocument['kind'],
      source: item.kind === 'pdf' ? 'pdf' : 'fallback',
      wordCount: countWords(item.markdown),
      ...(Number.isSafeInteger(item.pages) &&
        Number(item.pages) > 0 && { pages: Number(item.pages) }),
      ...(item.truncated === true && { truncated: true }),
    });
  });
  if (!workspaceFits([], documents)) throw new Error('library.limit');
  return documents;
}
export function parseLibraryBackup(
  text: string,
): { name: string; documents: WorkspaceDocument[] }[] {
  if (new TextEncoder().encode(text).length > MAX_LIBRARY_BACKUP_BYTES)
    throw new Error('library.limit');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('library.invalidBackup');
  }
  if (
    !record(data) ||
    data.format !== 'localpulse-library' ||
    data.version !== 1 ||
    !Array.isArray(data.collections) ||
    !data.collections.length ||
    data.collections.length > MAX_COLLECTIONS
  )
    throw new Error('library.invalidBackup');
  let chars = 0;
  const collections = data.collections.map((item: unknown) => {
    if (!record(item) || typeof item.name !== 'string') throw new Error('library.invalidBackup');
    const documents = validateDocuments(item.documents);
    chars += documents.reduce((sum, document) => sum + document.markdown.length, 0);
    return { name: collectionName(item.name), documents };
  });
  if (chars > MAX_LIBRARY_CHARS) throw new Error('library.limit');
  return collections;
}
export function exportLibrary(collections: ResearchCollection[]): string {
  return JSON.stringify(
    {
      format: 'localpulse-library',
      version: 1,
      collections: collections.map(({ name, documents }) => ({
        name,
        documents: documents.map(({ title, url, kind, markdown, pages, truncated }) => ({
          title,
          url,
          kind,
          markdown,
          pages,
          truncated,
        })),
      })),
    },
    null,
    2,
  );
}
export function collectionMatches(collection: ResearchCollection, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);
  const text = [collection.name, ...collection.documents.flatMap((d) => [d.title, d.markdown])]
    .join('\n')
    .toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}
