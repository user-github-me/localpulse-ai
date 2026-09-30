import { storage } from '#imports';

/**
 * An action started outside the panel (context menu, keyboard shortcut) for the panel to run
 * once it's open. Lives in session storage, so it never touches disk.
 */
export interface PendingAction {
  id: string;
  recipeId: string;
  tabId?: number;
  /** The window it was started in; only that window's panel runs it. */
  windowId?: number;
  /** Text selected when the context menu was used. */
  selection?: string;
  /** Where the selection is: the frame's address, which decides the privacy rules. */
  url?: string;
  /** The address of the tab's page, when the selection is in a frame from another site. */
  pageUrl?: string;
  createdAt: number;
}

export const pendingActionItem = storage.defineItem<PendingAction | null>('session:pendingAction', {
  fallback: null,
});

/**
 * Takes the pending action for this window if it's recent, clearing it so it runs only once.
 * An action for another window is left for that window's panel.
 */
export async function takePendingAction(
  windowId: number | undefined,
  maxAgeMs = 60_000,
): Promise<PendingAction | null> {
  const action = await pendingActionItem.getValue();
  if (!action) return null;
  if (action.windowId !== undefined && action.windowId !== windowId) return null;
  await pendingActionItem.setValue(null);
  return Date.now() - action.createdAt <= maxAgeMs ? action : null;
}
