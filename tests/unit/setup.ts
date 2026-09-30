import { resolve } from 'node:path';
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The fake browser doesn't implement i18n, so serve the English catalog the way Chrome would.
const messages = generateChromeMessages(await parseMessagesFile(resolve('src/locales/en.yml')));

fakeBrowser.i18n.getMessage = ((name: string, substitutions?: string | string[]) => {
  const message = messages[name]?.message ?? '';
  const values = typeof substitutions === 'string' ? [substitutions] : (substitutions ?? []);
  return message.replace(/\$(\$|\d)/g, (_match, token: string) =>
    token === '$' ? '$' : (values[Number(token) - 1] ?? ''),
  );
}) as typeof fakeBrowser.i18n.getMessage;
