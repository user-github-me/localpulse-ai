/* global process, fetch, URL, AbortSignal, TextDecoder */

/** Only encrypted events, keyed by a random mailbox capability. No expiration. */
export function createMemoryActivityStore({ maxMailboxes = 1000, maxEvents = 1000 } = {}) {
  const boxes = new Map();
  return {
    async append(mailbox, event) {
      if (!boxes.has(mailbox) && boxes.size >= maxMailboxes) throw new Error('Queue full.');
      const entries = boxes.get(mailbox) ?? new Map();
      if (entries.size >= maxEvents) throw new Error('Queue full.');
      entries.set(event.id, event);
      boxes.set(mailbox, entries);
    },
    async read(mailbox, limit = 100) {
      return [...(boxes.get(mailbox)?.values() ?? [])].slice(0, limit);
    },
    async acknowledge(mailbox, ids) {
      const entries = boxes.get(mailbox);
      for (const id of ids) entries?.delete(id);
      if (entries?.size === 0) boxes.delete(mailbox);
    },
  };
}

export const APPEND_SCRIPT = `-- encrypted-read-events-v1
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1`;
export const READ_SCRIPT = `-- encrypted-read-events-read-v1
local cursor = '0'
local result = {}
repeat
  local page = redis.call('HSCAN', KEYS[1], cursor, 'COUNT', 100)
  cursor = page[1]
  for i=2,#page[2],2 do
    table.insert(result, page[2][i])
    if #result >= tonumber(ARGV[1]) then return result end
  end
until cursor == '0'
return result`;
export const ACK_SCRIPT = `-- encrypted-read-events-ack-v1
for i,id in ipairs(ARGV) do redis.call('HDEL', KEYS[1], id) end
return 1`;

/** Durable Vercel queue: values are ciphertext, with no TTL or plaintext read times/counts. */
export function createRedisActivityStore({
  url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  fetchImpl = fetch,
  maxEvents = 1000,
} = {}) {
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  )
    throw new Error('Configure an HTTPS Redis REST origin.');
  if (typeof token !== 'string' || !token || /\s/u.test(token))
    throw new Error('Configure Redis privately.');
  async function execute(script, mailbox, args) {
    const response = await fetchImpl(endpoint.href, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', script, 1, `localpulse:encrypted:${mailbox}`, ...args]),
    });
    if (!response.ok) throw new Error('Queue unavailable.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Queue unavailable.');
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 256000) throw new Error('Invalid queue response.');
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
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.error || !('result' in payload)) throw new Error('Queue unavailable.');
    return payload.result;
  }
  return {
    async append(mailbox, event) {
      if (
        (await execute(APPEND_SCRIPT, mailbox, [event.id, JSON.stringify(event), maxEvents])) !== 1
      )
        throw new Error('Queue full.');
    },
    async read(mailbox, limit = 100) {
      const result = await execute(READ_SCRIPT, mailbox, [limit]);
      if (!Array.isArray(result) || result.length > limit)
        throw new Error('Invalid queue response.');
      return result.map((value) => JSON.parse(value));
    },
    async acknowledge(mailbox, ids) {
      await execute(ACK_SCRIPT, mailbox, ids);
    },
  };
}
