# VoiceVote private admin console

## Visitor and admin URLs
Public visitor form: https://drcharan287-sketch.github.io/science-fair-feedback/

Private admin login shell: https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec?action=admin

The admin page is served by Google Apps Script, not public GitHub Pages. It contains no feedback or rankings until a server-side credential check succeeds. Never place private feedback in the public projects.json catalog.

## Features
- Rankings of all active registered projects with vote counts, mean stars and Bayesian-smoothed weighted ratings. Unrated projects have score zero. Formula: (total rating points + 5×3.5)/(votes + 5).
- Original multilingual reviews and English machine translations are fetched **only on demand**, after clicking a project. The overview does not return private review text.
- Language counts highlight the actual AI-assisted workflow: browser speech recognition and Google machine translation. Numeric rankings are not AI-generated judging decisions.
- Recent voter activity shows project, date, protected/legacy status and moderation state; never raw browser tokens.
- Organizer pause/resume disables **all new votes on the server** (including old visitor pages), with a reason and audit log.
- Exclude/restore a vote from rankings without deleting the underlying feedback. Admin Rankings sheet excludes entries whose hidden Feedback column K (Vote status) equals VOID.
- Every administrator mutation must first append a PENDING audit intent; a later APPLIED status confirms the write path completed. Unresolved intents block further admin changes. See recovery procedure below.

## Faculty Presentation: private Demo and Live Results

Only **the Parent/Visitor Voting page** is linked from the common QR. Parents cannot navigate to the presentation screen from Voting; direct opening of the static `results.html` shell shows an access-required message and does not fetch real feedback aggregates without a valid presenter capability.

To open the faculty/student smart-board experience:

1. Sign into this protected Admin Console using the existing organizer credential.
2. Expand **Faculty Presentation · Demo Voting and Private Live Results** and click **Create temporary owner demo link**.
3. The same temporary session produces three links: **Open Faculty Demo Screen** (educational, clearly fictional example rankings); **Open Private Live Results** (real read-only participation, grade-wise weighted rankings and language counts); and **Open No-Save Voting Demo** (same visitor form, no feedback writes or browser vote resets).
4. Use **Open Private Live Results** on the Senses smart board. The presenter screen has a Demo/Live switch, a bright-room toggle, fullscreen control and grade filters/rotation. Reopen a new authenticated link after the two-hour session expires.
5. **Do not share any temporary presenter link with visitors, embed it in a QR code, or publish it.** The URL fragment contains a bearer capability: whoever obtains it can see the permitted aggregate display until expiry. The static page itself remains publicly fetchable from GitHub Pages, but real data is protected server-side by ticket validation on every refresh.

The prior **Audience Display public publication controls have been removed**. Backend `action=publicResults` responds only with a fictional/DEMO summary even if an older publication property was set to LIVE/PUBLISHED. Only ticket-validated `action=presenterResults` can return actual aggregate metrics. **No manual feedback approval queue is required or enabled**: valid feedback saves automatically. Existing audited vote-exclusion/restore is for exceptional integrity issues, not routine approval of submitted comments.

### iPhone Chrome/Safari demonstration

The existing English preview uses a no-save HTML POST in an embedded frame, which may fail on iOS browser configurations. The Voting UI offers **Open English translation in a separate tab** after recording/editing the source text. This launches a top-level `action=translatePreview` POST and displays the original and English rendering; it **never submits a vote**. iOS dictation uses a single-utterance lifecycle. Browser speech/translation support for the 22 Eighth Schedule languages is not guaranteed; staff should validate Telugu/Hindi on an actual iPhone (not Chromium emulation) and use typed entry if needed.

## Security
The existing public web app executes as the owner, so Session.getActiveUser().getEmail() is not a trustworthy identity check for anonymous visitors. The admin login therefore uses a randomly generated 256-bit key. Only its SHA-256 hash is versioned on public GitHub. Every admin API validates the key *before* opening the private Google Sheet; the key is not stored in browser localStorage, HTML or URLs.

Keep the plaintext key private. Anyone with the key has admin permissions, and the audit log cannot distinguish people sharing it. Rotate/redeploy if leaked. For individually authenticated administrators, consider a separate Google-authenticated admin deployment later.

## Audit-log safety and recovery (write-ahead journal)

Administrative changes to moderation state, voting pause/resume, and the **deferred** visitor-pass management features use a write-ahead journal in the restricted `Admin Action Log` tab:

1. While holding the existing Apps Script `ScriptLock`, the backend checks for earlier unresolved journal entries. If any exist, it **refuses** further admin changes.
2. It appends an audit row with `PENDING`, a unique event ID, reason, affected feedback row or pass serial, and the intended `Before` / `After` state; it calls `SpreadsheetApp.flush()` **before** touching the protected record.
3. It changes the protected state, flushes, then marks the journal `APPLIED` and flushes again. If any of these steps fail, do **not** automatically retry or undo the change. A `PENDING` journal means the outcome is **unknown** until checked.
4. The authenticated Admin Console displays an **AUDIT ATTENTION** warning whenever a journal action remains unresolved. New organizer mutations stay blocked, but read-only rankings and reviews remain available.

The prior five-column log rows are preserved. New audit fields are **F = State, G = Event ID, H = Before, I = After**. These fields do not include browser tokens, review text, unused pass codes or admin keys. Do not share the restricted log publicly.

### Owner-only reconciliation of PENDING entries

**Do not delete a PENDING journal row, edit its event ID, or blindly change its state to clear a warning.** The organizer responsible for the Google Sheet must:

1. Record the event ID, timestamp, action, target row/serial and expected Before/After values, then independently inspect the actual **Feedback column K**, **Script Properties** voting/pass-mode setting, or **Visitor Passes** ledger as relevant.
2. If the intended state is fully present, document the evidence and set column F to **`APPLIED`**. If no change occurred and the original state remains, document evidence and set column F to **`NOT_APPLIED`**. If there was a partial multi-step pass operation, investigate/repair it safely and set F to **`RECONCILED`** only after verification.
3. Record the investigator, timestamp, evidence and any corrective action in the restricted administrative incident notes or in a separate audit note; the original journal row must stay intact.
4. Refresh the Admin Console. The pending warning should disappear only if all unresolved journal events have been correctly dispositioned. Affected voting or passes must be checked before any follow-up action.

**Important limitations:** Google Sheets and Apps Script Properties are not an ACID transaction; an outage may create a journal intent whose actual outcome is indeterminate. The journal is not tamper-evident to users with Sheet editor permissions. The shared admin key still cannot distinguish individual organizers. For critical deployments, restrict Sheet editors and preserve a separate export of audit evidence.

## Release and tests
The production workflow overlays AdminApi.js and Admin.html while preserving the existing web app and public feedback flow. Contract tests cover no-access authorization, private review drilldown, votes, moderation and pause/resume. A read-only Chromium smoke test confirms an invalid key is rejected. It does not submit production feedback or open reviews.

## Future voter resets
Excluding a vote from rankings **does not** unlock that visitor's browser. A real re-vote exception needs a one-time, expiring, staff-issued reset code and a logged policy on whether the original vote is counted. Do not provide an unauthenticated public reset button. Browser tokens cannot guarantee one vote per person.
