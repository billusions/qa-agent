import { test, expect, note } from '../helpers/fixtures';
import { accounts } from '../helpers/env';
import {
  PROTECTED_GETS,
  bearer,
  getMe,
  getToken,
  postLogin,
  safeJson,
  sameEmail,
  sessionArtifacts,
  unregisteredEmail,
} from '../helpers/api';
import { expectRejectedNoSession } from '../helpers/assertions';
import { algNone, decodePayload, flipSignatureChar, stripSignature, tamperPayload } from '../helpers/jwt';
import { containsAccountPassword, containsHashPattern, looksLikeInternalError, passwordLikeKeys } from '../helpers/secrets';
import { G08_REASON, realAccountWrongPasswordsAllowed } from '../helpers/lockout-guard';

/**
 * R1 Authentication: P1 API cases (access control and security).
 * Routes, payloads and the auth model come from reports/exploration.md.
 * These tests create no data, so there is nothing to clean up.
 */

// A retry would resend wrong passwords to the shared accounts (G-08). No retries in this file.
test.describe.configure({ retries: 0 });

test('TC-R1-02 A wrong password is rejected, also when it is another user\'s valid password, and no session is created', { tag: ['@P1'] }, async ({ api }) => {
  if (accounts.owner.password === accounts.shared.password) {
    throw new Error('Setup: Owner and Shared use the same password, so step 2 and 3 are not wrong passwords');
  }
  note('lockout budget', 'Step 1 (any wrong password) is covered by step 2, so each account gets exactly 1 wrong password per run (G-08).');

  // Step 2: Owner email + Shared's valid password. Step 3: Shared email + Owner's valid password.
  const attempts = [
    { label: 'owner-email+shared-password', data: { email: accounts.owner.email, password: accounts.shared.password } },
    { label: 'shared-email+owner-password', data: { email: accounts.shared.email, password: accounts.owner.password } },
  ];

  for (const a of attempts) {
    const res = await postLogin(api, a.data);
    await expectRejectedNoSession(res, a.label);

    // Step 4: whatever came back must not open a protected endpoint.
    const { token } = await sessionArtifacts(res);
    if (token) {
      const me = await getMe(api, token);
      expect(me.status(), `${a.label}: returned token must not give access`).toBeGreaterThanOrEqual(401);
    }
  }

  // Step 5: the real logins still work.
  for (const role of ['owner', 'shared'] as const) {
    const token = await getToken(api, role);
    const me = await getMe(api, token);
    expect(me.status(), `${role}: /auth/me after failed attempts`).toBe(200);
    expect(sameEmail((await me.json()).email, accounts[role].email), `${role}: /auth/me shows the right user`).toBe(true);
  }
});

test('TC-R1-08 Protected endpoints reject requests without a valid session (no token, random token, changed token, expired token)', { tag: ['@P1'] }, async ({ api, tokens }) => {
  const ownerToken = await tokens.owner();
  const sharedToken = await tokens.shared();
  const owner = await (await getMe(api, ownerToken)).json();
  const shared = await (await getMe(api, sharedToken)).json();

  // Sanity: a valid token works, so a 401 below is about the token, not a broken endpoint.
  expect((await getMe(api, ownerToken)).status(), 'valid Owner token works').toBe(200);

  // Add one id-based endpoint from Owner's own data, if Owner has a room.
  const endpoints: string[] = [...PROTECTED_GETS];
  const rooms = await safeJson(await api.get('/data-rooms', { headers: bearer(ownerToken) }));
  if (rooms?.items?.[0]?.id) endpoints.push(`/data-rooms/${rooms.items[0].id}`);

  const variants: { label: string; headers: Record<string, string> }[] = [
    { label: 'no token', headers: {} },
    { label: 'random token', headers: bearer('qa-agent-random-token-value') },
    { label: 'empty bearer', headers: { Authorization: 'Bearer ' } },
    { label: 'token without Bearer prefix', headers: { Authorization: ownerToken } },
    { label: 'one signature char changed', headers: bearer(flipSignatureChar(ownerToken)) },
    { label: 'payload sub changed to Shared', headers: bearer(tamperPayload(ownerToken, { sub: shared.id })) },
    { label: 'payload exp moved forward', headers: bearer(tamperPayload(ownerToken, { exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 })) },
    { label: 'signature removed', headers: bearer(stripSignature(ownerToken)) },
    { label: 'alg none', headers: bearer(algNone(ownerToken)) },
    { label: 'alg none as Shared', headers: bearer(algNone(ownerToken, { sub: shared.id, email: shared.email })) },
  ];

  for (const endpoint of endpoints) {
    for (const v of variants) {
      const res = await api.get(endpoint, { headers: v.headers, failOnStatusCode: false });
      const label = `${endpoint} with ${v.label}`;
      expect.soft([401, 403].includes(res.status()), `${label}: rejected (got ${res.status()})`).toBe(true);
      const text = await res.text();
      const leaks = [owner.id, shared.id, owner.email, shared.email].some((v) => text.includes(v));
      expect.soft(leaks, `${label}: body has no user data`).toBe(false);
    }
  }

  // Step 4: an expired token. The test cannot sign one, and real tokens live 7 days (exploration §2, G-09).
  note('step 4 not run', 'No expired token available: JWT lifetime is 7 days and the test has no signing key (G-09). A forged "exp in the past" token is covered by the tamper cases.');
  note('jwt', `Token claims seen: ${Object.keys(decodePayload(ownerToken)).join(', ')}`);
});

test('TC-R1-09 Each user\'s session is separate; two sessions at the same time do not mix users', { tag: ['@P1'] }, async ({ api }) => {
  // Step 1: two fresh sessions.
  const tokenA = await getToken(api, 'owner');
  const tokenB = await getToken(api, 'shared');

  // Step 2: each session belongs to its own user.
  const meA = await (await getMe(api, tokenA)).json();
  const meB = await (await getMe(api, tokenB)).json();
  expect(sameEmail(meA.email, accounts.owner.email), 'session A is Owner').toBe(true);
  expect(sameEmail(meB.email, accounts.shared.email), 'session B is Second user').toBe(true);
  expect(meA.id, 'the two sessions are different users').not.toBe(meB.id);

  // Step 3: put Second user's id into every client-controlled place with session A.
  const spoofHeaders = { 'X-User-Id': meB.id, 'X-User': meB.id, 'X-Forwarded-User': meB.email };
  const spoofQuery = { userId: meB.id, user_id: meB.id, ownerId: meB.id, sub: meB.id };

  const meSpoofed = await api.get('/auth/me', { headers: { ...bearer(tokenA), ...spoofHeaders }, params: spoofQuery, failOnStatusCode: false });
  if (meSpoofed.status() === 200) {
    expect((await meSpoofed.json()).id, '/auth/me with spoofed id still returns Owner').toBe(meA.id);
  } else {
    expect(meSpoofed.status(), '/auth/me with spoofed id is rejected with 4xx').toBeLessThan(500);
  }

  const roomsA = await safeJson(await api.get('/data-rooms', { headers: bearer(tokenA) }));
  const roomsB = await safeJson(await api.get('/data-rooms', { headers: bearer(tokenB) }));
  const idsA = new Set<string>((roomsA?.items ?? []).map((r: any) => r.id));
  const idsB: string[] = (roomsB?.items ?? []).map((r: any) => r.id);

  const roomsSpoofed = await api.get('/data-rooms', { headers: { ...bearer(tokenA), ...spoofHeaders }, params: spoofQuery, failOnStatusCode: false });
  expect(roomsSpoofed.status(), '/data-rooms with spoofed id: no 5xx').toBeLessThan(500);
  if (roomsSpoofed.status() === 200) {
    const spoofedIds: string[] = ((await roomsSpoofed.json())?.items ?? []).map((r: any) => r.id);
    const foreign = spoofedIds.filter((id) => !idsA.has(id) && idsB.includes(id));
    expect(foreign, '/data-rooms with spoofed id returns none of Second user\'s rooms').toEqual([]);
  }

  // Cross-user read: Owner opens a room of Second user that is not shared with Owner -> must not be readable.
  const received = await safeJson(await api.get('/shares/received', { headers: bearer(tokenA) }));
  const sharedWithA = new Set<string>((received?.items ?? []).flatMap((s: any) => [s.resourceId, s.dataRoomId]));
  const privateRoomOfB = idsB.find((id) => !idsA.has(id) && !sharedWithA.has(id));
  if (privateRoomOfB) {
    const cross = await api.get(`/data-rooms/${privateRoomOfB}`, { headers: bearer(tokenA), failOnStatusCode: false });
    expect([403, 404].includes(cross.status()), `Owner reading Second user's private room (got ${cross.status()})`).toBe(true);
  } else {
    note('cross-user read not run', 'Second user has no room that is private from Owner.');
  }
  note('body field spoofing not run', 'No read endpoint takes a body; write endpoints would create data rooms, which cannot be deleted via the API.');

  // Step 4: Second user's login did not change or end Owner's session.
  const meAAgain = await getMe(api, tokenA);
  expect(meAAgain.status(), 'session A still works after the Second user login').toBe(200);
  expect((await meAAgain.json()).id, 'session A is still Owner').toBe(meA.id);
});

test('TC-R1-10 Logout ends the session on the server; other users\' sessions keep working', { tag: ['@P1'] }, async ({ api }) => {
  // Fresh sessions, so a working logout cannot break other tests' sessions.
  const tokenA = await getToken(api, 'owner');
  const tokenB = await getToken(api, 'shared');

  // Step 2: log Owner out. The app has no logout endpoint (exploration §5, EF-1); "Sign out" only clears
  // the browser's localStorage. We still call the usual logout route so that a future endpoint is used.
  const logout = await api.post('/auth/logout', { headers: bearer(tokenA), failOnStatusCode: false });
  note('logout call', `POST /auth/logout returned ${logout.status()} (exploration: no logout endpoint exists, EF-1)`);

  // Step 3: the saved token A must be rejected now.
  const afterLogout = await getMe(api, tokenA);
  expect.soft([401, 403].includes(afterLogout.status()), `old token after logout must be rejected (got ${afterLogout.status()})`).toBe(true);

  // Step 4: Second user's session still works.
  const meB = await getMe(api, tokenB);
  expect(meB.status(), 'session B still works').toBe(200);
  expect(sameEmail((await meB.json()).email, accounts.shared.email), 'session B is still Second user').toBe(true);
});

test('TC-R1-11 Injection text in the email or password field does not log anyone in and does not cause server errors', { tag: ['@P1'] }, async ({ api }) => {
  const other = unregisteredEmail('inj');
  const ownerEmail = accounts.owner.email;

  const cases: { label: string; data: unknown }[] = [
    // Step 1: SQL injection in email, password, or both.
    { label: 'sql-email-1', data: { email: `' OR '1'='1' --`, password: 'qa-agent-x' } },
    { label: 'sql-email-2', data: { email: `${ownerEmail}' --`, password: 'qa-agent-x' } },
    { label: 'sql-email-3', data: { email: `" OR ""="`, password: 'qa-agent-x' } },
    { label: 'sql-email-4', data: { email: `x@x.com' OR '1'='1`, password: 'qa-agent-x' } },
    { label: 'sql-password-1', data: { email: other, password: `' OR '1'='1' --` } },
    { label: 'sql-password-2', data: { email: other, password: `" OR ""="` } },
    { label: 'sql-both', data: { email: `' OR 1=1 --`, password: `' OR 1=1 --` } },
    // Step 2: NoSQL operators and arrays instead of strings.
    { label: 'nosql-both-gt', data: { email: { $gt: '' }, password: { $gt: '' } } },
    { label: 'nosql-email-gt', data: { email: { $gt: '' }, password: 'qa-agent-x' } },
    { label: 'nosql-owner-password-ne', data: { email: ownerEmail, password: { $ne: null } } },
    { label: 'nosql-owner-password-regex', data: { email: ownerEmail, password: { $regex: '.*' } } },
    { label: 'array-values', data: { email: [ownerEmail], password: ['qa-agent-x'] } },
    { label: 'null-values', data: { email: null, password: null } },
    { label: 'number-values', data: { email: 1, password: 1 } },
    { label: 'boolean-password', data: { email: ownerEmail, password: true } },
  ];

  for (const c of cases) {
    const res = await postLogin(api, c.data);
    await expectRejectedNoSession(res, c.label);
    expect.soft(looksLikeInternalError(await res.text()), `${c.label}: no internal error details in the body`).toBe(false);
  }

  // Step 3: Owner's real email with SQL text as the password. These are real wrong-password attempts.
  if (realAccountWrongPasswordsAllowed) {
    for (const [i, pw] of [`' OR '1'='1' --`, `x' OR 'x'='x`, `") OR ("1"="1`].entries()) {
      const res = await postLogin(api, { email: ownerEmail, password: pw });
      await expectRejectedNoSession(res, `owner-sql-password-${i + 1}`);
      expect.soft(looksLikeInternalError(await res.text()), `owner-sql-password-${i + 1}: no internal details`).toBe(false);
    }
  } else {
    note('step 3 not run', G08_REASON);
  }
});

test('TC-R1-12 The password and its hash never appear in any response', { tag: ['@P1'] }, async ({ api, tokens }) => {
  // Step 1: the full login response (body and headers).
  const login = await postLogin(api, accounts.owner);
  expect(login.status(), 'Owner login').toBe(200);
  const token = (await login.json()).accessToken as string;
  const loginHeaders = JSON.stringify(login.headersArray());
  const loginBody = await login.text();
  expect.soft(containsAccountPassword(loginBody), 'login body has no password').toBe(false);
  expect.soft(containsAccountPassword(loginHeaders), 'login headers have no password').toBe(false);
  expect.soft(containsHashPattern(loginBody + loginHeaders), 'login response has no password hash').toBe(false);
  expect.soft(passwordLikeKeys(await login.json()), 'login body has no password-like fields').toEqual([]);
  // The JWT payload is readable by anyone; it must not carry the password or hash either.
  const claims = JSON.stringify(decodePayload(token));
  expect.soft(containsAccountPassword(claims) || containsHashPattern(claims), 'JWT payload has no password or hash').toBe(false);
  expect.soft(passwordLikeKeys(decodePayload(token)), 'JWT payload has no password-like claims').toEqual([]);

  // Step 2: user-related endpoints, for both accounts.
  for (const [role, t] of [['owner', token], ['shared', await tokens.shared()]] as const) {
    for (const endpoint of PROTECTED_GETS) {
      const res = await api.get(endpoint, { headers: bearer(t), failOnStatusCode: false });
      expect.soft(res.status(), `${role} ${endpoint}: status`).toBe(200);
      const text = await res.text();
      expect.soft(containsAccountPassword(text), `${role} ${endpoint}: no password`).toBe(false);
      expect.soft(containsHashPattern(text), `${role} ${endpoint}: no password hash`).toBe(false);
      expect.soft(passwordLikeKeys(await safeJson(res)), `${role} ${endpoint}: no password-like fields`).toEqual([]);
    }
  }

  // Step 3: a failed login does not repeat the password that was sent.
  // An unregistered email is used, so no wrong password goes to a real account (G-08).
  const sentPassword = `qa-agent-${Date.now()}-Secret!42`;
  const failed = await postLogin(api, { email: unregisteredEmail('leak'), password: sentPassword });
  expect.soft(failed.status(), 'failed login: 4xx').toBeGreaterThanOrEqual(400);
  const failedText = (await failed.text()) + JSON.stringify(failed.headersArray());
  expect.soft(failedText.includes(sentPassword), 'failed login does not echo the password').toBe(false);
  expect.soft(containsHashPattern(failedText), 'failed login has no hash').toBe(false);
});
