# Stage 3 — Exploration notes (R1 Authentication)

**App:** Virtual Data Room. Owners keep PDFs in nested folders in "data rooms" and share them read-only.
**Front end (`BASE_URL`):** `https://virtual-data-room-ten.vercel.app` — a React single-page app (Vite).
**API (`API_BASE_URL` in `.env`):** points at the same Vercel host, **but the SPA actually calls a different API**:
`https://virtual-data-room-production.up.railway.app` (NestJS/Express, hard-coded in the JS bundle as the axios `baseURL`).

> **Blocker for Stage 4 / early finding:** `API_BASE_URL` in `.env` is the Vercel front-end host, not the real API host the app uses. API tests must target the Railway host. The orchestrator / human QA should decide whether to update `.env` (`API_BASE_URL=https://virtual-data-room-production.up.railway.app`) before Stage 4. All API facts below are from the Railway host.

Explored: 2026-10-20. Secrets (passwords, tokens) are never shown below.

---

## 1. How I explored

- Read the SPA bundle (`/assets/index-*.js`) to find routes, API paths and auth handling (no guessing).
- The API publishes **Swagger/OpenAPI** at `GET /docs` and `GET /docs-json` (no auth). This is the authoritative route + schema list and is quoted below.
- Ran anonymous and authenticated HTTP calls against the API for the P1/P2 flows.
- Used Playwright MCP (Chromium) for the login page, the failed-login error UI, and the anonymous redirect.
- **Lockout budget respected:** 1 wrong-password attempt against the Owner account only; 10 failed logins against an unregistered `qa-agent-<ts>@example.invalid` address; no wrong-password attempts against the Shared account.

---

## 2. Auth model (the big picture)

- **Stateless JWT bearer token.** Login returns `{ "accessToken": "<JWT>" }`. JWT header `{"alg":"HS256","typ":"JWT"}`; payload claims `sub`, `email`, `iat`, `exp`; **lifetime 7 days**; **no refresh token** (per OpenAPI: "log in again after expiry").
- **No cookies at all.** Login sends **no `Set-Cookie`**. The SPA stores the token in **`localStorage` under key `dataroom_token`** and sends it as `Authorization: Bearer <token>` on every API call (axios request interceptor). So G-16 cookie flags (HttpOnly/Secure/SameSite) do not apply — there is no session cookie.
- **No server-side session store and no logout endpoint** (see §5). "Logout" only deletes the localStorage token in the browser.
- **Access model (from OpenAPI):** every resource resolves to OWNER (full) or VIEWER (read-only, via a share on it or any folder/room above). **Missing and forbidden both return `404`** so ids cannot be probed. Writes need OWNER; reads need ≥ VIEWER.

---

## 3. Routes

### Front-end routes (SPA, from the bundle)
Public: `/login`, `/register`, `/share/:token`, `/share/:token/files/:fileId`, `/share/:token/folders/:folderId`.
Protected (redirect to `/login` if no token): `/` (My data rooms), `/room/:id`, `/folder/:id`, `/file/:id`, `/shared-with-me`, `/shared-with-me/room/:id`, `/shared-with-me/folder/:id`, `/shared-with-me/file/:id`. `*` → not-found.

- **Login route:** `/login`. **Register:** `/register` (exists — see G-19; not used).
- **No logout route in the UI router** — logout is a header button, not a page.

### API routes (from `GET /docs-json`)
Auth: `POST /auth/login`, `POST /auth/register`, `GET /auth/me` (protected). **No `/auth/logout`** (confirmed 404 for POST/GET/DELETE on `/auth/logout`, `/logout`, `/auth/signout`).
Public (no token): `GET /health`, `GET /docs`, `GET /docs-json`, and everything under `GET /public/{token}...`.
Protected (bearer token): `GET /data-rooms`, `POST /data-rooms`, `GET /data-rooms/{id}`, `/data-rooms/{id}/contents`, `/data-rooms/{id}/folders`; `POST /folders`, `GET /folders/{id}/contents|breadcrumbs|delete-preview`, `PATCH/DELETE /folders/{id}`; `POST /files/upload-intent`, `POST /files/{id}/complete`, `GET /files/{id}` + `/view-url` + `/download-url`, `PATCH /files/{id}` + `/move`, `DELETE /files/{id}`; `POST /shares`, `GET /shares`, `GET /shares/received`, `DELETE /shares/{id}`.

---

## 4. Auth API calls (shapes; values redacted)

### POST /auth/login
Request (JSON): `{ "email": string(≤255), "password": string(≤72) }` (`LoginDto`).
- **Success 200:** `{ "accessToken": "<JWT>" }` (`TokenResponseDto`). No `Set-Cookie`. No password/hash in body (verified). Response has **no `Cache-Control`** header.
- **Wrong credentials / unknown email 401:** `{"message":"Invalid email or password","error":"Unauthorized","statusCode":401}` — **identical for both cases** (good for enumeration, G-06).
- **Validation 400:** `{"message":[ ...one string per bad field... ],"error":"Bad Request","statusCode":400}`. Messages are generic ("Enter a valid email", "Enter your password", "password must be a string", "password must be shorter than or equal to 72 characters"). No stack traces, no DB errors.

### GET /auth/me  (protected)
- **200:** `{ id, email, name, createdAt }` (`UserResponseDto`). `email` is always lowercase. **No password/hash field.** `sub` claim in the JWT equals `id`. No `Cache-Control` header.
- Owner token returns Owner; Shared token returns Shared (verified).

### POST /auth/register  (exists; NOT exercised — G-19)
`{ name(≤100), email(≤255), password(8–72) }`; 201 → token; 409 on duplicate email.

**Error envelope (all endpoints):** `{ statusCode, message, error }`; `message` is a string, or an array of strings for 400 body-validation. `error` is absent on bare 401s from the auth guard.

---

## 5. How the session is carried / logout

- **Carrier:** `Authorization: Bearer <JWT>` header. Token in `localStorage['dataroom_token']`. **No cookie.**
- **Before login:** no token in localStorage, no cookie (verified in a clean browser). → **TC-R1-17 (session fixation) is N/A**: there is no pre-login session id to compare, and anyway the only id is a server-signed JWT minted at login (G-17).
- **Logout (G-02):** the "Sign out" button runs a client-only callback — removes `dataroom_token`, clears the query cache, navigates to `/login`. **There is no server call and no server-side invalidation.** The JWT stays valid until its 7-day `exp`. I confirmed a token kept working (`GET /auth/me` → 200) and that **no logout endpoint exists**.
- **401 handling:** an axios response interceptor, on any 401 that is not `/auth/login` or `/auth/register`, deletes the token and redirects to `/login` (unless already on `/login` or a `/share/` page).

---

## 6. Stable selectors (E2E)

**Login page `/login`:**
- Email field: `getByLabel('Email')` (also `#email`, `name="email"`, `type="email"`, `autocomplete="email"`).
- Password field: `getByLabel('Password')` (also `#password`, `name="password"`, `type="password"` → masked, `autocomplete="current-password"`). Confirms TC-R1-23 (input is masked).
- Submit: `getByRole('button', { name: 'Sign in' })`.
- Sign-up link: `getByRole('link', { name: 'Sign up' })` → `/register`.
- **Failed-login error:** a toast (sonner) inside `region "Notifications alt+T"`. Text **"Invalid email or password"** for bad credentials. Target with `getByText('Invalid email or password')`. The typed email is **not** reflected into the page; the toast shows the server message only (relevant to XSS G-05 / TC-R1-24 — React escapes, and input is not echoed).
- No `data-testid` attributes are set in the app (the bundle only has one dynamic/undefined one). Use role/label/text.

**Logged-in header (from the bundle — not reached live, see §8):**
- Nav links: `getByRole('link', { name: 'My data rooms' })` → `/`; `getByRole('link', { name: 'Shared with me' })` → `/shared-with-me`; brand link `getByRole('link', { name: 'Data Room' })` → `/`.
- A `<span>` shows the user's `name` (falls back to `email`).
- **Logout control:** `getByRole('button', { name: 'Sign out' })`.
- Breadcrumb has `aria-label="Breadcrumb"`; row action buttons use `aria-label` like `Actions for <name>`, `Download <name>`.

---

## 7. How to get a session in tests (helpers)

- `POST https://virtual-data-room-production.up.railway.app/auth/login` with `{email,password}` from `.env`, read `accessToken` from the body, send it as `Authorization: Bearer <token>`. No cookie jar needed.
- One login per role (Owner, Shared); cache the token per worker. Anonymous = no header.
- **Test data create/cleanup via API:** `POST /data-rooms {name}` → `id`; nested `POST /folders {name, parentId|dataRoomId}`; files are a 3-step upload (`POST /files/upload-intent` → `PUT` bytes to signed URL → `POST /files/{id}/complete`). Cleanup: `DELETE /folders/{id}` (cascades) and `DELETE /files/{id}`, `DELETE /shares/{id}`. Names must be unique among siblings (case-insensitive, 409 on folder clash) — use `qa-agent-<timestamp>-` prefixes. For auth-only R1 tests, `GET /auth/me` and `GET /data-rooms` are enough as "protected endpoints"; a default data room exists per account.

---

## 8. What I could NOT do (and why)

- **No authenticated browser session.** Logging the browser in needs the real password (or token) typed into a tool call; the environment's credential guard correctly blocks materializing those secrets. So the **logged-in E2E flows (TC-R1-18, 21, 22, 24, 25) were not walked live.** Selectors for the logged-in header come from the bundle (§6) and still need a live check once Stage 4 has an auth fixture that injects the token from `.env` inside the test process (where the guard allows it). The login page, failed-login error UI, and the anonymous→`/login` redirect **were** verified live.
- Did not exercise register/reset/verify/remember-me (none beyond register exist; register not used — project rule, G-19).

---

## 9. Findings against each gap (what the app actually does — NOT the agreed answer)

| Gap | What the app does |
|---|---|
| G-01 protected scope | All data endpoints need a bearer token → **401** when missing (`/auth/me`, `/data-rooms`, `/shares`, `/shares/received` all 401 anon). Public: `/health`, `/docs`, `/public/{token}...`, login, register. Front-end protected routes redirect to `/login` client-side only. |
| G-02 logout server-side | **No server-side logout.** Logout is client-only (deletes localStorage token). JWT stays valid 7 days; an old token still returned 200. |
| G-03 error responses | 401 for bad creds, 400 for validation, generic JSON envelope, no stack traces/DB errors. 404 for unknown routes, no 5xx seen. |
| G-04 password in response | No password/hash in login, `/auth/me`, or error bodies (verified). |
| G-05 XSS reflection | Typed email is not echoed to the page; errors are a toast with the server message. React auto-escapes. |
| G-06 enumeration | Unknown email and wrong password give the **same** 401 + "Invalid email or password". |
| G-07 rate limit / lockout | **No throttling observed** in 10 consecutive failed logins (all 401, ~0.4s each, no 429, no lock). Stage 4 will push 20–50 with an unregistered email. |
| G-08 safe to test | Confirmed login is stateless JWT; a few failed attempts did not affect the Owner account (still logs in). No lockout seen so far. |
| G-09 timeout | JWT `exp` = `iat` + 7 days; no refresh. No idle timeout (stateless). Can't easily get an expired token in-env. |
| G-10 browser session | Token in localStorage persists across reload/new tab/browser restart until `exp` (7 days). No "remember me" option. |
| G-11 multi-session | New login mints a new independent JWT; old token keeps working (stateless) — several concurrent sessions per user are fine. A second Owner login did not break the first token. |
| G-12 password-change/disable | No password-change or disable endpoint in the API. If added later, stateless JWTs would NOT be revoked — note for the designer. |
| G-13 max length | email ≤255, password ≤72 (enforced, 400 beyond). 10,000-char email/password → 400, no 5xx. |
| G-14 password compare | `password` capped at 72 chars (bcrypt-style). Login validation requires non-empty string; exact-match behavior (case, trailing space, null byte, 72-byte truncation) to be tested in Stage 4. |
| G-15 email matching | Email is validated (Zod `.trim().email().max(255)`) and stored/compared lowercase. **UPPERCASE Owner email + correct password → 200** (case-insensitive match). **Email with leading/trailing spaces → 400** (trimmed then rejected as needed; it does not log into another account). Malformed emails (`plainaddress`, `' OR 1=1 --`) → 400 "Enter a valid email". |
| G-16 HTTPS / cookie flags | Plain `http://` on both API and front end redirects to `https://` (301/308). Credentials in query string (`GET /auth/login?...`) → 404 (no GET route). **No session cookie exists**, so HttpOnly/Secure/SameSite are N/A; the token lives in localStorage (readable by page scripts — an XSS-exposure note, not a cookie-flag check). |
| G-17 session fixation | No session/token before login → **TC-R1-17 N/A**. |
| G-18 back button cache | `/auth/me` and `/data-rooms` responses have **no `Cache-Control: no-store`**. After client logout the token is gone, so API refetch would 401, but cached page behavior needs a live E2E check (see §8). |
| G-19 scope | `/register` route and `POST /auth/register` exist (not used). No reset/verify/SSO/2FA/remember-me seen. |
| G-20 return-to redirect | The guard uses `<Navigate to="/login" replace>` with **no `returnTo` param**; after login the app always goes to `/`. So "return to first page" is **not implemented** (open-redirect risk is therefore nil, but TC-R1-25's return-to expectation will not be met). |
| G-21 form UX | Email/password labels present; password masked; client-side Zod validation; error via toast. Keyboard/double-submit = Manual (TC-R1-26). |

---

## 10. Early findings (app behavior that already differs from R1 / a P1 expectation)

These are **candidates**, confirmed as bugs only in Stage 5.

1. **EF-1 (High, TC-R1-10 / G-02): Logout does not end the session on the server.** There is no logout endpoint; "Sign out" only deletes the browser's localStorage token. The JWT stays valid for its full 7 days — a copied/stolen token keeps working after logout. Verified: an old token still returns `GET /auth/me` → 200. TC-R1-10's hard expectation (old token rejected after logout) will fail.
2. **EF-2 (Medium→High, TC-R1-16 / G-16): The session token is stored in `localStorage`, not an HttpOnly cookie.** Page scripts can read it, so an XSS would leak the session. TC-R1-16's cookie-flag expectation cannot be met because there is no cookie. (HTTPS redirect and "no credentials in URL" parts DO hold.)
3. **EF-3 (Medium, TC-R1-13 / G-07): No rate limiting / lockout seen** in 10 failed logins. If 20–50 (Stage 4) also show no limit, brute-force is unthrottled. (This is the mirror risk of EF-1: no lockout = good for availability, bad for guessing.)
4. **EF-4 (Low/P3, TC-R1-25 / G-20): No return-to-page after login** and no `returnTo` parameter; the app always lands on `/`. TC-R1-25's "arrive on the page first requested" expectation will not be met. (No open-redirect risk, since there is no external-URL handling.)
5. **EF-5 (config blocker, not a product bug): `API_BASE_URL` in `.env` points at the Vercel front-end host, not the real API** (`...railway.app`). Must be corrected before Stage 4 API tests run.

Note: TC-R1-17 (session fixation) → **N/A** (no pre-login session). TC-R1-09 session-separation spot checks passed (Owner token stayed Owner when I added `userId`/`X-User-Id` for the Shared user; cross-user room read → 404; anon → 401) — to be asserted fully in Stage 4.
