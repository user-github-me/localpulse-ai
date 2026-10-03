import Dexie, { type EntityTable } from 'dexie';
import { collectionName } from '@/core/library';
import { safeSessionTab, type SessionTab, type TabSession } from '@/core/tabs';
class SessionDatabase extends Dexie {
  sessions!: EntityTable<TabSession, 'id'>;
  constructor() {
    super('localpulse-tab-sessions');
    this.version(1).stores({ sessions: 'id, createdAt' });
  }
}
let database: SessionDatabase | undefined;
const db = () => (database ??= new SessionDatabase());
export const listTabSessions = () => db().sessions.orderBy('createdAt').reverse().toArray();
export const deleteTabSession = (id: string) => db().sessions.delete(id);
export async function saveTabSession(name: string, tabs: SessionTab[]): Promise<void> {
  const values = tabs.map(safeSessionTab);
  if (!values.length || values.length > 100 || values.some((t) => !t))
    throw new Error('tabOrganizer.limit');
  const session: TabSession = {
    id: crypto.randomUUID(),
    name: collectionName(name),
    createdAt: Date.now(),
    tabs: values as SessionTab[],
  };
  await db().transaction('rw', db().sessions, async () => {
    if ((await db().sessions.count()) >= 50) throw new Error('tabOrganizer.limit');
    await db().sessions.add(session);
  });
}
