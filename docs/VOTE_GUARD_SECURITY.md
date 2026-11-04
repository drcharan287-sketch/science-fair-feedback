# VoiceVote — voter integrity and admin access

## What the current design enforces
- One accepted feedback/rating per **persistent browser token** for the entire science fair (not one per project).
- The browser generates a random UUID and stores it on the VoiceVote GitHub Pages origin.
- The HTTPS form sends the token in its POST body; only a SHA-256 digest is stored in the private `Feedback` sheet, column J. Column I contains the request's UUID so duplicate network retries cannot add new rows. Both columns should be hidden from normal admin views, not deleted.
- The Google Apps Script locks the sheet, validates the selected class/section/project against the active catalog, rejects existing device hashes, and appends feedback and audit fields in **one row**. Public GET save calls are rejected.
- A successful receipt adds `?vote=success` to the Return link, allowing the browser to disable the form on return.

## Important limits (do not market as unbreakable security)
- Browser storage is **not** a physical device ID. Clearing site storage, incognito mode, switching browsers, and different devices can bypass it. No user fingerprinting is performed.
- Shared devices (e.g. a teacher's kiosk phone) are limited to one vote in that browser. Provide separate visitor devices or use organizer-issued one-time attendee codes.
- Existing historical feedback records predate token issuance; the backend cannot retroactively identify their voters.
- Any public app with anonymous submissions can be subjected to scripted abuse; token storage is a fairness deterrent, not cryptographic identity proof.
- Malicious visitors could fabricate a new UUID. Stronger enforcement needs unique single-use attendee credentials issued at entry, verified server-side against an event roster, optionally rate-limited. This is independent of project QR codes.
- Apps Script has quota, execution-time and concurrency limits; use pre-event load testing and a fallback paper collection plan. Avoid heavy service calls or a live public leaderboard during peak submissions.

## Admin dashboard and rankings
- Google Sheet `Admin Rankings` includes *all active registered projects*, automatically refreshes rankings from new feedback rows, and shows Rank, Class, Section, Project, Vote count, Average stars, Weighted score, and a feedback-viewer link.
- Weighted score = `(votes × average stars + 5 × 3.5) / (votes + 5)` for voted projects; unrated projects have score zero. This minimizes the effect of a single 5-star rating. Ranking is for audience feedback, not necessarily jury awards.
- Feedback Viewer remains blank until an admin selects a `Class ♦ Section ♦ Project` entry. Only then does it show date, original feedback, rating, language and English translation.
- Access is restricted through **Google Sheets sharing**. Do not grant public view/editor access to the original Feedback spreadsheet. The public `projects.json` file contains project names only; feedback text is not published.
- Hiding spreadsheet tabs is a usability feature, not an authorization boundary.

## Operational controls
- Before the backend rollout, reserve columns I and J in Feedback, with headers `Submission ID` and `Device hash`, then hide them. Do not alter columns A:H.
- Do not delete or modify a questionable row without the organizer's approval. Prefer retaining a private audit backup.
- If a genuine voter needs a reset, do not give them a public reset button. The organizer can review the corresponding row's device hash and make an audited exception; this should be implemented before event day if resets are expected.
- Review feedback for inappropriate text before any public display. Avoid exposing private comments on the public GitHub Pages app.
- Run the backend deployment's non-writing POST probe and the frontend's intercepted POST dry-run after each release, then conduct one explicitly approved real save-and-read test.

## Recommended next phase
Issue one unique voting code per attendee (paper badge or admission pass; no 300 project-specific QR codes). A code may be redeemed once for a single project, providing a stronger event-wide one-vote rule without collecting private device fingerprints. Consider a staff-controlled override for accessibility and shared devices.
