import { test, expect, note } from '../helpers/fixtures';
import { accounts, env } from '../helpers/env';
import { bearer, getMe, postLogin, safeJson, sameEmail, sessionArtifacts, unregisteredEmail } from '../helpers/api';
import { expectRejectedNoSession } from '../helpers/assertions';
import { G08_REASON, realAccountWrongPasswordsAllowed } from '../helpers/lockout-guard';

/**
 * R1 Authentication: P2 API cases (core login behavior).
 * Routes, payloads and the auth model come from reports/exploration.md.
 * These tests create no data, so there is nothing to clean up.
 *
 * Not automated (stay manual): TC-R1-06 and TC-R1-15 (P3, API).
 */

// A retry would resend failed logins (G-08). No retries in this file.
test.describe.configure({ retries: 0 });

test('TC-R1-01 A valid email and password log in the right user, and the session works for later requests', { tag: ['@P2'] }, async ({ api }) => {
  for (const role of ['owner', 'shared'] as const) {
    const res = await postLogin(api, accounts[role]);
    expect(res.status(), `${role}: login status`).toBe(200);
    const { token } = await sessionArtifacts(res);
    expect(typeof token === 'string' && token.length > 0, `${role}: login returns a token`).toBe(true);

    const me = await getMe(api, token!);
    expect(me.status(), `${role}: /auth/me`).toBe(200);
    expect(sameEmail((await me.json()).email, accounts[role].email), `${role}: /auth/me shows the logged-in user`).toBe(true);

    const rooms = await api.get('/data-rooms', { headers: bearer(token!), failOnStatusCode: false });
    expect(rooms.status(), `${role}: /data-rooms`).toBe(200);
  }
});

test('TC-R1-03 An unknown email is rejected with the same response as a wrong password', { tag: ['@P2'] }, async ({ api }) => {
  const unknown = await postLogin(api, { email: unregisteredEmail('enum'), password: 'qa-agent-Wrong-Pass-1' });
  await expectRejectedNoSession(unknown, 'unknown email');
  const unknownBody = await safeJson(unknown);
  const unknownMessage = JSON.stringify(unknownBody?.message ?? '');
  // The message must not say that the account does not exist.
  expect.soft(/not (found|registered|exist)|no (such )?(user|account)|unknown (user|email)/i.test(unknownMessage), 'unknown-email message does not reveal that the account is missing').toBe(false);

  if (!realAccountWrongPasswordsAllowed) {
    note('step 2-3 not run', `${G08_REASON}. Only the unknown-email side was checked.`);
    note('observed', `unknown email -> ${unknown.status()} ${unknownMessage}`);
    return;
  }

  const wrong = await postLogin(api, { email: accounts.owner.email, password: 'qa-agent-Wrong-Pass-1' });
  await expectRejectedNoSession(wrong, 'owner wrong password');
  const wrongBody = await safeJson(wrong);
  expect(wrong.status(), 'same status').toBe(unknown.status());
  expect(wrongBody?.message, 'same message').toEqual(unknownBody?.message);
  expect(Object.keys(wrongBody ?? {}).sort(), 'same body structure').toEqual(Object.keys(unknownBody ?? {}).sort());
});

test('TC-R1-04 A missing or empty email or password is rejected with a validation error', { tag: ['@P2'] }, async ({ api }) => {
  const owner = accounts.owner;
  const jsonCases: { label: string; data: unknown }[] = [
    { label: 'empty email + valid password', data: { email: '', password: owner.password } },
    { label: 'valid email + empty password', data: { email: owner.email, password: '' } },
    { label: 'both empty', data: { email: '', password: '' } },
    { label: 'no email field', data: { password: owner.password } },
    { label: 'no password field', data: { email: owner.email } },
    { label: 'only spaces', data: { email: '   ', password: '   ' } },
    { label: 'empty JSON object', data: {} },
  ];
  for (const c of jsonCases) {
    await expectRejectedNoSession(await postLogin(api, c.data), c.label);
  }

  // Step 6: an empty body, and a wrong content type (valid credentials sent as text/plain).
  const empty = await api.post('/auth/login', { failOnStatusCode: false });
  await expectRejectedNoSession(empty, 'empty body');

  const textPlain = await api.post('/auth/login', {
    headers: { 'Content-Type': 'text/plain' },
    data: JSON.stringify({ email: owner.email, password: owner.password }),
    failOnStatusCode: false,
  });
  await expectRejectedNoSession(textPlain, 'wrong content type (text/plain)');
});

test('TC-R1-05 Email addresses in a wrong format are rejected', { tag: ['@P2'] }, async ({ api }) => {
  const emails = ['plainaddress', '@example.com', 'owner@', 'a@b@c.com', 'owner@ example.com', 'owner@example..com', 'owner example@x.com'];
  for (const [i, email] of emails.entries()) {
    await expectRejectedNoSession(await postLogin(api, { email, password: 'qa-agent-Any-Pass-1' }), `bad email ${i + 1} (${email})`);
  }
});

test('TC-R1-07 The password must match exactly (upper/lower case matters, no spaces removed, no characters cut off)', { tag: ['@P2'] }, async ({ api }) => {
  // All four steps are wrong-password attempts against Owner.
  test.skip(!realAccountWrongPasswordsAllowed, G08_REASON);

  const pw = accounts.owner.password;
  const swapCase = [...pw].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
  const variants = [
    { label: 'swapped case', password: swapCase },
    { label: 'trailing space', password: `${pw} ` },
    { label: 'extra characters', password: `${pw}x1` },
    { label: 'last character removed', password: pw.slice(0, -1) },
  ];
  for (const v of variants) {
    if (v.password === pw) {
      note('variant not run', `${v.label}: same as the real password (no letters to swap)`);
      continue;
    }
    await expectRejectedNoSession(await postLogin(api, { email: accounts.owner.email, password: v.password }), v.label);
  }
});

test('TC-R1-13 Many failed logins in a row are slowed down or blocked (throttling)', { tag: ['@P2'] }, async ({ api }) => {
  // Only an unregistered address is used (human QA decision for G-08). Max 20 attempts.
  const email = unregisteredEmail('throttle');
  const attempts = 20;
  const statuses: number[] = [];
  const durations: number[] = [];
  let lockMessage = false;

  for (let i = 0; i < attempts; i++) {
    const start = Date.now();
    const res = await postLogin(api, { email, password: `qa-agent-wrong-${i}` });
    durations.push(Date.now() - start);
    statuses.push(res.status());
    if (/too many|locked|try again|rate limit/i.test(await res.text())) lockMessage = true;
    if (res.status() === 429) break;
  }

  const count = (s: number) => statuses.filter((x) => x === s).length;
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1));
  const firstAvg = avg(durations.slice(0, 5));
  const lastAvg = avg(durations.slice(-5));
  note('observed', `${statuses.length} attempts: 401=${count(401)}, 429=${count(429)}, other=${statuses.filter((s) => s !== 401 && s !== 429).join(',') || 'none'}; avg time first 5=${firstAvg}ms, last 5=${lastAvg}ms; lock message=${lockMessage}`);

  // Hard part: throttling never causes a 5xx.
  expect(statuses.filter((s) => s >= 500), 'no 5xx during repeated failures').toEqual([]);
  // [A] The server limits further attempts: 429, a lock message, or clearly slower answers.
  const throttled = count(429) > 0 || lockMessage || lastAvg > firstAvg * 3;
  expect(throttled, 'repeated failed logins are slowed down or blocked [A] (G-07)').toBe(true);
});

test('TC-R1-13 (Owner part) A temporary block on a real account ends and a valid login works again', { tag: ['@P2'] }, async () => {
  test.skip(true, 'needs human decision: G-08');
});

test('TC-R1-14 Very long email or password input is handled safely', { tag: ['@P2'] }, async ({ api }) => {
  test.setTimeout(90_000);
  const longEmail = `${'a'.repeat(10_000 - '@example.invalid'.length)}@example.invalid`;
  const cases: { label: string; data: unknown }[] = [
    { label: '10,000-char email', data: { email: longEmail, password: 'qa-agent-Any-Pass-1' } },
    // Owner's email with a 10,000-char password: rejected by the 72-char limit before any password check.
    { label: '10,000-char password', data: { email: accounts.owner.email, password: 'p'.repeat(10_000) } },
    { label: '~1 MB body', data: { email: unregisteredEmail('big'), password: 'b'.repeat(1_000_000) } },
  ];
  for (const c of cases) {
    const res = await api.post('/auth/login', { data: c.data, failOnStatusCode: false, timeout: 30_000 });
    await expectRejectedNoSession(res, c.label);
    note('observed', `${c.label} -> ${res.status()}`);
  }

  // The server still answers normally afterwards.
  expect((await api.get('/health', { failOnStatusCode: false })).status(), '/health after large inputs').toBe(200);
  const normal = await postLogin(api, { email: unregisteredEmail('after'), password: 'qa-agent-Any-Pass-1' });
  expect(normal.status(), 'a normal failed login still gets 401').toBe(401);
});

test('TC-R1-16 Credentials are sent only over HTTPS and only in the request body; the session cookie is protected', { tag: ['@P2'] }, async ({ api }) => {
  // Real credentials are never sent over plain HTTP or in a URL (that would leak them into logs).
  // Dummy credentials show whether the server accepts these channels at all.
  const dummy = { email: unregisteredEmail('https'), password: 'qa-agent-Any-Pass-1' };

  // Step 1: plain HTTP must redirect to HTTPS or be refused.
  for (const [label, base] of [['API', env.API_BASE_URL], ['front end', env.BASE_URL]] as const) {
    const httpUrl = base.replace(/^https:/, 'http:');
    try {
      const res = await api.post(`${httpUrl}/auth/login`, { data: dummy, maxRedirects: 0, failOnStatusCode: false });
      const location = res.headers()['location'] ?? '';
      note('observed', `${label} over http -> ${res.status()}${location ? ` to ${location.split('/').slice(0, 3).join('/')}` : ''}`);
      expect.soft(res.status() >= 300 && res.status() < 400 && location.startsWith('https://'), `${label}: plain HTTP redirects to HTTPS`).toBe(true);
    } catch {
      note('observed', `${label} over http: connection refused`);
    }
  }

  // Step 2: credentials in the query string are not accepted.
  const qs = new URLSearchParams(dummy).toString();
  const getWithQuery = await api.get(`/auth/login?${qs}`, { failOnStatusCode: false });
  await expectRejectedNoSession(getWithQuery, 'GET with credentials in query');
  const postWithQuery = await api.post(`/auth/login?${qs}`, { failOnStatusCode: false });
  await expectRejectedNoSession(postWithQuery, 'POST with credentials only in query');
  note('limit', 'Query-string checks use an unregistered email; real credentials are never put into a URL.');

  // Step 3: cookie settings after a real login over HTTPS.
  const login = await postLogin(api, accounts.owner);
  expect(login.status(), 'Owner login over HTTPS').toBe(200);
  const cookies = login.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
  if (cookies.length === 0) {
    note('cookie check N/A', 'Login sets no cookie. The token is returned in the body and kept in localStorage (exploration §2, EF-2).');
  }
  for (const [i, c] of cookies.entries()) {
    expect.soft(/;\s*HttpOnly/i.test(c), `cookie ${i + 1}: HttpOnly [A]`).toBe(true);
    expect.soft(/;\s*Secure/i.test(c), `cookie ${i + 1}: Secure [A]`).toBe(true);
    expect.soft(/;\s*SameSite=(Lax|Strict)/i.test(c), `cookie ${i + 1}: SameSite Lax or Strict [A]`).toBe(true);
  }
});

test('TC-R1-17 Login creates a new session ID (no session fixation)', { tag: ['@P2'] }, async () => {
  test.skip(true, 'N/A: no session before login. The app sets no cookie or token before login (reports/exploration.md §5, G-17).');
});
