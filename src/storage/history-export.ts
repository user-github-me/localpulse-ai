import { conversationToMarkdown, type Conversation } from './history';

/** A single document avoids multiple-download permissions when exporting several chats. */
export function conversationsToMarkdown(conversations: readonly Conversation[]): string {
  return conversations.map(conversationToMarkdown).join('\n---\n\n');
}

/** Downloads happen on the user's device; the extension never uploads a backup. */
export function downloadHistoryFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
