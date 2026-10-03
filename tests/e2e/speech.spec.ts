import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  endpoint,
  MOCK_LOCAL_API,
  mockChatApi,
  openPanel,
  seedStorage,
} from './extension';

test('reads with installed voices only, exposes controls, and stops when the answer unmounts', async ({
  context,
  extensionId,
  article,
}) => {
  await context.addInitScript(() => {
    const events = new EventTarget();
    const spoken: { text: string; voice: string; local: boolean }[] = [];
    const voices = [
      {
        name: 'Remote default',
        voiceURI: 'remote',
        lang: 'en-US',
        default: true,
        localService: false,
      },
      {
        name: 'Installed English',
        voiceURI: 'english',
        lang: 'en-US',
        default: false,
        localService: true,
      },
      {
        name: 'Installed Bangla',
        voiceURI: 'bangla',
        lang: 'bn-BD',
        default: false,
        localService: true,
      },
    ];
    let cancelled = 0;
    const engine = {
      getVoices: () => voices,
      speak: (utterance: SpeechSynthesisUtterance) =>
        spoken.push({
          text: utterance.text,
          voice: utterance.voice?.name ?? '',
          local: utterance.voice?.localService === true,
        }),
      pause() {},
      resume() {},
      cancel() {
        cancelled++;
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    };
    Object.defineProperty(window, 'speechSynthesis', { value: engine, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(readonly text: string) {}
        voice: SpeechSynthesisVoice | null = null;
        lang = '';
        onend = null;
        onerror = null;
      },
      configurable: true,
    });
    Object.defineProperty(window, '__speechTest', {
      value: { spoken, cancelled: () => cancelled },
      configurable: true,
    });
  });
  await mockChatApi(
    context,
    MOCK_LOCAL_API,
    () => '# Summary\n\n**The page** explains WebGPU. [Read more](https://example.test/private).',
  );
  await seedStorage(context, extensionId, {
    settings: { endpoints: [endpoint('ep:local', MOCK_LOCAL_API, 'Local mock')] },
  });
  const panel = await openPanel(context, extensionId, article);
  await panel.getByRole('button', { name: 'Summarize', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Read aloud', exact: true }).click();
  const choice = panel.getByRole('combobox', { name: 'Local voice' });
  await expect(choice).toBeVisible();
  await expect(choice.locator('option')).toHaveCount(2);
  expect(await choice.locator('option').allTextContents()).not.toContain('Remote default (en-US)');
  expect(
    await panel.evaluate(
      () =>
        (window as unknown as { __speechTest: { spoken: { text: string; local: boolean }[] } })
          .__speechTest.spoken[0],
    ),
  ).toMatchObject({ local: true, text: 'Summary The page explains WebGPU. Read more.' });
  await panel.getByRole('button', { name: 'Pause reading', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Resume reading', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Resume reading', exact: true }).click();
  await choice.selectOption({ label: 'Installed Bangla (bn-BD)' });
  expect(
    await panel.evaluate(() =>
      (
        window as unknown as { __speechTest: { spoken: { voice: string; local: boolean }[] } }
      ).__speechTest.spoken.at(-1),
    ),
  ).toMatchObject({ voice: 'Installed Bangla', local: true });
  expect(
    (await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await panel.getByRole('button', { name: 'Stop reading', exact: true }).click();
  await expect(choice).toHaveCount(0);
  await panel.getByRole('button', { name: 'Read aloud', exact: true }).click();
  const before = await panel.evaluate(() =>
    (window as unknown as { __speechTest: { cancelled(): number } }).__speechTest.cancelled(),
  );
  await panel.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Stop reading', exact: true })).toHaveCount(0);
  expect(
    await panel.evaluate(() =>
      (window as unknown as { __speechTest: { cancelled(): number } }).__speechTest.cancelled(),
    ),
  ).toBeGreaterThan(before);
});
