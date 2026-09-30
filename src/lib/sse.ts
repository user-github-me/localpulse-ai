/**
 * Reads a Server-Sent Events stream and yields the `data` payload of each event.
 * Comment lines (starting with ":") and other fields are ignored; multi-line data is joined with "\n".
 */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];

  const takeLine = (line: string): string | undefined => {
    if (line === '') {
      if (data.length === 0) return undefined;
      const payload = data.join('\n');
      data = [];
      return payload;
    }
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== 'data') return undefined;
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    data.push(value);
    return undefined;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r\n|\r|\n/);
      while (newline !== -1) {
        // A trailing "\r" might be the first half of "\r\n" split across chunks.
        if (newline === buffer.length - 1 && buffer.endsWith('\r')) break;
        const line = buffer.slice(0, newline);
        const width = buffer.startsWith('\r\n', newline) ? 2 : 1;
        buffer = buffer.slice(newline + width);
        const payload = takeLine(line);
        if (payload !== undefined) yield payload;
        newline = buffer.search(/\r\n|\r|\n/);
      }
    }
    // A stream may end without a final blank line.
    buffer += decoder.decode();
    for (const line of buffer.split(/\r\n|\r|\n/)) {
      const payload = takeLine(line);
      if (payload !== undefined) yield payload;
    }
    const last = takeLine('');
    if (last !== undefined) yield last;
  } finally {
    // Also closes the connection when the consumer stops early (e.g. at [DONE] or on abort).
    await reader.cancel().catch(() => undefined);
  }
}
