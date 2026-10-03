export interface FollowupDraft {
  title: string;
  dueAt: number;
  sourceUrl?: string;
}

export interface Followup extends FollowupDraft {
  id: string;
  status: 'open' | 'done';
  createdAt: number;
  updatedAt: number;
}

export type FollowupFilter = 'due' | 'upcoming' | 'done';
export const MAX_FOLLOWUPS = 1000;
export const MAX_FOLLOWUP_TITLE = 160;
const LAST_DATE = 253_402_300_799_999;

export class FollowupError extends Error {
  constructor(
    public readonly code: 'invalidTitle' | 'invalidDue' | 'invalidUrl' | 'limit' | 'missing',
  ) {
    super(code);
    this.name = 'FollowupError';
  }
}

/** Follow-ups only link to web pages; saved URLs never retain embedded credentials. */
export function safeFollowupUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    url.username = '';
    url.password = '';
    return url.href;
  } catch {
    return undefined;
  }
}

/** Produces only the explicit fields this feature stores, never page bodies or recipients. */
export function validateFollowupDraft(value: FollowupDraft): FollowupDraft {
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > MAX_FOLLOWUP_TITLE ||
    [...value.title].some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    })
  ) {
    throw new FollowupError('invalidTitle');
  }
  if (!Number.isSafeInteger(value.dueAt) || value.dueAt < 0 || value.dueAt > LAST_DATE) {
    throw new FollowupError('invalidDue');
  }
  const sourceUrl = value.sourceUrl ? safeFollowupUrl(value.sourceUrl) : undefined;
  if (value.sourceUrl && !sourceUrl) throw new FollowupError('invalidUrl');
  return { title: value.title.trim(), dueAt: value.dueAt, ...(sourceUrl ? { sourceUrl } : {}) };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** datetime-local uses the computer's local time, never an ISO UTC string. */
export function toLocalDue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Invalid dates and times skipped during a daylight-saving change are rejected, not rolled over. */
export function parseLocalDue(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year === undefined || year < 1970 || year > 9999) return undefined;
  const date = new Date(year, (month ?? 0) - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    return undefined;
  return date.getTime();
}

/** One local calendar day from the later of now and the existing due time (including DST). */
export function snoozeDue(dueAt: number, now = Date.now()): number {
  const date = new Date(Math.max(dueAt, now));
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function filterFollowups(
  tasks: readonly Followup[],
  query: string,
  filter: FollowupFilter,
  now = Date.now(),
): Followup[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tasks
    .filter((task) => {
      const matches =
        filter === 'done'
          ? task.status === 'done'
          : task.status === 'open' && (filter === 'due' ? task.dueAt <= now : task.dueAt > now);
      const text = `${task.title} ${task.sourceUrl ?? ''}`.toLocaleLowerCase();
      return matches && words.every((word) => text.includes(word));
    })
    .sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function calendarText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** RFC 5545 folds at 75 UTF-8 octets; a continuation's leading space counts toward the limit. */
export function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let part = '';
  let bytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) {
      parts.push(part);
      part = ' ';
      bytes = 1;
    }
    part += char;
    bytes += length;
  }
  parts.push(part);
  return parts.join('\r\n');
}

function calendarDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Calendar apps deliver reminders after the user imports this file. LocalPulse sends nothing. */
export function followupsToIcs(tasks: readonly Followup[], now = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LocalPulse AI//Follow-ups//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const task of tasks.filter((item) => item.status === 'open')) {
    const checked = validateFollowupDraft(task);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(task.id)) throw new FollowupError('missing');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${task.id}@localpulse.invalid`,
      `DTSTAMP:${calendarDate(now)}`,
      `DTSTART:${calendarDate(checked.dueAt)}`,
      `SUMMARY:${calendarText(checked.title)}`,
    );
    if (checked.sourceUrl) lines.push(`URL:${checked.sourceUrl}`);
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:PT0S',
      `DESCRIPTION:${calendarText(checked.title)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR', '');
  return lines.map(foldCalendarLine).join('\r\n');
}
