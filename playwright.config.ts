import { defineConfig, devices } from '@playwright/test';
import { env } from './tests/helpers/env';

/**
 * Two projects, per the testing pyramid in CLAUDE.md:
 * - api: tests/api, no browser, requests go to API_BASE_URL
 * - e2e: tests/e2e, Chromium, pages under BASE_URL
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: env.API_BASE_URL },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'], baseURL: env.BASE_URL },
    },
  ],
});
