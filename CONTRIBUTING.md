# Contributing to LocalPulse AI

Thanks for helping. This guide covers setting up, the easiest ways to contribute, and what a pull
request needs.

## Setup

You need Node.js 24.15 or newer on the 24 line (with nvm: `nvm install`); 22.22.2+ on the 22 line
and 26+ also work, but not 23 or 25. pnpm comes through Corepack: Node 26 and newer don't include
it, so run `npm install -g corepack` there. The first `corepack pnpm` command downloads pnpm.

```sh
corepack pnpm install
corepack pnpm dev            # opens Chrome with the extension and reloads on changes
corepack pnpm dev:firefox
```

`corepack pnpm dev` starts Chrome with a new, empty profile each time, so Chrome's built-in model
isn't there, and the in-browser models don't run under `dev` (their worker would load from the dev
server, which Chrome doesn't allow). To try on-device AI, run `corepack pnpm build` and load
`local/build/chrome-mv3` in your everyday Chrome.

| Command                                 | What it does                                                    |
| --------------------------------------- | --------------------------------------------------------------- |
| `corepack pnpm test:tracker`            | Encrypted read service tests (native Node)                      |
| `corepack pnpm test`                    | Unit tests (Vitest)                                             |
| `corepack pnpm test:e2e`                | Builds a test version and runs the browser tests (Playwright)   |
| `corepack pnpm lint` / `compile`        | ESLint / TypeScript                                             |
| `corepack pnpm build` / `build:firefox` | Production builds in `local/build/`                             |
| `corepack pnpm zip` / `zip:firefox`     | Store packages in `local/build/`                                |
| `corepack pnpm crx`                     | Sign and verify a local CRX with the existing local signing key |

Before the first `corepack pnpm test:e2e`, run `corepack pnpm exec playwright install chromium`.
The command builds both production and test manifests. A production startup test verifies
onboarding/toolbar initialization with no optional permissions; other flows use the test manifest
to bypass interactive browser permission prompts.
A slow test downloads a real 0.7 GB in-browser model and answers with it:

```sh
corepack pnpm webllm-libs && corepack pnpm build:e2e
LOCALPULSE_REAL_WEBLLM=1 corepack pnpm exec playwright test webllm-real
```

The Chrome build bundles the in-browser models' WebAssembly files, which the build downloads and
checks against `scripts/webllm-libs.sha256`. After updating `@mlc-ai/web-llm` or the model list,
run `corepack pnpm webllm-libs --update-hashes` and include the new hashes in your pull request.

Store-preparation source and verification limits are public in [docs/store/v1.1.0.md](docs/store/v1.1.0.md).
Run `node scripts/capture-store.mjs`, the screenshot-producing browser tests, and
`node scripts/prepare-store.mjs` for synthetic-data UI screenshots. The signed CRX uses local keys
which must never be committed; standard browser-store uploads use the production ZIP unless the
item has opted into Verified CRX Uploads.

## Good first contributions

### Add a provider (JSON only)

Any service with an OpenAI-compatible Chat Completions API can be added to
`src/providers/presets.json`:

```json
{
  "id": "example",
  "label": "Example AI",
  "kind": "cloud",
  "baseUrl": "https://api.example.com/v1",
  "needsKey": true,
  "contextTokens": 16000,
  "keyUrl": "https://example.com/keys",
  "termsUrl": "https://example.com/terms",
  "dataNote": "What the service does with prompts on its free plan."
}
```

`dataNote` is shown to users before they send anything. Optional fields: `modelHints` (patterns
that pick a default model from the service's list), `setupNote` and `docsUrl`. In the pull
request, say whether the service stores or trains on prompts, and link to where it says so.

### Add a quick action (JSON only)

Add a file to `community-recipes/`; the format is in
[community-recipes/README.md](community-recipes/README.md).

### Add a chat app for "Continue in…" (JSON only)

Add it to `src/providers/handoff-targets.json` with its new-chat address. LocalPulse copies the
prompt and opens that page, and the user pastes it and presses Send. Don't use links that fill in
a prompt: some sites send those right away. LocalPulse must never automate or script these sites,
because their terms forbid it.

### Translate LocalPulse

1. Copy `src/locales/en.yml` to `src/locales/<language code>.yml`, for example `bn.yml` or `es.yml`.
2. Translate the values. Keep `{placeholders}`, `$1` and plural forms (`1:` and `n:`) as they are.
3. Run `corepack pnpm build` to check the file.

The browser picks the language automatically.

### Read a site better

Site readers are in `src/extractors/`: `github.ts` and `youtube.ts` are examples. A reader gets the
page's `document` and returns Markdown. Add a saved copy of a page to `tests/fixtures/pages/` and a
test to `tests/unit/extractor.test.ts`.

## Rules for every change

- **Privacy is the product.** Nothing may send data anywhere without the user choosing a provider
  and agreeing. No analytics, no crash reporting, no remote configuration.
- **Email read service:** only public keys and cryptographic event fields may enter the API.
  Never add email subjects, bodies, recipient addresses or destination links. Encrypt timestamps
  before storage, save locally before signed deletion, and maintain the public deployment disclosure.
  See [the service policy](tools/email-tracker/README.md).
- **No remote code.** All JavaScript and WebAssembly ships in the package. Stores reject
  extensions that load code at runtime.
- **Keep permissions minimal.** New permissions need a reason in the pull request, and should be
  optional where possible.
- **Put UI text in `src/locales/en.yml`**, not in components.
- **Tests:** unit tests for logic, a browser test for new user flows.
- **Accessibility:** keyboard access and labels. `tests/e2e/a11y.spec.ts` checks every screen with
  axe.

## Pull requests

Always work on a feature branch and open a pull request. Do not push directly to `main`. Merge
only after the maintainer explicitly asks. The current feature release is v1.1.0.

- Run `corepack pnpm format`, then `corepack pnpm compile && corepack pnpm lint && corepack pnpm test`,
  before pushing. CI also checks the formatting, runs both builds, lints the Firefox build with
  `web-ext lint` and runs the browser tests (`corepack pnpm test:e2e`).
- Describe what changed and how you tested it, with a screenshot for UI changes.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example
  `feat: add Mistral preset`.

By contributing, you agree that your work is released under the [MIT license](LICENSE) and that you
follow the [code of conduct](CODE_OF_CONDUCT.md).

## Feature issues and completion

Use the public feature issues linked in [ROADMAP.md](ROADMAP.md) to discuss implementation and
coordinate contributions. PR descriptions use `Closes #number` for implemented acceptance criteria.
GitHub closes the issue automatically when the PR merges into the default branch. Before merge,
the issue stays open with an implementation/test status; do not close it just because code was
pushed. Store publication is a separate milestone.

Local media executables are copied from pnpm-pinned packages by `scripts/media-assets.mjs`.
Model data is fetched only after user consent, from pinned revisions in `src/core/media.ts`.
Native dependency build scripts are deliberately disabled in `pnpm-workspace.yaml`; include
that file in source-review packages. Real OCR/Whisper smoke tests are optional:

```sh
mkdir -p local/fixtures
say -o local/fixtures/voice-test.wav --data-format=LEI16@16000 'Private research stays on this device.'
corepack pnpm build:e2e
LOCALPULSE_REAL_MEDIA=1 corepack pnpm exec playwright test media-real
```

The example creates audio with macOS's installed `say` tool. On other systems use your own
short local WAV containing “private research stays on this device” at the same fixture path.
No personal recordings belong in tests or source control.
