import { mkdir, readFile } from 'node:fs/promises';
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

const deck = [
  { front: 'What does WebGPU enable?', back: 'Parallel computation in web pages.' },
  {
    front: 'Name an example workload.',
    back: 'Photo filters, particles, or neural-network inference.',
  },
  { front: 'What stays on this device?', back: 'Your study order and card ratings.' },
];
const answer = `\`\`\`json\n${JSON.stringify({ cards: deck })}\n\`\`\``;

test('studies structured cards, reviews missed cards, copies and exports locally, and reopens from history', async ({
  context,
  extensionId,
  article,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const requests = await mockChatApi(context, MOCK_LOCAL_API, () => answer);
  await seedStorage(context, extensionId, {
    settings: {
      onboardingComplete: true,
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      quickActions: ['flashcards'],
    },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.setViewportSize({ width: 320, height: 820 });
  await panel.getByRole('button', { name: 'Flashcards', exact: true }).click();
  const study = panel.getByRole('region', { name: 'Study flashcards' });
  await expect(study).toBeVisible();
  await expect(study.getByText(deck[0]!.front, { exact: true })).toBeVisible();
  await expect(study.getByText(deck[0]!.back, { exact: true })).not.toBeVisible();
  await expect(study.getByRole('button', { name: 'Previous card' })).toBeDisabled();
  await expect(study.getByRole('button', { name: 'I knew it' })).toBeDisabled();
  expect(
    (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);

  await study.getByRole('button', { name: 'Next card' }).click();
  await expect(study.getByText(deck[1]!.front, { exact: true })).toBeVisible();
  await study.getByRole('button', { name: 'Previous card' }).click();
  await study.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(study.getByText(deck[0]!.back, { exact: true })).toBeVisible();
  await expect(study.getByRole('button', { name: 'Hide answer' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const screens = join(import.meta.dirname, '../../local/test-results/screens');
  await mkdir(screens, { recursive: true });
  await panel.screenshot({ path: join(screens, 'study-cards-320.png') });
  await study.getByRole('button', { name: 'I knew it' }).click();
  await expect(study.getByText(deck[1]!.front, { exact: true })).toBeVisible();
  await expect(study.getByText(deck[1]!.back, { exact: true })).not.toBeVisible();
  await study.getByRole('button', { name: 'Reveal answer' }).click();
  await study.getByRole('button', { name: 'Study again', exact: true }).click();
  await study.getByRole('button', { name: 'Reveal answer' }).click();
  await study.getByRole('button', { name: 'I knew it' }).click();
  await expect(study.getByRole('heading', { name: 'Round complete' })).toBeVisible();
  await expect(study).toContainText('You knew 2 of 3 cards in this round.');
  await study.getByRole('button', { name: 'Review missed cards' }).click();
  await expect(study).toContainText('Card 1 of 1');
  await expect(study.getByText(deck[1]!.front, { exact: true })).toBeVisible();
  await expect(study.getByRole('button', { name: 'Shuffle cards' })).toBeDisabled();

  await study.getByRole('button', { name: 'Copy Anki CSV' }).click();
  await expect(study.getByRole('button', { name: 'Anki CSV copied' })).toBeVisible();
  const csv = await panel.evaluate(() => navigator.clipboard.readText());
  expect(csv).toContain('#separator:comma\r\n#html:true\r\n');
  expect(csv).toContain(
    '"<span>What does WebGPU enable?</span>","<span>Parallel computation in web pages.</span>"',
  );
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    study.getByRole('button', { name: 'Download for Anki' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('localpulse-flashcards.csv');
  const path = await download.path();
  expect(path).toBeTruthy();
  expect(await readFile(path!, 'utf8')).toBe(csv);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.body.messages.at(-1)?.content).toContain(
    '"cards":[{"front":"Question text","back":"Answer text"}]',
  );

  // Deck content survives through the existing saved answer, but study progress restarts.
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await panel
    .getByRole('region', { name: 'History', exact: true })
    .getByRole('button', { name: /^Flashcards:/ })
    .click();
  await expect(study).toContainText('0 of 3 cards rated');
  await expect(study.getByText(deck[0]!.back, { exact: true })).not.toBeVisible();
  await study.getByRole('button', { name: 'Shuffle cards' }).click();
  await expect(study).toContainText('Card 1 of 3');
  expect(requests).toHaveLength(1);
});

test('malformed card data remains a normal readable answer', async ({
  context,
  extensionId,
  article,
}) => {
  const malformed = '{"cards":[{"front":"Incomplete card"}]}';
  await mockChatApi(context, MOCK_LOCAL_API, () => malformed);
  await seedStorage(context, extensionId, {
    settings: {
      endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local Mock')],
      quickActions: ['flashcards'],
      onboardingComplete: true,
    },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(panel.getByText(malformed, { exact: true })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Study flashcards' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Download for Anki' })).toHaveCount(0);
  await expect(panel.getByText('Answered on this device by Local Mock')).toBeVisible();
});
