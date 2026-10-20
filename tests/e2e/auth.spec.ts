import { test, expect, note } from '../helpers/fixtures';
import { accounts } from '../helpers/env';
import { bearer, getMe, getToken, safeJson, unregisteredEmail } from '../helpers/api';
import { G08_REASON, realAccountWrongPasswordsAllowed } from '../helpers/lockout-guard';
import { LoginPage } from '../../pages/LoginPage';
import { AppHeader } from '../../pages/AppHeader';

/**
 * R1 Authentication: browser-only cases (Chromium).
 * Routes and selectors come from reports/exploration.md §3 and §6.
 * Logged-in flows get a token through the API inside the test process and put it into
 * localStorage['dataroom_token'] (fixture `seedSession`). Nothing is written to disk.
 * These tests create no data.
 *
 * Not automated (stay manual): TC-R1-23, TC-R1-25 (P3, E2E) and TC-R1-26 (Manual).
 */

test.describe.configure({ retries: 0 });

const LOGIN_URL = /\/login$/;

test('TC-R1-18 Login through the UI with valid credentials opens the logged-in area', { tag: ['@P2'] }, async ({ page, api }) => {
  const login = new LoginPage(page);
  const header = new AppHeader(page);

  await login.goto();
  await login.login(accounts.owner.email, accounts.owner.password);

  await expect(page).not.toHaveURL(LOGIN_URL);
  await expect(header.signOut).toBeVisible();
  await expect(header.myDataRooms).toBeVisible();
  await expect(header.sharedWithMe).toBeVisible();

  // The header shows the user's name (or email if no name), per exploration §6.
  const me = await (await getMe(api, await getToken(api, 'owner'))).json();
  await expect(page.getByText(me.name || me.email, { exact: true }).first()).toBeVisible();
});

test('TC-R1-19 Wrong credentials in the UI show an error, and the user stays on the login form', { tag: ['@P2'] }, async ({ page }) => {
  const login = new LoginPage(page);
  const header = new AppHeader(page);
  const typedPassword = `qa-agent-${Date.now()}-Typed!`;

  // Step 2: an unregistered email.
  await login.goto();
  await login.login(unregisteredEmail('ui'), typedPassword);
  await expect(login.invalidCredentialsToast).toBeVisible();
  await expect(page).toHaveURL(LOGIN_URL);
  await expect(header.signOut).toBeHidden();

  // The typed password is not shown in the page text or the URL.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.includes(typedPassword), 'password not shown in the page').toBe(false);
  expect(page.url().includes(typedPassword), 'password not in the URL').toBe(false);

  // The user still cannot open a logged-in page.
  await page.goto('/');
  await expect(page).toHaveURL(LOGIN_URL);

  // Step 1: Owner's email with a wrong password. A real wrong-password attempt (G-08).
  if (realAccountWrongPasswordsAllowed) {
    await login.goto();
    await login.login(accounts.owner.email, typedPassword);
    await expect(login.invalidCredentialsToast).toBeVisible();
    await expect(page).toHaveURL(LOGIN_URL);
  } else {
    note('step 1 not run', `${G08_REASON}. Same-message check [A] covered at API level by TC-R1-03 only for the unknown-email side.`);
  }
});

test('TC-R1-20 An anonymous user who opens a protected page directly is sent to login', { tag: ['@P2'] }, async ({ page }) => {
  // Records if logged-in UI ever appears, even for a moment before the redirect.
  await page.addInitScript(() => {
    const w = window as any;
    w.__qaSawProtected = false;
    new MutationObserver(() => {
      const t = document.body?.innerText ?? '';
      if (/Sign out|My data rooms|Shared with me/.test(t)) w.__qaSawProtected = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const okProtectedApi: string[] = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (/^\/(auth\/me|data-rooms|folders|files|shares)/.test(u.pathname) && r.ok()) okProtectedApi.push(u.pathname);
  });

  const fakeId = '00000000-0000-4000-8000-000000000000';
  const routes = ['/', '/shared-with-me', `/room/${fakeId}`, `/folder/${fakeId}`, `/file/${fakeId}`, `/shared-with-me/room/${fakeId}`];
  const login = new LoginPage(page);

  for (const route of routes) {
    await page.goto(route);
    await expect(page, `${route} redirects to login`).toHaveURL(LOGIN_URL);
    await expect(login.submit).toBeVisible();
    expect(await page.evaluate(() => (window as any).__qaSawProtected), `${route}: no logged-in UI shown before the redirect`).toBe(false);
  }
  expect(okProtectedApi, 'no protected API call succeeded').toEqual([]);
});

test('TC-R1-21 After logout in the UI, the browser cannot show protected content', { tag: ['@P2'] }, async ({ page, api, tokens, seedSession }) => {
  const token = await tokens.owner();
  const rooms = await safeJson(await api.get('/data-rooms', { headers: bearer(token) }));
  const roomName: string | undefined = rooms?.items?.[0]?.name;

  const header = new AppHeader(page);
  await seedSession(page, token);
  await page.goto('/');
  await expect(header.signOut).toBeVisible();
  if (roomName) await expect(page.getByText(roomName, { exact: true }).first()).toBeVisible();

  // Step 1: log out in the UI.
  await header.signOut.click();
  await expect(page).toHaveURL(LOGIN_URL);
  expect(await page.evaluate(() => localStorage.getItem('dataroom_token')), 'token removed from the browser').toBeNull();

  // Step 2: Back does not show current protected data.
  await page.goBack();
  await expect(header.signOut).toBeHidden();
  if (roomName) await expect(page.getByText(roomName, { exact: true })).toHaveCount(0);

  // Step 3: reload, then open the protected URL directly.
  await page.reload();
  await expect(header.signOut).toBeHidden();
  await page.goto('/');
  await expect(page).toHaveURL(LOGIN_URL);
  note('related', 'Server-side token revocation is checked by TC-R1-10 (EF-1); this test covers only what the browser shows.');
});

test('TC-R1-22 The session still works after a page reload and in a new tab of the same browser', { tag: ['@P2'] }, async ({ page, context, tokens, seedSession }) => {
  const header = new AppHeader(page);
  await seedSession(page, await tokens.owner());
  await page.goto('/');
  await expect(header.signOut).toBeVisible();

  // Step 1: reload.
  await page.reload();
  await expect(page).not.toHaveURL(LOGIN_URL);
  await expect(header.signOut).toBeVisible();

  // Step 2: a new tab in the same browser context.
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab).not.toHaveURL(LOGIN_URL);
  await expect(new AppHeader(tab).signOut).toBeVisible();
  await tab.close();
});

test('TC-R1-24 Script code in the email field does not run in the browser', { tag: ['@P1'] }, async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });

  const login = new LoginPage(page);
  const payloads = [
    `"><img src=x onerror="window.__qaXss=1;alert(1)">`,
    `<script>window.__qaXss=1;alert(1)</script>@x.com`,
    `"><svg onload="window.__qaXss=1">@x.com`,
  ];

  for (const [i, email] of payloads.entries()) {
    await login.goto();
    await login.login(email, 'qa-agent-Any-Pass-1');
    // Wait for the app's answer: the inline format error or the server error toast.
    await expect(login.invalidEmailMessage.or(login.invalidCredentialsToast).first(), `payload ${i + 1}: an error is shown`).toBeVisible();
    expect(await page.evaluate(() => (window as any).__qaXss ?? null), `payload ${i + 1}: injected script did not run`).toBeNull();
    // If the input is shown back, it must be plain text: no element was created from it.
    const injected = await page.evaluate(() => document.querySelectorAll('img[src="x"], svg[onload]').length);
    expect(injected, `payload ${i + 1}: no element created from the input`).toBe(0);
  }
  expect(dialogs, 'no dialog appeared').toEqual([]);
});
