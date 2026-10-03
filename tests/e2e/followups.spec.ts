import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expect, openPanel, seedStorage, test } from './extension';

async function storedFollowups(panel: Page): Promise<Record<string, unknown>[]> {
  return panel.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('localpulse-followups');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('tasks');
          const get = transaction.objectStore('tasks').getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

test('reviews page follow-ups, edits due dates, completes, persists and exports calendar reminders locally', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, { settings: { onboardingComplete: true } });
  const panel = await openPanel(context, extensionId, article);
  await panel.setViewportSize({ width: 320, height: 820 });
  const outbound: string[] = [];
  panel.on('request', (request) => {
    if (!request.url().startsWith('chrome-extension://')) outbound.push(request.url());
  });
  await panel.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  const board = panel.getByRole('region', { name: 'Follow-ups', exact: true });
  await board.getByRole('button', { name: 'Add current page' }).click();
  const add = panel.getByRole('dialog', { name: 'Add a follow-up' });
  await expect(add.getByRole('textbox', { name: 'Follow-up title' })).toHaveValue(
    'How WebGPU changes graphics on the web',
  );
  await expect(add).toContainText(article.url());
  await add.getByRole('textbox', { name: 'Follow-up title' }).fill('Ask about WebGPU pricing');
  await add.getByLabel('Due date and time', { exact: true }).fill('2020-01-02T09:30');
  expect(
    (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await add.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(add).not.toBeVisible();
  await expect(board.getByRole('heading', { name: 'Ask about WebGPU pricing' })).toBeVisible();
  const [stored] = await storedFollowups(panel);
  expect(stored).toMatchObject({
    title: 'Ask about WebGPU pricing',
    sourceUrl: article.url(),
    status: 'open',
  });
  expect(Object.keys(stored!).sort()).toEqual([
    'createdAt',
    'dueAt',
    'id',
    'sourceUrl',
    'status',
    'title',
    'updatedAt',
  ]);
  const screens = join(import.meta.dirname, '../../local/test-results/screens');
  await mkdir(screens, { recursive: true });
  await panel.screenshot({ path: join(screens, 'followups-320.png') });
  await board.getByRole('searchbox', { name: 'Search follow-ups' }).fill('WEBGPU article.test');
  await expect(board.getByRole('listitem')).toHaveCount(1);
  await board.getByRole('searchbox', { name: 'Search follow-ups' }).fill('none-matches');
  await expect(board.getByRole('listitem')).toHaveCount(0);
  await board.getByRole('searchbox', { name: 'Search follow-ups' }).fill('');
  await board.getByRole('button', { name: 'Edit follow-up', exact: true }).click();
  const edit = panel.getByRole('dialog', { name: 'Edit follow-up' });
  await edit.getByRole('textbox', { name: 'Follow-up title' }).fill('Check WebGPU update');
  await edit.getByLabel('Due date and time', { exact: true }).fill('2090-02-03T10:15');
  await edit.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(board.getByRole('combobox', { name: 'Show follow-ups' })).toHaveValue('upcoming');
  await expect(board.getByRole('heading', { name: 'Check WebGPU update' })).toBeVisible();
  const [beforeSnooze] = await storedFollowups(panel);
  await board.getByRole('button', { name: 'Snooze one day' }).click();
  await expect
    .poll(async () => (await storedFollowups(panel))[0]?.dueAt as number)
    .toBeGreaterThan(beforeSnooze!.dueAt as number);
  await board.getByRole('button', { name: 'Mark done' }).click();
  await expect(board.getByRole('listitem')).toHaveCount(0);
  await board.getByRole('combobox', { name: 'Show follow-ups' }).selectOption('done');
  await expect(board.getByRole('heading', { name: 'Check WebGPU update' })).toBeVisible();
  await panel.reload();
  await panel.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  await board.getByRole('combobox', { name: 'Show follow-ups' }).selectOption('done');
  await expect(board.getByRole('heading', { name: 'Check WebGPU update' })).toBeVisible();
  await board.getByRole('button', { name: 'Reopen follow-up' }).click();
  await board.getByRole('combobox', { name: 'Show follow-ups' }).selectOption('upcoming');
  const [calendar] = await Promise.all([
    panel.waitForEvent('download'),
    board.getByRole('button', { name: 'Export open tasks to calendar' }).click(),
  ]);
  expect(calendar.suggestedFilename()).toBe('localpulse-followups.ics');
  const path = await calendar.path();
  const content = await readFile(path!, 'utf8');
  expect(content).toContain('SUMMARY:Check WebGPU update\r\n');
  expect(content).toContain(`URL:${article.url()}\r\n`);
  expect(content).toContain('BEGIN:VALARM');
  expect(outbound).toEqual([]);

  await board.getByRole('button', { name: 'Clear all follow-ups' }).click();
  const clear = panel.getByRole('dialog', { name: 'Clear all follow-ups' });
  await clear.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(board.getByRole('listitem')).toHaveCount(1);
  await board.getByRole('button', { name: 'Clear all follow-ups' }).click();
  await clear.getByRole('button', { name: 'Delete all follow-ups' }).click();
  await expect(clear).not.toBeVisible();
  await expect(board.getByRole('listitem')).toHaveCount(0);
  expect(await storedFollowups(panel)).toEqual([]);
});

test('enforces the local task cap without dropping saved follow-ups', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, { settings: { onboardingComplete: true } });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  const board = panel.getByRole('region', { name: 'Follow-ups', exact: true });
  await expect(board.getByText('No follow-ups in this view.')).toBeVisible();
  await panel.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('localpulse-followups');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('tasks', 'readwrite');
          const tasks = transaction.objectStore('tasks');
          for (let index = 0; index < 1000; index++)
            tasks.add({
              id: `seed-${index}`,
              title: `Saved ${index}`,
              dueAt: Date.now() + 1_000_000,
              status: 'open',
              createdAt: 1000,
              updatedAt: 1000,
            });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
  await board.getByRole('button', { name: 'New follow-up' }).click();
  const add = panel.getByRole('dialog', { name: 'Add a follow-up' });
  await add.getByRole('textbox', { name: 'Follow-up title' }).fill('This must not be saved');
  await add.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(add.getByRole('alert')).toContainText('This board holds up to 1,000 follow-ups.');
  expect(await storedFollowups(panel)).toHaveLength(1000);
});

test('blank follow-ups stay independent of history settings and open only saved HTTP sources', async ({
  context,
  extensionId,
  article,
}) => {
  await seedStorage(context, extensionId, {
    settings: { onboardingComplete: true, saveHistory: false },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  const board = panel.getByRole('region', { name: 'Follow-ups', exact: true });
  await board.getByRole('button', { name: 'New follow-up' }).click();
  const add = panel.getByRole('dialog', { name: 'Add a follow-up' });
  await expect(add.getByRole('textbox', { name: 'Follow-up title' })).toHaveValue('');
  await expect(add).toContainText('No source page');
  await add.getByRole('textbox', { name: 'Follow-up title' }).fill('Send a proposal');
  await add.getByLabel('Due date and time', { exact: true }).fill('2090-01-01T12:00');
  await add.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(board.getByRole('heading', { name: 'Send a proposal' })).toBeVisible();
  await expect(board.getByRole('button', { name: 'Open source page' })).toHaveCount(0);
  await board.getByRole('button', { name: 'Delete follow-up', exact: true }).click();
  await expect(board.getByRole('listitem')).toHaveCount(0);
  await board.getByRole('button', { name: 'Add current page' }).click();
  await add.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(board.getByRole('listitem')).toHaveCount(1);
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    board.getByRole('button', { name: 'Open source page' }).click(),
  ]);
  await opened.waitForURL(article.url());
  await opened.close();
  expect(await storedFollowups(panel)).toHaveLength(1);
});
