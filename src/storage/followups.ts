import Dexie, { type EntityTable } from 'dexie';
import {
  FollowupError,
  MAX_FOLLOWUPS,
  validateFollowupDraft,
  type Followup,
  type FollowupDraft,
} from '@/core/followups';

/** Independent local database: disabling chat history does not discard personal follow-ups. */
class FollowupDatabase extends Dexie {
  tasks!: EntityTable<Followup, 'id'>;

  constructor() {
    super('localpulse-followups');
    this.version(1).stores({ tasks: 'id, dueAt, status, updatedAt' });
  }
}

let database: FollowupDatabase | undefined;
const db = () => (database ??= new FollowupDatabase());

export async function listFollowups(): Promise<Followup[]> {
  return db().tasks.orderBy('dueAt').toArray();
}

export async function addFollowup(draft: FollowupDraft): Promise<Followup> {
  const fields = validateFollowupDraft(draft);
  return db().transaction('rw', db().tasks, async () => {
    if ((await db().tasks.count()) >= MAX_FOLLOWUPS) throw new FollowupError('limit');
    const now = Date.now();
    const task: Followup = {
      ...fields,
      id: `followup-${crypto.randomUUID()}`,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    await db().tasks.add(task);
    return task;
  });
}

export async function updateFollowup(
  id: string,
  changes: Partial<FollowupDraft> & { status?: Followup['status'] },
): Promise<void> {
  await db().transaction('rw', db().tasks, async () => {
    const current = await db().tasks.get(id);
    if (!current) throw new FollowupError('missing');
    const fields = validateFollowupDraft({ ...current, ...changes });
    const status = changes.status ?? current.status;
    if (status !== 'open' && status !== 'done') throw new FollowupError('missing');
    // Replace with explicit fields so extra properties in caller input can never be stored.
    await db().tasks.put({
      ...fields,
      id: current.id,
      status,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
  });
}

export async function deleteFollowup(id: string): Promise<void> {
  await db().tasks.delete(id);
}

export async function clearFollowups(): Promise<void> {
  await db().tasks.clear();
}
