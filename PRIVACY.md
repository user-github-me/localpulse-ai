# Privacy Policy — LocalPulse AI

_Last updated: 2026-09-30_

**LocalPulse AI does not collect, sell or transmit your data to its developers. It has no servers.
Pages you ask about are processed on your computer, unless you choose a cloud AI provider and
agree to send a page to it.**

## What it accesses

- **The page you ask about.** When you use LocalPulse on a tab (for example by clicking its icon,
  a quick action or the right-click menu), it reads that page's text, title and address, and any
  text you selected. While the side panel is open, it reads the current tab to show what it will
  use. It doesn't read tabs you don't use it on.
- **Files you choose.** PDFs or text files you drop into the panel or open with its file button.
- **Other tabs you choose.** Only when you add them to a question. The optional "tabs" permission
  is used to list their titles and addresses so you can pick them.

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

Everything is stored only in your browser on this computer:

- **Settings and your choices**, such as which cloud providers you allowed on which sites.
- **API keys** you enter. They're sent only to the provider they belong to, and you can choose to
  forget them when the browser closes.
- **Chat history.** Your questions and the answers, with the title and address of the page each
  was about, but not the page text. You can turn history off and delete it in Settings.
- **Downloaded in-browser models.** The built-in model is managed by your browser.

Uninstalling LocalPulse removes all of it.

## Downloads

- **Chrome's built-in model** is downloaded by Chrome from Google when you turn it on.
- **In-browser models** are downloaded from Hugging Face (huggingface.co) when you choose one.
- **Hand-off** opens the chat site you pick.
- **Reading some pages.** For a PDF open in a tab, LocalPulse downloads that PDF again from its site
  (the browser's viewer can't be read directly). For a GitHub pull request, it downloads the pull
  request's changes from GitHub; for a YouTube video, it downloads the transcript from YouTube.
  These requests go only to the site you're reading.

These are the only network requests LocalPulse makes besides requests to AI providers you set up.

## What it does NOT do

- No data is sent to the LocalPulse developers, and there is no LocalPulse server.
- No analytics, tracking, advertising or crash reporting.
- No accounts.
- No remote code: all code ships in the extension.
- Your data is never sold, and never used for anything other than answering your questions.

## Contact

Questions or concerns: open an issue at https://github.com/user-github-me/localpulse-ai/issues. For security problems, see
[SECURITY.md](SECURITY.md).
