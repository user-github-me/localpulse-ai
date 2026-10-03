import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterFollowups,
  foldCalendarLine,
  FollowupError,
  followupsToIcs,
  parseLocalDue,
  safeFollowupUrl,
  snoozeDue,
  toLocalDue,
  validateFollowupDraft,
  type Followup,
} from '@/core/followups';

function task(id: string, dueAt: number, status: Followup['status'] = 'open'): Followup {
  return { id, title: `Research ${id}`, dueAt, status, createdAt: 1000, updatedAt: 1000 };
}

afterEach(() => vi.unstubAllEnvs());

describe('follow-up records', () => {
  it('stores only reviewed metadata and strips source URL credentials', () => {
    expect(
      validateFollowupDraft({
        title: '  Read the update  ',
        dueAt: 1000,
        sourceUrl: 'https://user:password@example.com/inbox/42',
        recipients: ['person@example.com'],
        body: 'Private email',
        status: 'done',
      } as never),
    ).toEqual({ title: 'Read the update', dueAt: 1000, sourceUrl: 'https://example.com/inbox/42' });
    expect(safeFollowupUrl('http://localhost:3000/thread?id=42')).toBe(
      'http://localhost:3000/thread?id=42',
    );
    for (const url of [
      'javascript:alert(1)',
      'file:///tmp/mail',
      'data:text/html,Hi',
      'chrome://settings',
      'not a URL',
    ])
      expect(safeFollowupUrl(url)).toBeUndefined();
  });

  it('rejects bad due times, unsafe links and titles before storage', () => {
    for (const dueAt of [NaN, Infinity, -1, 0.5, 253_402_300_800_000])
      expect(() => validateFollowupDraft({ title: 'Follow up', dueAt })).toThrow(FollowupError);
    for (const title of ['', '   ', 'x'.repeat(161), '\u0000bad'])
      expect(() => validateFollowupDraft({ title, dueAt: 1000 })).toThrow(FollowupError);
    expect(() =>
      validateFollowupDraft({ title: 'Follow up', dueAt: 1000, sourceUrl: 'javascript:alert(1)' }),
    ).toThrow('invalidUrl');
  });

  it('filters due/upcoming/done independently and searches title and source by every word', () => {
    const tasks = [
      task('late', 1100),
      task('early', 900),
      task('now', 1000),
      { ...task('done', 800, 'done'), sourceUrl: 'https://notes.example.com' },
    ];
    expect(filterFollowups(tasks, '', 'due', 1000).map((item) => item.id)).toEqual([
      'early',
      'now',
    ]);
    expect(filterFollowups(tasks, '', 'upcoming', 1000).map((item) => item.id)).toEqual(['late']);
    expect(filterFollowups(tasks, ' NOTES research ', 'done', 1000).map((item) => item.id)).toEqual(
      ['done'],
    );
    expect(filterFollowups(tasks, 'now early', 'due', 1000)).toEqual([]);
    expect(tasks.map((item) => item.id)).toEqual(['late', 'early', 'now', 'done']);
  });
});

describe('local due dates', () => {
  it('round-trips local time without applying UTC or rolling impossible dates', () => {
    vi.stubEnv('TZ', 'Asia/Shanghai');
    const due = parseLocalDue('2026-10-03T09:30');
    expect(due).toBe(new Date(2026, 9, 3, 9, 30).getTime());
    expect(toLocalDue(due!)).toBe('2026-10-03T09:30');
    expect(new Date(due!).toISOString()).toBe('2026-10-03T01:30:00.000Z');
    for (const invalid of [
      '2026-02-30T10:00',
      '2026-13-01T10:00',
      '2026-01-01T24:00',
      '2026-01-01T10:60',
      '2026-1-1T10:00',
      '2026-01-01T10:00Z',
    ])
      expect(parseLocalDue(invalid)).toBeUndefined();
  });

  it('rejects skipped DST times and snoozes by one calendar day instead of a fixed 24 hours', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(parseLocalDue('2026-03-08T02:30')).toBeUndefined();
    const before = parseLocalDue('2026-03-07T09:30')!;
    const next = snoozeDue(before, before);
    expect(toLocalDue(next)).toBe('2026-03-08T09:30');
    expect(next - before).toBe(23 * 60 * 60 * 1000);
    const overdue = parseLocalDue('2026-03-06T09:30')!;
    expect(snoozeDue(overdue, before)).toBe(next);
  });
});

describe('calendar export', () => {
  it('exports only open tasks with stable UIDs, UTC dates and display alarms', () => {
    const due = Date.UTC(2026, 9, 3, 9, 30);
    const csv = followupsToIcs(
      [task('open-task', due), task('done-task', due, 'done')],
      Date.UTC(2026, 9, 1),
    );
    expect(csv).toContain('UID:open-task@localpulse.invalid\r\n');
    expect(csv).toContain('DTSTAMP:20261001T000000Z\r\n');
    expect(csv).toContain('DTSTART:20261003T093000Z\r\n');
    expect(csv).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0S\r\n');
    expect(csv).not.toContain('done-task');
    expect(csv).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(csv).toMatch(/END:VCALENDAR\r\n$/);
  });

  it('escapes property injection and folds Unicode at 75 UTF-8 bytes without breaking characters', () => {
    const title = 'বিষয়,'.repeat(10) + '\r\nEND:VEVENT\nBEGIN:VEVENT;danger\\path';
    const content = followupsToIcs(
      [{ ...task('safe-id', 1000), title, sourceUrl: 'https://user:password@example.com/thread' }],
      1000,
    );
    const unfolded = content.replace(/\r\n /g, '');
    expect(unfolded).toContain('\\nEND:VEVENT\\nBEGIN:VEVENT\\;danger\\\\path');
    expect(unfolded.match(/\r\nBEGIN:VEVENT\r\n/g)).toHaveLength(1);
    expect(unfolded).toContain('URL:https://example.com/thread\r\n');
    expect(content).not.toContain('password');
    const encoder = new TextEncoder();
    for (const line of content.split('\r\n'))
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const source = `SUMMARY:${'🧠 বাংলা '.repeat(25)}`;
    expect(foldCalendarLine(source).replace(/\r\n /g, '')).toBe(source);
    expect(() => followupsToIcs([{ ...task('bad\r\nBEGIN:VEVENT', 1000) }], 1000)).toThrow(
      'missing',
    );
  });
});
