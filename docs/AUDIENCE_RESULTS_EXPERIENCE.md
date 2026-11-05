# VoiceVote audience display — smart board, parents and privacy

**Created:** 5 November 2026  
**Voting URL / existing common QR:** https://drcharan287-sketch.github.io/science-fair-feedback/  
**Audience experience:** https://drcharan287-sketch.github.io/science-fair-feedback/results.html

## What is implemented

The new `results.html` is independent from the private Admin Console. It has:
- A visually distinctive 16:9 smart-board layout, larger text, grade-oriented cards, language distribution and a curated feedback wall.
- Parent-friendly, responsive phone layout; smart-board fullscreen toggle, bright-room mode, and optional grade auto-rotation.
- **DEMO:** default; only synthetic, clearly labeled sample scores and sample remarks; uses real public project *count* but reads **no Feedback**. Never treats samples as real votes.
- **LIVE:** only public counts of accepted ratings, appreciated exhibits and language activity; **never publishes rankings**.
- **PUBLISHED:** grade-wise weighted audience rankings *only* after a deliberate authenticated organizer mode change. The calculation matches private Admin (five-vote 3.5-star prior). These are **not official jury awards**.
- Raw private feedback, browser tokens, submission IDs, admin credentials and the full Feedback sheet are never sent by the audience API.
- Separately curated highlights only: an optional restricted tab `Public Highlights` with six columns:
  `Approval Status | Project ID | Quote | English Translation | Language | Approved By`.
  A row is public only if its status is `APPROVED`, the project ID is active, the quote is nonempty and ≤240 characters, and `Approved By` is nonempty. Moderators must remove names, phone numbers and identifying details **before** setting APPROVED. The system does not automatically extract or approve raw visitor remarks.

The public Results endpoint is Apps Script `/exec?action=publicResults&callback=...`. It returns *only allowed fields for the server-owned mode*. It accepts no client-provided override of mode. Apps Script `doGet` remains read-only; feedback uses the existing POST form.

## Publication controls (private)

After signing in to the existing Admin Console, expand **Audience Display · publication controls**. Select DEMO, LIVE or PUBLISHED, enter a meaningful 8–200 character reason, and confirm. The backend validates the admin key and writes an audit journal before setting the Script Property `VOICEVOTE_PUBLIC_RESULTS_MODE`.

**The feature is deployed in DEMO mode by default.** Do not select LIVE or PUBLISHED before organizer approval and sufficient representative attendance. One can revert to DEMO using the same audited control. No visitor passes or private comments become public from this change.

## Smart-board operation

1. Open the audience URL in the Senses Electronics board browser or mirror it from a laptop.
2. Choose **Brightness** for brightly lit halls; choose **Full screen** where supported.
3. Select a Grade or use **Auto-rotate grades** for hands-free presentations. Disable auto-rotation during explanations.
4. Verify the top banner says **DEMO MODE · SAMPLE DATA** before student demonstrations.
5. For parents, keep the common QR directed at the existing voting URL. The Results link is navigational only; opening it never votes.

No specific board resolution is assumed. Layout is tuned to bright 16:9 displays and 360–430px mobile screens, with responsive scaling and reduced-motion accessibility. HTML/CSS/JS are deliberately self-hosted without external frontend frameworks or required fonts.

## Score/fairness note

Published rankings are computed using the same weighted score as the Admin Console:
`(total_stars + 17.5) / (valid_votes + 5)`. All VOID votes and votes for unknown/inactive projects are excluded. Grade ranks reset independently. Before PUBLISHED mode is authorized, live participation totals are safer than a premature winner announcement.

## Tests and release gate

- Local in-memory tests verify default DEMO does not read Feedback, LIVE has no rankings, PUBLISHED uses correct scores, approved-only excerpts, and admin-key/audit gating.
- Browser tests intercept **all** Apps Script GET responses with synthetic fixtures (and block every non-GET request). They check projector and phone widths, bright-room toggle, grade filtering, demo-only query bypass, quote HTML injection safety and zero production votes.
- Publication gate verifies the exact committed Voting/Results HTML/CSS/JS before browser smoke tests.
- Existing Apps Script deployment workflow stages reviewed code and includes read-only catalog, no-save POST probe, invalid-key access rejection and rollback on smoke failure.
- Real physical Senses board brightness/touch behaviour, iPhone Safari and real microphone transcription remain organizer/device checks.

**Future enhancement:** A richer public feedback moderation workflow, greater than eight highlight rotation, and detailed grade analytics can be staged later. Keep the current display safe and fast for the 7 November event.
