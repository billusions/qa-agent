# QA Summary — R1 Authentication

**Date:** 2026-10-20
**Scope:** `requirements/auth.pdf`. It has one requirement: **R1. Authentication: email/password**.
**App:** front end `https://virtual-data-room-ten.vercel.app`, API `https://virtual-data-room-production.up.railway.app`. Chromium only.
**Accounts:** Owner and Second user (from `.env`), plus anonymous requests.
**Sources:**
- `test-cases/test-cases.md`: the test cases
- `reports/gaps.md`: open questions
- `reports/exploration.md`: how the app works
- `reports/test-run.md`: test results
- `bugs/`: bug reports

Severity and priority in this file are suggestions. The human QA makes the final decision.

---

## 1. Test results

| Level | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| API | 16 | 11 | 2 | 3 |
| E2E | 6 | 6 | 0 | 0 |
| **Total** | **22** | **17** | **2** | **3** |

- **Failed:** both failures are app bugs. Each one was reproduced a second time, outside the test suite. There were no test defects.
- **Skipped:**
  - TC-R1-07 and the Owner part of TC-R1-13 wait for a decision on G-08: can wrong passwords be sent to the real accounts?
  - TC-R1-17 does not apply. The app has no session before login.
- **Environment:** one Stage 4 run had network errors from the API host (`ECONNRESET`). The Stage 5 run had none.
- **Secret check:** no password, account email or token was found in the reports, test results or bug files.

---

## 2. Coverage by requirement

| Requirement | Test cases | P1 / P2 / P3 | Automated | Passed | Failed | Skipped | Manual (not run) |
|---|---|---|---|---|---|---|---|
| R1 | 26 | 7 / 14 / 5 | 21 cases (22 tests) | 17 | 2 | 3 | 5 |

- **P1:** all 7 P1 cases are automated. 6 passed. 1 failed: TC-R1-10, logout.
- **Partly covered:** 6 tests passed, but some of their steps did not run. Usually the reason is G-08 (no wrong passwords to the real accounts). Details are in `reports/test-run.md`, section 4.
- **Manual, not run:** TC-R1-06, 15, 23, 25 and 26, all P3. TC-R1-25 will probably fail. After login, the app always opens `/`. It does not return you to the page you first asked for.

**Not in scope:** the app is a data room with folders, files and sharing. The requirements file covers only login, so none of these features were tested.

---

## 3. Bugs by severity

| Severity | Count | Bugs |
|---|---|---|
| Critical | 0 | — |
| High | 1 | **BUG-01:** logout does not end the session on the server. The old token still works after "Sign out" (TC-R1-10, P1, layer: both). |
| Medium | 1 | **BUG-02:** failed logins are never slowed down or blocked. Anyone can guess passwords without a limit (TC-R1-13, P2, layer: API). It depends on the product owner's answer to GA-01. |
| Low | 0 | — |

---

## 4. Open gaps

There are **24 open gaps**: 21 from Stage 2 and 3 found during automation. The product owner has not answered any of them yet.

| Impact | Count | Gaps |
|---|---|---|
| High | 5 | G-01 … G-05 |
| Medium | 17 | G-06 … G-19, GA-01, GA-02, GA-03 |
| Low | 2 | G-20, G-21 |

What the app does for the High gaps. This shows the app's behavior; it is not the product owner's answer.

| Gap | Question | What the app does |
|---|---|---|
| G-01 | Which pages and API calls need a login? | Protected API calls return 401 without a token. Protected pages send you to `/login`. |
| G-02 | Does logout end the session on the server? | **No.** This is BUG-01. |
| G-03 | Are internal details hidden in error answers? | Yes. The tests saw no stack traces and no 5xx errors. |
| G-04 | Is the password kept out of every answer? | Yes. No password or hash was in any answer. |
| G-05 | Does a script typed into the login form stay plain text? | Yes. The script did not run. |

**Decisions for the human QA or the product owner:**
1. **G-08:** may the tests send wrong passwords to the real accounts? Until this is answered, TC-R1-07, part of TC-R1-13 and some steps of 4 other tests do not run.
2. **GA-01 / G-07:** is a limit on failed logins required? This decides whether BUG-02 stays open.
3. **GA-02:** is it OK to keep the token in `localStorage`, where page scripts can read it? Or must the session be an HttpOnly cookie, a cookie that page scripts cannot read?
4. **GA-03:** can the test environment give us an expired token? Without one, step 4 of TC-R1-08 cannot run.

---

## 5. Tests that need human review

None. No test is marked `test.fixme`. The skipped tests wait only for the G-08 decision.

---

## 6. Top 3 risks for release

1. **A stolen token cannot be stopped (BUG-01, together with GA-02).**
   - A token works for 7 days.
   - "Sign out" deletes it only in the browser.
   - The server has no way to end a session.
   - The token is kept where page scripts can read it.

   So if one XSS problem appears anywhere in the app, an attacker can steal a session that works for 7 days. Neither the user nor the server can end it. In this round, XSS (a script that runs in the page) was tested only in the login form.

2. **Unlimited password guessing (BUG-02).** 70 failed logins in about one minute got no limit, no block and no slower answers. An attacker can guess weak passwords as fast as the network allows. The requirements do not state password rules (G-14), so weak passwords may be allowed.

3. **The requirement is too thin, so most expected results are assumptions.**
   - R1 says only "email/password". 19 of 26 test cases depend on assumptions marked [A].
   - The product owner has answered none of the 24 gaps.
   - The main features (data rooms, files, sharing, access control between users) have no requirements in this round, so they were not tested. For a data room, these are the highest-risk areas.

**Suggestion:** fix BUG-01 before release. Decide on BUG-02 with the product owner. Then add requirements for data rooms and sharing, and run the pipeline again.
