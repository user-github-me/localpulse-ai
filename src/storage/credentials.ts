import { storage } from '#imports';

// API keys live only in this browser: never storage.sync, never logged, never put in URLs.
const localKeys = storage.defineItem<Record<string, string>>('local:apiKeys', { fallback: {} });
const sessionKeys = storage.defineItem<Record<string, string>>('session:apiKeys', {
  fallback: {},
});

export async function getApiKey(endpointId: string): Promise<string | undefined> {
  const session = await sessionKeys.getValue();
  if (session[endpointId]) return session[endpointId];
  const local = await localKeys.getValue();
  return local[endpointId] || undefined;
}

export async function hasApiKey(endpointId: string): Promise<boolean> {
  return (await getApiKey(endpointId)) !== undefined;
}

/** Stores a key. With `sessionOnly`, it's forgotten when the browser closes. */
export async function setApiKey(
  endpointId: string,
  key: string,
  { sessionOnly = false }: { sessionOnly?: boolean } = {},
): Promise<void> {
  await removeApiKey(endpointId);
  const item = sessionOnly ? sessionKeys : localKeys;
  const keys = await item.getValue();
  await item.setValue({ ...keys, [endpointId]: key.trim() });
}

export async function removeApiKey(endpointId: string): Promise<void> {
  for (const item of [localKeys, sessionKeys]) {
    const keys = { ...(await item.getValue()) };
    if (endpointId in keys) {
      delete keys[endpointId];
      await item.setValue(keys);
    }
  }
}

export async function isSessionOnlyKey(endpointId: string): Promise<boolean> {
  return endpointId in (await sessionKeys.getValue());
}
