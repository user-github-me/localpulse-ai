import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { pendingActionItem, takePendingAction } from '@/storage/pending';

beforeEach(() => {
  fakeBrowser.reset();
});

const action = (overrides = {}) => ({
  id: 'a1',
  recipeId: 'explain',
  selection: 'Some text',
  url: 'https://news.example/a',
  createdAt: Date.now(),
  ...overrides,
});

describe('takePendingAction', () => {
  it('gives an action to the panel of its window, once', async () => {
    await pendingActionItem.setValue(action({ windowId: 7 }));
    expect(await takePendingAction(7)).toMatchObject({ id: 'a1', url: 'https://news.example/a' });
    expect(await takePendingAction(7)).toBeNull();
  });

  it("leaves another window's action for that window's panel", async () => {
    await pendingActionItem.setValue(action({ windowId: 7 }));
    expect(await takePendingAction(8)).toBeNull();
    expect(await pendingActionItem.getValue()).toMatchObject({ id: 'a1' });
  });

  it('drops actions that are too old to still be wanted', async () => {
    await pendingActionItem.setValue(action({ createdAt: Date.now() - 120_000 }));
    expect(await takePendingAction(undefined)).toBeNull();
    expect(await pendingActionItem.getValue()).toBeNull();
  });
});
