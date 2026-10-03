# Privacy Policy — LocalPulse AI

_Last updated: 2026-10-03 (unreleased source update)_

**Pages you ask about stay on your computer unless you choose a cloud AI provider and agree to
send them. Optional email read activity is a separate service you explicitly connect: a public
MIT-licensed deployment on Vercel, or your own instance. It receives public keys and tracking-image
requests, queues encrypted timestamps, and deletes collected events after your extension signs
an acknowledgement. It never accepts email subjects, bodies, content or recipient addresses.
Hosting providers handle network metadata under their policies, as explained below.**

## What it accesses

- **The page you ask about.** When you use LocalPulse on a tab (for example by clicking its icon,
  a quick action or the right-click menu), it reads that page's text, title and address, and any
  text you selected. While the side panel is open, it reads the current tab to show what it will
  use. It doesn't read tabs you don't use it on.
- **Files you choose.** PDFs, text files, images or audio recordings you drop into the panel or open with its file button.
- **Tab organizer.** On explicit access, lists public web-tab titles and addresses in the current window, previews exact duplicates, groups by domain in Chrome and saves selected sessions locally. No content or tab metadata is sent to a service. Restoring explicitly opens saved websites with ordinary browser requests. Saved URLs may contain private query details.
- **Other tabs you choose.** Only when you add them to a question. The optional "tabs" permission
  is used to list their titles and addresses so you can pick them.
- **Document workspace.** Files you add and snapshots of pages you explicitly capture remain in
  the side panel's memory. Only the sources you include are used for a question. Closing the panel
  or clearing the workspace removes their content; history does not keep it.

## Where it goes

It depends on the AI provider, which is always shown next to the answer:

| Provider                                                                                     | Where your page goes                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The browser's built-in model (e.g. Gemini Nano in Chrome)                                    | It stays on your computer.                                                                                                                  |
| An AI app on your computer (Ollama, LM Studio, llama.cpp)                                    | To that app on your computer.                                                                                                               |
| The in-browser model (WebLLM)                                                                | It stays on your computer.                                                                                                                  |
| A cloud API you configured with your own key (e.g. Google Gemini, OpenRouter, Groq, Mistral) | Directly from your browser to that company, after you agree. That company's terms and privacy policy apply.                                 |
| "Continue in" ChatGPT, Claude, Gemini or Perplexity                                          | LocalPulse opens the site and may copy your question and the page text to your clipboard. Nothing is sent until you send it there yourself. |

You can turn on **Local-only mode**, which never sends your pages or questions to cloud providers.
You can also list sites that never go to the cloud. Emails, phone numbers and card numbers in the
page (its text, title and address) and in earlier answers are replaced with placeholders before a
cloud request, unless you turn that off. What you type in a question is sent as you wrote it.

A follow-up question includes the earlier questions and answers of the conversation. When it goes
to a cloud provider, it only includes earlier answers about pages you allowed for that provider;
answers about never-send sites are always left out, and the answer says when something was left
out.

## What is stored

The extension stores these items only in your browser on this computer:

- **Settings and your choices**, such as which cloud providers you allowed on which sites.
- **API keys** you enter. They're sent only to the provider they belong to, and you can choose to
  forget them when the browser closes.
- **Chat history.** Your questions and the answers, with the title and address of the page each
  was about, but not the page text. Favorites and names you choose also stay here. History searches
  run locally. You can turn history off and delete it in Settings or History.
- **Research library.** Complete text, titles and addresses of sources you explicitly save as named collections. Searches run locally. Delete collections separately from chat history. Library JSON backups contain full source content; keep them private. Reopening and importing collections requires fresh cloud consent and preserves original site restrictions. No pages are automatically saved.
- **Saved tab sessions.** User-chosen names, titles and full web addresses; delete them from Tab organizer separately from chat history.
- **Downloaded in-browser models.** The built-in model is managed by your browser.
- **Follow-ups.** Titles you review, optional web-page addresses, due dates and completion status.
  This independent local list stays available when chat history is disabled. No email bodies or
  recipient addresses are scraped. Delete tasks or clear the board from Follow-ups.
- **Email read activity.** The chosen server URL, private encryption and signing keys, private names, random local draft UUIDs, random
  tracking-image capabilities, request timestamps and pending acknowledgements. These persist
  locally across browser restarts without expiry. They contain no email subjects, bodies,
  recipient addresses or destination links. Disconnecting forgets the chosen URL but preserves
  keys and results; reconnect to that URL to access them.

Uninstalling LocalPulse removes the extension's browser data. Files you exported and records on
your optional tracking server remain until you delete them separately.

**History backups** are files you explicitly download to your computer. JSON backups contain
conversation text, titles, addresses and favorite markers, but no API keys, settings, cloud
permissions, extracted page/file text or editable page targets. Import validates the file and
adds separate conversations without replacing existing ones. Imported answer labels do not grant
cloud access: their provenance is treated as unknown, so cloud follow-ups omit them. Your local
AI can still use them. Downloaded backups remain on your computer after uninstalling the extension.

Flashcard answers use the same history policy. Card order, ratings and practice progress remain
in panel memory. Anki files and calendar files are explicit local downloads. Importing a calendar
file into a cloud-synced calendar can send task titles, links and dates to that calendar provider;
its policy applies. LocalPulse does not send calendar data itself. Local read-aloud permits only
voices the browser reports as installed locally, with no remote voice fallback.

## Optional email read activity

The first-run welcome flow offers tracking with an explicit enable button and Skip for now.
No tracking requests happen merely by installing or viewing setup. Opening an already-connected dashboard only reads local data; opted-in scheduling can collect activity while the browser runs. Enabling automatic tracking prepares a first random image; further images are created for supported compose drafts.
Tracking is off until you explicitly connect a server. The optional service is open source under
MIT and can run on Vercel or your own host. Read its [public source and deployment policy](tools/email-tracker/README.md).
The server's `/` and `/transparency` disclose the implementation, GitHub deployment commit, queue
schema, deletion, limits and hosting providers. Connecting grants access only to its address.
Optional Gmail and Outlook access permits a bundled, site-specific script to find compose editor structures and tracking-image URLs. It inserts a different random image per draft, offers a per-draft toggle and shows locally decrypted counts/times next to tracked message images. It does not read subjects, recipients, message text or message IDs for tracking, and never sends email. Content scripts receive public image capabilities and display counts only; private keys stay in trusted extension contexts. Chrome restricts extension-local storage to trusted contexts.

Creating a tracking image sends only public P-256 encryption and signature-verification keys.
The extension never accesses inboxes, email subjects, bodies, contacts or recipients for this
feature and never sends email. Automatic insertion applies only to supported email sites you explicitly allow; manual images remain available for other apps.

Normal page reading can still read a webmail page or selected message when you ask the AI about it;
the page-provider consent and privacy rules above apply to that separate action.

Each image request temporarily exposes its arrival time to the server. The application encrypts
that timestamp with an ephemeral ECDH key, HKDF-SHA-256 and AES-256-GCM for your private key before
writing anything to the queue. The queue contains only random mailbox/event IDs, an ephemeral
public key, a nonce and encrypted timestamp. There is no stored plaintext count or timestamp, email
content, IP address, User-Agent, referrer or cookie. The application sets no cookies and writes no
access logs, analytics or crash reports. **Vercel and Upstash still handle network metadata and may
retain platform logs under their own [Vercel](https://vercel.com/legal/privacy-policy) and
[Upstash](https://upstash.com/trust/privacy.pdf) policies.** Encryption does not conceal request
arrival times, sizes or traffic patterns from infrastructure operators.

Code and policies are public. Anyone with a tracking capability can fetch that mailbox's
ciphertext; there is no browsable directory of users or events. Only the user's extension private
key can decrypt queued payloads. Deletion requires a signature from the user's private signing
key, which is also never sent. Sharing an image URL lets others generate activity and inspect its
ciphertext, so it cannot prove authenticity of a human read.

**Check reads**, an explicit message-badge refresh and optional 15-minute browser scheduling fetch at most 100 events per image per collection. The
extension decrypts and saves them locally before signing acknowledgement of those exact event IDs.
The server then deletes those values, removing empty queues. Failed acknowledgements retry on
collection without counting the same event twice; newly arriving events are retained. Deletion
applies to the active queue, not a promise to erase provider logs or historical infrastructure
snapshots. Notifications are off by default and require separate optional permission. They display generic local counts. Automatic insertion and notifications can be disabled in Email tracking; reload existing mail tabs afterward. Direct owner-side image loads are blocked when browser rules can recognize them, but server-side proxies/preloads can still count.

There is **no time-based expiry** for image capabilities, queued events or local results.
Up to 1,000 events can wait per image; a full queue or provider quota can miss requests. Local
results hold up to 20,000 timestamps per image and 100 images per server.

Private keys, capabilities and results live only in browser-local extension storage and explicit
password-encrypted backups. Export a backup before clearing browser data or uninstalling; losing
the keys loses access. Backups use AES-256-GCM and PBKDF2-SHA-256 with 310,000 iterations and a fresh
salt. Their password must have at least 12 characters; use a strong one and keep it separately.
Restoring requires a profile without existing tracking images to avoid overwriting another key set.
Browser-local storage is not password-encrypted; someone with access to your browser profile may
access it. History backups do not contain tracking keys or results.

Apple Mail can preload images, Gmail proxies and caches them, and scanners can request them.
Requests therefore cannot prove delivery, human reading, unique recipients or location. The panel
never loads images for previews. Previewing a snippet elsewhere can create an event. Disclose
tracking to recipients. Removing an image deletes queued events and local results, but already-sent
images remain valid and can generate more events; export a backup if you may need to collect them
later. Disconnecting or uninstalling does not delete queued data. AI Local-only mode governs AI
providers; this independently configured feature can still contact its server.

## Downloads

- **Chrome's built-in model** is downloaded by Chrome from Google when you turn it on.
- **In-browser models** are downloaded from Hugging Face (huggingface.co) when you choose one.
- **Hand-off** opens the chat site you pick.
- **Reading some pages.** For a PDF open in a tab, LocalPulse downloads that PDF again from its site
  (the browser's viewer can't be read directly). For a GitHub pull request, it downloads the pull
  request's changes from GitHub; for a YouTube video, it downloads the transcript from YouTube.
  These requests go only to the site you're reading.

- **OCR language data** downloads from a pinned tessdata_fast commit on raw.githubusercontent.com only after you enable recognition. Tesseract code and WebAssembly ship in the package. Images/scanned PDF pages and recognized text are processed locally.
- **Audio model data** downloads from a pinned Whisper tiny English repository on Hugging Face and its CDN only after you enable transcription. Runtime code/WebAssembly ship in the package. Audio and transcripts are processed locally; no microphone is accessed.
- **Explicit web research** sends only a typed query to Wikipedia or your chosen SearXNG endpoint, or opens a typed-query DuckDuckGo link. Public source text is fetched only after selection, without cookies. Services see the query, network address and timing. No private source context is attached automatically; AI Local-only mode does not disable explicit web search.
- **Restoring a saved tab session** opens its chosen websites with ordinary browser requests after confirmation.

These disclosed downloads and explicit optional features are the network requests LocalPulse makes besides requests to AI providers you set up.

## What it does NOT do

- No page or conversation content is sent to LocalPulse developers. The separately connected
  email read service handles only public keys and encrypted activity as disclosed above.
- No analytics, advertising, crash reporting or automatic user tracking. Optional email tracking
  works only through a server the user explicitly connects.
- No accounts.
- No remote code: all code ships in the extension.
- Your data is never sold. It is used for the actions you explicitly request.

## Contact

Questions or concerns: open an issue at https://github.com/user-github-me/localpulse-ai/issues. For security problems, see
[SECURITY.md](SECURITY.md).
