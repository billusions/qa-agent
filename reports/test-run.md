# Stage 5 — Test run and triage (R1 Authentication)

**Date:** 2026-10-22
**Done by:** test-triager. This agent did not write the tests and did not change them.
**Command:** `npx playwright test` (both projects). Chromium only.
**Front end:** `https://virtual-data-room-ten.vercel.app`
**API:** `https://virtual-data-room-production.up.railway.app`
**Accounts:** Owner and Second user (from `.env`), plus anonymous requests.
**Full runs in this stage:** 1. A second run was not needed: both failures were checked by hand instead.
**Lockout budget (G-08):** kept. In the test run, only TC-R1-02 sent wrong passwords to real accounts: 1 to Owner and 1 to Second user. The manual checks sent **no** wrong password to a real account. They used only unregistered emails (`qa-agent-<timestamp>-...@example.invalid`). `QA_ALLOW_REAL_ACCOUNT_WRONG_PASSWORDS` was not set.

Earlier report: the test-automator wrote a Stage 5 report on 2026-10-20 (17 passed, 2 failed, 3 skipped). Git keeps that version. This report is a new, independent judgment of every failure.

---

## 1. Results by project

| Project | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| API (`tests/api`) | 16 | 11 | 2 | 3 |
| E2E (`tests/e2e`) | 6 | 6 | 0 | 0 |
| **Total** | **22** | **17** | **2** | **3** |

- Run time: about 15 seconds. 4 workers.
- Flaky tests: 0. (A flaky test fails first and passes on a retry.) Retries are off on purpose, so failed logins are not sent again (G-08).
- Network errors: none. No `ECONNRESET` this time.
- The result is the same as on 2026-10-20. The same 2 tests failed, for the same reason.

---

## 2. Failures

| Test ID | Priority | Classification | Reason (one line) | Still reproduces? | Layer | Link |
|---|---|---|---|---|---|---|
| TC-R1-10 | P1 | **App bug** | After logout, the old token still works: `GET /auth/me` returns 200, not 401/403. | Yes. By API and by a real UI "Sign out" (see 2.1). | both | [BUG-01](../bugs/BUG-01.md) (existing), G-02 |
| TC-R1-13 | P2 | **App bug — needs human review** | 20 failed logins in a row: all 401, no 429, no lock message, answers not slower. The expected result is an assumption [A] only. | Yes. By API, 45 more attempts (see 2.2). | API | [BUG-02](../bugs/BUG-02.md) (existing), G-07, GA-01 |

No new bug numbers. No failure is a test defect. No failure is an environment problem.

### 2.1 TC-R1-10 — Logout does not end the session on the server

**Test case (reference):** Owner and Second user are logged in. Owner logs out. Owner's saved token must be rejected (401/403): "the server has ended the session; the client did not only delete its copy [A]". Second user's session must still work.

**Test result:** `POST /auth/logout` → 404. `GET /auth/me` with Owner's old token → **200** (expected 401/403). Second user's session → 200 (correct).

**Is the test right? My own review.**
- The assertion matches the test case: it expects 401 or 403 for the old token. Correct.
- One weak point: the test "logs out" by calling `POST /auth/logout`. This route does not exist (404). So the test does not use the app's real logout. This could hide a mistake in the test: maybe the real "Sign out" does something on the server. So I checked the real "Sign out" button in a browser (below). It sends no request to the API. So the test's result is the same as with a real logout. The failure is real. This is not a test defect.
- The test case's [A] is backed by gap G-02, which marks "the old token is rejected after logout" as a **hard expectation** (it protects against unauthorized access). So the app's behavior cannot become the expected result.

**Manual check 1 — API only** (script outside the test code, 2026-10-22):
1. Log in as Owner and as Second user → 200, 200. `GET /auth/me` with both tokens → 200, 200.
2. Try logout routes with Owner's token: `POST`, `DELETE`, `GET /auth/logout`, `POST /logout`, `POST /auth/signout`, `POST /auth/revoke`, `POST /auth/logout-all` → all **404**.
3. The API's own route list (`GET /docs-json`) has only 3 auth routes: `/auth/register`, `/auth/login`, `/auth/me`. There is no logout route.
4. `GET /auth/me` with Owner's token → **200**. With Second user's token → 200.
5. Token lifetime (from the JWT `iat` and `exp` claims) → **7 days**.

**Manual check 2 — real UI flow in Chromium** (script outside the test code):
1. Open `/login`. Log in as Owner through the form. The "Sign out" button appears.
2. Read the token the app saved (`localStorage['dataroom_token']`). `GET /auth/me` with it → 200.
3. Click **Sign out**. The app opens `/login` and deletes the token from `localStorage`.
4. Network: **no request to the API** during or after sign-out.
5. `GET /auth/me` with the same token → **200**. Second user's token → 200.

**Result:** reproduced. **Layer: both.** The UI only deletes its own copy of the token. The API has no way to end a session. I agree with the earlier classification (app bug) and with BUG-01. The behavior is unchanged since 2026-10-20.

**Evidence:**
- Test: `TC-R1-10 Logout ends the session on the server; other users' sessions keep working` (project `api`)
- `test-results/auth-access-control-TC-R1--daa79-users-sessions-keep-working-api/error-context.md`
- `test-results/results.json` (annotation "logout call": `POST /auth/logout returned 404`)
- HTML report: `playwright-report/index.html`
- No trace or screenshot: traces are off on purpose (they would record tokens), and this is an API test.

### 2.2 TC-R1-13 — Failed logins are not slowed down or blocked

**Test case (reference):** 20–50 failed logins in a row. Expected: "after a reasonable number of failures, the server limits or temporarily blocks further attempts (for example 429, or a general 'too many attempts' message) … [A]". Never a 5xx.

**Test result:** 20 attempts with an unregistered email: 20 × 401, 0 × 429, no 5xx, no lock message. Average answer time: first 5 = 225 ms, last 5 = 207 ms (not slower). The hard part (no 5xx) passed. The [A] part failed.

**Is the test right? My own review.**
- 20 attempts is inside the 20–50 range of the test case. The test stops early on a 429, so it would see a block.
- It counts a block as: a 429, a lock text ("too many", "locked", "try again", "rate limit"), or answers more than 3 times slower. "3 times slower" is the test's own reading of "clearly slower". Here the answers got a little faster, so any reasonable limit would give the same result.
- The test uses only an unregistered email (G-08). It cannot see a limit that counts only real accounts. This is a known limit of the test, not a defect. My manual check has the same limit.
- So the test checks what the test case says. This is not a test defect.

**Manual check — API only** (script outside the test code, a new unregistered email):
1. 30 failed logins in a row → 30 × 401. Average time: first 5 = 219 ms, last 5 = 211 ms. No `Retry-After` or `RateLimit-*` header. No lock message.
2. 15 failed logins sent at the same time → 15 × 401.

**Result:** reproduced. **Layer: API.** In this stage, 65 failed logins from one client got no limit. The behavior is unchanged since 2026-10-20.

**Why "App bug — needs human review", and not only "App bug":**
- The app differs from the expected result in the test case. By my rules, that is an app bug, and the test case is the reference. So I do not call it a test defect, and I do not change the expectation.
- But the expected result is an [A]. R1 does not mention throttling. Gap G-07 is **not** marked as a hard expectation (unlike G-02). G-07 and GA-01 are still open.
- So the classification depends on a product decision. I agree with the earlier triage (app bug that depends on G-07 / GA-01), and I add the "needs human review" flag to make this clear. If the product owner says throttling is not required, close BUG-02, and the test-designer changes TC-R1-13.
- No new gap is needed. GA-01 already asks this question.

**Evidence:**
- Test: `TC-R1-13 Many failed logins in a row are slowed down or blocked (throttling)` (project `api`)
- `test-results/auth-login-TC-R1-13-Many-f-92049-down-or-blocked-throttling--api/error-context.md`
- `test-results/results.json` (annotation "observed": `20 attempts: 401=20, 429=0, other=none; avg time first 5=225ms, last 5=207ms; lock message=false`)
- HTML report: `playwright-report/index.html`

---

## Sent back to test-automator

**None.** No failure in this run is a test defect.

One suggestion that is **not** a test defect (the result is correct today). It is for the test-automator to consider, after the human QA agrees:
- **TC-R1-10:** the test "logs out" with `POST /auth/logout`, which does not exist (404). So the test does not run the app's real logout. Today this gives the right result, because the real "Sign out" sends nothing to the API (checked in 2.1). But if the developers add a logout route with a different path or method, the test will still call the wrong route and keep failing after the fix. Suggested change: use the logout route from `GET /docs-json` when one exists, and fail with a clear message when there is none. Or add a matching E2E check: click "Sign out", then call `GET /auth/me` with the old token.

---

## 3. Skipped tests (not failures)

| Test ID | Reason | My view |
|---|---|---|
| TC-R1-07 | Needs a human decision: G-08. All 4 steps send wrong passwords to the real Owner account. | Correct skip. The lockout rules are unknown. |
| TC-R1-13 (Owner part) | Needs a human decision: G-08. It would try to block the real Owner account. | Correct skip. The test case itself says: run on Owner only if the lock is known to be temporary. |
| TC-R1-17 | N/A. The app gives no session before login (no cookie, no token). | Correct. The test case says to mark it N/A in this case (G-17). |

---

## 4. Tests that passed with steps not run

These tests passed, but some steps did not run. A pass here does **not** cover the full test case.

| Test ID | Step not run | Reason |
|---|---|---|
| TC-R1-03 | Steps 2–3: compare "unknown email" with "Owner + wrong password" | G-08. Only the unknown-email side ran: 401 "Invalid email or password". The main point of the test case (the two answers are the same) is **not** checked by automation. |
| TC-R1-08 | Step 4: an expired token | No expired token is available (7-day tokens, no signing key). GA-03. |
| TC-R1-09 | User ID in a request body | No read endpoint takes a body. Write endpoints would create data rooms that cannot be deleted through the API. |
| TC-R1-11 | Step 3: Owner's real email with injection text as the password | G-08. The other injection steps ran and passed. |
| TC-R1-16 | Step 3: cookie settings (HttpOnly, Secure, SameSite) | There is no cookie. The token is kept in `localStorage`. GA-02. HTTPS redirect (API 301, front end 308) and "no credentials in the URL" passed. |
| TC-R1-19 | Step 1: Owner's email + wrong password in the UI | G-08. The unregistered-email step ran and passed. |

---

## 5. Tests that need human review

| Test ID | Why | Decision needed |
|---|---|---|
| TC-R1-13 | Fails only on an [A] expected result. R1 does not require throttling. | Is throttling required (G-07, GA-01)? If yes, keep BUG-02. If no, close BUG-02 and the test-designer changes TC-R1-13. |

Other decisions for the human QA (they do not change a failure today):
1. **G-08 (lockout with the shared accounts).** It blocks TC-R1-07, the Owner part of TC-R1-13, and the steps in section 4. If lockout is known to be off or temporary, set `QA_ALLOW_REAL_ACCOUNT_WRONG_PASSWORDS=1` and run these tests one by one.
2. **GA-02 (token in `localStorage`).** If the session must be an HttpOnly cookie, TC-R1-16 must fail and a new bug is needed.

No test failed twice as a test defect.

---

## 6. Manual cases (not run)

| Test ID | Priority | Level | Note |
|---|---|---|---|
| TC-R1-06 | P3 | API | Email in upper case or with spaces. Not automated (P3). |
| TC-R1-15 | P3 | API | Unicode and special characters. Not automated (P3). |
| TC-R1-23 | P3 | E2E | Hidden password input. Not automated (P3). |
| TC-R1-25 | P3 | E2E | Return to the first requested page after login. Not automated (P3). Stage 3 saw no "return to" parameter, so this will likely fail when run by hand. |
| TC-R1-26 | P3 | Manual | Login form UX and keyboard use. |

---

## 7. Coverage by requirement

| Requirement | Test cases | Automated | Passed | Failed | Skipped | Manual |
|---|---|---|---|---|---|---|
| R1 | 26 | 21 (22 tests: TC-R1-13 has 2) | 17 | 2 (TC-R1-10, TC-R1-13) | 3 (TC-R1-07, TC-R1-13 Owner part, TC-R1-17) | 5 |

P1 cases: 7 of 7 automated. 6 passed, 1 failed (TC-R1-10).

---

## 8. Secret check

After the run, these folders were scanned in-process: `test-results/`, `playwright-report/` and `reports/`. The scan looked for the 4 credential values from `.env` (`OWNER_PASSWORD`, `SHARED_PASSWORD`, `OWNER_EMAIL`, `SHARED_EMAIL`), in plain, base64 and URL-encoded form, and for JWTs (tokens that start with `eyJ`). The zip data inside `playwright-report/index.html` was unpacked and scanned too.

**Result:** 16 files and entries checked. **0 matches.** The manual check scripts printed only status codes and times, never tokens, emails or passwords.

---

## Summary

- **Run:** 1 full run. API: 11 passed, 2 failed, 3 skipped. E2E: 6 passed, 0 failed. Total: 17 / 2 / 3. Same as on 2026-10-20.
- **Failures by classification:**
  - App bug: 1 — TC-R1-10 (P1). Still reproduces, by API and by the real UI "Sign out". Existing BUG-01 (High, layer: both).
  - App bug — needs human review: 1 — TC-R1-13 (P2). Still reproduces (65 failed logins, no limit). Existing BUG-02 (Medium, layer: API). Depends on G-07 / GA-01, because the expected result is an [A] and not a hard expectation.
  - Test defect: 0. Requirement gap: 0 new. Environment: 0.
- **Agreement with the earlier triage:** I agree with both classifications, for the reasons in 2.1 and 2.2. I add a "needs human review" flag to TC-R1-13.
- **Sent back to test-automator:** none. One optional suggestion for TC-R1-10 (use the real logout mechanism).
- **New gaps:** none. `reports/gaps.md` was not changed.
- **Blockers:** none. G-08 still blocks TC-R1-07, the Owner part of TC-R1-13, and some steps of TC-R1-03, TC-R1-11 and TC-R1-19.
