/**
 * YouTube transcripts, best effort. Caption files now need a token made by
 * YouTube's player, so this uses the transcript endpoint that YouTube's own "Show transcript"
 * panel calls. It's undocumented and may break; callers fall back to the title and description.
 * Runs inside the youtube.com page, only for the video the user is watching, when they ask.
 */

interface Segment {
  seconds: number;
  text: string;
}

function parseTime(value: string): number {
  return value
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + (Number.isFinite(part) ? part : 0), 0);
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Finds every transcriptSegmentRenderer in YouTube's response, wherever it's nested. */
export function collectSegments(node: unknown, out: Segment[] = []): Segment[] {
  if (Array.isArray(node)) {
    for (const child of node) collectSegments(child, out);
  } else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const segment = record.transcriptSegmentRenderer as
      | {
          startMs?: string;
          startTimeText?: { simpleText?: string };
          snippet?: { runs?: { text?: string }[]; simpleText?: string };
        }
      | undefined;
    if (segment) {
      const text = (
        segment.snippet?.runs?.map((run) => run.text ?? '').join('') ??
        segment.snippet?.simpleText ??
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      const seconds = segment.startMs
        ? Number(segment.startMs) / 1000
        : parseTime(segment.startTimeText?.simpleText ?? '0');
      if (text) out.push({ seconds, text });
    } else {
      for (const value of Object.values(record)) collectSegments(value, out);
    }
  }
  return out;
}

/** Groups segments into paragraphs of about a minute, each starting with its time. */
export function formatTranscript(segments: readonly Segment[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let start = 0;
  for (const segment of segments) {
    if (current.length > 0 && segment.seconds - start >= 60) {
      paragraphs.push(`[${formatTime(start)}] ${current.join(' ')}`);
      current = [];
    }
    if (current.length === 0) start = segment.seconds;
    current.push(segment.text);
  }
  if (current.length) paragraphs.push(`[${formatTime(start)}] ${current.join(' ')}`);
  return paragraphs.join('\n\n');
}

export async function fetchTranscript(videoId: string): Promise<string | undefined> {
  const signal = AbortSignal.timeout(10_000);
  // Re-read the watch page: after in-app navigation, the data embedded in the current DOM can
  // belong to the previous video.
  const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    credentials: 'include',
    signal,
  });
  if (!page.ok) return undefined;
  const html = await page.text();
  const params = /"getTranscriptEndpoint":\{"params":"([^"]+)"/.exec(html)?.[1];
  if (!params) return undefined;
  const clientVersion =
    /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1] ??
    /"clientVersion":"([^"]+)"/.exec(html)?.[1];
  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: clientVersion ?? '2.20260901.00.00' },
        },
        params,
      }),
      signal,
    },
  );
  if (!response.ok) return undefined;
  const segments = collectSegments(await response.json());
  return segments.length ? formatTranscript(segments) : undefined;
}
