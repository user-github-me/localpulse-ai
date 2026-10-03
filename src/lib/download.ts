/** Downloads stay on this device unless the user shares the resulting file. */
export function downloadText(text: string, filename: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
