import { browser, storage } from '#imports';
import { normalizeTrackerUrl, trackingPermissionPattern } from '@/core/email-tracking';
import {
  decryptReadEvent,
  decryptTrackerBackup,
  encryptTrackerBackup,
  generateTrackerKeys,
  onlyPublicKey,
  READ_UUID,
  signAcknowledgement,
  validateTrackerKeys,
  type EncryptedReadEvent,
  type TrackerKeys,
} from '@/core/tracker-crypto';

export interface ReadTracker {
  id: string;
  token: string;
  pixelUrl: string;
  createdAt: number;
  reads: { id: string; at: number }[];
  pendingAcknowledgements: string[];
}
interface TrackerVault {
  keys: TrackerKeys;
  trackers: Record<string, ReadTracker[]>;
}
const serverItem = storage.defineItem<string>('local:emailTrackerUrl', { fallback: '' });
const vaultItem = storage.defineItem<TrackerVault | null>('local:readTrackerVault', {
  fallback: null,
});
let operations = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  // Side panels in different windows share this vault. Lock across extension pages so a
  // concurrent writer cannot overwrite keys or acknowledge events before durable saving.
  const result = operations.then(() =>
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('localpulse-read-vault', operation)
      : operation(),
  );
  operations = result.then(
    () => {},
    () => {},
  );
  return result;
}
export const getTrackerUrl = () => serverItem.getValue();
async function vault(): Promise<TrackerVault> {
  const current = await vaultItem.getValue();
  if (current) return current;
  const next = { keys: await generateTrackerKeys(), trackers: {} };
  await vaultItem.setValue(next);
  return next;
}
async function request(base: string, path: string, value?: unknown): Promise<unknown> {
  if (
    normalizeTrackerUrl(base) !== base ||
    !(await browser.permissions.contains({ origins: [trackingPermissionPattern(base)] }))
  )
    throw new Error('permission');
  const response = await fetch(`${base}${path}`, {
    method: value === undefined ? 'GET' : 'POST',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    ...(value === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'crypto' : 'request');
  if (response.status === 204) return undefined;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256000) throw new Error('response');
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
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function connectTracker(base: string): Promise<void> {
  const status = (await request(base, '/api/status')) as {
    service?: string;
    version?: number;
    ready?: boolean;
  };
  if (status.service !== 'localpulse-email-tracker' || status.version !== 3)
    throw new Error('response');
  if (status.ready === false) throw new Error('unavailable');
  await serverItem.setValue(base);
}
export async function disconnectTracker(): Promise<void> {
  await serverItem.removeValue();
}
export async function listReadTrackers(): Promise<ReadTracker[]> {
  return (await vaultItem.getValue())?.trackers[await getTrackerUrl()] ?? [];
}
export function createReadTracker(): Promise<ReadTracker> {
  return serial(async () => {
    const base = await getTrackerUrl(),
      values = await vault();
    const trackers = values.trackers[base] ?? [];
    if (trackers.length >= 100) throw new Error('limit');
    const result = (await request(base, '/api/readers', {
      encryptionKey: onlyPublicKey(values.keys.encryptionPublicKey),
      verificationKey: onlyPublicKey(values.keys.signingPublicKey),
    })) as { mailbox: string; token: string; pixelUrl: string };
    if (
      !READ_UUID.test(result.mailbox) ||
      !/^[a-zA-Z0-9_-]{16,3000}$/.test(result.token) ||
      result.pixelUrl !== `${base}/p/${result.token}.gif`
    )
      throw new Error('response');
    const tracker: ReadTracker = {
      id: result.mailbox,
      token: result.token,
      pixelUrl: result.pixelUrl,
      createdAt: Date.now(),
      reads: [],
      pendingAcknowledgements: [],
    };
    values.trackers[base] = [tracker, ...trackers];
    await vaultItem.setValue(values);
    return tracker;
  });
}
async function acknowledge(
  base: string,
  values: TrackerVault,
  tracker: ReadTracker,
): Promise<void> {
  while (tracker.pendingAcknowledgements.length) {
    const ids = tracker.pendingAcknowledgements.slice(0, 100);
    const signature = await signAcknowledgement(values.keys, tracker.id, ids);
    await request(base, '/api/events/ack', { token: tracker.token, ids, signature });
    tracker.pendingAcknowledgements = tracker.pendingAcknowledgements.filter(
      (id) => !ids.includes(id),
    );
    await vaultItem.setValue(values);
  }
}
/** Save decrypted events locally before acknowledgement. Retries cannot count an event twice. */
export function collectReadActivity(): Promise<ReadTracker[]> {
  return serial(async () => {
    const base = await getTrackerUrl(),
      values = await vault();
    const trackers = values.trackers[base] ?? [];
    for (const tracker of trackers) {
      await acknowledge(base, values, tracker);
      const result = (await request(base, '/api/events', { token: tracker.token })) as {
        mailbox: string;
        events: EncryptedReadEvent[];
      };
      if (
        result.mailbox !== tracker.id ||
        !Array.isArray(result.events) ||
        result.events.length > 100
      )
        throw new Error('response');
      const newReads: { id: string; at: number }[] = [];
      for (const event of result.events) {
        const at = await decryptReadEvent(values.keys, tracker.id, event);
        if (
          !tracker.reads.some((read) => read.id === event.id) &&
          !newReads.some((read) => read.id === event.id)
        )
          newReads.push({ id: event.id, at });
      }
      if (tracker.reads.length + newReads.length > 20000) throw new Error('limit');
      tracker.reads.push(...newReads);
      tracker.reads.sort((left, right) => left.at - right.at);
      tracker.pendingAcknowledgements = [
        ...new Set([...tracker.pendingAcknowledgements, ...result.events.map((event) => event.id)]),
      ];
      await vaultItem.setValue(values);
      await acknowledge(base, values, tracker);
    }
    return trackers;
  });
}
export function removeReadTracker(id: string): Promise<void> {
  return serial(async () => {
    const base = await getTrackerUrl(),
      values = await vault();
    const tracker = values.trackers[base]?.find((tracker) => tracker.id === id);
    if (!tracker) return;
    // Explicitly clear queued ciphertext with owner proof before forgetting local metadata.
    for (let page = 0; page < 10; page++) {
      const result = (await request(base, '/api/events', { token: tracker.token })) as {
        events: EncryptedReadEvent[];
      };
      if (!Array.isArray(result.events) || result.events.length > 100) throw new Error('response');
      if (!result.events.length) break;
      const ids = result.events.map((event) => event.id);
      await request(base, '/api/events/ack', {
        token: tracker.token,
        ids,
        signature: await signAcknowledgement(values.keys, tracker.id, ids),
      });
    }
    values.trackers[base] = values.trackers[base]?.filter((tracker) => tracker.id !== id) ?? [];
    await vaultItem.setValue(values);
  });
}
export function exportReadBackup(password: string): Promise<string> {
  return serial(async () => encryptTrackerBackup({ version: 1, vault: await vault() }, password));
}
export function importReadBackup(content: string, password: string): Promise<void> {
  return serial(async () => {
    const value = (await decryptTrackerBackup(content, password)) as {
      version: number;
      vault: TrackerVault;
    };
    if (
      value.version !== 1 ||
      !value.vault?.keys ||
      !value.vault.trackers ||
      typeof value.vault.trackers !== 'object' ||
      Array.isArray(value.vault.trackers)
    )
      throw new Error('backup');
    await validateTrackerKeys(value.vault.keys);
    const checked: TrackerVault = { keys: value.vault.keys, trackers: {} };
    for (const [base, trackers] of Object.entries(value.vault.trackers)) {
      if (normalizeTrackerUrl(base) !== base || !Array.isArray(trackers) || trackers.length > 100)
        throw new Error('backup');
      checked.trackers[base] = trackers.map((tracker) => {
        if (
          !READ_UUID.test(tracker.id) ||
          !/^[a-zA-Z0-9_-]{16,3000}$/.test(tracker.token) ||
          tracker.pixelUrl !== `${base}/p/${tracker.token}.gif` ||
          !Number.isSafeInteger(tracker.createdAt) ||
          tracker.createdAt < 0 ||
          tracker.createdAt > 8.64e15 ||
          !Array.isArray(tracker.reads) ||
          tracker.reads.length > 20000 ||
          tracker.reads.some(
            (read) =>
              !READ_UUID.test(read.id) ||
              !Number.isSafeInteger(read.at) ||
              read.at < 0 ||
              read.at > 8.64e15,
          ) ||
          new Set(tracker.reads.map((read) => read.id)).size !== tracker.reads.length ||
          !Array.isArray(tracker.pendingAcknowledgements) ||
          tracker.pendingAcknowledgements.length > 1000 ||
          tracker.pendingAcknowledgements.some((id) => !READ_UUID.test(id))
        )
          throw new Error('backup');
        return {
          id: tracker.id,
          token: tracker.token,
          pixelUrl: tracker.pixelUrl,
          createdAt: tracker.createdAt,
          reads: tracker.reads
            .map(({ id, at }) => ({ id, at }))
            .sort((left, right) => left.at - right.at),
          pendingAcknowledgements: [...tracker.pendingAcknowledgements],
        };
      });
      if (new Set(checked.trackers[base].map((tracker) => tracker.id)).size !== trackers.length)
        throw new Error('backup');
    }
    const current = await vaultItem.getValue();
    if (current && Object.values(current.trackers).some((list) => list.length))
      throw new Error('backupExists');
    await vaultItem.setValue(checked);
  });
}
export const readTrackerHtml = (tracker: ReadTracker) =>
  `<img src="${tracker.pixelUrl}" width="1" height="1" alt="" />`;
