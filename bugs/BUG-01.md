# BUG-01

```
BUG-01 | Severity: High | Requirement: R1
Title: Logout does not end the session on the server. The old token still works after "Sign out".
Environment: Chromium (for the UI steps). App: https://virtual-data-room-ten.vercel.app. API: https://virtual-data-room-production.up.railway.app. Accounts: Owner (logs out) and Shared (second user, session must keep working).
Steps to reproduce:
  1. Log in as Owner through the API:
     curl -s -X POST https://virtual-data-room-production.up.railway.app/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"<OWNER_EMAIL>","password":"<OWNER_PASSWORD>"}'
     Save "accessToken" from the answer as <owner_token>.
  2. Log in as Shared the same way. Save the token as <shared_token>.
  3. Check that <owner_token> works:
     curl -s -o /dev/null -w "%{http_code}\n" \
       https://virtual-data-room-production.up.railway.app/auth/me \
       -H "Authorization: Bearer <owner_token>"
     Result: 200.
  4. Log Owner out in the UI: open the app in Chromium, log in as Owner, click the "Sign out" button in the header. The app opens /login.
     (Through the API: there is no logout route. POST /auth/logout returns 404.)
  5. Repeat step 3 with the same <owner_token>.
  6. Repeat step 3 with <shared_token>.
Expected: Per R1 and G-02 (hard expectation, test case TC-R1-10): after logout the server ends Owner's session. Step 5 is rejected with 401 or 403. Step 6 still returns 200 (the Shared user's session is not affected).
Actual:
  - Step 5: GET /auth/me with Owner's old token returns 200. The token still works.
  - Step 6: 200 (correct).
  - The UI "Sign out" only deletes the token from the browser (localStorage key "dataroom_token") and opens /login. It sends no request to the API.
  - The API has no logout route. POST, DELETE and GET /auth/logout, POST /logout, POST /auth/signout and POST /auth/revoke all return 404. The API route list (GET /docs-json) has only 3 auth routes: /auth/register, /auth/login, /auth/me.
  - The token is valid for 7 days (JWT "exp" claim). So a copied or stolen token keeps working for up to 7 days after the user signs out. Nobody can stop it: not the user and not the server.
Layer: both
Evidence:
  - Test: "TC-R1-10 Logout ends the session on the server; other users' sessions keep working" (project api, tests/api)
  - test-results/auth-access-control-TC-R1--daa79-users-sessions-keep-working-api/error-context.md
  - test-results/results.json (annotation "logout call": POST /auth/logout returned 404)
  - playwright-report/index.html
  - Second check by API only and by UI (Chromium) only: reports/test-run.md, section 2.1. Both reproduced the bug.
  - No trace or screenshot: traces are off on purpose, because they would record tokens.
```

## Notes

- **Related gap:** G-02 in `reports/gaps.md`. R1 does not mention logout. G-02 marks "the old token is rejected after logout" as a hard expectation, because it protects against unauthorized access.
- **Why both layers:** the UI deletes only its own copy of the token (UI part). The API has no way to end a session or block a token (API part). A fix in the UI alone is not enough.
- **Why High and not Critical:** this is a P1 access-control case. But an attacker must first get a copy of the token. Severity is a suggestion. The human QA makes the final call.
- **Open question for the product owner (G-02, question 2):** must logout end only this session, or all sessions of the user ("log out everywhere")?
