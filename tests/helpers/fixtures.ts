import { test as base, expect, Page, APIRequestContext } from '@playwright/test';
import { getToken, newApiContext } from './api';

/**
 * Shared fixtures.
 * - `api`: a request context aimed at API_BASE_URL (works in both projects).
 * - `tokens`: one login per role per worker, kept in memory only. Use it when a test just needs
 *   "a valid session". Tests about the session itself (login, logout, separation) log in on their own.
 * - `seedSession`: puts a token into localStorage['dataroom_token'] the way the SPA stores it
 *   (exploration §5). It writes nothing to disk.
 */

type Tokens = { owner: () => Promise<string>; shared: () => Promise<string> };

type TestFixtures = {
  api: APIRequestContext;
  seedSession: (page: Page, token: string) => Promise<void>;
};
type WorkerFixtures = { tokens: Tokens };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  tokens: [
    async ({}, use) => {
      const api = await newApiContext();
      const cache: Partial<Record<'owner' | 'shared', Promise<string>>> = {};
      await use({
        owner: () => (cache.owner ??= getToken(api, 'owner')),
        shared: () => (cache.shared ??= getToken(api, 'shared')),
      });
      await api.dispose();
    },
    { scope: 'worker' },
  ],

  api: async ({}, use) => {
    const api = await newApiContext();
    await use(api);
    await api.dispose();
  },

  seedSession: async ({}, use) => {
    await use(async (page, token) => {
      // Open a public page on the app origin first, so localStorage belongs to the right origin.
      await page.goto('/login');
      await page.evaluate((t) => localStorage.setItem('dataroom_token', t), token);
    });
  },
});

export { expect };

/** Adds a note to the test result. Never pass secrets here. */
export function note(type: string, description: string): void {
  test.info().annotations.push({ type, description });
}
