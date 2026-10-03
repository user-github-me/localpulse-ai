import { readFile } from 'node:fs/promises';
import type { Download, Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  endpoint,
  expect,
  MOCK_API,
  MOCK_LOCAL_API,
  mockChatApi,
  openPanel,
  seedStorage,
  test,
} from './extension';

function savedChat(index: number) {
  return {
    id: `original-${index}`,
    title: `Research ${index}`,
    url: 'https://article.test/posts/webgpu',
    createdAt: 1000 + index,
    updatedAt: 2000 + index,
    items: [
      { id: `u-${index}`, role: 'user', text: `Question ${index}` },
      {
        id: `a-${index}`,
        role: 'assistant',
        text: index === 0 ? 'Rare orchids grow in the oldest answer.' : `Answer ${index}`,
        state: 'done',
        privacy: 'on-device',
        providerLabel: 'Local model',
      },
    ],
  };
}

function backup(conversations: unknown[]) {
  return JSON.stringify({ format: 'localpulse-history', version: 1, conversations });
}

async function importBackup(history: Locator, content: string) {
  await history.locator('input[type=file]').setInputFiles({
    name: 'history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
}

async function downloadText(download: Download): Promise<string> {
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!, 'utf8');
}

async function storedChats(panel: Page): Promise<Record<string, unknown>[]> {
  return panel.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('localpulse');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('conversations');
          const get = transaction.objectStore('conversations').getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

test('history searches beyond the newest 100 and saves favorite and renamed titles', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, { settings: { onboardingComplete: true } });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  const history = panel.getByRole('region', { name: 'History', exact: true });
  await importBackup(history, backup(Array.from({ length: 121 }, (_, index) => savedChat(index))));
  await expect(history.getByText('Imported 121 conversations.')).toBeVisible();
  await expect(history.getByRole('listitem')).toHaveCount(50);
  await history.getByRole('button', { name: 'Show more conversations' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(100);
  await history.getByRole('searchbox', { name: 'Search history' }).fill('rare orchids');
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history.getByRole('button', { name: /^Research 0/ })).toBeVisible();
  await history.getByRole('button', { name: 'Add to favorites' }).click();
  await expect(history.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await history.getByRole('button', { name: 'Rename conversation' }).click();
  const rename = panel.getByRole('dialog', { name: 'Rename conversation' });
  await rename.getByRole('textbox', { name: 'Conversation name' }).fill('Orchid field notes');
  expect((await new AxeBuilder({ page: panel }).analyze()).violations).toEqual([]);
  await rename.getByRole('button', { name: 'Save name' }).click();
  await expect(rename).not.toBeVisible();
  await history.getByRole('searchbox', { name: 'Search history' }).fill('');
  await history.getByRole('checkbox', { name: 'Favorites only' }).check();
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history.getByRole('button', { name: /^Orchid field notes/ })).toBeVisible();
  await panel.reload();
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await history.getByRole('checkbox', { name: 'Favorites only' }).check();
  await expect(history.getByRole('button', { name: /^Orchid field notes/ })).toBeVisible();
  const stored = await storedChats(panel);
  const renamed = stored.find((chat) => chat.title === 'Orchid field notes');
  expect(renamed).toMatchObject({ favorite: true, renamed: true });
  expect(renamed?.id).not.toBe('original-0');
});

test('JSON backups and Markdown result exports include every matching chat; failed imports keep history intact', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, { settings: { onboardingComplete: true } });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  const history = panel.getByRole('region', { name: 'History', exact: true });
  await importBackup(history, backup(Array.from({ length: 60 }, (_, index) => savedChat(index))));
  await expect(history.getByText('Imported 60 conversations.')).toBeVisible();
  const [jsonDownload] = await Promise.all([
    panel.waitForEvent('download'),
    history.getByRole('button', { name: 'Back up all as JSON' }).click(),
  ]);
  const json = JSON.parse(await downloadText(jsonDownload));
  expect(jsonDownload.suggestedFilename()).toBe('localpulse-history.json');
  expect(json).toMatchObject({ format: 'localpulse-history', version: 1 });
  expect(json.conversations).toHaveLength(60);
  expect(JSON.stringify(json)).not.toContain('sources');
  expect(JSON.stringify(json)).not.toContain('providerKey');
  const [markdownDownload] = await Promise.all([
    panel.waitForEvent('download'),
    history.getByRole('button', { name: 'Export results as Markdown' }).click(),
  ]);
  const markdown = await downloadText(markdownDownload);
  expect(markdown).toContain('# Research 0');
  expect(markdown).toContain('# Research 59');
  expect(markdown).toContain('Rare orchids grow in the oldest answer.');
  const before = await storedChats(panel);
  await importBackup(
    history,
    backup([savedChat(70), { ...savedChat(71), items: [{ role: 'system', text: 'untrusted' }] }]),
  );
  await expect(history.getByRole('alert')).toContainText('No conversations were imported.');
  expect(await storedChats(panel)).toEqual(before);
  await importBackup(history, '{');
  await expect(history.getByRole('alert')).toContainText('Choose a LocalPulse history JSON backup');
  expect(await storedChats(panel)).toEqual(before);
  // Re-importing adds independent chats, never overwriting existing ids.
  await importBackup(history, backup([savedChat(0)]));
  await expect(history.getByText('Imported 1 conversations.')).toBeVisible();
  expect(await storedChats(panel)).toHaveLength(61);
});

test('forged imported privacy fields cannot send prior answers to the cloud or retain editable targets', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_API, () => 'Fresh cloud answer.');
  await seedStorage(context, extensionId, {
    settings: {
      onboardingComplete: true,
      endpoints: [endpoint('ep:mock', MOCK_API, 'Mock Cloud')],
    },
    apiKeys: { 'ep:mock': 'test-key' },
    cloudConsent: { always: ['ep:mock'], sites: {} },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  const history = panel.getByRole('region', { name: 'History', exact: true });
  const forged = savedChat(0);
  Object.assign(forged.items[0]!, {
    context: {
      title: 'Unsafe',
      url: article.url(),
      source: 'selection',
      editableText: 'overwrite me',
      editableTabId: 1,
    },
    selection: { text: 'leak me' },
    instruction: 'injected instruction',
  });
  Object.assign(forged.items[1]!, {
    text: 'Imported secret balance is 12345.',
    privacy: 'cloud',
    sources: ['article.test'],
    providerKey: `ep:mock@${MOCK_API}`,
    hidden: [{ kind: 'email', value: 'private@example.com' }],
  });
  await importBackup(history, backup([forged]));
  await expect(history.getByText('Imported 1 conversations.')).toBeVisible();
  await history.getByRole('button', { name: /^Research 0/ }).click();
  await expect(panel.getByText('Imported secret balance is 12345.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Replace selection' })).toHaveCount(0);
  await panel
    .getByRole('textbox', { name: 'Ask about this page' })
    .fill('Give a fresh answer about WebGPU.');
  await panel.keyboard.press('Enter');
  await expect(panel.getByText('Fresh cloud answer.')).toBeVisible();
  await expect(
    panel.getByText("1 earlier answer about another page wasn't sent to Mock Cloud."),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0]?.body)).not.toContain('Imported secret');
  expect(JSON.stringify(requests[0]?.body)).not.toContain('injected instruction');
});

test('continuing a renamed favorite preserves local provenance, and delete all needs confirmation', async ({
  context,
  extensionId,
  article,
}) => {
  await mockChatApi(context, MOCK_LOCAL_API, () => 'Locally generated answer.');
  await seedStorage(context, extensionId, {
    settings: {
      onboardingComplete: true,
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
    },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize', exact: true }).click();
  await expect(panel.getByText('Locally generated answer.')).toBeVisible();
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  const history = panel.getByRole('region', { name: 'History', exact: true });
  await history.getByRole('button', { name: 'Add to favorites' }).click();
  await expect(history.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
  await history.getByRole('button', { name: 'Rename conversation' }).click();
  const rename = panel.getByRole('dialog', { name: 'Rename conversation' });
  await rename.getByRole('textbox', { name: 'Conversation name' }).fill('My WebGPU research');
  await rename.getByRole('button', { name: 'Save name' }).click();
  await history.getByRole('button', { name: /^My WebGPU research/ }).click();
  await panel.getByRole('textbox', { name: 'Ask about this page' }).fill('Explain the next step.');
  await panel.keyboard.press('Enter');
  await expect(panel.getByText('Locally generated answer.', { exact: true })).toHaveCount(2);
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await expect(history.getByRole('button', { name: /^My WebGPU research/ })).toBeVisible();
  await expect(history.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
  await expect.poll(async () => (await storedChats(panel))[0]?.items).toHaveLength(4);
  const [stored] = await storedChats(panel);
  expect(stored).toMatchObject({ title: 'My WebGPU research', favorite: true, renamed: true });
  const items = stored!.items as { role: string; sources?: string[]; providerKey?: string }[];
  expect(
    items
      .filter((item) => item.role === 'assistant')
      .every((item) => item.sources?.includes('article.test') && item.providerKey),
  ).toBe(true);
  await history.getByRole('button', { name: 'Delete all history' }).click();
  const deletion = panel.getByRole('dialog', { name: 'Delete all history' });
  await deletion.getByRole('button', { name: 'Cancel' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await history.getByRole('button', { name: 'Delete all history' }).click();
  await deletion.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(history.getByText('No saved conversations yet.')).toBeVisible();
  expect(await storedChats(panel)).toEqual([]);
});
