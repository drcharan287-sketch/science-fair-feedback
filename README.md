# VoiceVote — AI-Powered Science Fair Feedback

**Current continuity:** [PROJECT_STATUS.md](PROJECT_STATUS.md) (full historical tracker) · [Thread handover](docs/THREAD_HANDOVER.md). Check the latest `main` and Actions before following an older screenshot.

**Public/visitor experience:** [VoiceVote Voting UI](https://drcharan287-sketch.github.io/science-fair-feedback/) is the **only destination on the common school QR**. Parents choose Class/Section/Project, speak or type in any of 22 Indian Eighth Schedule languages plus English, review the editable transcript, rate 1–5 stars and submit once per browser token. The previous-language transcript and preview clear on language change. There is **no public Results link, no public Practice page, and no manual comment approval queue**.

**Faculty/student presentation:** Sign into the existing protected Apps Script **Admin Console** → **Faculty Presentation** → **Create temporary owner demo link**. It produces three two-hour temporary links:
- **Faculty Demo Screen:** educational walkthrough, fictional/sample insights and explanation of speech → translation → ranking; no real feedback totals presented as demo.
- **Private Live Results (smart board):** actual read-only aggregate votes, language counts and grade-wise ratings/weighted rankings, refreshing periodically; no individual visitor comments or secrets.
- **No-Save Voting Demo:** the SAME Voting UI that parents see, but with a server-verified temporary no-write presenter ticket. Rehearse repeatedly; do not reset browser locks.

The shared static `results.html` route on GitHub Pages is **access-gated**, not a public screen: without a currently valid presenter ticket its content stays hidden. The Apps Script backend also denies real data without a valid presenter ticket. The base HTML/CSS path remains publicly fetchable because GitHub Pages is public; the private data is not. Keep issued presenter links with faculty/student presenters only; they expire after two hours. **No Admin setting is needed to publish rankings to visitors—and public publishing is disabled.**

**iPhone/iPad translation compatibility:** The usual English preview is a no-save, cross-origin iframe POST. Where iOS Chrome/Safari prevents an inline response, use **Open English translation in a separate tab** after recording/editing. That uses a direct, user-initiated, top-level `translatePreview` POST with no submitted vote and no text placed in a URL. Review the original first; recognition and Google translation are not guaranteed for all 22 languages or devices. Saved feedback still uses the existing server-side translation path.

## Architecture

- **Public Voting:** `index.html`, `voicevote-theme.css`, `voicevote-catalog.js`; public `projects.json` snapshot currently contains **407 stable project IDs** (as verified 6 Nov 2026), pending school roster reconciliation.
- **Private presenter shell:** `results.html`, `results.js`, `results.css`, guarded until the backend verifies a presenter capability. Public `action=publicResults` is permanently DEMO-only; `action=presenterResults` validates a short-lived presenter ticket and returns only aggregate metrics.
- **Protected server and data:** existing managed Google Apps Script `/exec`, restricted `Projects` and `Feedback` Sheets, private Admin Console. Submission is top-level HTTPS form POST, never a saving GET. Receipt is larger on mobile with **Close** on success; errors retain the explicit safe retry path.
- **Ranking:** numeric/Bayesian weighted score `(sum of stars + 17.5)/(number of valid ratings + 5)`; this is **not AI scoring** and is not the official jury award. Individual original and translated reviews stay on demand in the authenticated Admin Console.
- **Privacy and workflow:** No public comments, raw browser tokens, private keys or feedback rows in GitHub. Exceptional Admin vote exclusion is audited and is not a per-comment approval workflow.

## One vote per browser (phased release)

The frontend stores an anonymous, random browser token in `localStorage` and includes it in the POST body. The backend SHA-256-hashes it; under a script lock, it checks **all project submissions** against the stored hashes and rejects subsequent submissions from the same token. A repeated submission ID is idempotent. The backend also verifies the selected project exists in the active roster. Returning from a successful receipt marks the browser as already voted.

This is **not** an unbreakable one-person-or-one-physical-device guarantee: clearing site storage, using a private window, switching browsers, or using another device can create a new token. Shared browsers allow only one visitor to vote. We deliberately do **not** fingerprint users, collect hardware IDs, IP addresses or email addresses. An organizer-issued single-use pass mechanism exists in the backend but is **deferred and hidden from the public form** pending school management coordination. Do not enable mandatory passes. See `PROJECT_STATUS.md` and `docs/VOTE_GUARD_SECURITY.md`.

## Release safety

**Staged rollout is required.** Deploy the fail-closed private-results backend before exposing authorized presenter UI links. Preserve the existing Apps Script deployment, QR destination, accepted browser-token flow, and all Feedback rows. Use source tests and published no-vote browser checks to verify security boundaries.

Run `node --test` to execute in-memory frontend/backend contract tests. These tests do not contact Google or write feedback. The live browser dry run intercepts every POST rather than writing to the production sheet. An explicitly approved real save-and-read test is still useful after the final rollout.

Read `DEPLOYMENT_AUTOMATION.md` for deployment configuration and `docs/VOTE_GUARD_SECURITY.md` for limitations and admin operations.

## Deferred enhancements

Project-specific QR codes and stall numbers are postponed until stall allocations are confirmed. Quick project search, responsive feedback entry and a private admin dashboard are implemented. The next priorities are non-writing mobile/multilingual readiness tests, a final live-device test batch and the official full project roster. Public leaderboard publication is disabled; actual grade rankings are restricted to faculty/student presenter links. Visitor passes remain deferred. See `PROJECT_STATUS.md`.
