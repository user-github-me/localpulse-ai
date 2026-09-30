<p align="center"><img src="docs/assets/icon-128.png" width="88" alt=""></p>

# LocalPulse AI

> Private AI for the page you're reading. Summarize, explain and chat with any web page from your
> browser's side panel, using AI that runs on your own computer whenever possible.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-1c7a5a)
![Chrome, Edge, Brave, Opera, Vivaldi, Firefox](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Opera%20%7C%20Vivaldi%20%7C%20Firefox-5b6863)
![License: MIT](https://img.shields.io/badge/license-MIT-5b6863)

## What is this?

LocalPulse is an open-source browser extension that reads the tab you're on and answers questions
about it in the side panel. It has no servers, no accounts and no tracking.

It uses the most private AI it can find, in this order:

1. **Your browser's built-in model**: Gemini Nano in Chrome, where the computer supports it.
2. **An AI app on your computer**: Ollama, LM Studio or llama.cpp.
3. **A small model inside the browser**: WebLLM on your graphics card. It works in Brave, Opera,
   Edge and Chrome after a one-time download.
4. **A cloud API with your own key**: Google Gemini, OpenRouter, Groq, Mistral and others. It's
   used only if you add a key, and LocalPulse asks you before any page is sent.

Every answer says where it was written: a green light means on this device, amber means the cloud.

## Features

- **One-click actions**: Summarize, Key points, Explain code, Simplify, Action items, Translate
  and Compare. You can add your own.
- **Questions about the page.** Long pages are read in parts, and questions use the sections that
  match.
- **Right-click on selected text** to explain, summarize, simplify, rewrite or translate it.
  Proofread text in a form and put the result back in the field.
- **PDFs**: the one open in a tab, or drop a file into the panel. Also YouTube transcripts, and
  GitHub files and pull requests.
- **Several tabs at once**, for example to compare two articles.
- **Checked quotes**: quotes in an answer are looked up on the page, and invented ones are flagged.
- **Continue in ChatGPT, Claude, Gemini or Perplexity**: LocalPulse copies the question and opens
  the site, and you paste it and press Send. It never automates those sites.
- **History that stays on your computer**, with export to Markdown. Tables in answers download as
  CSV.
- Light and dark themes, keyboard friendly, and translatable.

## Privacy

| Where the answer comes from              | Where your page goes                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Built-in model (Gemini Nano)             | Nowhere. It stays on this computer.                                   |
| App on your computer (Ollama, LM Studio) | To that app on this computer.                                         |
| In-browser model (WebLLM)                | Nowhere. It stays on this computer.                                   |
| Cloud API with your key                  | Straight from your browser to the company you chose, after you agree. |
| Continue in ChatGPT / Claude / …         | Only what you paste or send there yourself.                           |

Settings add a Local-only mode and a list of sites that never go to the cloud. Emails, phone
numbers and card numbers are hidden before a cloud request. Follow-up questions only take earlier
answers along to a cloud provider when their pages may go there too. Full details are in
[PRIVACY.md](PRIVACY.md).

## Screenshots

<p>
  <img src="docs/screenshots/summary.png" width="300" alt="The side panel with a summary written on this device">
  <img src="docs/screenshots/consent.png" width="300" alt="LocalPulse asking before sending a page to a cloud provider">
  <img src="docs/screenshots/quotes.png" width="300" alt="An answer with its quotes checked against the page">
</p>

## Install

LocalPulse needs Chrome, Edge, Brave, Opera or Vivaldi 138 or newer, or Firefox 140 or newer.

### From a release (no build needed)

1. Download `localpulse-ai-<version>-chrome.zip` from the [Releases page](https://github.com/user-github-me/localpulse-ai/releases) and
   unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the
   unzipped folder (the one with `manifest.json` in it).
   - For Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and
     pick `manifest.json` in the unzipped `localpulse-ai-<version>-firefox.zip`.

### From source

1. Install [Node.js](https://nodejs.org) 24 (with nvm: `nvm install`, which reads `.nvmrc`).
   Node 22.22.2+ and 26+ also work; Node 25 isn't supported. Node 25 and newer don't include
   Corepack, so run `npm install -g corepack` first.
2. Build the extension:
   ```sh
   git clone https://github.com/user-github-me/localpulse-ai.git
   cd localpulse-ai
   corepack pnpm install      # the first run asks to download pnpm: answer Y
   corepack pnpm build        # Chrome, Edge, Brave, Opera, Vivaldi
   corepack pnpm build:firefox
   ```
3. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`) and turn on
   **Developer mode**.
4. Click **Load unpacked** and pick the **`local/build/chrome-mv3`** folder inside the project.
   Don't pick the project folder itself: it holds the source code, and the build creates the
   extension, with its `manifest.json`, in `local/build/chrome-mv3`. (Picking the project folder
   gives "Manifest file is missing or unreadable".) Pick `chrome-mv3` exactly: `chrome-mv3-dev` only
   works while `corepack pnpm dev` is running, and `chrome-mv3-e2e` is a test build with extra
   permissions.
   - For Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and
     pick `local/build/firefox-mv3/manifest.json`. Firefox removes temporary add-ons when it
     restarts; after a rebuild, click **Reload** on the add-on there.
5. After changing the code, run `corepack pnpm build` again and click the reload button on the
   extension's card. Or run `corepack pnpm dev`: it opens a separate Chrome window with the
   extension and reloads it on every change. That window starts with a new, empty profile, so
   Chrome's built-in model isn't in it; to try on-device AI, load the extension in your everyday
   Chrome.

## Usage

1. Click the LocalPulse icon in the toolbar, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>
   (<kbd>⌥</kbd><kbd>⇧</kbd><kbd>L</kbd> on a Mac). Pin it from the puzzle-piece menu to keep it in
   the toolbar.
2. The first time, the welcome page checks what your computer can run and suggests a setup.
3. Pick an action or type a question. Select text first to ask about just that part.

No AI set up yet? When you click Summarize, the panel offers a free model that runs in the browser
(a one-time download of about 0.7 GB), an app like Ollama, or your own API key. **Continue in
ChatGPT** works with no setup at all.

A quick tour to check everything works:

- Open an article and click **Summarize**.
- Type a question about it. Quotes in the answer are checked against the page.
- Select some text, right-click, and choose **LocalPulse AI → Explain**.
- Open a PDF in a tab, or drop one into the panel, and ask about it.
- Open **Settings** (the gear in the panel) to reorder providers, add an API key or turn on
  Local-only mode.

Chrome gives an extension access to a tab when you click its icon on that tab. To use LocalPulse on
every tab without clicking the icon, choose **Allow on all sites** in the panel.

## How it works

```
Side panel (React) ── reads the tab on request ──▶ extractor.js (Readability + Turndown)
      │
      ├─ router: the first ready provider, most private first; the cloud only with consent
      ├─ run: fits long pages into small models (summaries in parts, relevant sections)
      └─ providers: built-in AI · OpenAI-compatible (Ollama, LM Studio, cloud APIs) · WebLLM
Service worker: toolbar button, right-click menu, shortcuts
```

The AI runs in the side panel page, not the service worker, so long answers aren't cut off. No
content script runs on pages until you ask about them.

## Permissions

| Permission                            | Why                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel`                           | Shows LocalPulse in the browser's side panel.                                                                                                                   |
| `activeTab`                           | Reads the tab where you clicked the LocalPulse icon, only then.                                                                                                 |
| `scripting`                           | Runs the page reader in that tab when you ask a question.                                                                                                       |
| `storage`, `unlimitedStorage`         | Keeps settings, history and downloaded models on this computer.                                                                                                 |
| `contextMenus`                        | Adds LocalPulse to the right-click menu for selected text.                                                                                                      |
| `declarativeNetRequestWithHostAccess` | Lets Ollama accept requests from LocalPulse, only for servers on your computer you connected.                                                                   |
| Optional: access to sites             | Asked when you choose **Allow on all sites**, add other tabs to a question, connect an AI app on your computer such as Ollama, or read a PDF from another site. |
| Optional: `tabs`                      | Asked when you add other tabs to a question, to list their titles.                                                                                              |

Installing LocalPulse shows no permission warnings; the optional ones are asked for when a feature
needs them.

## Limitations

- Chrome's built-in model (Gemini Nano) needs Chrome 138 or newer, 22 GB of free disk space, and a
  graphics card with more than 4 GB of memory or 16 GB of RAM and 4 CPU cores. You can check its
  status at `chrome://on-device-internals`. Brave, Opera and Vivaldi don't include a built-in
  model; use the in-browser model or a local app there.
- Small models make mistakes. Check important facts; quotes are checked against the page, but
  summaries aren't.
- YouTube transcripts depend on undocumented YouTube internals and may stop working.
- The Firefox version doesn't include the in-browser model yet: its files are too large for
  addons.mozilla.org's validator.
- Scanned PDFs (images without text) can't be read.
- Free cloud plans change often. On Google's free Gemini tier, prompts may be used to improve
  Google's products.

## Contributing

Contributions are welcome, especially new provider presets, quick actions, site readers and
translations. Most of these are a JSON or YAML file. See [CONTRIBUTING.md](CONTRIBUTING.md). To
report a security problem, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
