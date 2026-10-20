# Gap Analysis — Authentication

**Source:** `requirements/auth.pdf` (1 page). It has one requirement: **R1. Authentication: email/password**.
**Test cases checked:** `test-cases/test-cases.md` (TC-R1-01 … TC-R1-26).

The requirement is one line. It says *how* users log in (email and password). It says nothing about sessions, logout, errors, limits, password rules, lockout or which parts of the app need a login. So almost every detailed expected result in the test cases is an assumption. This file lists each open question, the assumption we use for testing, and the test cases it affects.

**Impact levels**
- **High** = the answer can change the expected result of a P1 test case.
- **Medium** = the answer can change the expected result of a P2 test case.
- **Low** = UX only (P3).

**Hard expectation** = an assumption that protects against unauthorized access or data loss. We keep it as the expected result even if the app behaves differently. A difference is reported as a bug, not as a changed expected result.

---

## 1. Summary table

| Gap ID | Requirement | Type | Impact | Topic |
|---|---|---|---|---|
| G-01 | R1 | Missing detail | High | Which pages and API calls need a login, and which are public |
| G-02 | R1 | Missing detail | High | Logout: does it end the session on the server, and which sessions does it end |
| G-03 | R1 | Unclear error behavior | High | Error responses: status codes, and no internal details (stack traces, database errors) |
| G-04 | R1 | Missing detail | High | The password must never appear in any response |
| G-05 | R1 | Missing detail | High | User input shown back on the page (XSS) |
| G-06 | R1 | Unclear error behavior | Medium | Same error for "unknown email" and "wrong password" (account enumeration) |
| G-07 | R1 | Undefined limit | Medium | Lockout and rate limits after failed logins |
| G-08 | R1 | Test environment | Medium | Is it safe to test lockout with the shared test accounts |
| G-09 | R1 | Undefined limit | Medium | Session timeout (idle and maximum time) |
| G-10 | R1 | Missing detail | Medium | How long a session lasts in the browser; "remember me" |
| G-11 | R1 | Missing detail | Medium | Several sessions at the same time for the same user |
| G-12 | R1 | Missing detail | Medium | What happens to active sessions when the password changes or the account is disabled |
| G-13 | R1 | Undefined limit | Medium | Maximum length of email, password and request body |
| G-14 | R1 | Missing detail | Medium | Password rules and how the password is compared |
| G-15 | R1 | Missing detail | Medium | Email format check and email matching (upper/lower case, spaces) |
| G-16 | R1 | Missing detail | Medium | HTTPS only, and the settings of the session cookie |
| G-17 | R1 | Missing detail | Medium | Session fixation: is there a session before login, and does login create a new one |
| G-18 | R1 | Missing detail | Medium | Browser Back button and cached pages after logout |
| G-19 | R1 | Scope | Medium | Sign-up, password reset, email verification, "remember me", other login methods |
| G-20 | R1 | Missing detail | Low | Return to the first requested page after login; external return URLs (open redirect) |
| G-21 | R1 | Missing detail | Low | Login form UX: hidden password, labels, keyboard, double submit |

Total: **21 gaps**. High: **5** (G-01 … G-05). Medium: **14**. Low: **2**.

---

## 2. Gaps

### G-01 — Which pages and API calls need a login (High)

**Issue:** R1 says users log in, but not what a login protects. Maybe some pages are public (for example a landing page or public links). Without a list, we cannot say that a missing login on an endpoint is a bug.

**Question:** Which pages and API endpoints must need a login? Are any of them public on purpose?

**Assumption used:** Every page and endpoint that shows or changes user data needs a valid session. Only the login page, the login endpoint and static files (images, scripts, styles) are public. Requests without a valid session get 401/403, or a redirect to login for pages. **Hard expectation:** this protects against unauthorized access.

**Affects:** TC-R1-08, TC-R1-20, TC-R1-21, TC-R1-25

---

### G-02 — Logout on the server, and which sessions it ends (High)

**Issue:** R1 does not mention logout. A logout can only delete the token in the browser, while the server still accepts it. Then a stolen token keeps working.

**Question:**
1. Must logout end the session on the server, so the old token or cookie stops working at once?
2. Does logout end only the current session (this browser), or all sessions of this user (all devices)? Is there a "log out everywhere" option?

**Assumption used:**
1. Logout ends the session on the server. The old token or cookie is rejected right after logout. **Hard expectation:** this protects against unauthorized access.
2. Logout ends only the current session. Sessions of other users are never affected. Other sessions of the same user are not checked until the product owner answers.

**Affects:** TC-R1-10, TC-R1-21

---

### G-03 — Error responses: status codes and internal details (High)

**Issue:** R1 does not say what a failed or bad login request returns. Some apps return 200 with an error text in the body. Some return 400, others 401 or 422. An error can also show internal details, such as a database error or a stack trace (the list of code lines where an error happened). This helps attackers.

**Question:**
1. Which status codes must a failed login return: wrong credentials, missing fields, bad format, wrong content type?
2. May an error response contain technical details?

**Assumption used:**
1. Any 4xx status is accepted for a failed or bad login, as long as no session is created. A 5xx is always a bug.
2. Error responses never contain database errors, stack traces, query text or other internal details. **Hard expectation:** this is a security protection.

**Affects:** TC-R1-02, TC-R1-04, TC-R1-11, TC-R1-14, TC-R1-15

---

### G-04 — The password must never appear in a response (High)

**Question:** Can you confirm that no response (login, profile, user data, errors) may contain the password or its hash (the stored, scrambled form of the password)? May a failed login send back the email or password that the user typed?

**Assumption used:** No response contains the password in plain text, a password hash, or a field such as `password` or `passwordHash`. A failed login does not send back the password that was typed. Sending back the email is acceptable. **Hard expectation:** this protects the user's credentials.

**Affects:** TC-R1-12, TC-R1-19

---

### G-05 — User input shown back on the page (XSS) (High)

**Issue:** The login form may show the typed email inside an error message. If the page puts that text into the page as code, a script in the email field can run. This is XSS (cross-site scripting: an attacker's script that runs inside the app's page).

**Question:** Does the login page show the typed email back to the user (for example in an error message)? Can you confirm that all user input must be shown as plain text only?

**Assumption used:** No script from the email or password field ever runs. If the input is shown on the page, it is shown as plain text that does nothing. **Hard expectation:** this is a security protection.

**Affects:** TC-R1-24

---

### G-06 — Same error for unknown email and wrong password (Medium)

**Issue:** If the app says "this email is not registered" for one case and "wrong password" for the other, an attacker can find out which emails have accounts. This is called account enumeration.

**Question:** Must the login give the same answer (same status, same message) for an unknown email and for a wrong password? Should the response time also be about the same?

**Assumption used:** The status and the message are the same in both cases, for example "Invalid email or password". The message does not say which field was wrong. We do not measure response time.

**Affects:** TC-R1-03, TC-R1-19

---

### G-07 — Lockout and rate limits after failed logins (Medium)

**Issue:** R1 does not say what happens after many wrong passwords. Without any limit, an attacker can try many passwords (brute force). With a permanent lock, an attacker can lock any user out of their account.

**Question:**
1. Is there a limit on failed logins? After how many attempts, and in what time window?
2. Is the limit for each account, for each IP address (computer address), or both?
3. What happens when the limit is reached: slower answers, a 429 status ("too many requests"), a temporary lock, or a permanent lock?
4. How long does a lock last? How is an account unlocked?
5. What message does the user see? Is it the same for an existing and a non-existing email?

**Assumption used:** After a reasonable number of failures (we test 20–50 in a row), the server slows down or blocks more attempts, for example with 429 or a general "too many attempts" message. The block is temporary. It never causes a 5xx. A correct login works again after the waiting time.

**Affects:** TC-R1-13, TC-R1-02 (step 5: a few failures must not lock the account)

---

### G-08 — Is it safe to test lockout with the shared test accounts (Medium)

**Issue:** TC-R1-13 sends many failed logins. If the app has a lockout, it can lock the Owner account. Other test runs and other people use the same test accounts. A lock would break all later tests. Also, TC-R1-02 sends several wrong passwords for Owner and Second user in every run.

**Question:**
1. Does the test environment have a lockout? Is it the same as in production?
2. May we run the lockout test against Owner? If yes, how long is the lock, and who can unlock the account?
3. Can we get a separate account only for lockout tests, or can the lockout be reset in the test environment?

**Assumption used:** We do not try to lock the shared accounts. TC-R1-13 runs first with an unregistered email. It runs against Owner only alone, as the last test, and only if we know that the lock is temporary. If we do not get an answer, the Owner part of TC-R1-13 is skipped and marked "needs human decision".

**Affects:** TC-R1-13, TC-R1-02, and indirectly every test that logs in as Owner or Second user

---

### G-09 — Session timeout (Medium)

**Question:**
1. Does a session end after some time without activity (idle timeout)? How long?
2. Is there a maximum session time, even with activity (absolute timeout)? How long?
3. If the app uses tokens, how long is a token valid? Is there a refresh token (a second token used to get a new one)?
4. Can the test environment use a short timeout, so we can test an expired session?

**Assumption used:** Sessions have some expiry time. An expired session or token is rejected like a missing one (401/403 or a redirect to login). If we cannot get an expired token in the test environment, step 4 of TC-R1-08 is skipped and reported.

**Affects:** TC-R1-08 (step 4), TC-R1-22

---

### G-10 — How long the session lasts in the browser; "remember me" (Medium)

**Question:**
1. Does a user stay logged in after a page reload and in a new tab? After closing and opening the browser again?
2. Is there a "remember me" option? If yes, how long does it keep the user logged in?

**Assumption used:** The user stays logged in after a reload and in a new tab of the same browser. We do not test a browser restart or "remember me".

**Affects:** TC-R1-22

---

### G-11 — Several sessions at the same time for the same user (Medium)

**Issue:** This also matters for automation. Our tests often log in as Owner many times, sometimes in parallel. If a new login ends the older sessions, tests will fail for reasons that are not bugs.

**Question:** May the same user be logged in on several devices or browsers at the same time? Does a new login end the older sessions?

**Assumption used:** Several sessions of the same user may exist at the same time. A login by one user never changes or ends another user's session (this part is a **hard expectation**: it protects against sessions mixing between users).

**Affects:** TC-R1-09, TC-R1-10, TC-R1-22

---

### G-12 — Active sessions when the password changes or the account is disabled (Medium)

**Issue:** R1 does not say if users can change their password, or if an admin can disable or delete an account. If these features exist, an old session may keep working after the change. Then a person who stole a session keeps access even after the real user changed the password.

**Question:**
1. Can a user change the password? Can an account be disabled or deleted?
2. If yes, must the other existing sessions of that user end at once?

**Assumption used:** No test case covers this now, because the features are not in the requirements. If the features exist, we expect that existing sessions end after a password change (except perhaps the current one) and after an account is disabled or deleted. **Hard expectation** if the features exist: this protects against unauthorized access. New P1 test cases would then be needed.

**Affects:** No current test case. Possible new cases.

---

### G-13 — Maximum length of email, password and request body (Medium)

**Question:** What is the maximum length of the email and of the password? What is the maximum size of a login request? What error is returned when the input is too long?

**Assumption used:** Very long values (10,000 characters, or a body of about 1 MB) are rejected with a 4xx error (a validation error, or 413 = request too large). No 5xx, no timeout, and the server still works normally after this.

**Affects:** TC-R1-14

---

### G-14 — Password rules and how the password is compared (Medium)

**Issue:** R1 has no password rules. Some systems also change the password before they compare it: they cut it at a fixed length (some hashing methods use only the first 72 bytes), remove spaces at the ends, or stop at a null byte (an invisible "end of text" character). Then a wrong password can log in.

**Question:**
1. What are the password rules: minimum and maximum length, required character types, allowed characters (Unicode, emoji, spaces)?
2. Is the password compared exactly: upper/lower case matters, no spaces removed, no characters cut off?
3. Is a very long password cut to a shorter length before it is checked?

**Assumption used:** The password is compared exactly. Upper/lower case matters. Spaces are not removed. Characters are not cut off. A null byte does not cut the password short, so "real password + null byte + anything" does not log in. Password rules for creating a password are not tested, because sign-up and password change are not in scope (see G-19).

**Affects:** TC-R1-07, TC-R1-15

---

### G-15 — Email format check and email matching (Medium)

**Question:**
1. Does the login check the email format, and does it return a separate "invalid email format" error? Or the same general login error?
2. Is the email matched without regard to upper/lower case (`Owner@X.com` = `owner@x.com`)?
3. Are spaces before and after the email removed?
4. Are emails with non-English characters (Unicode) allowed?

**Assumption used:**
1. A badly formatted email is rejected with a 4xx error and no session. A format error or a general login error are both accepted.
2. and 3. Email matching ignores upper/lower case and spaces at the ends, and always finds the same account. If the product decides that email is case-sensitive, these logins must be rejected in the same way. They must never log in to a different account (this part is a **hard expectation**).
4. A Unicode email that does not belong to an account gets a normal 4xx error, never a 5xx.

**Affects:** TC-R1-05, TC-R1-06, TC-R1-15

---

### G-16 — HTTPS only and the settings of the session cookie (Medium)

**Question:**
1. Must the app and the API work only over HTTPS (encrypted connection)? What should happen with a plain `http://` request: a redirect or a refusal?
2. May credentials be sent in the URL (query string)?
3. Does the app use a cookie or a token for the session? If a cookie: must it have the HttpOnly, Secure and SameSite settings?

**Assumption used:** Plain HTTP redirects to HTTPS or is refused, and credentials are never accepted over plain HTTP. Credentials in the URL are not accepted. A session cookie has these settings:
- HttpOnly (page scripts cannot read it),
- Secure (sent only over HTTPS),
- SameSite Lax or Strict (not sent with most requests that start on other websites).

**Affects:** TC-R1-16

---

### G-17 — Session fixation (Medium)

**Issue:** Session fixation means the app keeps the same session ID after login. An attacker who set or knew that ID before login could then use the victim's logged-in session. This test only makes sense if the app gives a session ID **before** login. We do not know if it does.

**Question:**
1. Does the app create a session (cookie or token) for anonymous visitors, before login?
2. If yes, must login always create a new session ID?

**Assumption used:** If there is a session before login, the session ID changes at login, and the old ID does not give logged-in access. If there is no session before login, TC-R1-17 is marked N/A. This is not a failure.

**Affects:** TC-R1-17

---

### G-18 — Browser Back button and cached pages after logout (Medium)

**Issue:** After logout, the browser Back button can show a copy of the last page that the browser saved (a cached page). This can show private data to the next person at a shared computer.

**Question:** After logout, may the Back button show the saved copy of a protected page? Or must the app tell the browser not to save protected pages (for example with the `Cache-Control: no-store` header)?

**Assumption used:** After logout, Back and reload do not show current protected data. Either the login page appears, or the saved old page cannot load or change any data. Opening a protected URL redirects to login.

**Affects:** TC-R1-21

---

### G-19 — Scope: sign-up, password reset, email verification, "remember me", other login methods (Medium)

**Issue:** "Authentication: email/password" can mean only the login form. It can also mean the full account flow. Each extra feature brings its own security risks (for example, a password reset link that can be used twice).

**Question:** Which of these are in scope for this release?
- sign-up (creating an account),
- password reset ("forgot password"),
- email verification (the user must confirm the email before login),
- "remember me",
- password change,
- other login methods (Google login, single sign-on, two-factor login).

Also: may a user with an unverified email log in?

**Assumption used:** Only login and logout with an existing account are in scope. We do not test sign-up, reset, verification, "remember me", password change or other login methods. We never create accounts (project rule). If any of these are in scope, new test cases are needed.

**Affects:** Header of `test-cases/test-cases.md` (scope note), TC-R1-22

---

### G-20 — Return to the first requested page after login; open redirect (Low)

**Question:**
1. When an anonymous user opens a protected page and then logs in, must the app open that page after login? Or always the same start page?
2. If the app uses a "return to" address in the URL, must it accept only addresses inside the app?

**Assumption used:**
1. After login, the user arrives on the page they first asked for.
2. An external return address is ignored, and the user stays inside the app. (An open redirect is a link to the real app that sends the user to an attacker's website after login.)

Note: TC-R1-25 is P3 because returning to the page is UX. If the app has a "return to" parameter and it accepts external websites, we suggest a High severity bug, because it helps phishing (fake websites that steal passwords).

**Affects:** TC-R1-25

---

### G-21 — Login form UX (Low)

**Question:**
1. Must the password field hide the typed characters? Is there a "show password" button?
2. Are there rules for labels, error texts and keyboard use (accessibility)?
3. What should happen if the user clicks "Log in" twice quickly?

**Assumption used:** The password field hides the characters (a "show password" button is allowed). Fields have clear labels. Tab moves through the fields in a logical order, and Enter submits. A double click does not cause an error or a double action.

**Affects:** TC-R1-23, TC-R1-26

---

## 3. Contradictions / tensions

1. **Lockout and account enumeration (G-07 and G-06).** If the app locks only existing accounts, or shows "account locked" only for real emails, an attacker can learn which emails have accounts. This breaks the same-error rule. Question: must the lockout message be the same for existing and non-existing emails?

2. **Lockout and availability (G-07 and G-08).** A strong lockout stops password guessing. But it also lets anyone lock a real user out by typing wrong passwords on purpose. In our test environment, it can lock the shared test accounts. The product owner should choose: a temporary lock, slower answers, a limit per IP address, or a mix.

3. **Long sessions and session timeout (G-10 and G-09).** Staying logged in after reload and in new tabs (and maybe "remember me") is good for users. A short timeout is better for security. The product owner should give both numbers, so that the tests for TC-R1-22 and TC-R1-08 do not expect opposite things.

4. **Same general error and helpful messages (G-06 and G-21).** For security, the error must not say which field was wrong. For UX, a clear message is better. A format error such as "this is not a valid email" is safe, because it does not depend on whether an account exists (TC-R1-05). A message such as "wrong password" is not safe (TC-R1-03). We use this rule unless the product owner decides otherwise.

5. **Email is cleaned, the password is not (G-15 and G-14).** We expect the app to ignore upper/lower case and spaces at the ends of the email, but to compare the password exactly. If the app uses the same input cleaning for both fields, the password check becomes weaker. Both rules should be written down separately.

---

## Found during automation
