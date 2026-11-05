# VoiceVote / PulsePlus — Project Status & Continuity Tracker

**Last reviewed:** 5 November 2026 (IST)  
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
| Known release | At the start of this tracker update, `main` was at `b217794f` (PR #14); Apps Script v22. Always inspect new merges before proceeding. |

**Release validation status:** PR #14 passed 33 Node tests and GitHub Pages publication. This follow-up adds/updates a no-write browser speech-readiness suite and pass-hidden checks. Use Actions on the new merge to verify those results; do not assume a physical-device test from emulation.

## 4. How we test without blocking a browser or writing feedback

**Default:** `node --test` for in-memory contracts. For published UI, use GitHub Actions `Verify VoiceVote in real browser`: fresh, isolated headless Chromium contexts; the `verify-post-form-dry-run.mjs` script intercepts the entire POST and never forwards it to Google; `verify-speech-readiness.mjs` fakes the browser's speech-recognition events and never submits.

- **No real form submit** to the production Apps Script merely to check layout, languages, project selections, button state, or microphone error messages.
- **No browser lockout caused by our automation:** dry-run storage lives in disposable browser contexts, not the user's actual browser.
- **No pretending emulation equals real devices:** Android-sized/iPhone-sized Chromium simulations verify layout and frontend event handling, **not** Android microphone accuracy or Safari engine support.
- **Final real end-to-end** speech/translation/receipt test should be one carefully planned batch on real Android Chrome and iPhone Safari, preferably with a separate test deployment/sheet. If production feedback writes are unavoidable, obtain explicit approval first, record test IDs, inspect rows, and do **not** delete existing feedback or reset protections as a shortcut.
- A vote made on the actual public form may lock that browser token; testing another device/browser or clearing storage is **not** an acceptable substitute for controlled acceptance testing.

## 5. Active work tracker

Legend: **DONE** = implemented and verified in the indicated scope; **AUTO PENDING** = automated check not yet confirmed after latest publication; **MANUAL PENDING** = needs a real device/organizer; **DEFERRED** = deliberately postponed.

| ID | Priority | Task / acceptance criteria | Owner | Status |
| --- | --- | --- | --- | --- |
| VV-01 | P0 | Hide public pass input/help and alternate-attendee control; leave backend and common QR unchanged; verify live after publication | Developer | AUTO PENDING on current follow-up |
| VV-02 | P0 | Keep browser POST smoke non-writing; verify hidden-pass field is blank and no Google save reaches server | Developer | AUTO PENDING on current follow-up |
| VV-03 | P0 | Run automated English, Telugu, Hindi speech lifecycle, final transcript edit, mic denial/no-speech/network error and small-viewport checks | Developer | AUTO PENDING on current follow-up |
| VV-04 | P0 | Verify browser speech recognition and editable transcription with **real** Android Chrome and iPhone Safari; record versions, mic permission behavior and fallback | QA / organizer | MANUAL PENDING; batch near event readiness |
| VV-05 | P0 | Validate actual Google translation for Telugu/Hindi and saved receipt in an isolated test Sheet/deployment; check no user feedback is lost | Developer + organizer | MANUAL PENDING; approval required for any production write |
| VV-06 | P0 | Ensure Apps Script is still in visitor-pass **preparation/not-required** mode before event; no pass-ledger activation or issuance | Organizer | MANUAL PENDING; do not turn on required mode |
| VV-07 | P1 | Load official ~300 project roster, mark active/inactive correctly, check search duplicates and expected class/section counts | School management | MANUAL PENDING; 2 active projects currently |
| VV-08 | P1 | Admin read-only review: rankings, one-project on-demand bilingual reviews, language counts and access rejection from unauthorized login | Developer + organizer | PARTLY DONE; final authorized review pending |
| VV-09 | P1 | Privacy/permission review: Sheet share settings, source/secret exposure, audit and moderation behavior | Developer + organizer | MANUAL PENDING before event |
| VV-10 | P1 | Test low-network/offline errors, responsive overflow, browser Back/Refresh/receipt recovery without real duplicate submission | Developer | PARTLY DONE; extend read-only smoke checks |
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
- **2026-11-05:** Follow-up work adds hidden-pass UI, non-writing multilingual mobile simulations, and this continuity tracker. Check the latest Actions/PR before marking items VV-01 to VV-03 DONE.

For each future change: (1) read this file; (2) compare actual `main` to latest logged baseline; (3) make a small branch/PR; (4) pass `node --test`; (5) verify Pages/browser Actions without an actual submission; (6) update relevant rows, evidence links and last-reviewed date; (7) only then proceed. Keep production feedback rows immutable except for explicitly audited moderation.

## 8. Paste into a fresh ChatGPT project thread

> Continue PulsePlus / VoiceVote from `PROJECT_STATUS.md` in `drcharan287-sketch/science-fair-feedback`. Read the current GitHub `main` branch, PRs and Actions first, and update the tracker. Visitor voting passes are deferred and hidden; never enable mandatory passes. Use read-only/nonwriting browser smoke tests and mocks; don't submit production feedback or clear user browser storage. Preserve the common QR, deployed Apps Script and existing Feedback Sheet data. Work from the highest-priority incomplete tracker item, using reviewed PRs and evidence of tests. End every reply with the next best constructive step.

**Next best step:** Check the post-publication CI/browser results for this follow-up, then schedule the real-device English/Telugu/Hindi sign-off as one controlled batch rather than repeated production voting tests.
