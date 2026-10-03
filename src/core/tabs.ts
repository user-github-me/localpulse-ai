export interface SessionTab {
  title: string;
  url: string;
}
export interface OrganizerTab extends SessionTab {
  id: number;
  pinned: boolean;
}
export interface TabSession {
  id: string;
  name: string;
  createdAt: number;
  tabs: SessionTab[];
}
export function safeSessionTab(value: unknown): SessionTab | undefined {
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (typeof item.url !== 'string' || item.url.length > 8000 || typeof item.title !== 'string')
    return;
  try {
    const url = new URL(item.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return { url: url.href, title: item.title.slice(0, 300) };
  } catch {
    return;
  }
}
/** Exact URLs only: different queries and fragments may represent different user work. */
export function duplicateTabIds(tabs: OrganizerTab[]): number[] {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const tab of tabs) {
    if (seen.has(tab.url) && !tab.pinned) ids.push(tab.id);
    else seen.add(tab.url);
  }
  return ids;
}
export function tabDomainGroups(tabs: OrganizerTab[]): Map<string, OrganizerTab[]> {
  const groups = new Map<string, OrganizerTab[]>();
  for (const tab of tabs) {
    const host = new URL(tab.url).hostname;
    groups.set(host, [...(groups.get(host) ?? []), tab]);
  }
  return groups;
}
