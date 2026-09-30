import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (pnpm build:e2e) into Chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'local/test-results',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
