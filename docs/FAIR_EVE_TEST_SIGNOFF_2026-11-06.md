# VoiceVote — 6 November 2026 fair-eve test and cleanup sign-off

**Scope:** Organizer-authorized real Admin project creation, Android Voting submission, persisted Hindi-to-English feedback, scoring and ranking, followed by narrow removal of both test artifacts. No further test vote was made by ChatGPT.

## Actual observed sequence

1. The organizer signed in to the protected Admin Console and used **Manage projects** to add Grade **9**, Section **Keats**, project **TEST PROJECT**, reason **NEW PROJECT**. The Apps Script journal recorded `ADD_PROJECT` `APPLIED`. The new entry at `Projects!A426:H426` had immutable ID `VVP-EVENT-118E500FAAE440AB9A7EF44D`. Exhibits increased from 424 to 425.
2. Independently, the organizer submitted **one Android vote for Xeno Chat App** in Grade **6**, Section **Heidelberg**. This is expected and not a project mismatch. The `Feedback!A2:M2` row had timestamp **6 Nov 2026 23:10:45** (sheet display time), rating **5**, language **`hi-IN`**, stable ID **`VVP-VI_HEIDELBERG-G5-S1`**, and non-empty submission/device identifiers. The original feedback was Devanagari (21 Devanagari characters, 0 Latin) and the English translation was different and Latin-script (20 Latin, 0 Devanagari). This validates actual non-English-to-English storage but not independently the translation's full semantic accuracy or the microphone's use.
3. The protected Results board showed one rated project, Xeno Chat App, at **3.75 weighted stars**, **rank 01** (5★ from one vote shrunk by the existing 3.5-star/five-vote prior). This is expected. The active catalog showed 425.
4. **Targeted cleanup after owner authorization:** cleared the contents, not neighboring data or formulas, of `Feedback!A2:M2` and `Projects!A426:H426` in one exact two-request Google Sheets batch. The TEST PROJECT itself never had a vote. Its historical Admin audit `APPLIED` entry was preserved.
5. Follow-up verification: all **424 live Projects** exactly match the 6 November source manifest (`docs/authoritative-roster-2026-11-06.json`) for grade, section, title, active state, stable ID and source key. There are **424 active/unique IDs**, **0 Feedback records**, **0 rated/ranked projects**, **0 language responses**, no TEST PROJECT row, and blank private Feedback Viewer project selection.

## Admin confirmation improvement and release gates

- [PR #76](https://github.com/drcharan287-sketch/science-fair-feedback/pull/76): replaces the visually awkward browser confirm with an accessible VoiceVote-styled project-change review dialog, clear grade/section/name/reason, cancel-no-write, deactivation warning, and sign-out dismissal. Admin key/security, audit, Apps Script data operations, and vote pipeline are unchanged.
- Source/staged browser CI [PASS](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42265352776) and protected Apps Script production [PASS](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42265567084).
- [PR #77](https://github.com/drcharan287-sketch/science-fair-feedback/pull/77) fixed a test's premature retry-readiness assertion during live catalog loading. [Post-merge source CI](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42266326505) and [full published browser tests](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42266326693) **PASS**, without real vote writes.
- No production real Edit/Deactivate/Reactivate test was performed, avoiding disruption to legitimate projects.

## Sign-off and limitations

**Pre-fair software/Android submission and Hindi translation persistence: PASS.** Clean baseline restored, scoped test successfully removed. The school should not reset Feedback or Projects again after genuine 7 November voting begins.

**Physical sign-off still open:** refresh private Results on the actual Senses board to check 424/0 after the ≤45-second private presenter cache expires; visually scan public QR without voting. Actual iPhone Safari and all 23 microphone languages have not been verified on physical devices; typing/manual correction remain essential fallbacks. The tested Android browser may retain its local once-voted state after backend row deletion. The official Excel summary shows 379 despite 424 individually named entries; awaiting school coordinator decision. Single-use passes remain deferred/preparation mode, so cleared storage/device changes cannot be claimed fully controlled.

**Next action:** physical board/QR no-save visual check and final organizer acknowledgment. Do not create any more dummy projects, feedback, translation records or new votes as part of this sign-off.
