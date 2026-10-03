import { test, expect, openPanel, seedStorage, mockChatApi, endpoint, MOCK_API } from './extension';
const file = {
  name: 'research.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('A verified quotation contains four words. Evidence remains on this device.'),
};
test('explicitly saves, reopens after panel closure, exports and deletes a collection', async ({
  context,
  extensionId,
  article,
}) => {
  let panel = await openPanel(context, extensionId, article);
  await panel.locator('input[type="file"]').first().setInputFiles(file);
  await panel.getByRole('button', { name: 'Research library', exact: true }).click();
  let library = panel.getByRole('dialog', { name: 'Research library' });
  await library.getByRole('textbox', { name: 'Collection name' }).fill('My research');
  await library.getByRole('button', { name: 'Save chosen sources' }).click();
  await expect(library.getByRole('heading', { name: 'My research' })).toBeVisible();
  await panel.close();
  panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Research library', exact: true }).click();
  library = panel.getByRole('dialog', { name: 'Research library' });
  await library.getByRole('textbox', { name: 'Search names and source text' }).fill('evidence');
  await expect(library.getByRole('heading', { name: 'My research' })).toBeVisible();
  const download = panel.waitForEvent('download');
  await library.getByRole('button', { name: 'Export library', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('localpulse-library.json');
  await library.getByRole('button', { name: 'Open collection' }).click();
  await expect(panel.getByRole('heading', { name: '1 documents' })).toBeVisible();
  await panel.getByRole('button', { name: 'Research library', exact: true }).click();
  await library.getByRole('button', { name: 'Delete', exact: true }).click();
  await library.getByRole('button', { name: 'Delete collection', exact: true }).click();
  await expect(library.getByRole('heading', { name: 'My research' })).toHaveCount(0);
});
test('reopened public sources need fresh cloud consent', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(
    context,
    MOCK_API,
    () => '“WebGPU is a modern graphics and compute API.”',
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:cloud', MOCK_API, 'Mock Cloud')] },
    apiKeys: { 'ep:cloud': 'test-key' },
    cloudConsent: { always: ['ep:cloud'], sites: {} },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Document workspace', exact: true }).click();
  const workspace = panel.getByRole('dialog', { name: 'Document workspace' });
  await workspace.getByRole('button', { name: 'Capture current page' }).click();
  await workspace.getByRole('button', { name: 'Close', exact: true }).click();
  await panel.getByRole('button', { name: 'Research library', exact: true }).click();
  const library = panel.getByRole('dialog', { name: 'Research library' });
  await library.getByRole('textbox', { name: 'Collection name' }).fill('Public page');
  await library.getByRole('button', { name: 'Save chosen sources' }).click();
  await library.getByRole('button', { name: 'Open collection' }).click();
  await panel.getByRole('button', { name: 'Summarize', exact: true }).click();
  const consent = panel.getByRole('dialog', { name: 'Send to Mock Cloud?' });
  await expect(consent).toBeVisible();
  expect(requests).toHaveLength(0);
  await consent.getByRole('button', { name: 'Send this time' }).click();
  await expect(panel.getByText(/WebGPU is a modern graphics/).last()).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('opens a checked quotation in its local source context', async ({
  context,
  extensionId,
  article,
}) => {
  await mockChatApi(context, MOCK_API, () => '“A verified quotation contains four words.”');
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:cloud', MOCK_API, 'Mock Cloud')] },
    apiKeys: { 'ep:cloud': 'test-key' },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.locator('input[type="file"]').first().setInputFiles(file);
  await panel.getByRole('button', { name: 'Summarize', exact: true }).click();
  await panel
    .getByRole('dialog', { name: 'Send to Mock Cloud?' })
    .getByRole('button', { name: 'Send this time' })
    .click();
  await panel.getByRole('button', { name: 'Quote checked' }).click();
  await panel.getByRole('button', { name: 'Open source excerpt' }).click();
  const excerpt = panel.getByRole('dialog', { name: 'Verified source excerpt' });
  await expect(excerpt.locator('mark')).toContainText('A verified quotation contains four words');
  await expect(excerpt).toContainText('Evidence remains on this device.');
  await expect(excerpt.getByRole('link', { name: 'Open original source' })).toHaveCount(0);
});
