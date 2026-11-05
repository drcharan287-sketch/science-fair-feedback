# VoiceVote — Science Fair Feedback

**Living project handover and validation tracker:** [PROJECT_STATUS.md](PROJECT_STATUS.md). Read this first when resuming in a new ChatGPT thread.

VoiceVote is a multilingual, AI-assisted science fair feedback experience: **407 active exhibits as of 5 November 2026**, with a larger roster expected. Parents use **one shared event QR** to open the redesigned phone-first Voting form. A separate responsive Results screen lets students demonstrate anonymous participation and multilingual insights on the Senses classroom smart board, without exposing unpublished rankings or private reviews.

**Live pages:** [Parent Voting UI](https://drcharan287-sketch.github.io/science-fair-feedback/) · [Audience Results & Demo](https://drcharan287-sketch.github.io/science-fair-feedback/results.html)

**Owner demonstration:** Use the authenticated Admin Console → **Owner Demonstration** to generate a temporary two-hour link that opens the SAME Voting page in no-write demo mode. It can rehearse repeatedly even on a browser that previously voted. No public Practice app, feedback submission, translation request, vote-lock reset or ranking change occurs. Parents never see a Practice invitation. See [Audience and owner operations guide](docs/AUDIENCE_RESULTS_EXPERIENCE.md).

**How to operate the audience screen safely:** [Audience Results guide](docs/AUDIENCE_RESULTS_EXPERIENCE.md). **Default = DEMO** (fictional sample display, no real rankings), with real Live totals and Published grade rankings available only after an authenticated, audited organizer decision.

## Live architecture

- **Frontend:** `index.html`, `voicevote-theme.css`, `voicevote-catalog.js` for parent Voting; `results.html`, `results.css`, `results.js` for smart-board and mobile Results on GitHub Pages.
- **Catalog:** `Projects` tab in Google Sheets; `projects.json` is an automatically synchronized, public, read-only snapshot with a live JSONP fallback.
- **Feedback:** Top-level HTTPS form `POST` to the existing Google Apps Script `/exec` deployment. The Google-hosted receipt confirms saves. GET saving is deliberately disabled.
- **Storage:** `Feedback` tab uses eight visible columns: Date, Project, Class, Section, Original Feedback, Rating, Language, English Translation. Columns **I/J** are hidden audit fields: Submission ID and SHA-256 device token digest.
- **Admin:** The spreadsheet contains a private `Admin Rankings` tab and a `Feedback Viewer` tab. Ranking uses vote counts, average stars, and a Bayesian-style score with a prior of five 3.5-star votes. Feedback text stays out of the ranking table and appears in the viewer only when an admin selects a project. Private results use the signed-in Admin Console and Google Sheet permissions. The separate **read-only** public Results API returns only mode-approved aggregate fields, and no individual visitor comments; it never returns raw private Feedback records.

## One vote per browser (phased release)

The frontend stores an anonymous, random browser token in `localStorage` and includes it in the POST body. The backend SHA-256-hashes it; under a script lock, it checks **all project submissions** against the stored hashes and rejects subsequent submissions from the same token. A repeated submission ID is idempotent. The backend also verifies the selected project exists in the active roster. Returning from a successful receipt marks the browser as already voted.

This is **not** an unbreakable one-person-or-one-physical-device guarantee: clearing site storage, using a private window, switching browsers, or using another device can create a new token. Shared browsers allow only one visitor to vote. We deliberately do **not** fingerprint users, collect hardware IDs, IP addresses or email addresses. An organizer-issued single-use pass mechanism exists in the backend but is **deferred and hidden from the public form** pending school management coordination. Do not enable mandatory passes. See `PROJECT_STATUS.md` and `docs/VOTE_GUARD_SECURITY.md`.

## Release safety

**Staged rollout is required.** Publish the frontend token changes first, verify the live browser POST includes `deviceToken`, and only then deploy backend validation. Deploying the token-required backend before the new frontend would reject submissions from visitors with cached older pages. Existing script and GitHub Pages deployments are preserved through GitHub Actions.

Run `node --test` to execute in-memory frontend/backend contract tests. These tests do not contact Google or write feedback. The live browser dry run intercepts every POST rather than writing to the production sheet. An explicitly approved real save-and-read test is still useful after the final rollout.

Read `DEPLOYMENT_AUTOMATION.md` for deployment configuration and `docs/VOTE_GUARD_SECURITY.md` for limitations and admin operations.

## Deferred enhancements

Project-specific QR codes and stall numbers are postponed until stall allocations are confirmed. Quick project search, responsive feedback entry and a private admin dashboard are implemented. The next priorities are non-writing mobile/multilingual readiness tests, a final live-device test batch and the official full project roster. Public leaderboard publication remains opt-in, and visitor passes remain deferred. See `PROJECT_STATUS.md`.
