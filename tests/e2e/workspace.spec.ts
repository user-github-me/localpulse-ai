import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  endpoint,
  MOCK_API,
  MOCK_LOCAL_API,
  mockChatApi,
  openPanel,
  seedStorage,
} from './extension';

const files = [
  {
    name: 'first.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Revenue grew by twelve percent. The first report covers January.'),
  },
  {
    name: 'second.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Costs fell by five percent. The second report covers February.'),
  },
];

declare const chrome: {
  storage: { session: { set(items: Record<string, unknown>): Promise<void> } };
};

test('retries with original workspace sources and refuses missing originals', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, () => 'Original sources analyzed.');
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.locator('input[type="file"]').first().setInputFiles(files);
  await panel.getByRole('button', { name: 'Summarize', exact: true }).click();
  await expect(panel.getByText('Original sources analyzed.')).toBeVisible();
  await panel.getByRole('button', { name: 'Document workspace', exact: true }).click();
  const workspace = panel.getByRole('dialog', { name: 'Document workspace' });
  await workspace.getByRole('checkbox', { name: /second.txt/ }).uncheck();
  await workspace.getByRole('button', { name: 'Read chosen sources' }).click();
  await panel.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(panel.getByText('Original sources analyzed.')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]?.body.messages.at(-1)?.content).toContain('Costs fell by five percent.');
  await panel.getByRole('button', { name: 'Document workspace', exact: true }).click();
  await workspace.getByRole('button', { name: 'Remove second.txt' }).click();
  await workspace.getByRole('button', { name: 'Read chosen sources' }).click();
  await panel.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    panel.getByText(/The original workspace sources are no longer available/),
  ).toBeVisible();
  await expect(panel.getByText('Original sources analyzed.')).toBeVisible();
  expect(requests).toHaveLength(2);
});

test('runs a right-click action received while files are loading using its selected text', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, () => 'Selected text explained.');
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.evaluate(() => {
    const readText = File.prototype.text;
    File.prototype.text = async function () {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return readText.call(this);
    };
  });
  await panel.locator('input[type="file"]').first().setInputFiles(files);
  await expect(panel.getByText('Reading first.txt…').first()).toBeVisible();
  const question = panel.getByRole('textbox', { name: 'Ask about this page' });
  await question.fill('Keep this question while reading.');
  await question.press('Enter');
  await expect(question).toHaveValue('Keep this question while reading.');
  await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await panel.evaluate(async (action) => chrome.storage.session.set({ pendingAction: action }), {
    id: 'queued-reading',
    recipeId: 'explain',
    selection: 'The right-click text is about compilers.',
    url: article.url(),
    createdAt: Date.now(),
  });
  await expect(panel.getByText('Selected text explained.')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]?.body.messages.at(-1)?.content).toContain(
    'The right-click text is about compilers.',
  );
  expect(requests[0]?.body.messages.at(-1)?.content).not.toContain('Revenue grew');
});

test('reads several documents, checks quote sources, and keeps captured pages in the workspace', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () =>
      'The first report says “Revenue grew by twelve percent.” The second says “Costs fell by five percent.”',
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.locator('input[type="file"]').first().setInputFiles(files);
  await expect(panel.getByRole('heading', { name: '2 documents', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(panel.getByText(/Answered on this device/)).toBeVisible();
  expect(requests[0]?.body.messages.at(-1)?.content).toContain('Document 2: second.txt');
  expect(requests[0]?.body.messages.at(-1)?.content).toContain('Revenue grew by twelve percent.');
  await panel.getByRole('button', { name: '2 quotes checked against the page' }).click();
  await expect(panel.getByText('Source: first.txt.')).toBeVisible();
  await expect(panel.getByText('Source: second.txt.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Show on page' })).toHaveCount(0);

  await panel.getByRole('button', { name: 'Document workspace', exact: true }).click();
  const dialog = panel.getByRole('dialog', { name: 'Document workspace' });
  await dialog.getByRole('checkbox', { name: /second.txt/ }).uncheck();
  await dialog.getByRole('button', { name: 'Capture current page' }).click();
  await expect(dialog.getByRole('checkbox', { name: /How WebGPU changes/ })).toBeVisible();
  expect((await new AxeBuilder({ page: panel }).analyze()).violations).toEqual([]);
  await panel.screenshot({ path: 'local/test-results/screens/workspace.png' });
  await dialog.getByRole('button', { name: 'Read chosen sources' }).click();
  await panel.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = panel.getByRole('dialog', { name: 'What the AI will read' });
  await expect(preview).toContainText('Document 2: How WebGPU changes');
  await expect(preview).not.toContainText('Costs fell by five percent.');
});

test('local files always require one-time cloud consent, and never-send rules cover every chosen source', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_API, () => 'Report analyzed.');
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:cloud', MOCK_API, 'Mock Cloud')] },
    apiKeys: { 'ep:cloud': 'test-key' },
    cloudConsent: { always: ['ep:cloud'], sites: {} },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.locator('input[type="file"]').first().setInputFiles(files);
  await panel.getByRole('button', { name: 'Summarize', exact: true }).click();
  const consent = panel.getByRole('dialog', { name: 'Send to Mock Cloud?' });
  await expect(consent).toContainText('from 2 documents');
  await expect(consent.getByRole('button', { name: /Always send/ })).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await consent.getByRole('button', { name: 'Send this time' }).click();
  await expect(panel.getByText('Report analyzed.')).toBeVisible();
  await panel.getByRole('button', { name: 'Key points', exact: true }).click();
  await expect(consent).toBeVisible();
  await consent.getByRole('button', { name: "Don't send" }).click();
  await panel.getByRole('button', { name: 'Document workspace', exact: true }).click();
  const workspace = panel.getByRole('dialog', { name: 'Document workspace' });
  await workspace.getByRole('button', { name: 'Capture current page' }).click();
  await expect(workspace.getByRole('checkbox', { name: /How WebGPU changes/ })).toBeVisible();
  await workspace.getByRole('button', { name: 'Read chosen sources' }).click();
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:cloud', MOCK_API, 'Mock Cloud')],
      neverCloudSites: ['article.test'],
    },
  });
  await panel.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(panel.getByText(/Cloud providers are off for this page/)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('rejects an invalid batch without partially adding its files', async ({
  context,
  extensionId,
  article,
}) => {
  const panel = await openPanel(context, extensionId, article);
  await panel
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      files[0]!,
      { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from('') },
    ]);
  await expect(panel.getByText(/No readable text in empty.txt/)).toBeVisible();
  await panel.getByRole('button', { name: 'Document workspace', exact: true }).click();
  await expect(
    panel.getByRole('dialog', { name: 'Document workspace' }).getByRole('checkbox'),
  ).toHaveCount(0);
});
