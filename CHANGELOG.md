# Changelog

All notable changes to LocalPulse AI. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versions follow
[Semantic Versioning](https://semver.org/).

## 1.0.0 — 2026-09-30

First release.

At install, LocalPulse asks only for the permissions listed in the README; site access and the tabs
list are optional and requested when a feature needs them.

### Added

- **Side panel.** Chat about the current page, with quick actions: Summarize, Key points, Explain
  code, Simplify, Action items, Translate and Compare.
- **AI providers, most private first:**
  - Chrome's built-in model, plus Edge's summarizer and translator;
  - Ollama, LM Studio and llama.cpp;
  - in-browser models (WebLLM: Llama 3.2 1B and 3B, Qwen 3.5 2B);
  - OpenAI-compatible cloud APIs with your own key (Gemini, OpenRouter, Groq, Mistral, Hugging
    Face, OpenAI, custom).
- **Privacy:**
  - consent before any page goes to a cloud provider;
  - the provider is shown on every answer;
  - Local-only mode and never-send sites;
  - emails, phone numbers and card numbers hidden from cloud requests;
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
  opens; you press Send.
- **Custom quick actions**, with import and export, and a community pack.
- **Local history** with Markdown export; tables download as CSV.
- **Everywhere:** light and dark themes, translatable interface, and a Firefox version (without
  in-browser models).
