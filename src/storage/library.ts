import Dexie, { type EntityTable } from 'dexie';
import {
  collectionName,
  validateDocuments,
  MAX_COLLECTIONS,
  MAX_LIBRARY_CHARS,
  type ResearchCollection,
} from '@/core/library';
import type { WorkspaceDocument } from '@/core/workspace';
class LibraryDatabase extends Dexie {
  collections!: EntityTable<ResearchCollection, 'id'>;
  constructor() {
    super('localpulse-library');
    this.version(1).stores({ collections: 'id, updatedAt' });
  }
}
let database: LibraryDatabase | undefined;
const db = () => (database ??= new LibraryDatabase());
export const listCollections = () => db().collections.orderBy('updatedAt').reverse().toArray();
export const deleteCollection = (id: string) => db().collections.delete(id);
export async function renameCollection(id: string, name: string): Promise<void> {
  await db().collections.update(id, { name: collectionName(name), updatedAt: Date.now() });
}
export async function saveCollections(
  drafts: { name: string; documents: WorkspaceDocument[] }[],
): Promise<void> {
  const now = Date.now();
  const entries = drafts.map((draft) => ({
    id: crypto.randomUUID(),
    name: collectionName(draft.name),
    documents: validateDocuments(draft.documents),
    createdAt: now,
    updatedAt: now,
  }));
  await db().transaction('rw', db().collections, async () => {
    const current = await db().collections.toArray();
    if (
      current.length + entries.length > MAX_COLLECTIONS ||
      [...current, ...entries].reduce(
        (total, entry) => total + entry.documents.reduce((n, d) => n + d.markdown.length, 0),
        0,
      ) > MAX_LIBRARY_CHARS
    )
      throw new Error('library.limit');
    await db().collections.bulkAdd(entries);
  });
}
