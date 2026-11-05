# VoiceVote / PulsePlus — Project Status & Continuity Tracker

**Last reviewed:** 5 November 2026 (IST); VV-08/VV-09 admin technical audit and Apps Script v23 verification complete
**Source of truth:** GitHub `main` branch; refresh the current commit and GitHub Actions before trusting an older status note.  
**Current phase:** Phase 2 — public/mobile/multilingual readiness and event preparation.  
**Release approach:** Small reviewed PRs, automated tests, GitHub Pages post-publication smoke tests, and explicitly approved production writes only.  
**Policy:** No real votes or feedback rows should be created just to repeat routine UI tests.

> This is a living handover document. Update this file whenever a feature is completed, validated, deferred, deployed, or found broken. The GitHub copy persists across ChatGPT threads.

## 1. Purpose and current user goal

VoiceVote is a common-QR-code, AI-assisted science fair audience-feedback app for a planned event of roughly 300 projects. A visitor chooses Class, Section and Project; speaks or types in a supported language; reviews the editable transcript; selects 1–5 stars; and submits feedback to a protected Google Sheet. Organizers can view rankings and on-demand original/translated reviews in a key-protected Admin Console.

**Important current decision:** Visitor voting passes are **deferred**. School management would have to organize verification, distribution and reissue operations, which is not feasible in the current phase. The public visitor-pass UI and shared-phone pass control are hidden; existing backend code is preserved for a later explicit decision. **Do not issue passes, enable mandatory pass mode, or resume pass rollout without new organizer approval.**

The present public mode uses a random localStorage browser token checked on the server. It is **not** one-person/one-physical-device verification: clearing storage, private browsing and another browser can bypass it. Do not promise otherwise.

## 2. Stable resources and boundaries

| Item | Location / note |
| --- | --- |
| Repository | https://github.com/drcharan287-sketch/science-fair-feedback |
| Public form and existing common QR destination | https://drcharan287-sketch.github.io/science-fair-feedback/ |
| Admin Console shell | https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec?action=admin |
| Apps Script | Existing managed `/exec` deployment; last independently confirmed release **v22** (5 November 2026) |
| Data store | Restricted Google spreadsheet named **Feedback**; never put private sheet IDs, admin keys, codes, tokens or feedback contents in this public tracker |
| Public code | `index.html`, `voicevote-catalog.js`, `projects.json` |
| Server code | `apps-script/Code.gs`, `AdminApi.gs`, `Admin.html`, `VisitorPasses.gs` |
| Tests and actions | `test/*.test.js`, `scripts/*.mjs`, `.github/workflows/*.yml` |
| Deployment details | `DEPLOYMENT_AUTOMATION.md`, `docs/ADMIN_CONSOLE.md`, `docs/VOTE_GUARD_SECURITY.md`, `docs/VISITOR_PASSES.md` |

The spreadsheet and admin results are private. Keep the Google Sheet restricted to organizers. Do not place feedback, generated codes, or the admin key into GitHub Pages or screenshots. Hidden columns alone are **not** access controls.

## 3. Verified history and implemented functionality

| Area | Current status and evidence |
| --- | --- |
| Common QR, public GitHub Pages app | Implemented. Existing QR destination preserved. |
| Class/section/project filtering and quick project search | Implemented; backed by `Projects` Sheet and synchronized `projects.json`. |
| Catalog size | As read on 5 Nov 2026: **2 active projects** (Class 6 / Heidelberg / XenoChat; Class 9 / Keats / VoiceVote). Planned final roster is about 300. |
| AI demonstration | Page explains browser speech recognition, machine translation to English, and non-AI numeric ranking. Five language options are present: English, Telugu, Hindi, Tamil, Kannada. |
| Feedback save and confirmation | HTTPS top-level form POST to existing Apps Script deployment, HTML receipt, retry-submission ID and server-side browser-token hash. GET writes rejected. |
| Admin Console | Password-like random access key is checked server-side; private rankings, review drill-down, language counts, audit log and moderator actions implemented. |
| Feedback records | Read-only check on 5 Nov 2026 found **2 existing rows**, one legacy and one hashed browser token; no production feedback writes authorized during these development checks. |
| Visitor pass code | Backend and admin pass-management implementation merged in PR #11, public entry in #12 and post-Pages checks in #13. **Feature deferred; public UI now hidden in the current follow-up release**. No `Visitor Passes` tab was present on 5 Nov 2026. Backend pass mode is not independently readable from GitHub. |
| Mobile dictation safety | PR #14 merged on 5 Nov 2026: submit is blocked until speech recognition ends, microphone errors remain useful, editing fallback and narrow-screen controls improved. |
| Known release | Admin security-hardening PR #22 merged at `588baad4` on 5 Nov 2026. The existing Apps Script deployment was updated to **v23**, with all smoke checks passing. PR #18–21 recovery checks remain green. Refresh current `main` before further development. |

**Release validation status (5 Nov 2026):** PR #15/#16 confirmed hidden passes and mocked multilingual mobile behavior in [read-only run 41979800953](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/41979800953). **PR #18–20 recovery work is now verified:** [published browser run 41994042841](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/41994042841) succeeded with exact Pages HTML, ordinary catalog/POST smoke, mocked speech, offline catalog failure/retry, known-offline no-POST prevention, an interrupted POST still locked after Back/Refresh, synthetic success receipt persisting a lock, and synthetic rejected receipt unlocking only for an explicit manual retry. The merged [VoiceVote tests run 41994042874](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/41994042874) was green (36 tests, 0 failures). Every external Google save was intercepted locally, no production feedback submitted. **Mocked receipts are not proof of a real Google save; Android/iPhone device, Safari, real speech and translation remain untested.**

**Admin review evidence (5 Nov 2026):** [PR #22](https://github.com/drcharan287-sketch/science-fair-feedback/pull/22) added sign-out DOM redaction, stale-response invalidation and private-review pagination guards. [Production deployment run 42004182528](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42004182528) passed source tests (41/41), existing Apps Script update to **v23**, read-only project catalog, nonwriting POST and intentionally invalid administrator access. [Run 42004325921](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42004325921) also passed without saving. The connected Sheet still showed two feedback rows and owner/two-editor-only sharing afterward. **No legitimate admin key was used and no actual authenticated dashboard was opened.** Full risk and sign-off details: [Admin privacy audit](docs/ADMIN_PRIVACY_AUDIT_2026-11-05.md).

## 4. How we test without blocking a browser or writing feedback

**Default:** `node --test` for in-memory contracts. For published UI, use GitHub Actions `Verify VoiceVote in real browser`: fresh, isolated headless Chromium contexts. `verify-post-form-dry-run.mjs` intercepts the entire POST; `verify-speech-readiness.mjs` mocks recognition; `verify-recovery-readiness.mjs` blocks cross-origin requests in all tabs and uses synthetic receipt pages to test offline, Back/Refresh and interruption. **All three scripts avoid sending real feedback to Google.**

- **No real form submit** to the production Apps Script merely to check layout, languages, project selections, button state, or microphone error messages.
- **No browser lockout caused by our automation:** dry-run storage lives in disposable browser contexts, not the user's actual browser.
- **No pretending emulation equals real devices:** Android-sized/iPhone-sized Chromium simulations verify layout and frontend event handling, **not** Android microphone accuracy or Safari engine support.
- **Final real end-to-end** speech/translation/receipt test should be one carefully planned batch on real Android Chrome and iPhone Safari, preferably with a separate test deployment/sheet. If production feedback writes are unavoidable, obtain explicit approval first, record test IDs, inspect rows, and do **not** delete existing feedback or reset protections as a shortcut.
- A vote made on the actual public form may lock that browser token; testing another device/browser or clearing storage is **not** an acceptable substitute for controlled acceptance testing.

## 5. Active work tracker

Legend: **DONE** = implemented and verified in the indicated scope; **AUTO PENDING** = automated check not yet confirmed after latest publication; **MANUAL PENDING** = needs a real device/organizer; **DEFERRED** = deliberately postponed.

| ID | Priority | Task / acceptance criteria | Owner | Status |
| --- | --- | --- | --- | --- |
| VV-01 | P0 | Hide public pass input/help and alternate-attendee control; leave backend and common QR unchanged; verify live after publication | Developer | **DONE** — PR #15, published browser run 41979800953 |
| VV-02 | P0 | Keep browser POST smoke non-writing; verify hidden-pass field is blank and no Google save reaches server | Developer | **DONE** — intercepted POST confirmed; no Google save |
| VV-03 | P0 | Run automated English, Telugu, Hindi speech lifecycle, final transcript edit, mic denial/no-speech/network error and small-viewport checks | Developer | **DONE (simulations only)** — both viewport suites green |
| VV-04 | P0 | Verify browser speech recognition and editable transcription with **real** Android Chrome and iPhone Safari; record versions, mic permission behavior and fallback | QA / organizer | MANUAL PENDING; batch near event readiness |
| VV-05 | P0 | Validate actual Google translation for Telugu/Hindi and saved receipt in an isolated test Sheet/deployment; check no user feedback is lost | Developer + organizer | MANUAL PENDING; approval required for any production write |
| VV-06 | P0 | Ensure Apps Script is still in visitor-pass **preparation/not-required** mode before event; no pass-ledger activation or issuance | Organizer | MANUAL PENDING; do not turn on required mode |
| VV-07 | P1 | Load official ~300 project roster, mark active/inactive correctly, check search duplicates and expected class/section counts | School management | MANUAL PENDING; 2 active projects currently |
| VV-08 | P1 | Admin read-only review: ranking math, authenticated on-demand reviews, language counts, no feedback text in overview, invalid-access handling, sign-out privacy | Developer + organizer | **TECHNICAL PASS** — PR #22, 41 tests passed, Apps Script v23 smoke; **organizer valid-key read-only dashboard UAT pending** |
| VV-09 | P1 | Privacy review: named Sheet sharing, source/secret exposure, safe review rendering, stale callback handling, audit/moderation guarantees | Developer + organizer | **TECHNICAL REVIEW COMPLETE, FOLLOW-UPS OPEN** — one owner + two editors, no public Sheet role; static shared-key attribution, log-failure handling and organizer access review pending |
| VV-10 | P1 | Test offline catalog failure/retry, known-offline preflight, interrupted POST state, Back/Refresh, synthetic success and rejected receipts, with no duplicate or production submission | Developer | **DONE (automated Chromium simulation only)** — PR #18–20, green browser run 41994042841; real network/device acceptance remains later |
| VV-11 | P1 | Create student-friendly mic instructions and printed fallback plan when speech or connection fails | Organizer | PENDING |
| VV-12 | P2 | Reconcile README/deployment docs that describe older pre-POST behavior; add event operating checklist | Developer | PENDING |
| VV-13 | P2 | Explore stronger per-person voting controls only when management has staffing/process/time | School management | DEFERRED — visitor passes |
| VV-14 | P2 | Project-specific QR/stall numbers, public leaderboard approval and advanced judging analytics | School management | DEFERRED / scope decision |

## 6. Final physical-device sign-off sheet (fill once when ready)

Do not claim a pass before an actual device or isolated test environment has been used.

| Device/browser (actual, not emulated) | English speech | Telugu speech | Hindi speech | Edit transcript | Mic denied/recovery | Typed fallback | Translation + receipt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Android phone, Chrome (version: ____) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| iPhone, Safari (iOS/version: ____) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

Record device model, language, result, any error text, and whether the test was mock/no-write or a separately authorized real backend test. Do not publish actual attendee comments in this tracker.

## 7. Change log / synchronization protocol

- **2026-11-05:** Synchronized GitHub source and read-only Sheet metadata. Confirmed two active projects, two existing feedback records, existing Apps Script v22, and major admin features.
- **2026-11-05:** Management-dependent single-use visitor pass rollout deferred. Its public field should no longer be displayed after this follow-up deploy; backend retained in preparation.
- **2026-11-05:** PR #14 — safer dictation/phone UI; Node tests and Pages deployment passed.
- **2026-11-05:** PR #15 merged — hides pass UI and shared-phone controls, adds non-writing multilingual mobile simulations and this tracker. PR #16 merged — ensures browser smoke runs from a `main` push only after checking exact published HTML.
- **2026-11-05:** Run [41979800953](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/41979800953) succeeded: published HTML match; catalog and intercepted POST; English/Telugu/Hindi mocked speech, transcript edits, microphone error fallback and responsive phone-sized Chromium. No real feedback sent, no production browser vote used.
- **2026-11-05:** PR #18 added known-offline preflight/guidance (no pending lock when definitely offline; hold lock if receipt unknown). PR #19 and PR #20 corrected the recovery test harness to account for Chromium's aborted navigation and intentional pending-vote lock. [Run 41994042841](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/41994042841) passed all offline, interrupted POST, Back/Refresh and synthetic receipt cases. **No Apps Script changes, no real Google writes, no existing feedback deleted.**

- **2026-11-05:** PR #22 hardened Admin Console sign-out and review paging. Contract tests (41) and v23 deployment passed; intentionally invalid-key browser test denied access. Read-only Sheet permissions remained one owner plus two editors; original two feedback rows intact. VV-08 awaits organizer-only valid-key UAT; VV-09 awaits audit-log failure handling, shared-key accountability and editor validation.

For each future change: (1) read this file; (2) compare actual `main` to latest logged baseline; (3) make a small branch/PR; (4) pass `node --test`; (5) verify Pages/browser Actions without an actual submission; (6) update relevant rows, evidence links and last-reviewed date; (7) only then proceed. Keep production feedback rows immutable except for explicitly audited moderation.

## 8. Paste into a fresh ChatGPT project thread

> Continue PulsePlus / VoiceVote from `PROJECT_STATUS.md` in `drcharan287-sketch/science-fair-feedback`. Read the current GitHub `main` branch, PRs and Actions first, and update the tracker. Visitor voting passes are deferred and hidden; never enable mandatory passes. Use read-only/nonwriting browser smoke tests and mocks; don't submit production feedback or clear user browser storage. Preserve the common QR, deployed Apps Script and existing Feedback Sheet data. Work from the highest-priority incomplete tracker item, using reviewed PRs and evidence of tests. End every reply with the next best constructive step.

**Next best step:** Resolve remaining VV-09 audit-log failure/reconciliation behavior with isolated tests; have the organizer privately verify the two editor accounts and run one read-only valid-key Admin Console UAT. Then obtain the official project roster for VV-07. Keep visitor passes deferred and avoid production feedback submissions.
