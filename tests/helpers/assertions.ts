import { APIResponse, expect } from '@playwright/test';
import { sessionArtifacts } from './api';

/**
 * A rejected login: 4xx (never 5xx), no token in the body, no Set-Cookie.
 * `label` names the case (for example "sql-email-1"). Never put a secret into the label.
 */
export async function expectRejectedNoSession(res: APIResponse, label: string): Promise<void> {
  const status = res.status();
  expect.soft(status, `${label}: no 5xx`).toBeLessThan(500);
  expect.soft(status >= 400 && status < 500, `${label}: 4xx expected, got ${status}`).toBe(true);
  const { token, cookies } = await sessionArtifacts(res);
  expect.soft(token === undefined, `${label}: no accessToken in the response`).toBe(true);
  expect.soft(cookies.length, `${label}: no Set-Cookie in the response`).toBe(0);
}
