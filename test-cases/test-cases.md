# Test Cases — Authentication

## Header

**Source files:** `requirements/auth.pdf` (1 page). It has one numbered requirement:
- **R1.** Authentication: email/password

The source already has numbers, so we did not renumber anything. It does not name any edge cases, so there are no E-IDs.

**Accounts / roles used**
- **Owner**: an existing test account (`OWNER_EMAIL` / `OWNER_PASSWORD`).
- **Second user**: a second existing test account (`SHARED_EMAIL` / `SHARED_PASSWORD`).
- **Anonymous**: a client with no session and no credentials.

We do not create any account. The requirements do not include registration, password reset or email verification. So we do not test them here.

**Terms used in this file**
- **Session**: the app's record that a user is logged in. After login, the server gives the client a **session cookie** or a **token** (a string that proves who the user is). The client sends it with every later request.
- **Protected endpoint / page**: an API call or page that only a logged-in user may use.
- **Status codes**: **2xx** = success. **4xx** = the client sent a bad or unauthorized request (for example **401** = not logged in, **403** = not allowed, **413** = request too large, **429** = too many requests). **5xx** = the server crashed or failed. A 5xx is never an acceptable answer to bad input.
- **Server-side**: on the server, not only in the browser.

**[A] meaning:** the expected result goes further than the requirement text. The requirement only says "email/password". An [A] result is an assumption. It is based on common practice for secure login. Each [A] will get an entry in the gap analysis (Stage 2). Results without [A] follow directly from "authentication by email and password": correct credentials log the user in, wrong credentials do not, and protected functions need a login.

**Priority rules:**
- **P1** = access control, security or data loss only. Here this means: getting in without a valid login, one user's session mixing with another's, a session that still works after logout, injection attacks, the password shown in a response, and scripts that run in the page (XSS).
- **P2** = core login or session behavior is broken, or a security protection that the requirement does not state directly.
- **P3** = UX or cosmetic.
- A UI check that repeats an API-level access check is P2.

**Level rules:**
- **API** whenever the check can be done with an HTTP request.
- **E2E** only for things that only a browser can show: redirects, error messages on the page, the Back button showing a cached page, scripts running in the page, and hidden password input.
- **Manual** for subjective UX.

Steps describe behavior only. The exact endpoints, routes and selectors will come from the Stage 3 exploration.

---

## Requirement checklist (ranked by risk)

| Rank | ID | Short text | Risk area | Why it has this rank |
|---|---|---|---|---|
| 1 | R1 | Authentication: email/password | Access control / security | Login protects everything else in the app. It can fail without any visible error: someone gets in without a valid login, two users' sessions mix, a session still works after logout, or an injection attack works. Then anyone can see every user's data. It is the only requirement, so all the risk is here. |

---

## Test cases

### R1 — Authentication: email/password

#### Access control and security (P1)

```
TC-R1-02 | P1 | A wrong password is rejected, also when it is another user's valid password, and no session is created
Preconditions: Owner and Second user exist. The client has no session.
Steps: 1. Send a login with Owner's email and a wrong password.
       2. Send a login with Owner's email and Second user's (valid) password.
       3. Send a login with Second user's email and Owner's password.
       4. For each response, take any cookie or token it returns. Use it to call a protected endpoint.
       5. Log in as Owner with the correct password.
Expected: Steps 1–3 are rejected with an authentication error (4xx, not 5xx). No session cookie or token is created. Any value that is returned does not give access in step 4 (401/403, or a redirect to login). Step 5 succeeds: a few failed attempts do not change or break the account.
Level: API
```

```
TC-R1-08 | P1 | Protected endpoints reject requests without a valid session (no token, random token, changed token, expired token)
Preconditions: Owner can log in. Exploration has found at least one protected endpoint (for example the current-user/profile endpoint, or any endpoint that lists data).
Steps: 1. As Anonymous, call each known protected endpoint with no cookie or token.
       2. Do the same with a random, meaningless token value.
       3. Log in as Owner and copy the session token. Change one character in it and do the same calls. If it is a signed token such as a JWT (JSON Web Token: a token with a header, data and a signature), also change its data or its signature. Also try an "alg-none" token: a JWT whose header says "alg": "none", which means "no signature". A safe server must refuse it.
       4. If you can get an expired token (for example after the session times out), do the same calls with it.
Expected: Every request is rejected (401/403, or a redirect to login for page routes). The response body contains no protected data. No 5xx.
Level: API
```

```
TC-R1-09 | P1 | Each user's session is separate; two sessions at the same time do not mix users
Preconditions: Owner and Second user exist.
Steps: 1. Log in as Owner (session A) and as Second user (session B), in two separate clients.
       2. With session A, call the current-user/profile endpoint. Do the same with session B.
       3. With session A, send requests that contain Second user's ID in every place where the client can set one, if such places exist: a query parameter, a body field, or a header (for example a header that sets the user ID).
       4. After both logins, call the current-user endpoint again with session A.
Expected: Session A always belongs to Owner. Session B always belongs to Second user. Sending Second user's ID with session A does not change the user and does not return Second user's data. The request is rejected, or the ID is ignored and the user is still Owner. The Second user login does not change or end Owner's session.
Level: API
```

```
TC-R1-10 | P1 | Logout ends the session on the server; other users' sessions keep working
Preconditions: Owner and Second user are logged in, with sessions A and B.
Steps: 1. Save the value of Owner's session token or cookie (A).
       2. Log Owner out.
       3. Send a protected request again, using the saved value A.
       4. With session B, call a protected endpoint.
Expected: Step 3 is rejected (401/403, or a redirect to login). The server has ended the session; the client did not only delete its copy [A]. Step 4 succeeds: Second user's session still works.
Level: API
```

```
TC-R1-11 | P1 | Injection text in the email or password field does not log anyone in and does not cause server errors
Preconditions: The client has no session.
Steps: 1. Send logins with SQL injection text in the email, the password, or both. SQL injection means text that tries to change the database query. Examples: `' OR '1'='1' --`, `owner_email' --`, `" OR ""="`.
       2. If the request body is JSON, send NoSQL injection values. NoSQL injection means sending an object or an array instead of a plain string, so that a database like MongoDB reads it as a query condition. Examples: password `{"$ne": null}` ("not equal to empty"), email `{"$gt": ""}` ("greater than empty"), or arrays instead of strings.
       3. Send Owner's real email with injection text as the password.
Expected: No value logs anyone in, and no session is created. The responses are 4xx validation or authentication errors, never 5xx. The response does not show database errors, stack traces (lists of code lines from an error) or parts of a query [A].
Level: API
```

```
TC-R1-12 | P1 | The password and its hash never appear in any response
Preconditions: Owner can log in.
Steps: 1. Log in as Owner. Check the full login response (body, headers, cookies).
       2. Call the current-user/profile endpoint and any other user-related endpoints found in exploration. Check the responses.
       3. Send a failed login. Check the error response.
Expected: No response contains the password in plain text, a password hash (the stored, scrambled form of the password), or a field such as `password` or `passwordHash`. A failed login does not repeat the password that was sent [A].
Level: API
```

#### Core login behavior (P2)

```
TC-R1-01 | P2 | A valid email and password log in the right user, and the session works for later requests
Preconditions: Owner and Second user exist. The client has no session.
Steps: 1. Log in with Owner's email and password.
       2. Use the returned session (cookie or token) to call the current-user/profile endpoint and one other protected endpoint.
       3. Do steps 1–2 again for Second user.
Expected: Login succeeds (2xx) and creates a session. The protected calls succeed and show the logged-in user (Owner in step 2, Second user in step 3).
Level: API
```

```
TC-R1-03 | P2 | An unknown email is rejected with the same response as a wrong password
Preconditions: The client has no session. Use an email that is surely not registered (for example random-uuid@example.invalid).
Steps: 1. Log in with the unregistered email and any password.
       2. Log in with Owner's email and a wrong password.
       3. Compare the status codes, the error messages and the structure of the two responses.
Expected: Both are rejected, and no session is created. You cannot tell the two responses apart: same status and the same general message (for example "Invalid email or password"). This prevents account enumeration: an attacker cannot use the login form to find out which emails have an account [A].
Level: API
```

```
TC-R1-04 | P2 | A missing or empty email or password is rejected with a validation error
Preconditions: The client has no session.
Steps: 1. Send a login with an empty email and a valid password.
       2. Valid email, empty password.
       3. Both empty.
       4. No email field in the request body. Then: no password field.
       5. Email and password that contain only spaces.
       6. An empty body. Then: a wrong content type (wrong data format in the request header).
Expected: Every request is rejected with a 4xx error, and no session is created. No 5xx. Owner's email with an empty password never logs in.
Level: API
```

```
TC-R1-05 | P2 | Email addresses in a wrong format are rejected
Preconditions: The client has no session.
Steps: 1. Send logins with emails such as `plainaddress`, `@example.com`, `owner@`, `a@b@c.com`, `owner@ example.com`.
Expected: Rejected with a 4xx validation or authentication error, and no session. No 5xx [A: the requirement does not say if this must be a format error or a general login error. Both are acceptable, as long as nobody is logged in].
Level: API
```

```
TC-R1-07 | P2 | The password must match exactly (upper/lower case matters, no spaces removed, no characters cut off)
Preconditions: Owner exists.
Steps: 1. Log in as Owner with the password in the opposite letter case (upper case becomes lower case and lower case becomes upper case).
       2. Log in with the correct password plus a space at the end.
       3. Log in with the correct password plus extra characters at the end.
       4. Log in with the correct password without its last character.
Expected: All four are rejected, and no session is created. The password is compared exactly [A].
Level: API
```


```
TC-R1-13 | P2 | Many failed logins in a row are slowed down or blocked (throttling)
Preconditions: The client has no session. The test accounts are shared, so do not lock them: run first with an unregistered email. Run with Owner only alone, as the last test, and only if you know the lock is temporary.
Steps: 1. Quickly send 20–50 failed logins in a row from the same client.
       2. Watch for changes: a new status (for example 429), slower responses, or a lock message.
       3. If Owner gets blocked, wait for the stated waiting time. Then check that a valid login works again.
Expected: After a reasonable number of failures, the server limits or temporarily blocks further attempts (for example 429, or a general "too many attempts" message). Blocking never causes a 5xx. The block is temporary, not a permanent lock of the account [A].
Level: API
```

```
TC-R1-14 | P2 | Very long email or password input is handled safely
Preconditions: The client has no session.
Steps: 1. Send a login with an email of 10,000 characters.
       2. Send Owner's email with a password of 10,000 characters.
       3. Send a request body of about 1 MB.
Expected: Rejected with a 4xx error (validation, or 413), and no session. No 5xx and no timeout. After this, the server still responds normally [A].
Level: API
```

```
TC-R1-16 | P2 | Credentials are sent only over HTTPS and only in the request body; the session cookie is protected
Preconditions: Owner can log in.
Steps: 1. Send the login request to the http:// address of the app or API (HTTP without encryption), if it is reachable.
       2. Try to log in with the credentials in the URL query string (GET, or POST with query parameters).
       3. After a successful login over HTTPS, check the Set-Cookie settings of the session cookie (if the app uses cookies).
Expected: Plain HTTP redirects to HTTPS or is refused. Credentials are never accepted over plain HTTP. Credentials in the query string are not accepted. The session cookie has these three settings [A]:
  - HttpOnly: page scripts cannot read the cookie.
  - Secure: the browser sends the cookie only over HTTPS.
  - SameSite (Lax or Strict): the browser does not send the cookie with most requests that start on other websites.
Level: API
```

```
TC-R1-17 | P2 | Login creates a new session ID (no session fixation)
Preconditions: The app gives a session cookie or token before login (for example an anonymous session cookie). If it does not, mark this test N/A.
Steps: 1. As Anonymous, open the login page or API. Save any session ID you get before login.
       2. Log in as Owner in the same client.
       3. Compare the session ID after login with the one from before login.
       4. Try to use the session ID from before login on a protected endpoint.
Expected: The session ID after login is different from the one before login. The ID from before login does not give logged-in access [A]. (Session fixation is an attack where the app keeps the same session ID after login. An attacker who set or knew that ID before login could then use the victim's logged-in session.)
Level: API
```

#### Edge cases (P3)

```
TC-R1-06 | P3 | Email matching ignores upper/lower case and spaces before or after the email
Preconditions: Owner exists.
Steps: 1. Log in with Owner's email in UPPER CASE (or mixed case) and the correct password.
       2. Log in with Owner's email with spaces before and after it, and the correct password.
Expected: Both log in as Owner (the same account, not a different user) [A]. If the product decides that email is case-sensitive, both must be rejected in the same way. They must never log in to a different account.
Level: API
```

```
TC-R1-15 | P3 | Unicode and special characters in the credential fields do not break login
Preconditions: The client has no session.
Steps: 1. Send Owner's email with passwords that contain Unicode (non-English letters such as `пароль✓`, and emoji), quotes, backslashes, a null byte `\u0000` (an invisible "end of text" character), and line breaks.
       2. Send an email with Unicode characters before or after the @.
Expected: Each request returns a normal authentication or validation error (4xx), and no session. No 5xx. The null byte does not cut the password short so that it matches the real password [A].
Level: API
```

#### Browser-only behavior (E2E)

```
TC-R1-18 | P2 | Login through the UI with valid credentials opens the logged-in area
Preconditions: A browser with no session. Owner exists.
Steps: 1. Open the app and go to the login form.
       2. Enter Owner's email and password, and submit.
Expected: The user arrives in the logged-in area of the app. The UI shows that Owner is logged in (for example Owner's email or name, or a logout button).
Level: E2E
```

```
TC-R1-19 | P2 | Wrong credentials in the UI show an error, and the user stays on the login form
Preconditions: A browser with no session.
Steps: 1. Submit the login form with Owner's email and a wrong password.
       2. Submit it with an unregistered email.
Expected: An error message is visible. The user stays on the login form and cannot open logged-in pages. The message is the same in both cases and does not say which field was wrong [A]. The password does not appear in the page or in the URL.
Level: E2E
```

```
TC-R1-20 | P2 | An anonymous user who opens a protected page directly is sent to login
Preconditions: A browser with no session. Exploration has found the URLs of protected pages.
Steps: 1. Open a protected page directly by its URL.
Expected: The user is redirected to the login form (or the login form is shown). No protected content is shown, not even for a short moment before the redirect. (This is the UI version of TC-R1-08.)
Level: E2E
```

```
TC-R1-21 | P2 | After logout in the UI, the browser cannot show protected content
Preconditions: Owner is logged in through the UI.
Steps: 1. Open a protected page. Then log out in the UI.
       2. Press the browser Back button.
       3. Reload the page, or open the protected page URL directly.
Expected: Logout takes the user to the login page or a public page. Back and reload do not show current protected data. Either the login page is shown, or the old page saved by the browser (cached page) cannot load or change any data [A]. Opening the protected URL redirects to login.
Level: E2E
```

```
TC-R1-22 | P2 | The session still works after a page reload and in a new tab of the same browser
Preconditions: Owner is logged in through the UI.
Steps: 1. Reload the page.
       2. Open the app in a new tab of the same browser context (the same browser profile, with the same cookies).
Expected: Owner is still logged in in both cases and does not need to enter the credentials again [A].
Level: E2E
```

```
TC-R1-23 | P3 | The password input is hidden
Preconditions: A browser with no session.
Steps: 1. Open the login form and type into the password field.
Expected: The typed characters are hidden, for example shown as dots (the input is a password-type field) [A].
Level: E2E
```

```
TC-R1-24 | P1 | Script code in the email field does not run in the browser
Preconditions: A browser with no session.
Steps: 1. Enter an email such as `"><img src=x onerror=alert(1)>` or `<script>alert(1)</script>@x.com`, with any password, and submit. (This checks for XSS, cross-site scripting: an attacker's script that runs inside the app's page.)
       2. Watch for pop-up dialogs or running scripts while the error or validation message appears.
Expected: No script runs and no dialog appears. If the page shows the input back, it shows it as plain text that does nothing [A].
Level: E2E
```

```
TC-R1-25 | P3 | After login, the user goes back to the protected page they first asked for
Preconditions: A browser with no session. A protected URL deep inside the app is known.
Steps: 1. Open the deep protected URL. You are redirected to login.
       2. Log in as Owner.
       3. If the redirect uses a "return to" parameter in the URL, change it to point to an external website, and do steps 1–2 again.
Expected: The user arrives on the page they first asked for [A]. An external return URL is ignored, and the user stays inside the app [A]. (This prevents an open redirect: a link to the real app that sends the user to an attacker's website after login.)
Level: E2E
```

#### Subjective UX (Manual)

```
TC-R1-26 | P3 | The login form is clear and works with the keyboard only
Preconditions: A browser with no session.
Steps: 1. Check the labels, placeholder texts and error messages of the login form.
       2. Use only the keyboard: move between the fields with Tab, and submit with Enter.
       3. Check what the form does while it is submitting (for example, double-click the submit button).
Expected: The fields have clear labels, and the error messages are easy to understand. Tab moves through the fields in a logical order. Enter submits the form. A double submit does not cause errors or do the action twice [A].
Level: Manual
```

---

## Coverage table

| Requirement | Test cases | P1 | P2 | P3 | API | E2E | Manual | Total |
|---|---|---|---|---|---|---|---|---|
| R1 | TC-R1-01 … TC-R1-26 | 7 | 14 | 5 | 17 | 8 | 1 | 26 |
| **Total** | | **7** | **14** | **5** | **17** | **8** | **1** | **26** |

P1 share: 7 / 26 = 27%. This is above the usual 15–20%, because the only requirement is about security.

By case:
- **P1 (7):** TC-R1-02, TC-R1-08, TC-R1-09, TC-R1-10, TC-R1-11, TC-R1-12, TC-R1-24
- **P2 (14):** TC-R1-01, 03, 04, 05, 07, 13, 14, 16, 17, 18, 19, 20, 21, 22
- **P3 (5):** TC-R1-06, 15, 23, 25, 26
- **API (17):** TC-R1-01 … TC-R1-17
- **E2E (8):** TC-R1-18 … TC-R1-25
- **Manual (1):** TC-R1-26

**All P1 IDs:** TC-R1-02, TC-R1-08, TC-R1-09, TC-R1-10, TC-R1-11, TC-R1-12, TC-R1-24

**All E2E IDs:** TC-R1-18, TC-R1-19, TC-R1-20, TC-R1-21, TC-R1-22, TC-R1-23, TC-R1-24, TC-R1-25
