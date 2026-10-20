# BUG-02

> **Note:** Depends on the product owner's answer to GA-01 / G-07 (R1 does not state throttling). Close if throttling is not required.

```
BUG-02 | Severity: Medium | Requirement: R1
Title: Failed logins are never slowed down or blocked. Unlimited password guessing is possible.
Environment: API only (no browser). API: https://virtual-data-room-production.up.railway.app. App: https://virtual-data-room-ten.vercel.app (not used in the steps). Account role: anonymous (no session), with an unregistered email.
Steps to reproduce:
  1. Choose an email that is not registered, for example qa-agent-<timestamp>-throttle@example.invalid. Do not use a real test account (G-08: the lockout rules are unknown).
  2. Send 30 failed logins in a row from one computer:
     for i in $(seq 1 30); do
       curl -s -o /dev/null -w "%{http_code} %{time_total}\n" \
         -X POST https://virtual-data-room-production.up.railway.app/auth/login \
         -H "Content-Type: application/json" \
         -d '{"email":"qa-agent-<timestamp>-throttle@example.invalid","password":"<any_wrong_password>"}'
     done
  3. Look at each status code and answer time. Also look at the answer headers (curl -i) for "Retry-After" or "RateLimit-*".
Expected: Per TC-R1-13 [A] (assumption from G-07 / GA-01): after a reasonable number of failures, the server limits or temporarily blocks more attempts. For example: status 429 ("too many requests"), a general "too many attempts" message, or clearly slower answers. The block is temporary. It never causes a 5xx.
Actual:
  - Test run: 20 failed logins in a row. All 20 returned 401 "Invalid email or password". 0 returned 429. No 5xx. Average answer time: first 5 = 283 ms, last 5 = 295 ms (not slower).
  - Second check (API only, a new unregistered email): 30 failed logins in a row, all 401. Average time: first 5 = 256 ms, last 5 = 264 ms. No "Retry-After" or "RateLimit-*" header. No lock message. Then 20 failed logins sent at the same time: all 401.
  - In total, 70 failed logins from one client in about one minute. None was limited. So an attacker can try passwords as fast as the network allows (brute force: guessing many passwords).
Layer: API
Evidence:
  - Test: "TC-R1-13 Many failed logins in a row are slowed down or blocked (throttling)" (project api, tests/api)
  - test-results/auth-login-TC-R1-13-Many-f-92049-down-or-blocked-throttling--api/error-context.md
  - test-results/results.json (annotation "observed": 20 attempts: 401=20, 429=0, ...)
  - playwright-report/index.html
  - Second check: reports/test-run.md, section 2.2.
```

## Notes

- **Depends on a decision:** R1 does not say that failed logins must be limited. The expected result comes from the assumption in G-07 and GA-01 (`reports/gaps.md`). If the product owner says throttling is not required, close this bug. The test-designer then changes TC-R1-13.
- **Limit of this check:** we used only unregistered emails (G-08). We did not send wrong passwords to the real accounts. If the app limits only real accounts, this test cannot see it. A limit per IP address (computer address) or per email would have shown up, and it did not.
- **Why Medium:** brute force is a real security risk. But the requirement does not ask for a limit, and TC-R1-13 is P2. Severity is a suggestion. The human QA makes the final call.
