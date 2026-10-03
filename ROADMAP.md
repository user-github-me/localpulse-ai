# LocalPulse AI: current stage and direction

LocalPulse helps people understand what they read with tools they can run and own. Its priorities
are useful free workflows, local processing, understandable privacy controls and an MIT-licensed
codebase that contributors can extend without running a service.

## Where the project stands

The repository records its first release, **1.0.0 on September 30, 2026**, followed by **1.0.1**
on the same day. The subsequent commits concentrate on privacy edge cases, quote verification,
selection replacement and language behavior. This is a functioning extension with production
builds, release packaging, unit tests and browser tests. On October 2, 2026, the live
[Chrome Web Store listing](https://chromewebstore.google.com/detail/obbcngemlmnpajcpdjknfccfhhnhldme)
shows **version 1.0.1**, updated that day. This establishes store availability; it does not
establish real-world model quality across all supported hardware. Other browser packages are
buildable; their store publication has not been checked here.

The implementation already includes Chrome and Firefox packaging; a React side panel; browser
AI, Ollama/LM Studio, WebLLM and optional cloud APIs; page/PDF/YouTube/GitHub extraction; long-page
summaries and relevant-section retrieval; writing tools; checked quotes; and local conversation
history. The privacy work is substantial: source provenance follows answers across turns,
never-send rules are checked again when settings change, and cloud requests redact page details.

The current **v1.1.0 feature update (unreleased)** adds a temporary document workspace, 24 actions with a
searchable library, searchable history with favorites, renaming and portable backups, interactive
flashcards/Anki export, installed-voice read-aloud, a local follow-up board/calendar export and an
optional encrypted email read tracker with first-run setup, a direct panel entry and a public GitHub/Vercel service. See
[CHANGELOG.md](CHANGELOG.md) for the implementation and [README.md](README.md) for usage.
Source builds now identify themselves as **1.1.0**. The published store release remains 1.0.1
until a separate store update is submitted and approved.

## How the parts fit

| Layer              | Responsibility                                                   | Extension point                                       |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Extractors         | Read chosen content as Markdown                                  | `src/extractors/`                                     |
| Workspace          | Hold explicitly captured sources in panel memory                 | `src/core/workspace.ts`                               |
| Recipes            | Describe tasks without executable code                           | `src/recipes/builtin.json`, community packs           |
| Core runner        | Fit content to a model using parts, retrieval or summaries       | `src/core/run.ts`                                     |
| Router and privacy | Select providers, enforce consent and retain source provenance   | `src/core/router.ts`, `privacy.ts`, `conversation.ts` |
| Providers          | Stream answers from local or explicitly chosen remote models     | `src/providers/`                                      |
| History            | Keep conversations locally and support portable exports          | `src/storage/history*.ts`                             |
| Study and speech   | Practice structured cards and read answers with installed voices | `src/core/study.ts`, `speech.ts`                      |
| Follow-ups         | Keep reviewed tasks locally and export calendar reminders        | `src/core/followups.ts`, `src/storage/followups.ts`   |
| Optional tracker   | Manual images, encrypted timestamps and owner-signed deletion    | `src/core/email-tracking.ts`, `tools/email-tracker/`  |
| Interface          | Make the source, task and processing location visible            | `src/app/`, `src/locales/`                            |

AI inference happens in the side panel, which stays alive during long answers. The background
worker handles browser integration. All executable code ships in the extension package. The
workspace is intentionally temporary: silently retaining whole pages would change what users
expect from a private page assistant.

## v1.1.0 community feature issues

Implementation is being reviewed through [PR #11](https://github.com/user-github-me/localpulse-ai/pull/11).
These are source changes, not a published store update. Linked issues close when the PR merges:

| Issue                                                            | Feature                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| [#2](https://github.com/user-github-me/localpulse-ai/issues/2)   | Explicit local research collections, search and backups    |
| [#3](https://github.com/user-github-me/localpulse-ai/issues/3)   | Verified source excerpts and extracted PDF page references |
| [#4](https://github.com/user-github-me/localpulse-ai/issues/4)   | Local OCR with opt-in language data                        |
| [#5](https://github.com/user-github-me/localpulse-ai/issues/5)   | Private tab review, domain groups and saved sessions       |
| [#6](https://github.com/user-github-me/localpulse-ai/issues/6)   | Local audio transcription with opt-in Whisper data         |
| [#7](https://github.com/user-github-me/localpulse-ai/issues/7)   | Explicit typed-query web research                          |
| [#8](https://github.com/user-github-me/localpulse-ai/issues/8)   | Private tracking-image names                               |
| [#9](https://github.com/user-github-me/localpulse-ai/issues/9)   | Optional generic read-activity notifications               |
| [#10](https://github.com/user-github-me/localpulse-ai/issues/10) | Synthetic encrypted tracking test and cleanup              |
| [#12](https://github.com/user-github-me/localpulse-ai/issues/12) | Automatic Gmail/Outlook insertion and local message badges |
| [#13](https://github.com/user-github-me/localpulse-ai/issues/13) | Platform-aware, configured shortcut hints                  |

Real-model checks recognize a generated local image and transcribe a generated local recording.
They demonstrate that the bundled runtimes work under Chrome's extension security policy; they
are not an accuracy benchmark or proof that every webmail UI variation is supported.

## Further upgrades, in order

The items below include longer-term refinements beyond the issue-linked first implementations.

1. **Evidence you can navigate.** Preserve PDF page numbers and web headings through extraction
   and retrieval; let an answer's citation open its exact source excerpt. Validate the excerpt
   against the source. Keep claim verification distinct from text matching. Today checked quotes
   identify matching documents, but do not verify an answer's overall truth.
2. **Extend interactive study.** Flashcards with reveal, ratings, missed-card practice and Anki
   export are implemented. Next add validated interactive quizzes and opt-in spaced repetition,
   portable deck metadata and explicit local progress retention.
3. **An opt-in local research library.** Save named reading collections only when requested,
   with explicit retention, deletion, source refresh and portable export. Search content locally;
   start with the existing lexical search before adding large embedding downloads. Each source
   must keep its privacy rules when used in another collection or conversation.
4. **Local text recognition.** Read scanned PDFs and selected images using bundled OCR code and
   user-chosen language packs. Show download size and recognition progress. Preserve page
   references and allow correction before asking AI; cap memory use and support cancellation.
5. **Reliable structured extraction.** Offer field templates for schedules, expenses, comparison
   tables and meeting tasks. Validate generated fields and link them to supporting excerpts.
   Mark missing values instead of inventing them, then export CSV or JSON locally.
6. **Wider access and measured quality.** Add contributed interface translations, document
   keyboard and screen-reader behavior, and maintain a small public evaluation corpus spanning
   languages, long documents and small local models. Improve setup and performance using these
   results. Firefox's current build still omits WebLLM because of package-validation limits.

## Evidence from public requests

Checked October 3, 2026. These are actual requests from adjacent open-source projects, not a
market survey. Reaction counts are modest and change; they do not establish broad popularity.

| User request                                                                             | Posted            | Relevance                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| [Page Assist #642: better OCR](https://github.com/n4ze3m/page-assist/issues/642)         | June 24, 2025     | Bundled local OCR for scans/images, with correction and page references.                  |
| [#148: RAG folder monitoring](https://github.com/n4ze3m/page-assist/issues/148)          | July 20, 2024     | Opt-in persistent local research collections and refreshed documents.                     |
| [#611: number before citation](https://github.com/n4ze3m/page-assist/issues/611)         | May 31, 2025      | Numbered, navigable citations to checked source excerpts.                                 |
| [#307: better voices locally](https://github.com/n4ze3m/page-assist/issues/307)          | January 26, 2025  | Installed-voice read-aloud now implemented; language/voice quality depends on the device. |
| [#586: web search within side panel](https://github.com/n4ze3m/page-assist/issues/586)   | May 6, 2025       | Explicit opt-in search with cited sources and clear network behavior.                     |
| [#573: Qwen thinking-mode switch](https://github.com/n4ze3m/page-assist/issues/573)      | April 29, 2025    | Future model-specific controls, only for providers that support them.                     |
| [WebLLM #853: browser built-in AI adapter](https://github.com/mlc-ai/web-llm/issues/853) | September 3, 2026 | Existing provider abstraction already supports built-in browser AI alongside WebLLM.      |

The email tracker responds to this project's user's request. It needs a publicly reachable
server and remains an explicit optional feature. [Apple's official privacy description](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/)
states that remote content downloads in the background regardless of email engagement.
[Gmail's image guidance](https://support.google.com/mail/answer/145919?hl=en) and
[image-proxy announcement](https://gmail.googleblog.com/2013/12/images-now-showing.html) explain
its proxy behavior. Accordingly the UI reports estimated read counts and image-request timestamps, with no claims of
verified reads, delivery, unique recipients or location. A local follow-up board works without
this server. A calendar app delivers reminders after the user imports exported tasks.

## What keeps it sustainable and free

Local and in-browser model workflows need no subscription to LocalPulse. Optional providers can
charge for their APIs; the extension should state that clearly and always keep local choices
accessible. Core local features should remain usable without infrastructure, analytics, accounts, remote code
or a paid tier. Optional email read tracking needs a public receiver; publish all code and policies,
allow self-hosting, encrypt queued events for user-held keys and disclose finite free hosting quotas. Contributions can be small: a translated YAML file, a focused recipe,
a saved-page extractor fixture or a reproducible model-quality example all help.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), include the relevant privacy and accessibility
checks, and describe the real user task your change improves. New source-storage or provider
capabilities deserve particular review because users trust this extension with private content.
