# Test Cases — Data Room

Source of truth: `requirements/requirements.pdf` (R1–R16, E1–E2).
Accounts: **Owner** = `OWNER_EMAIL`, **User B** = `SHARED_EMAIL` (acts as "not shared with" user until a share is created), **Anonymous** = logged-out browser / request without auth.
Expected results that go beyond the literal requirement text are marked **[A]** (assumption) and will be listed with a product-owner question in `reports/gaps.md` (Stage 2).

**Priority:** P1 only where a failure means unauthorized access, data loss or a security hole; access checks are asserted at API level, so UI duplicates of them are P2. **Level:** E2E only where a real browser is required (drag-and-drop, upload progress, file viewer, breadcrumbs, warnings and states shown to the user, script execution); everything else checkable over HTTP is API; subjective UX checks are Manual.

---

## 1. Requirement checklist (risk-ranked)

| Rank | ID | Requirement (short) | Risk area | Why it ranks here |
|---|---|---|---|---|
| 1 | R2 | Data Room is private to owner unless shared | Access control | Silent data leak to other users |
| 2 | R16 | Owner can revoke access | Access control | Revoked user keeps access = leak |
| 3 | R13 | Share room/folder/file read-only incl. nested content | Access control | Viewer able to write, or scope leaks beyond shared item |
| 4 | R15 | Permissioned mode (specific users only) | Access control | Non-listed user gains access |
| 5 | R14 | Public link mode | Access control | Link guessable / works after disable / grants write |
| 6 | R1 | Email/password authentication | Security | Unauthenticated access to API |
| 7 | R7 | Delete folder with all nested content + warning | Data integrity | Orphaned/undeleted data, data loss without warning |
| 8 | E2 | Delete folder while a shared user is viewing it | Data integrity / access | Stale view exposing deleted data, crashes |
| 9 | R12 | Delete a file | Data integrity | File still downloadable after delete |
| 10 | R11 | Move a file | Data integrity | File lost/duplicated, moved across rooms or into foreign folder |
| 11 | R10 | Rename file, resolve name conflicts | Data integrity | Overwrite of another file |
| 12 | E1 | Upload files with the same name | Data integrity | Silent overwrite |
| 13 | R6 | Rename a folder | Data integrity | Conflicts, broken paths |
| 14 | R8 | Upload PDFs (multi, DnD, per-file progress) | Core feature | Non-PDF accepted, partial failures hidden |
| 15 | R4 | Create / nest folders | Core feature | |
| 16 | R9 | View a file in UI | Core feature | |
| 17 | R5 | Folder contents + breadcrumbs | Core feature / UX | |
| 18 | R3 | Clean UX, edge/error states, no unimplemented features | UX | |

---

## 2. Test cases

### R2 — Data Room ownership & privacy

```
TC-R2-01 | P2 | Owner's Data Room is not listed for another user
Preconditions: Owner has a Data Room with a folder and a file; nothing shared with User B.
Steps: 1. As User B, list Data Rooms (UI home + API list endpoint).
Expected: Owner's room does not appear. Owner sees it in their own list.
Level: API
```
```
TC-R2-02 | P1 | Another user cannot read an unshared room/folder/file by direct ID
Preconditions: Owner's room, folder and file IDs known; nothing shared.
Steps: 1. As User B, GET the room, the folder contents and the file metadata by ID. 2. Try the file download/content URL.
Expected: 403 or 404 on every request; no names, metadata or file bytes in the response body.
Level: API
```
```
TC-R2-03 | P1 | Another user cannot modify an unshared room's content by direct ID
Preconditions: As TC-R2-02.
Steps: As User B: 1. Create a folder inside Owner's room/folder. 2. Upload a file to Owner's folder. 3. Rename Owner's folder and file. 4. Move Owner's file. 5. Delete Owner's file and folder. 6. Change sharing settings of Owner's room.
Expected: Every request rejected (403/404). As Owner, verify nothing changed.
Level: API
```
```
TC-R2-04 | P1 | Unauthenticated requests are rejected on all content endpoints
Preconditions: Owner's room/folder/file IDs known; no public link.
Steps: 1. Without auth, call list/read/create/rename/move/delete/upload/download endpoints.
Expected: 401 (or redirect to login for pages); no data returned; nothing modified.
Level: API
```
```
TC-R2-05 | P2 | Direct URL to unshared room in browser shows no content to another user
Preconditions: Owner's room URL known.
Steps: 1. Log in as User B in browser. 2. Open Owner's room/folder/file URL.
Expected: "Not found / no access" state, no names or file preview visible, no flash of content before redirect.
Level: Manual
```
```
TC-R2-06 | P2 | Owner of a shared room keeps full control; viewer cannot become owner
Preconditions: Owner's room shared with User B.
Steps: 1. As User B, try to delete the room, change sharing, transfer ownership (if API exists).
Expected: Rejected. Room still owned by Owner.
Level: API
```
```
TC-R2-07 | P2 | New user starts with no rooms from other users
Preconditions: User B has never been shared anything (or all shares revoked).
Steps: 1. As User B, open the rooms list.
Expected: Only User B's own rooms; empty state if none.
Level: API
```

### R16 — Revoke access

```
TC-R16-01 | P1 | Revoking a permissioned share removes access immediately (API)
Preconditions: Owner's folder shared with User B (permissioned); User B can read it.
Steps: 1. Owner revokes User B. 2. As User B, re-request the folder, its children and a file download URL used before.
Expected: 403/404 on all; folder no longer in User B's "shared with me" list.
Level: API
```
```
TC-R16-02 | P1 | Revoking a public link makes the link stop working
Preconditions: Owner's room has a public link; link opens anonymously.
Steps: 1. Owner disables/revokes the link. 2. Open the link anonymously and as User B. 3. Request a file download URL obtained via the link.
Expected: Link returns "no access / not found"; file content not downloadable.
Level: API
```
```
TC-R16-03 | P2 | Revoked user with page open loses access on next action
Preconditions: User B viewing shared folder in browser.
Steps: 1. Owner revokes in another session. 2. User B clicks into a subfolder / opens a file / refreshes.
Expected: Access-denied state shown; no further content loaded. [A] No real-time push required, but no stale data after next request.
Level: E2E
```
```
TC-R16-04 | P2 | Previously obtained file/download URLs stop working after revoke
Preconditions: User B opened a file (record any signed/direct file URL).
Steps: 1. Owner revokes. 2. User B (and anonymous) requests the recorded file URL.
Expected: Denied. [A] If signed URLs with expiry are used, expiry is short; record actual TTL as finding.
Level: API
```
```
TC-R16-05 | P2 | Revoking one user does not affect other shares
Preconditions: Folder shared with User B AND has a public link (only 2 accounts available).
Steps: 1. Owner revokes User B only. 2. Check public link still works; 3. Revoke public link; check User B's share state unchanged by that action (re-share first).
Expected: Each revoke affects only its own grant.
Level: API
```
```
TC-R16-06 | P2 | Only the owner can revoke
Preconditions: Folder shared with User B.
Steps: 1. As User B, call revoke/unshare on the share (including revoking own or others' access, disabling public link).
Expected: [A] Rejected for public link and others; self-removal from "shared with me" may be allowed but must not alter the owner's settings.
Level: API
```
```
TC-R16-07 | P1 | Revoke on parent removes inherited access to nested items
Preconditions: Folder F (with subfolder S and file X in S) shared with User B.
Steps: 1. Owner revokes F. 2. As User B, request S and X by ID.
Expected: Denied on S and X.
Level: API
```
```
TC-R16-08 | P2 | Re-sharing after revoke restores access
Preconditions: Share revoked as in TC-R16-01.
Steps: 1. Owner shares again. 2. User B opens folder.
Expected: Access restored; for public link [A] a new link token is generated (old one stays dead).
Level: API
```
```
TC-R16-09 | P2 | Revoke UI: owner sees current grants and can revoke each
Preconditions: Folder shared with User B + public link.
Steps: 1. Owner opens share dialog. 2. Revoke User B. 3. Disable public link.
Expected: Dialog lists User B and link state; after revoke, list updates and confirmation shown.
Level: Manual
```

### R13 — Share room / folder / file, read-only, including nested content

```
TC-R13-01 | P2 | Share a whole Data Room: user sees all nested folders and files
Preconditions: Room with folders 3 levels deep and files at each level.
Steps: 1. Owner shares room with User B. 2. As User B, list every level and open each file.
Expected: Full tree visible and readable.
Level: API
```
```
TC-R13-02 | P1 | Share a folder: only that folder's subtree is visible
Preconditions: Room with sibling folders F1, F2; F1 has nested content.
Steps: 1. Share F1 with User B. 2. As User B, read F1 subtree; read F2, the room root and parent by ID.
Expected: F1 subtree readable; F2 and room root/parent listing denied or not exposing siblings.
Level: API
```
```
TC-R13-03 | P1 | Share a single file: only that file is accessible
Preconditions: Folder with files X and Y.
Steps: 1. Share X with User B. 2. As User B, read X; read Y and parent folder by ID.
Expected: X readable; Y and folder listing denied.
Level: API
```
```
TC-R13-04 | P1 | Shared user cannot write — folders
Preconditions: Folder shared with User B.
Steps: As User B via API: create subfolder, rename folder, delete folder, delete subfolder.
Expected: All rejected (403); Owner verifies no changes.
Level: API
```
```
TC-R13-05 | P1 | Shared user cannot write — files
Preconditions: Folder with file shared with User B.
Steps: As User B via API: upload into folder, rename file, move file (within shared folder and into User B's own room), delete file.
Expected: All rejected; file stays in place unchanged.
Level: API
```
```
TC-R13-06 | P1 | Shared user cannot re-share or change share settings
Preconditions: Folder shared with User B.
Steps: As User B: create public link, add another user, change mode.
Expected: Rejected.
Level: API
```
```
TC-R13-07 | P2 | Viewer UI hides write actions
Preconditions: Folder shared with User B.
Steps: 1. As User B open shared folder in browser. 2. Look for upload, new folder, rename, move, delete, share controls; try drag-and-drop a PDF onto the folder.
Expected: No write controls shown/enabled; DnD does not upload.
Level: E2E
```
```
TC-R13-08 | P2 | Content added later to a shared folder is visible to viewer
Preconditions: Folder F shared with User B.
Steps: 1. Owner creates subfolder and uploads file into F after sharing. 2. As User B, list F.
Expected: New items visible (sharing includes nested content dynamically).
Level: API
```
```
TC-R13-09 | P2 | Moving a file out of a shared folder removes viewer access to it
Preconditions: F shared with User B; F contains file X; G not shared.
Steps: 1. Owner moves X from F to G. 2. As User B, read X by ID.
Expected: Denied. (And reverse: moving file into F grants access.)
Level: API
```
```
TC-R13-10 | P2 | Owner can share the same item in both modes; sharing status is shown
Preconditions: Folder.
Steps: 1. Enable public link and add User B. 2. Reopen share dialog.
Expected: Both grants persisted and displayed. [A] Modes can coexist.
Level: API
```
```
TC-R13-11 | P2 | Viewer can view and download shared files [A]
Preconditions: File shared with User B.
Steps: 1. As User B request the file metadata and content/download endpoint.
Expected: Content returned (200, correct bytes). [A] Whether download is allowed under "read-only" — record behavior. Viewer rendering is covered by TC-R9-03.
Level: API
```

### R15 — Permissioned mode (specific users only)

```
TC-R15-01 | P2 | Share with a specific registered user by email
Preconditions: Folder; User B not yet shared.
Steps: 1. Owner adds SHARED_EMAIL in permissioned mode. 2. As User B, open "shared with me" and the folder.
Expected: Folder visible and readable by User B.
Level: API
```
```
TC-R15-02 | P1 | Permissioned share is not accessible anonymously or via a guessed link
Preconditions: Folder shared only to User B (no public link).
Steps: 1. Copy the URL User B uses. 2. Open it anonymously.
Expected: Login required / denied; no content.
Level: API
```
```
TC-R15-03 | P2 | Share with an email that has no account
Preconditions: Folder.
Steps: 1. Owner shares with a non-existent email (e.g. `qa-agent-<ts>@example.invalid`).
Expected: [A] Clear error or pending invite; no crash; no account created.
Level: API
```
```
TC-R15-04 | P2 | Invalid email input is rejected
Steps: 1. Share with "", "not-an-email", whitespace, very long string.
Expected: Validation error, no grant created.
Level: API
```
```
TC-R15-05 | P2 | Sharing with self (owner's own email) is handled
Steps: 1. Owner shares with OWNER_EMAIL.
Expected: [A] Rejected or no-op with message; no duplicate entries.
Level: API
```
```
TC-R15-06 | P3 | Sharing twice with the same user does not create duplicates
Steps: 1. Share folder with User B twice.
Expected: One grant listed.
Level: API
```
```
TC-R15-07 | P2 | Email matching is case-insensitive [A]
Steps: 1. Share with SHARED_EMAIL in upper case. 2. As User B open.
Expected: [A] User B gets access.
Level: API
```
```
TC-R15-08 | P2 | Permissioned sharing flow in the UI
Steps: 1. Owner opens share dialog, chooses specific users, enters SHARED_EMAIL, saves. 2. User B logs in and finds item.
Expected: Confirmation shown; item reachable from User B's UI.
Level: Manual
```
```
TC-R15-09 | P1 | Permissioned share grants access only to the listed users
Preconditions: Folder F with a subfolder and a file, shared in permissioned mode only with `qa-agent-<ts>@example.invalid` (User B not listed); no public link. [A] Depends on TC-R15-03: if sharing with a non-registered email is rejected, share F with User B and use a sibling folder F2 that has a permissioned share to the same owner-only list.
Steps: 1. As User B, request F, its subfolder and the file content URL by ID. 2. List User B's "shared with me".
Expected: 403/404 on every request; F not listed for User B.
Level: API
```

### R14 — Public link mode

```
TC-R14-01 | P1 | Public link opens content anonymously, read-only
Preconditions: Folder with nested content; public link enabled.
Steps: 1. Open link in logged-out context. 2. Navigate subfolders, open a file. 3. Try write APIs with the link token.
Expected: Content viewable; all writes rejected.
Level: API
```
```
TC-R14-02 | P1 | Public link scope is limited to the shared item
Preconditions: Public link on folder F1; sibling F2 exists.
Steps: 1. Using the link's session/token, request F2, room root, parent by ID.
Expected: Denied.
Level: API
```
```
TC-R14-03 | P2 | Public link token is not guessable
Steps: 1. Create 2 links; inspect tokens.
Expected: [A] Long random token (≥ 128-bit), not sequential or derived from item ID; changing one char gives "not found".
Level: API
```
```
TC-R14-04 | P2 | Item without public link is not reachable via public-link route
Preconditions: Folder with no public link.
Steps: 1. Call the public-link route with the folder ID instead of a token, or with an empty/forged token.
Expected: Not found.
Level: API
```
```
TC-R14-05 | P2 | Public link works for a logged-in non-owner user
Steps: 1. As User B (not in permissioned list) open the link.
Expected: Read-only access; the item [A] is not added to User B's own rooms with write rights.
Level: API
```
```
TC-R14-06 | P2 | Copy public link from the UI and open it in a fresh browser
Steps: 1. Owner enables link, clicks copy. 2. Open copied URL in a new anonymous context.
Expected: Link copied (confirmation shown), opens the shared item read-only with file viewer working.
Level: Manual
```
```
TC-R14-07 | P2 | Public link on a single file
Steps: 1. Enable link on one file. 2. Open anonymously.
Expected: File viewer shows only that file; no folder navigation to siblings.
Level: API
```

### R1 — Authentication

```
TC-R1-01 | P2 | Login with valid email/password
Steps: 1. Log in with OWNER_EMAIL/OWNER_PASSWORD.
Expected: Session established; user's rooms shown.
Level: API
```
```
TC-R1-02 | P2 | Login with wrong password is rejected with a generic error
Steps: 1. Log in with OWNER_EMAIL and wrong password. 2. Log in with an unknown email.
Expected: 401/400, same generic message for both (no user enumeration); no session.
Level: API
```
```
TC-R1-03 | P2 | Protected pages redirect to login when logged out
Steps: 1. Open room/folder URLs without a session.
Expected: Redirect to login; after login [A] returned to original URL.
Level: Manual
```
```
TC-R1-04 | P2 | Logout invalidates the session
Steps: 1. Log in, capture token/cookie. 2. Log out. 3. Reuse the old token on an API call.
Expected: 401.
Level: API
```
```
TC-R1-05 | P1 | Forged / expired / malformed token is rejected
Steps: 1. Call APIs with a tampered token, a random string, empty Bearer.
Expected: 401, no stack trace in body.
Level: API
```
```
TC-R1-06 | P2 | Login form validation
Steps: 1. Submit empty fields; invalid email format.
Expected: Inline validation messages, no request or 400 handled gracefully.
Level: Manual
```
```
TC-R1-07 | P2 | Session persists across page reload
Steps: 1. Log in. 2. Reload.
Expected: Still logged in.
Level: Manual
```
```
TC-R1-08 | P3 | Google sign-in, if shown, works end-to-end; if not implemented, not shown (R3)
Steps: 1. Inspect login page.
Expected: Either working Google sign-in or no button.
Level: Manual
```
```
TC-R1-09 | P3 | Password field is masked and credentials not in URL
Steps: 1. Inspect login form and network request.
Expected: type=password; credentials sent in body over HTTPS.
Level: Manual
```

### R7 — Delete folder with nested content + warning

```
TC-R7-01 | P1 | Delete a folder with nested content shows a warning listing what will be deleted
Preconditions: Folder F with 2 subfolders and 3 files nested.
Steps: 1. Owner clicks delete on F.
Expected: Confirmation dialog states that F and its contents will be deleted, [A] with counts or names of subfolders/files.
Level: E2E
```
```
TC-R7-02 | P2 | Cancelling the warning deletes nothing
Steps: 1. Open delete dialog for F. 2. Cancel / Esc / click outside.
Expected: F and all children still exist (verify via API).
Level: E2E
```
```
TC-R7-03 | P1 | Confirmed delete removes folder and all descendants
Preconditions: F with 3-level nested tree and files.
Steps: 1. Delete F via API. 2. Request every descendant folder and file by ID; request file content URLs.
Expected: All return 404; parent listing no longer shows F; file bytes not retrievable.
Level: API
```
```
TC-R7-04 | P2 | Deleting a folder does not affect siblings or parent
Preconditions: Parent P with F and sibling G (with files).
Steps: 1. Delete F.
Expected: P and G with contents intact.
Level: API
```
```
TC-R7-05 | P2 | Deleting a shared folder removes access for shared users and public link
Preconditions: F shared with User B and via public link.
Steps: 1. Owner deletes F. 2. User B and anonymous request F and its file.
Expected: 404; F gone from User B's "shared with me".
Level: API
```
```
TC-R7-06 | P2 | Delete an empty folder
Expected: Warning (may be simpler); folder removed.
Level: API
```
```
TC-R7-07 | P2 | Delete an already deleted folder / non-existent ID
Steps: 1. Delete F twice.
Expected: Second call 404, no 500.
Level: API
```
```
TC-R7-08 | P2 | Deleting a Data Room root [A]
Steps: 1. Try to delete the room itself (if supported).
Expected: [A] Same warning semantics as folder; all content removed.
Level: API
```

### E2 — Deleting a folder that a shared user is viewing

```
TC-E2-01 | P2 | Viewer's open folder is deleted: next action shows a clear "no longer available" state
Preconditions: F (with files) shared with User B; User B has F open in browser.
Steps: 1. Owner deletes F (other session). 2. User B clicks a file, opens a subfolder, refreshes.
Expected: Friendly "folder was deleted / not available" message, navigation back to a valid location; no crash, no blank page, no stale file content served.
Level: E2E
```
```
TC-E2-02 | P1 | Viewer with a file open from a deleted folder cannot fetch it anymore
Preconditions: User B has a file viewer open from F.
Steps: 1. Owner deletes F. 2. User B reloads viewer / requests file content URL.
Expected: 404; viewer shows not-available state.
Level: API
```
```
TC-E2-03 | P2 | Viewer inside a deeply nested subfolder of a deleted folder
Preconditions: User B viewing F/S1/S2.
Steps: 1. Owner deletes F. 2. User B clicks a breadcrumb to F/S1.
Expected: Not-available state; breadcrumbs do not lead to error pages with stack traces.
Level: Manual
```
```
TC-E2-04 | P2 | Public-link viewer of a deleted folder
Steps: As TC-E2-01 with an anonymous public-link viewer.
Expected: Same graceful state.
Level: Manual
```
```
TC-E2-05 | P3 | Real-time update of viewer when folder is deleted [A]
Steps: 1. User B idle on F. 2. Owner deletes F. 3. Observe without interaction.
Expected: [A] Not required; record whether UI updates live.
Level: Manual
```

### R12 — Delete a file

```
TC-R12-01 | P1 | Delete a file removes it and its content
Steps: 1. Upload X. 2. Delete X via API. 3. Request X metadata and content URL; list folder.
Expected: 404 for X; folder no longer lists X.
Level: API
```
```
TC-R12-02 | P2 | Deleting a file does not affect other files (incl. same-name in other folders)
Preconditions: X in F, another file named X in G, Y in F.
Steps: 1. Delete X in F.
Expected: G/X and F/Y intact.
Level: API
```
```
TC-R12-03 | P2 | Deleted shared file is not accessible to viewer
Preconditions: File shared with User B (file-level and via folder).
Steps: 1. Owner deletes. 2. User B requests.
Expected: 404.
Level: API
```
```
TC-R12-04 | P2 | Delete file from UI with confirmation
Steps: 1. Click delete on file. 2. Confirm.
Expected: [A] Confirmation shown; file disappears from list; success feedback.
Level: Manual
```
```
TC-R12-05 | P2 | Delete non-existent / already-deleted file
Expected: 404, no 500.
Level: API
```

### R11 — Move a file

```
TC-R11-01 | P2 | Move file to another folder in the same room
Steps: 1. Move X from F to G via API. 2. List F and G; read X.
Expected: X only in G; content unchanged (same size/hash); same file ID [A].
Level: API
```
```
TC-R11-02 | P1 | Move into a folder with an existing file of the same name
Preconditions: F/X.pdf and G/X.pdf.
Steps: 1. Move F/X.pdf to G.
Expected: No silent overwrite: [A] rejected with conflict error or auto-renamed (consistent with R10/E1). Both files' contents preserved.
Level: API
```
```
TC-R11-03 | P1 | Cannot move a file into another user's room/folder
Preconditions: User B owns a room; Owner knows a folder ID of it (have User B create it).
Steps: 1. Owner moves own file into User B's folder ID.
Expected: Rejected (403/404); file stays in place.
Level: API
```
```
TC-R11-05 | P2 | Move to non-existent / deleted folder
Expected: 404/400; file unchanged.
Level: API
```
```
TC-R11-06 | P2 | Move to the same folder it is already in
Expected: No-op or clear message; no duplicate.
Level: API
```
```
TC-R11-07 | P2 | Move a file in the UI (move dialog / drag-and-drop)
Steps: 1. Move file via UI to a nested folder. 2. Navigate there.
Expected: File appears in target, gone from source; success feedback.
Level: Manual
```
```
TC-R11-08 | P2 | Move to the room root
Expected: File appears at root.
Level: API
```

### R10 — Rename a file, resolving name conflicts

```
TC-R10-01 | P2 | Rename a file
Steps: 1. Rename X.pdf to Y.pdf via API. 2. List folder, open file.
Expected: New name shown; content unchanged.
Level: API
```
```
TC-R10-02 | P1 | Rename to a name already used in the same folder does not overwrite
Preconditions: F/A.pdf, F/B.pdf.
Steps: 1. Rename A.pdf to B.pdf.
Expected: [A] Conflict resolved by rejecting with clear error OR auto-suffix (e.g. "B (1).pdf"). Both files remain with original content.
Level: API
```
```
TC-R10-03 | P2 | Rename to a name used in a different folder is allowed
Preconditions: F/A.pdf, G/B.pdf.
Steps: 1. Rename F/A.pdf to B.pdf.
Expected: Allowed.
Level: API
```
```
TC-R10-04 | P2 | Case-only conflict (B.pdf vs b.pdf)
Expected: [A] Treated as conflict (or record behavior).
Level: API
```
```
TC-R10-05 | P2 | Invalid names rejected
Steps: Rename to "", "   ", "/", "../x", "a/b.pdf", name with control chars, 256+ chars.
Expected: Validation error; no path traversal; name unchanged.
Level: API
```
```
TC-R10-06 | P2 | Extension handling on rename
Steps: 1. Rename X.pdf to "X" (no ext) and to "X.exe".
Expected: [A] Extension preserved or enforced as .pdf; file still opens as PDF.
Level: API
```
```
TC-R10-07 | P2 | Rename in the UI with conflict message
Steps: 1. Rename via UI to an existing name.
Expected: User sees conflict message or the resolved name.
Level: Manual
```
```
TC-R10-08 | P3 | Special/unicode characters and trimming
Steps: Rename to "Отчёт 2026 – final.pdf", leading/trailing spaces.
Expected: Unicode saved correctly; whitespace trimmed [A].
Level: API
```
```
TC-R10-09 | P2 | Renaming a shared file is reflected for viewer
Steps: 1. Owner renames shared file. 2. User B lists.
Expected: New name visible; access unchanged.
Level: API
```

### E1 — Uploading files with the same name

```
TC-E1-01 | P1 | Upload a file with the same name as an existing file in the folder
Preconditions: F/report.pdf exists (content A).
Steps: 1. Upload another report.pdf (content B) to F.
Expected: [A] No silent overwrite: either auto-rename (e.g. "report (1).pdf") or explicit prompt (replace / keep both). Content A remains retrievable unless user explicitly chose replace.
Level: API
```
```
TC-E1-02 | P2 | Upload several files with the same name in one batch
Steps: 1. Upload two different files both named dup.pdf in one multi-upload.
Expected: Both stored with distinct names; no lost file.
Level: API
```
```
TC-E1-03 | P2 | Same name in a different folder is allowed unchanged
Expected: Both keep "report.pdf".
Level: API
```
```
TC-E1-04 | P2 | Same-name upload shown correctly in the UI
Steps: 1. Upload existing name via UI.
Expected: User sees resolution (prompt or new name), list shows both.
Level: E2E
```
```
TC-E1-05 | P2 | Case-different names (Report.pdf vs report.pdf)
Expected: [A] Consistent with TC-R10-04.
Level: API
```
```
TC-E1-06 | P3 | Repeated same-name uploads produce sequential unique names
Steps: Upload same name 3 times.
Expected: e.g. "x.pdf", "x (1).pdf", "x (2).pdf" — no collisions.
Level: API
```

### R6 — Rename a folder

```
TC-R6-01 | P2 | Rename a folder
Steps: 1. Rename F to F2 via API. 2. List parent; list F2 contents.
Expected: New name; children intact; same ID.
Level: API
```
```
TC-R6-02 | P2 | Rename to a name of a sibling folder does not merge/overwrite
Preconditions: P/A and P/B with content.
Steps: 1. Rename A to B.
Expected: [A] Rejected or auto-suffixed; both folders' contents intact and separate.
Level: API
```
```
TC-R6-03 | P2 | Invalid folder names rejected
Steps: "", spaces only, "/", "..", 256+ chars.
Expected: Validation error; name unchanged.
Level: API
```
```
TC-R6-04 | P2 | Folder named same as a file in the same folder
Steps: 1. P has file "Docs"; rename folder to "Docs" [A].
Expected: Record behavior; no data loss.
Level: API
```
```
TC-R6-05 | P2 | Renamed folder keeps its sharing and the path shows the new name
Preconditions: F with subfolder S shared with User B.
Steps: 1. Owner renames F. 2. As User B, read F and S (including path/ancestors data if the API returns it).
Expected: Access unchanged; new name returned everywhere F appears.
Level: API
```
```
TC-R6-06 | P2 | Rename folder via UI (inline or dialog), cancel keeps old name
Level: Manual
```

### R8 — Upload PDFs

```
TC-R8-01 | P2 | Upload a single PDF
Steps: 1. Upload valid PDF to F via API. 2. List F; download content.
Expected: File listed with correct name/size; content byte-identical.
Level: API
```
```
TC-R8-02 | P2 | Upload multiple PDFs at once
Steps: 1. Upload 3 PDFs in one request (or in parallel requests, however the app's upload API is built).
Expected: All 3 stored and listed, each byte-identical to its source.
Level: API
```
```
TC-R8-03 | P2 | Drag-and-drop upload of multiple PDFs
Steps: 1. Drag 2 PDFs onto folder drop zone.
Expected: Drop zone highlights; both uploaded.
Level: E2E
```
```
TC-R8-04 | P2 | Per-file progress indicator
Steps: 1. Select 3 PDFs (one larger) in the file picker.
Expected: All 3 upload; each file shows its own progress and completion state.
Level: E2E
```
```
TC-R8-05 | P1 | Non-PDF files are rejected server-side
Steps: 1. Upload .txt, .exe, .html, .png via API; 2. Upload an HTML/JS file renamed to .pdf; 3. Upload with Content-Type application/pdf but non-PDF bytes.
Expected: Rejected with clear error; nothing stored. [A] Server validates content, not only extension.
Level: API
```
```
TC-R8-06 | P2 | Non-PDF in a batch shows a per-file error in the UI
Steps: 1. Pick 2 PDFs + 1 .docx in one selection.
Expected: Clear error on the .docx row; the 2 PDFs still upload.
Level: E2E
```
```
TC-R8-07 | P2 | Mixed batch: one invalid file does not block the others
Steps: 1. Upload 2 PDFs + 1 .txt in one request/batch via API.
Expected: PDFs stored; .txt rejected with a per-file error in the response; nothing partial stored for the .txt.
Level: API
```
```
TC-R8-08 | P2 | Size limits: empty (0-byte) and large PDF
Steps: 1. Upload 0-byte .pdf. 2. Upload file above the limit [A].
Expected: Clear error for invalid/oversize; no partial file remains.
Level: API
```
```
TC-R8-09 | P2 | Upload to a non-existent or other user's folder
Expected: Rejected; nothing stored.
Level: API
```
```
TC-R8-10 | P3 | Upload failure (network drop) shown per file with retry [A]
Level: Manual
```
```
TC-R8-11 | P2 | Unicode / long file names preserved on upload
Level: API
```

### R4 — Create and nest folders

```
TC-R4-01 | P2 | Create a folder at the room root
Expected: 201; folder listed in root.
Level: API
```
```
TC-R4-02 | P2 | Create nested folders (3+ levels)
Expected: Each listed in its parent; correct parent IDs.
Level: API
```
```
TC-R4-03 | P2 | Duplicate folder name in same parent
Expected: [A] Rejected or auto-suffixed; no duplicates with identical names.
Level: API
```
```
TC-R4-04 | P2 | Invalid folder names rejected
Steps: "", spaces, "/", 256+ chars.
Expected: Validation error.
Level: API
```
```
TC-R4-05 | P2 | Create folder inside non-existent / deleted / other user's parent
Expected: 404/403.
Level: API
```
```
TC-R4-06 | P2 | Create a folder via UI
Steps: 1. Click New folder, enter name, confirm.
Expected: Folder appears; empty-name submit disabled or error.
Level: Manual
```
```
TC-R4-07 | P3 | Very deep nesting (e.g. 20 levels) [A]
Expected: Works or clear limit message; UI/breadcrumbs remain usable.
Level: Manual
```
```
TC-R4-08 | P2 | Cannot move/create a folder cycle (folder into its own descendant) [A]
Steps: If folder move/parent change exists in API, set F's parent to its child.
Expected: Rejected.
Level: API
```

### R9 — View a file in the UI

```
TC-R9-01 | P2 | Open a PDF in the in-app viewer
Steps: 1. Click a file.
Expected: PDF renders (pages visible), file name shown, close/back returns to folder.
Level: E2E
```
```
TC-R9-02 | P2 | Multi-page PDF navigation in viewer
Expected: Can scroll/page through all pages.
Level: Manual
```
```
TC-R9-03 | P2 | Viewer as shared user and via public link
Expected: Renders for User B and anonymous link visitor.
Level: E2E
```
```
TC-R9-04 | P2 | Corrupt / unrenderable PDF shows error state
Steps: Open a file whose bytes are a damaged PDF (if upload allows).
Expected: Error message, not blank/infinite spinner.
Level: Manual
```
```
TC-R9-05 | P2 | File content endpoint enforces access (no public raw URL)
Steps: 1. Capture the file content URL from viewer. 2. Request it as User B (unshared) and anonymously.
Expected: Denied.
Level: API
```

### R5 — Folder contents and breadcrumbs

```
TC-R5-01 | P2 | Folder view lists subfolders and files
Expected: All direct children shown with name/type; [A] folders before files.
Level: API
```
```
TC-R5-02 | P2 | Breadcrumb shows full path and each crumb navigates
Steps: 1. Navigate Room > A > B > C. 2. Click "A" crumb.
Expected: Breadcrumb reads Room / A / B / C; clicking A opens A.
Level: E2E
```
```
TC-R5-03 | P2 | Direct URL to a nested folder renders correct breadcrumbs
Steps: 1. Open C's URL in new tab.
Expected: Full breadcrumb path built.
Level: Manual
```
```
TC-R5-04 | P2 | Breadcrumbs for a shared user don't expose unshared ancestors
Preconditions: Only C (inside A/B) shared with User B.
Steps: 1. User B opens C.
Expected: Breadcrumb starts at shared root; ancestor names A/B not shown and not clickable [A].
Level: E2E
```
```
TC-R5-05 | P3 | Empty folder shows empty state
Level: Manual
```
```
TC-R5-06 | P3 | Browser back/forward works with folder navigation
Level: Manual
```

### R3 — Clean UX, edge cases and error states, no unimplemented features

```
TC-R3-01 | P3 | No dead/placeholder controls ("coming soon", no-op buttons)
Steps: Click every visible control on main screens.
Expected: Every control works or isn't shown.
Level: Manual
```
```
TC-R3-02 | P2 | API errors return clean JSON, no stack traces / internals
Steps: Send malformed JSON, wrong types, unknown IDs (UUID and non-UUID).
Expected: 4xx with readable message; no 500; no stack traces.
Level: API
```
```
TC-R3-03 | P3 | Loading, empty and error states on main screens
Level: Manual
```
```
TC-R3-04 | P3 | Unknown route shows 404 page
Level: Manual
```
```
TC-R3-05 | P3 | Success/error feedback after every write action (create, rename, move, delete, share)
Level: Manual
```
```
TC-R3-06 | P2 | Double-click on submit doesn't create duplicates (folder create, upload, share)
Level: Manual
```
```
TC-R3-07 | P1 | Stored XSS via names is not executed
Steps: Create folder/file named `<img src=x onerror=alert(1)>`; view as owner, as User B, and via public link.
Expected: Rendered as text; no script execution.
Level: E2E
```
```
TC-R3-08 | P3 | Layout usable at narrow viewport
Level: Manual
```

---

## 3. Coverage table

| Requirement | Test cases | Total | P1 | P2 | P3 | API | E2E | Manual |
|---|---|---|---|---|---|---|---|---|
| R1 | TC-R1-01, TC-R1-02, TC-R1-03, TC-R1-04, TC-R1-05, TC-R1-06, TC-R1-07, TC-R1-08, TC-R1-09 | 9 | 1 | 6 | 2 | 4 | 0 | 5 |
| R2 | TC-R2-01, TC-R2-02, TC-R2-03, TC-R2-04, TC-R2-05, TC-R2-06, TC-R2-07 | 7 | 3 | 4 | 0 | 6 | 0 | 1 |
| R3 | TC-R3-01, TC-R3-02, TC-R3-03, TC-R3-04, TC-R3-05, TC-R3-06, TC-R3-07, TC-R3-08 | 8 | 1 | 2 | 5 | 1 | 1 | 6 |
| R4 | TC-R4-01, TC-R4-02, TC-R4-03, TC-R4-04, TC-R4-05, TC-R4-06, TC-R4-07, TC-R4-08 | 8 | 0 | 7 | 1 | 6 | 0 | 2 |
| R5 | TC-R5-01, TC-R5-02, TC-R5-03, TC-R5-04, TC-R5-05, TC-R5-06 | 6 | 0 | 4 | 2 | 1 | 2 | 3 |
| R6 | TC-R6-01, TC-R6-02, TC-R6-03, TC-R6-04, TC-R6-05, TC-R6-06 | 6 | 0 | 6 | 0 | 5 | 0 | 1 |
| R7 | TC-R7-01, TC-R7-02, TC-R7-03, TC-R7-04, TC-R7-05, TC-R7-06, TC-R7-07, TC-R7-08 | 8 | 2 | 6 | 0 | 6 | 2 | 0 |
| R8 | TC-R8-01, TC-R8-02, TC-R8-03, TC-R8-04, TC-R8-05, TC-R8-06, TC-R8-07, TC-R8-08, TC-R8-09, TC-R8-10, TC-R8-11 | 11 | 1 | 9 | 1 | 7 | 3 | 1 |
| R9 | TC-R9-01, TC-R9-02, TC-R9-03, TC-R9-04, TC-R9-05 | 5 | 0 | 5 | 0 | 1 | 2 | 2 |
| R10 | TC-R10-01, TC-R10-02, TC-R10-03, TC-R10-04, TC-R10-05, TC-R10-06, TC-R10-07, TC-R10-08, TC-R10-09 | 9 | 1 | 7 | 1 | 8 | 0 | 1 |
| R11 | TC-R11-01, TC-R11-02, TC-R11-03, TC-R11-05, TC-R11-06, TC-R11-07, TC-R11-08 | 7 | 2 | 5 | 0 | 6 | 0 | 1 |
| R12 | TC-R12-01, TC-R12-02, TC-R12-03, TC-R12-04, TC-R12-05 | 5 | 1 | 4 | 0 | 4 | 0 | 1 |
| R13 | TC-R13-01, TC-R13-02, TC-R13-03, TC-R13-04, TC-R13-05, TC-R13-06, TC-R13-07, TC-R13-08, TC-R13-09, TC-R13-10, TC-R13-11 | 11 | 5 | 6 | 0 | 10 | 1 | 0 |
| R14 | TC-R14-01, TC-R14-02, TC-R14-03, TC-R14-04, TC-R14-05, TC-R14-06, TC-R14-07 | 7 | 2 | 5 | 0 | 6 | 0 | 1 |
| R15 | TC-R15-01, TC-R15-02, TC-R15-03, TC-R15-04, TC-R15-05, TC-R15-06, TC-R15-07, TC-R15-08, TC-R15-09 | 9 | 2 | 6 | 1 | 8 | 0 | 1 |
| R16 | TC-R16-01, TC-R16-02, TC-R16-03, TC-R16-04, TC-R16-05, TC-R16-06, TC-R16-07, TC-R16-08, TC-R16-09 | 9 | 3 | 6 | 0 | 7 | 1 | 1 |
| E1 | TC-E1-01, TC-E1-02, TC-E1-03, TC-E1-04, TC-E1-05, TC-E1-06 | 6 | 1 | 4 | 1 | 5 | 1 | 0 |
| E2 | TC-E2-01, TC-E2-02, TC-E2-03, TC-E2-04, TC-E2-05 | 5 | 1 | 3 | 1 | 1 | 1 | 3 |
| **Total** | | **136** | **26** | **95** | **15** | **92** | **14** | **30** |

**P1 (26):** TC-R2-02, TC-R2-03, TC-R2-04, TC-R16-01, TC-R16-02, TC-R16-07, TC-R13-02, TC-R13-03, TC-R13-04, TC-R13-05, TC-R13-06, TC-R15-02, TC-R15-09, TC-R14-01, TC-R14-02, TC-R1-05, TC-R7-01, TC-R7-03, TC-E2-02, TC-R12-01, TC-R11-02, TC-R11-03, TC-R10-02, TC-E1-01, TC-R8-05, TC-R3-07

**E2E (14):** TC-R16-03, TC-R13-07, TC-R7-01, TC-R7-02, TC-E2-01, TC-E1-04, TC-R8-03, TC-R8-04, TC-R8-06, TC-R9-01, TC-R9-03, TC-R5-02, TC-R5-04, TC-R3-07
