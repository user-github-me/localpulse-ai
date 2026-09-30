import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// WebAssembly libraries for the in-browser models, fetched by scripts/fetch-webllm-libs.mjs.
const WEBLLM_LIBS = resolve('local/webllm-libs');

// Why each permission is needed: see the Permissions table in README.md.
export default defineConfig({
  srcDir: 'src',
  // Builds and store ZIPs go to the git-ignored local/ folder.
  outDir: 'local/build',
  zip: {
    // The sources ZIP for addons.mozilla.org reviewers holds only what's needed to rebuild the
    // add-on. It's an allowlist, so private files in local/ can never end up in it.
    includeSources: [
      'src/**',
      'public/**',
      'scripts/**',
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.json',
      'wxt.config.ts',
      'README.md',
      'LICENSE',
    ],
  },
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  imports: false,
  manifest: ({ browser, mode }) => {
    const isFirefox = browser === 'firefox';
    return {
      // Localized from src/locales/<language>.yml.
      name: '__MSG_extName__',
      short_name: 'LocalPulse',
      description: '__MSG_extDescription__',
      default_locale: 'en',
      permissions: [
        'storage',
        'activeTab',
        'scripting',
        'contextMenus',
        'declarativeNetRequestWithHostAccess',
        'unlimitedStorage',
        ...(isFirefox ? [] : ['sidePanel']),
        ...(mode === 'e2e' ? ['tabs'] : []),
      ],
      // The e2e build also gets "tabs" up front, for the same reason.
      optional_permissions: mode === 'e2e' ? [] : ['tabs'],
      optional_host_permissions: ['<all_urls>'],
      // End-to-end tests can't click permission prompts, so that build gets access up front.
      ...(mode === 'e2e' && { host_permissions: ['<all_urls>'] }),
      action: { default_title: '__MSG_actionTitle__' },
      commands: {
        _execute_action: { suggested_key: { default: 'Alt+Shift+L' } },
        'summarize-page': {
          suggested_key: { default: 'Alt+Shift+S' },
          description: '__MSG_commandSummarize__',
        },
      },
      content_security_policy: {
        extension_pages:
          "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: blob:",
      },
      ...(isFirefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: '{d7d5788b-46bb-4a27-90b4-e98cffbd2a8a}',
                strict_min_version: '140.0',
                data_collection_permissions: {
                  required: ['none'],
                  optional: ['websiteContent'],
                },
              },
            },
          }
        : { minimum_chrome_version: '138' }),
    };
  },
  vite: (env) => ({
    plugins: [
      tailwindcss(),
      // Firefox: swap the in-browser model for a stub (see src/providers/webllm.stub.ts). Aliases
      // resolve first, so this matches the absolute path of src/providers/webllm.ts.
      env.browser === 'firefox' && {
        name: 'localpulse:no-webllm-in-firefox',
        enforce: 'pre' as const,
        resolveId(source: string, importer?: string) {
          const path =
            source.startsWith('.') && importer ? join(dirname(importer), source) : source;
          return /providers\/webllm(\.ts)?$/.test(path)
            ? resolve('src/providers/webllm.stub.ts')
            : undefined;
        },
      },
    ],
  }),
  hooks: {
    // Bundle the WebLLM libraries: the Chrome Web Store treats WebAssembly as code, so it can't be
    // downloaded at runtime.
    'build:publicAssets': (wxt, files) => {
      if (wxt.config.browser === 'firefox') return;
      if (!existsSync(WEBLLM_LIBS)) {
        if (wxt.config.mode !== 'e2e') {
          wxt.logger.warn(
            'local/webllm-libs is missing, so the in-browser models will not load. Run: corepack pnpm webllm-libs',
          );
        }
        return;
      }
      for (const name of readdirSync(WEBLLM_LIBS)) {
        if (name.endsWith('.wasm')) {
          files.push({ absoluteSrc: join(WEBLLM_LIBS, name), relativeDest: `webllm/${name}` });
        }
      }
    },
  },
});
