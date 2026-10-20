# Stage 5 — Test run and triage (R1 Authentication)

**Date:** 2026-10-20
**Command:** `npx playwright test` (both projects). Chromium only.
**Front end:** `https://virtual-data-room-ten.vercel.app`
**API:** `https://virtual-data-room-production.up.railway.app`
**Accounts:** Owner and Second user (from `.env`), plus anonymous requests.
**Full runs in this stage:** 1 (the limit is 2). The lockout budget was kept: TC-R1-02 sent 1 wrong password to each real account. No other wrong password went to a real account. `QA_ALLOW_REAL_ACCOUNT_WRONG_PASSWORDS` was not set.

---

## 1. Results by project

| Project | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| API (`tests/api`) | 16 | 11 | 2 | 3 |
| E2E (`tests/e2e`) | 6 | 6 | 0 | 0 |
| **Total** | **22** | **17** | **2** | **3** |

Run time: about 16 seconds. No flaky tests (a flaky test fails first and passes on a retry). Retries are off, so that failed logins are not sent again (G-08).

The result is the same as the last Stage 4 run: 17 passed, 2 failed, 3 skipped.

**Network errors:** none in this run. An earlier Stage 4 run had `ECONNRESET` errors (the server closed the connection) from the Railway API host on 4 tests. All of these tests passed in this run. We classify this as **Environment (the API host is sometimes unstable)**, not a test defect. If it happens often, more runs will be needed to tell it apart from real failures.

---

## 2. Failures

| Test ID | Classification | Reason (one line) | Confirmed a second time? | Layer | Suggested severity | Link |
|---|---|---|---|---|---|---|
| TC-R1-10 | App bug | After logout, the old token still works: `GET /auth/me` returns 200, not 401/403. | Yes, by the API and by the UI (see 2.1) | Both (the UI deletes only its own copy; the API has no way to end a session) | High | G-02 (hard expectation). Bug report in Stage 6. |
| TC-R1-13 | App bug (depends on G-07 / GA-01) | 20 failed logins in a row: all 401, no 429, no lock message, no slower answers. | Yes, by the API: 50 more attempts (see 2.2) | API | Medium | G-07, GA-01. Bug report in Stage 6, unless the product owner says throttling is not required. |

No failure is a **test defect**. No test was changed in this stage. No test needs `test.fixme`.

### 2.1 TC-R1-10 — Logout does not end the session on the server

**What the test checks:** Owner logs in (token A). Second user logs in (token B). Owner logs out. Token A must be rejected. Token B must still work.

**Test result:** `POST /auth/logout` → 404 (this route does not exist). `GET /auth/me` with token A → **200** (expected 401/403). `GET /auth/me` with token B → 200 (correct).

**Second check, through the API only** (a separate script, not the test suite):
1. Log in as Owner and as Second user. `GET /auth/me` with Owner's token → 200.
2. Try every likely logout route with Owner's token: `POST`, `DELETE` and `GET /auth/logout`, `POST /logout`, `POST /auth/signout`, `POST /auth/revoke`. All return **404**.
3. The API's own route list (`GET /docs-json`, the OpenAPI description) has only 3 auth routes: `/auth/register`, `/auth/login`, `/auth/me`. There is no logout route.
4. `GET /auth/me` with Owner's old token → **200**. With Second user's token → 200.

**Second check, through the UI** (a separate Chromium script):
1. Put Owner's token into the browser the way the app does (`localStorage['dataroom_token']`). Open `/`.
2. Click **Sign out**. The app goes to `/login` and deletes the token from the browser.
3. The app sends **no request to the API** while signing out.
4. After that, `GET /auth/me` with the same token → **200**.

**Result:** Reproduced. **Layer: both.** The UI "Sign out" only deletes the browser's copy of the token. The API has no logout route and no way to stop a token. A token is valid for 7 days (JWT `exp` claim), so a copied or stolen token keeps working for up to 7 days after the user signs out.

**Why High:** this is a P1 access-control case, and G-02 marks "the old token is rejected after logout" as a hard expectation. Nobody can end a stolen session: not the user and not the server. It is not Critical, because an attacker must first get the token.

**Evidence:**
- Test: `TC-R1-10 Logout ends the session on the server; other users' sessions keep working`
- `test-results/auth-access-control-TC-R1--daa79-users-sessions-keep-working-api/error-context.md`
- `test-results/results.json` (annotation "logout call": `POST /auth/logout returned 404`)
- HTML report: `playwright-report/index.html`
- No trace or screenshot: traces are off on purpose (they would record tokens), and this is an API test.

### 2.2 TC-R1-13 — Failed logins are not slowed down or blocked

**What the test checks:** 20 failed logins in a row with an unregistered email (`qa-agent-<timestamp>-throttle@example.invalid`). After some failures, the server should answer with 429, show a "too many attempts" message, or answer clearly slower [A].

**Test result:** 20 attempts: 20 × 401, 0 × 429, no 5xx. Average time: first 5 = 283 ms, last 5 = 295 ms. No lock message. The hard part of the test (no 5xx) passed. The [A] part (some limit) failed.

**Second check, through the API only** (a separate script, a new unregistered email):
1. 30 failed logins in a row: 30 × 401. Average time first 5 = 256 ms, last 5 = 264 ms. No `Retry-After` or `RateLimit-*` header. No lock message.
2. 20 more failed logins sent at the same time: 20 × 401.

**Result:** Reproduced. **Layer: API.** In total, 70 failed logins from one client in about one minute got no limit. So an attacker can try passwords as fast as the network allows (brute force).

**Why "App bug" and not "Requirement gap":** the test-designer wrote throttling as the expected result of TC-R1-13 [A], and the expected result is not changed here. But the requirement R1 does not say that throttling is required (G-07 is still open). We added GA-01 to `reports/gaps.md`. If the product owner says throttling is not required, this should be closed and not reported as a bug.

**Why Medium:** brute force is a real security risk. But the requirement does not ask for a limit, and the test is P2.

**Limit of this check:** we used only unregistered emails (G-08). If the app limits only real accounts, our test cannot see it. A per-IP-address limit would have shown up, and it did not.

**Evidence:**
- Test: `TC-R1-13 Many failed logins in a row are slowed down or blocked (throttling)`
- `test-results/auth-login-TC-R1-13-Many-f-92049-down-or-blocked-throttling--api/error-context.md`
- `test-results/results.json` (annotation "observed": `20 attempts: 401=20, 429=0, ...`)
- HTML report: `playwright-report/index.html`

---

## 3. Skipped tests (not failures)

| Test ID | Reason |
|---|---|
| TC-R1-07 | Needs a human decision: G-08. All 4 steps send wrong passwords to the real Owner account (for example the password in the opposite letter case). The lockout rules are unknown. |
| TC-R1-13 (Owner part) | Needs a human decision: G-08. It would try to block the real Owner account. |
| TC-R1-17 | N/A. The app gives no session before login (no cookie and no token), so session fixation cannot happen (G-17, exploration §5). |

---

## 4. Tests that passed with steps not run

These tests passed, but some steps did not run. A pass here does not cover the full test case.

| Test ID | Step not run | Reason |
|---|---|---|
| TC-R1-03 | Steps 2–3: compare "unknown email" with "Owner + wrong password" | G-08 (wrong password to a real account). Only the unknown-email side was checked: 401 "Invalid email or password". In Stage 3 exploration, both cases gave the same answer. |
| TC-R1-08 | Step 4: an expired token | No expired token is available (tokens live 7 days, no signing key). New gap GA-03. |
| TC-R1-09 | User ID in a request body | No read endpoint takes a body. Write endpoints would create data rooms, and data rooms cannot be deleted through the API, so the test could not clean up. |
| TC-R1-11 | Step 3: Owner's real email with injection text as the password | G-08 (wrong passwords to a real account). Injection with unregistered emails and with non-string values for Owner's email did run and passed. |
| TC-R1-16 | Step 3: cookie settings (HttpOnly, Secure, SameSite) | There is no cookie. The token is kept in `localStorage`. New gap GA-02. The HTTPS redirect (API 301, front end 308) and "no credentials in the URL" checks passed. |
| TC-R1-19 | Step 1: Owner's email + wrong password in the UI | G-08. The unregistered-email step ran and passed. |

---

## 5. Tests that need human review

No test needs `test.fixme`. There were no test defects.

Decisions for the human QA:
1. **G-08 (lockout with the shared accounts).** It blocks TC-R1-07, the Owner part of TC-R1-13, and the steps in section 4 above. If the lockout is known to be off or temporary, set `QA_ALLOW_REAL_ACCOUNT_WRONG_PASSWORDS=1` and run these tests one by one.
2. **TC-R1-13 and G-07 / GA-01.** Please decide whether throttling is required. The test fails on the [A] part only.
3. **GA-02 (token in `localStorage`).** If the session must be an HttpOnly cookie, TC-R1-16 must fail and a new bug is needed (this was early finding EF-2 in exploration).

---

## 6. Manual cases (not run)

| Test ID | Priority | Level | Note |
|---|---|---|---|
| TC-R1-06 | P3 | API | Email in upper case or with spaces. P3, so it stays manual. Stage 3 saw: upper case logs in as Owner (200); spaces before and after → 400. |
| TC-R1-15 | P3 | API | Unicode and special characters. P3, so it stays manual. |
| TC-R1-23 | P3 | E2E | Hidden password input. P3, so it stays manual. Stage 3 saw `type="password"`. |
| TC-R1-25 | P3 | E2E | Return to the first requested page after login. P3, so it stays manual. Stage 3 saw no "return to" parameter; the app always opens `/` after login (early finding EF-4). This will likely fail when run by hand. |
| TC-R1-26 | P3 | Manual | Login form UX and keyboard use. |

---

## 7. Coverage by requirement

| Requirement | Test cases | Automated | Passed | Failed | Skipped | Manual |
|---|---|---|---|---|---|---|
| R1 | 26 | 21 (22 tests, TC-R1-13 has 2) | 17 | 2 (TC-R1-10, TC-R1-13) | 3 (TC-R1-07, TC-R1-13 Owner part, TC-R1-17) | 5 |

P1 cases: 7 of 7 automated. 6 passed, 1 failed (TC-R1-10).

---

## 8. Secret check

After the run, `reports/`, `test-results/` and `playwright-report/` were checked in-process against the values in `.env`, and for JWTs (tokens that start with `eyJ`). The check looked for the plain values and their base64 and URL-encoded forms. The HTML report keeps its data in a compressed zip inside `index.html`, so this zip was unpacked and checked too.

**Result:** 11 files and 4 report entries checked. **0 matches.** No password, no account email and no JWT were found. (Keys checked: `OWNER_PASSWORD`, `SHARED_PASSWORD`, `OWNER_EMAIL`, `SHARED_EMAIL`.)

---

## Summary

- **Run:** 1 full run. API: 11 passed, 2 failed, 3 skipped. E2E: 6 passed, 0 failed. Total: 17 / 2 / 3.
- **Failures:** 2. Both are app bugs. Both were reproduced a second time without the test suite.
  - **TC-R1-10 (High, layer: both):** logout does not end the session. The old token still works (200). There is no logout route on the API.
  - **TC-R1-13 (Medium, layer: API):** no limit on failed logins (70 attempts, all 401). This depends on G-07 / GA-01.
- **Test defects:** 0. **Environment:** 0 in this run (the earlier `ECONNRESET` errors did not happen again).
- **New gaps:** GA-01 (is throttling required), GA-02 (token in `localStorage`), GA-03 (no expired token for testing). They are in `reports/gaps.md`, section "Found during automation".
- **Blocked by G-08:** TC-R1-07, the Owner part of TC-R1-13, and some steps of TC-R1-03, TC-R1-11 and TC-R1-19.
- **Next:** Stage 6 can write 2 bug reports (BUG-01 for TC-R1-10, BUG-02 for TC-R1-13, if the human QA agrees on TC-R1-13).
