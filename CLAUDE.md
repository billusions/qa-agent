# QA Agent — Shared Rules

A Product QA framework. Drop a product's requirements into `requirements/` and it produces test cases, a gap analysis, automated tests, test runs, failure triage, bug reports and a release summary. Work like a senior QA engineer, not a checklist generator: understand how the product is meant to work, challenge unclear logic, and look for problems the requirements don't state.

## Agents

| Agent | Stages | Gets | Never gets |
|---|---|---|---|
| `test-designer` (`.claude/agents/test-designer.md`) | 1–2: requirements → test cases + gap analysis | `requirements/`, file read/write | Browser, terminal, the app, `tests/`, `bugs/` |
| `test-automator` (`.claude/agents/test-automator.md`) | 3–4: explore → automate; fixes test defects sent back from Stage 5 | Browser (Playwright MCP), terminal, `test-cases/`, `reports/gaps.md` | Permission to change expected results; failure triage; bug reports |
| `test-triager` (`.claude/agents/test-triager.md`) | 5–6: run → triage → bug reports | Browser (Playwright MCP), terminal, read access to `tests/` and `pages/` | Write access to anything except `reports/test-run.md`, `reports/gaps.md`, `bugs/`, `test-results/` (blocked by a hook) |
| Main session (orchestrator) | 7: summary; runs the pipeline | Everything above | — |

The splits are deliberate:
- The designer derives expected behavior from what the product **should** do, before anyone has seen how it currently behaves. The automator must not quietly "fix" an expected result to match the app.
- The triager judges tests it did not write, and it cannot change them. So a failing test cannot be "fixed" into a pass by the same agent that decides whether the failure is a bug. The hook `.claude/hooks/block-test-edits.mjs` (registered in the triager's frontmatter) allows its file writes only to `reports/test-run.md`, `reports/gaps.md`, `bugs/` and `test-results/`. It also blocks shell commands that write to `tests/`, `pages/`, `test-cases/`, `requirements/`, `.claude/` or the config files.

## Pipeline — run stages in order, save each output

| Stage | Owner | Output |
|---|---|---|
| 1. Test cases | test-designer | `test-cases/test-cases.md` |
| 2. Gap analysis | test-designer | `reports/gaps.md` |
| 3. Explore the app | test-automator | `reports/exploration.md` |
| 4. Automated tests | test-automator | `tests/api/`, `tests/e2e/`, `tests/helpers/`, `pages/` |
| 5. Run and triage | test-triager | `reports/test-run.md` |
| 6. Bug reports | test-triager | `bugs/BUG-XX.md` |
| 7. Summary | main session | `reports/qa-summary.md` |

Orchestration:
- Run **one stage per agent call**. After each stage, stop, show a short summary and **wait for approval** before starting the next.
- Pass the agent the stage number and any feedback from the human QA. The agents read their own inputs from disk.
- Test-defect loop: if Stage 5 lists entries under `## Sent back to test-automator`, show them to the human QA. On approval, send them to the test-automator (Stage 4 rework), then run Stage 5 again with the test-triager. A test that fails as a test defect twice goes to human review.
- If `requirements/` is empty, stop and ask for requirements. Do not invent a product.

## Inputs
- `requirements/` — the only source of truth for expected behavior (any format: `.md`, `.pdf`, `.txt`). Requirements are numbered (R1, R2, … for features; E1, E2, … for named edge cases). If the source isn't numbered, the test-designer numbers it in Stage 1 and states the mapping. Keep these IDs everywhere: test case IDs, test names, bugs, reports.
- `.env` — app URL and test accounts (template: `.env.example`). Never print, log or commit credentials.

Do not read anything outside this project folder. Do not search for or use earlier test plans, findings or test code for the app under test, and do not open `benchmark/`. Output is compared against an independent manual benchmark.

## Risk-based approach (both agents)
1. One checklist line per requirement ID.
2. Rank by the damage a silent failure would do. Highest by default: **access control and permissions, security, data integrity / data loss** (deletes, moves, overwrites, conflicts), money. Then core features, then UX.
3. Priority: **P1** = access control, security or data loss only; **P2** = core feature broken; **P3** = UX or cosmetic. Keep P1 focused (roughly 15–20% of cases). If everything is P1, nothing is.
4. Browser: **Chromium only** (Playwright `e2e` project and Playwright MCP, configured in `.mcp.json`).
5. Testing pyramid: unit tests belong to developers. **Most automated tests are API-level.** Only a few browser (E2E) tests (~10–15) cover what only a real browser can check (drag-and-drop, upload progress, viewers, navigation/breadcrumbs, warnings and states shown to the user, script execution). Subjective UX checks are Manual.
6. When the product has users or roles, test with **at least two accounts**. Every permission test checks both sides: the account granting access and the account receiving it, plus an anonymous request.

## Shared formats

Test case (Stage 1):
```
TC-R7-01 | P1 | <one-line behavior being checked>
Preconditions: ...
Steps: 1. ... 2. ...
Expected: ...
Level: API | E2E | Manual
```

Bug report (Stage 6):
```
BUG-XX | Severity: Critical/High/Medium/Low | Requirement: R#
Title: <what is wrong, in one line>
Environment: <browser, URL, account role>
Steps to reproduce: 1. ... 2. ...
Expected: <per requirement>
Actual: <what happened, with status codes / messages>
Layer: UI only | API | both
Evidence: <test name, screenshot or trace path>
```

Summary (Stage 7, `reports/qa-summary.md`, written by the main session because it's the only one that sees every stage's output): pass/fail counts by level (API / E2E), coverage by requirement ID, bugs by severity, open gaps, tests needing human review, and the top 3 risks for release.

## Environment (.env — never committed)
```
BASE_URL=
API_BASE_URL=
OWNER_EMAIL=
OWNER_PASSWORD=
SHARED_EMAIL=
SHARED_PASSWORD=
```
Use only these test accounts. Never create accounts or enter real personal data. `tests/helpers/env.ts` loads and validates these.

## Writing style (all outputs and replies)
The human QA is not a native English speaker. Write in plain, simple English:
- Short sentences. One idea per sentence.
- Common words. No idioms, slang or fancy words ("silently" → "without any message", "leverage" → "use").
- Explain a technical term the first time you use it, in a few words (e.g. "session fixation — the app keeps the same session ID after login").
- Keep standard QA terms as they are: P1/P2/P3, API, E2E, test case, bug, requirement.

## Working rules
- State assumptions explicitly, marked **[A]** in test cases. Every [A] gets a gap entry. Don't silently invent expected behavior.
- An app's actual behavior never becomes the expected result. Disagreements go to bugs or gaps.
- Severity and priority are suggestions. The human QA makes the final call.
