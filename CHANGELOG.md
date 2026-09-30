# Changelog

All notable changes to LocalPulse AI. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versions follow
[Semantic Versioning](https://semver.org/).

## 1.0.1 — 2026-09-30

A fix release: privacy edge cases, a safer Replace, and better results in other languages. No
permissions changed.

### Fixed

- **Replace selection** writes only over the text the answer was written from, on the same page,
  and keeps the spaces and line breaks around it.
- **Hidden details come back in answers:** emails, phone numbers and card numbers that a cloud
  provider saw as placeholders show their real values in the answer, on this computer only. Replace
  and quote checks use them too.
- **Privacy:**
  - switching on Local-only mode or a never-send site during a request stops it;
  - local files and pages of unknown origin always ask before going to the cloud;
  - never-send rules written as ".bank.com" work, and blob: pages count as the site that made
    them;
  - earlier answers don't go to an endpoint whose server address has changed;
  - emails next to Chinese or Japanese text, in the addresses of several tabs, and phone numbers
    in full-width or Bengali digits are hidden;
  - Firefox: follow-up questions also need the website-content permission.
- **Right-click and shortcut actions** read the page even when a file is open in the panel, keep
  their selection for Try again and "Continue in", and aren't lost when two arrive together.
- **Languages:** the built-in summarizer no longer writes English summaries for other answer
  languages; translations use the browser's translator when the built-in model can't write the
  language, and say why when nothing can translate the text.
- Requests that were too large are retried with smaller parts for the summarizer and translator
  too.
- Answers keep code and tags that only look like LocalPulse's internal page wrapper.
- Wording: word counts in the consent dialog, the hand-off steps (you paste the question), and the
  Settings notes on history and site access.

## 1.0.0 — 2026-09-30

First release.

At install, LocalPulse asks only for the permissions listed in the README; site access and the tabs
list are optional and requested when a feature needs them.

### Added

- **Side panel.** Chat about the current page, with quick actions: Summarize, Key points, Explain
  code, Simplify, Action items, Translate and Compare.
- **AI providers, most private first:**
  - the browser's built-in model, summarizer and translator (Chrome, Edge);
  - Ollama, LM Studio and llama.cpp;
  - in-browser models (WebLLM: Llama 3.2 1B and 3B, Qwen 3.5 2B);
  - OpenAI-compatible cloud APIs with your own key (Gemini, OpenRouter, Groq, Mistral, Hugging
    Face, OpenAI, custom).
- **Privacy:**
  - consent before any page goes to a cloud provider;
  - the provider is shown on every answer;
  - Local-only mode and never-send sites;
  - emails, phone numbers and card numbers in the page hidden before it goes to the cloud;
  - follow-up questions take earlier answers to a cloud provider only from pages allowed for it.
- **Long pages** read in parts; questions answered from the most relevant sections.
- **More content:**
  - PDFs (open in a tab or dropped into the panel);
  - YouTube transcripts;
  - GitHub files and pull requests;
  - several tabs at once.
- **Right-click actions** on selected text, with Proofread and Rewrite that can replace the text in
  the page's field.
- **Checked quotes:** quotes in answers are looked up on the page, and missing ones are flagged.
- **Continue in** ChatGPT, Claude, Gemini or Perplexity: the question is copied and the site
  opens; you paste it and press Send.
- **Custom quick actions**, with import and export, and a community pack.
- **Local history** with Markdown export; tables download as CSV.
- **Everywhere:** light and dark themes, translatable interface, and a Firefox version (without
  in-browser models).
