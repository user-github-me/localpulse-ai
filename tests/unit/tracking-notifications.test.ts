import { beforeEach, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  url: vi.fn(),
  list: vi.fn(),
  collect: vi.fn(),
}));
vi.mock('@/storage/tracking-options', () => ({
  getTrackingOptions: mocks.options,
}));
vi.mock('@/storage/email-tracker', () => ({
  getTrackerUrl: mocks.url,
  listReadTrackers: mocks.list,
  collectReadActivity: mocks.collect,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.options.mockResolvedValue({ automatic: true, notifications: true });
  mocks.url.mockResolvedValue('https://tracker.test');
  mocks.list.mockResolvedValue([{ id: 'image-a', reads: [] }]);
  mocks.collect.mockResolvedValue([{ id: 'image-a', reads: [{ at: 1000 }] }]);
  vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
  vi.spyOn(fakeBrowser.notifications, 'create').mockResolvedValue('notice' as never);
});

it('coalesces concurrent collection and only notifies with generic counts', async () => {
  const { collectAndNotify } = await import('@/core/tracking-integration');
  await Promise.all([collectAndNotify(), collectAndNotify(), collectAndNotify()]);
  expect(mocks.collect).toHaveBeenCalledTimes(1);
  expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
  const notice = vi.mocked(fakeBrowser.notifications.create).mock.calls[0]![0];
  expect(notice).toMatchObject({
    title: 'LocalPulse · email read activity',
    message: '1 new image requests were saved locally. These are estimated reads.',
  });
  expect(JSON.stringify(notice)).not.toContain('image-a');
  await collectAndNotify();
  expect(mocks.collect).toHaveBeenCalledTimes(1);
});

it('collects silently unless notification permission and opt-in are both present', async () => {
  mocks.options.mockResolvedValue({ automatic: true, notifications: false });
  let integration = await import('@/core/tracking-integration');
  await integration.collectAndNotify();
  expect(mocks.collect).toHaveBeenCalledTimes(1);
  expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
  mocks.options.mockResolvedValue({ automatic: true, notifications: true });
  vi.mocked(fakeBrowser.permissions.contains).mockResolvedValue(false as never);
  vi.resetModules();
  integration = await import('@/core/tracking-integration');
  await integration.collectAndNotify();
  expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
});

it('makes no collection when tracking and notifications are disabled', async () => {
  mocks.options.mockResolvedValue({ automatic: false, notifications: false });
  const { collectAndNotify } = await import('@/core/tracking-integration');
  await collectAndNotify();
  expect(mocks.collect).not.toHaveBeenCalled();
  expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
});

it('does not announce existing counts as new reads', async () => {
  mocks.list.mockResolvedValue([{ id: 'image-a', reads: [{ at: 1000 }] }]);
  const { collectAndNotify } = await import('@/core/tracking-integration');
  await collectAndNotify();
  expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
});
