import { expect, it } from 'vitest';
import { duplicateTabIds, safeSessionTab, tabDomainGroups } from '@/core/tabs';
it('keeps query and fragment variants and pinned tabs out of duplicate closure', () => {
  const tabs = [
    { id: 1, url: 'https://example.test/?q=one', title: 'one', pinned: true },
    { id: 2, url: 'https://example.test/?q=one', title: 'two', pinned: false },
    { id: 3, url: 'https://example.test/?q=two', title: 'three', pinned: false },
    { id: 4, url: 'https://example.test/?q=one#work', title: 'four', pinned: false },
  ];
  expect(duplicateTabIds(tabs)).toEqual([2]);
  expect(tabDomainGroups(tabs).get('example.test')).toHaveLength(4);
});
it('session URLs cannot execute scripts or include credentials', () => {
  expect(safeSessionTab({ url: 'javascript:alert(1)', title: 'x' })).toBeUndefined();
  expect(safeSessionTab({ url: 'https://user:pass@example.test', title: 'x' })).toBeUndefined();
  expect(
    safeSessionTab({ url: 'https://example.test/?q=work', title: 'x', apiKey: 'fake' }),
  ).toEqual({ url: 'https://example.test/?q=work', title: 'x' });
});
