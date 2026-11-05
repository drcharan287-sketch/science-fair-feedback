# VoiceVote: single-use visitor voting passes

> **CURRENT DECISION (5 November 2026): DEFERRED.** The visitor pass input and shared-phone pass control are hidden in the public app, and mandatory pass mode must not be enabled without a fresh organizer decision. The implementation below is retained for future planning only. See [PROJECT_STATUS.md](../PROJECT_STATUS.md).

## Safe rollout (no additional QR codes)

VoiceVote keeps the **one common project QR** and the same GitHub Pages voting URL. Each **attendee**, not each project or physical phone, receives a unique code at an organizer-controlled check-in desk.

- Admin Console → **Visitor passes** → Generate 1–100 codes per batch, label the batch, copy/print the codes **immediately**. Code plaintext is returned exactly once and never stored in the spreadsheet.
- The existing restricted Google Sheet holds a `Visitor Passes` tab with serial, SHA-256 code hash, status, issuance/redemption timestamps and audit references; it never holds full codes.
- The public app accepts a code in the HTTPS POST body. The server verifies it under the same Apps Script lock as the Feedback append, so one pass can produce **one accepted feedback row** across browsers, cleared storage or shared devices.
- Feedback column **L** holds the redeemed pass serial (hidden in the normal sheet view). This also prevents redemption if the app appended a feedback row but the pass-status update was interrupted. Existing rows A:K are preserved.
- Codes look like `VV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`; the 32 hex digits are based on a UUIDv4 random value (~122 bits). The prefix and dashes improve readability, not entropy.

## Stage A (default): preparation mode

The backend uses `VOICEVOTE_REQUIRE_VISITOR_PASSES` in Script Properties. **Unset or 0 means preparation mode**; existing no-pass browser-token submissions continue unchanged. Issued codes **can already be redeemed** if supplied, and cannot be reused.

This stage can safely deploy before the visitor input appears and before passes are printed. The organizer should not switch to mandatory passes yet. Legacy votes made before activation cannot be retroactively tied to attendee codes.

## Stage B: public pass input

After the new frontend is published and tested in Chromium, attendees can enter their pass above the existing project/search/voice/rating form. After submitting, return from Google's receipt marks the browser as voted.

A separately admitted attendee can enter a **different unused code** and explicitly start a new visitor on the same shared phone. The server uses the pass as primary identity; the browser token is only the legacy identity where a pass is missing.

## Stage C: explicit activation (organizer only)

Only after passes have been printed and distributed and the public input has been verified:

1. Admin Console → Visitor passes → confirm there are available codes.
2. Select **Require passes for all new votes**, confirm, and give a reason.
3. The server now rejects *every* new submission without a valid unused pass, even on a fresh browser or cleared storage. A public client may still show an optional field if caching is stale, but the server always enforces the requirement.
4. Perform one explicitly approved controlled test; check the receipt, Feedback column L and `Visitor Passes` USED status. Do not use a production visitor's code for tests.

**No mandatory-mode activation is part of automated deployment.**

## Reissues, lost codes and audit

Admin Console → Visitor passes → enter the printed serial number and an 8–400 character reason. The old **AVAILABLE** pass is marked REVOKED *before* the replacement code is generated and logged. Codes marked USED cannot be reissued to create another vote. A pass whose Feedback row was saved but ledger update failed also cannot be reissued.

Only a serial and last four characters are visible in the Admin Console history. A full pass cannot be recovered after its original generation or reissue. Admin actions are audited in `Admin Action Log`.

## Anti-guessing, limitations and operational policy

- Random 122-bit tokens are impractical to guess. A **best-effort** script cache also pauses attempts after six invalid codes per reported browser token in roughly 15 minutes. This rate limit is bypassable by changing the untrusted browser token, so do **not** claim IP/device identification or perfect DoS prevention. Google's Apps Script and Sheets quotas still apply.
- A valid unused pass can be **shared** with another person before redemption. Staff should physically issue **one code per verified attendee**, track distribution, and avoid posting unused codes publicly. No visitor names, phone numbers, IPs, or browser fingerprints are collected in this design.
- Use the admin Pause voting switch for suspicious activity; it blocks new submissions server-side without deleting records.
- Avoid ever sharing the administrator access key or generated unused codes in screenshots, logs, public GitHub issues or chat messages.
- The existing `VoiceVote` QR remains unchanged. Project-specific QR codes remain deferred.
