import { storage } from '#imports';
export interface TrackingOptions {
  automatic: boolean;
  notifications: boolean;
}
export const trackingOptionsItem = storage.defineItem<TrackingOptions>('local:trackingOptions', {
  fallback: { automatic: false, notifications: false },
});
export const getTrackingOptions = () => trackingOptionsItem.getValue();
export async function setTrackingOptions(changes: Partial<TrackingOptions>): Promise<void> {
  const current = await getTrackingOptions();
  await trackingOptionsItem.setValue({ ...current, ...changes });
}
