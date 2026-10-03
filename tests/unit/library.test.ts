import { describe, expect, it } from 'vitest';
import {
  collectionMatches,
  exportLibrary,
  parseLibraryBackup,
  validateDocuments,
} from '@/core/library';
import { workspaceSourceKeys } from '@/core/workspace';
import { checkQuotes } from '@/core/quotes';
const document = {
  title: 'Report',
  url: 'https://private.test/report',
  kind: 'pdf',
  markdown:
    '## Page 1\n\nOld material here.\n\n## Page 7\n\nA verified quotation contains four words.',
  pages: 7,
  selectionEditable: true,
};
describe('local research library boundaries', () => {
  it('preserves source sites but drops executable/permission fields and refreshes identities', () => {
    const [first] = validateDocuments([
      { ...document, id: 'forged', cloudConsent: true, apiKey: 'fake' },
    ]);
    const [second] = validateDocuments([document]);
    expect(first?.id).not.toBe(second?.id);
    expect(first?.id).not.toBe('forged');
    expect(first).not.toHaveProperty('selectionEditable');
    expect(first).not.toHaveProperty('apiKey');
    expect(workspaceSourceKeys({ ...first!, requiresConsent: true })).toEqual([
      'private.test',
      `file:${first?.id}`,
    ]);
  });
  it('validates backups atomically and rejects unsafe URLs and excessive collections', () => {
    const backup = (documents: unknown) =>
      JSON.stringify({
        format: 'localpulse-library',
        version: 1,
        collections: [{ name: 'Research', documents }],
      });
    expect(parseLibraryBackup(backup([document]))[0]?.documents[0]?.url).toBe(document.url);
    expect(() =>
      parseLibraryBackup(backup([{ ...document, url: 'javascript:alert(1)' }])),
    ).toThrow();
    expect(() =>
      parseLibraryBackup(backup([{ ...document, url: 'https://user:pass@private.test' }])),
    ).toThrow();
    expect(() => parseLibraryBackup(backup(Array(13).fill(document)))).toThrow();
    expect(() => parseLibraryBackup(backup([{ ...document, markdown: '' }]))).toThrow();
  });
  it('exports only source content and searches all terms locally', () => {
    const collection = {
      id: 'one',
      name: 'Research',
      createdAt: 1,
      updatedAt: 2,
      documents: validateDocuments([document]),
    };
    const output = exportLibrary([collection]);
    expect(output).not.toContain('createdAt');
    expect(parseLibraryBackup(output)[0]?.name).toBe('Research');
    expect(collectionMatches(collection, 'research quotation')).toBe(true);
    expect(collectionMatches(collection, 'research missing')).toBe(false);
  });
});
describe('verified citation locations', () => {
  it('uses source offsets and real PDF page headings, rather than generated claims', () => {
    const [quote] = checkQuotes(
      'On page 2: “A verified quotation contains four words.”',
      document.markdown,
      true,
    );
    expect(quote?.location?.page).toBe(7);
    expect(quote?.location?.match).toContain('A verified quotation contains four words');
    expect(quote?.location?.before).toContain('## Page 7');
  });
  it('marks invented quotes missing and locates the first actual duplicate', () => {
    const [missing] = checkQuotes(
      '“An invented quotation contains four words.”',
      document.markdown,
      true,
    );
    expect(missing?.found).toBe(false);
    expect(missing?.location).toBeUndefined();
    const [found] = checkQuotes(
      '“A verified quotation contains four words.”',
      document.markdown + '\n## Page 9\nA verified quotation contains four words.',
      true,
    );
    expect(found?.location?.page).toBe(7);
  });
});
