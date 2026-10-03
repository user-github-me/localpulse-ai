import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  endpoint,
  expect,
  MOCK_LOCAL_API,
  mockChatApi,
  openPanel,
  seedStorage,
  test,
} from './extension';

test('searches and filters actions, persists pins, and runs an unpinned study action', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () =>
      '| Front | Back |\n| --- | --- |\n| What does WebGPU enable? | GPU compute in web pages. |',
  );
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      onboardingComplete: true,
    },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.setViewportSize({ width: 320, height: 820 });
  const toolbar = panel.getByRole('navigation', { name: 'Quick actions' });
  await expect(toolbar.getByRole('button', { name: 'Flashcards', exact: true })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Browse actions' }).click();
  const library = panel.getByRole('dialog', { name: 'Action library' });
  await expect(library).toBeVisible();
  expect(
    (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);

  await library.getByRole('combobox', { name: 'Category' }).selectOption('learn');
  await expect(library.getByRole('heading', { name: 'Study guide' })).toBeVisible();
  await expect(library.getByRole('heading', { name: 'Research brief' })).toHaveCount(0);
  await library.getByRole('searchbox', { name: 'Search actions' }).fill('nothing-matches-this');
  await expect(
    library.getByText('No matching actions. Try another search or category.'),
  ).toBeVisible();
  await library.getByRole('searchbox', { name: 'Search actions' }).fill('flashcards');
  await expect(library.getByRole('status')).toContainText('1 action found');

  await library.getByRole('button', { name: 'Pin Flashcards to quick actions' }).click();
  await expect(
    library.getByRole('button', { name: 'Unpin Flashcards from quick actions' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await panel.keyboard.press('Escape');
  await expect(library).not.toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Flashcards', exact: true })).toBeVisible();

  await panel.reload();
  await expect(toolbar.getByRole('button', { name: 'Flashcards', exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Browse actions' }).click();
  await library.getByRole('searchbox', { name: 'Search actions' }).fill('flashcards');
  await library.getByRole('button', { name: 'Unpin Flashcards from quick actions' }).click();
  await expect(
    library.getByRole('button', { name: 'Pin Flashcards to quick actions' }),
  ).toHaveAttribute('aria-pressed', 'false');
  const screens = join(import.meta.dirname, '../../local/test-results/screens');
  mkdirSync(screens, { recursive: true });
  await panel.screenshot({ path: join(screens, 'action-library.png') });
  await library.getByRole('button', { name: 'Run Flashcards' }).click();
  await expect(library).not.toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Flashcards', exact: true })).toHaveCount(0);
  await expect(panel.getByText('Answered on this device by Local Mock')).toBeVisible();
  await expect(panel.getByRole('cell', { name: 'GPU compute in web pages.' })).toBeVisible();
  expect(requests).toHaveLength(1);
  const content = requests[0]?.body.messages.at(-1)?.content ?? '';
  expect(content).toContain('Create up to 15 flashcards');
  expect(content).toContain('Compute shaders let a page run');
});

test('keeps the library available with an empty toolbar and finds custom prompts', async ({
  context,
  extensionId,
  article,
}) => {
  const requests = await mockChatApi(context, MOCK_LOCAL_API, () => 'No costs are stated.');
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      quickActions: [],
      customRecipes: [
        {
          id: 'custom-budget',
          label: 'Budget helper',
          prompt: 'Extract costs and uncertainties from the page.',
          mode: 'reduce',
          input: 'page',
          custom: true,
        },
      ],
    },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Browse actions' }).click();
  const library = panel.getByRole('dialog', { name: 'Action library' });
  await library.getByRole('combobox', { name: 'Category' }).selectOption('custom');
  await library.getByRole('searchbox', { name: 'Search actions' }).fill('costs uncertainties');
  await expect(library.getByRole('heading', { name: 'Budget helper' })).toBeVisible();
  await expect(library.getByRole('heading', { name: 'Summarize', exact: true })).toHaveCount(0);
  await library.getByRole('button', { name: 'Run Budget helper' }).click();
  await expect(panel.getByText('No costs are stated.')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]?.body.messages.at(-1)?.content).toContain('Extract costs and uncertainties');
});
