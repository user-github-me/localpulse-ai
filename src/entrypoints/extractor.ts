import { defineUnlistedScript } from '#imports';
import { extractPage } from '@/extractors/page';

// Injected with chrome.scripting.executeScript({ files: ['/extractor.js'] }) only when the user
// asks about a page. `globalName` makes the script evaluate to main()'s result (a Promise that
// Chrome awaits), which becomes the injection result.
export default defineUnlistedScript({
  globalName: true,
  main: () => extractPage(document),
});
