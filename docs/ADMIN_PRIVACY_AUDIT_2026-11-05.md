# VoiceVote — Admin Console Security, Privacy and Dashboard Reliability Review

**Review date:** 5 November 2026 (IST)  
**Scope:** Tracker VV-08 (private admin dashboard) and VV-09 (sharing and data protection).  
**Safety:** Source inspection, Google Drive permission/metadata reads, bounded non-comment Sheet reads, local fake-key unit tests and read-only invalid-key browser checks only. No production feedback submissions, votes, moderation or Sheet edits authorized.

## 1. Observed production facts (read-only)

- Google Sheet titled **Feedback**: Google Drive returned **one named owner and two named editors**. It did **not** return any `anyone` or domain-wide permissions. The sheet is *shared*, but this is not the same thing as link-public. The school organizer should independently confirm the three named accounts still need access.
- Tabs were `Feedback`, `Projects`, `Admin Rankings`, `Feedback Viewer`; there was no `Admin Action Log` at inspection. The absence of a log tab means there is no live audit entry to inspect yet; it does not demonstrate audit behavior in production.
- Feedback contained two existing rows. **Only schema and non-comment fields were read** for this audit: 2 ratings of 5, 1 `te-IN` and 1 `hi-IN`; one legacy device row and one SHA-256-hash-protected row. Both `Projects` records were active. No vote statuses were populated. Do not publish actual visitor comments.
- Expected algorithmic overview for these two active rows (if no data changed) is accepted=2, excluded=0, rated projects=2, two used languages; 1 vote/project, mean 5.00, weighted score **3.750** each under the documented five-vote 3.5 prior. **This is a calculation from Sheets + reviewed source**, not an authenticated live-admin dashboard read.

## 2. Verified or implemented protections

- Public Apps Script `?action=admin` serves an unauthenticated *login shell*. Admin data calls require `adminRequireKey_` before opening Google Sheets. Source stores only SHA-256 of a high-entropy admin key, not the plaintext key. A smoke check with an invalid key is deliberately nonwriting.
- Rank overview returns counts and numeric scores **without original or translated feedback text**. A separate credential-checked `adminGetReviews` retrieves up to 30 reviews per project per page, including a status marker for excluded rows. `adminGetVoterActivity` excludes raw device tokens, hashes and feedback text from its response.
- Original feedback and translations are rendered in DOM using `textContent`, never interpreted as HTML. Local tests use synthetic markup-like review text to guard against accidental injection.
- The UI now invalidates outstanding RPC callbacks when administrators sign out or begin a different login attempt, clears private results/reviews/voter activity/pass history from hidden DOM, and avoids duplicate review-page requests. A delayed server reply cannot redraw a signed-out dashboard. Sign-out **does not revoke the actual shared admin credential** or cancel a Google server call already dispatched.
- Moderation `VOID`/restore operations retain the original feedback row; ratings marked VOID are excluded from rankings. Pausing/resuming voting uses server-side configuration. Contract tests cover credential rejection, score calculation, review pagination and the nondeletion rule.

## 3. Residual limitations and follow-up decisions

| Priority | Item | Importance / action |
| --- | --- | --- |
| **P1** | **Shared admin credential** | A single 256-bit key cannot attribute actions to individual staff. `Actor` is `Admin credential`, not a named user. Restrict key distribution; plan per-organizer Google identities and rotation when appropriate. |
| **P1** | **Audit write ordering** | The backend mutates a vote/property then appends its audit row. If the log append fails, the mutation could persist without a log. Local tests verify successful paths, **not this failure mode**. Add a robust failure/reconciliation design before relying on audit as tamper-evident history. |
| **P1** | **Deferred visitor-pass admin controls** | Public visitor-pass UI is hidden, but protected admin controls still exist. Activation without publicly distributed passes could block visitor submissions. Keep the policy deferred and confirm `preparation` mode with an authorized organizer; do not issue or activate passes. |
| **P1** | **Authorized admin UAT** | Live valid-key ranking, actual on-demand reviews, audit logging and access from organizer devices were deliberately not exercised. Schedule one supervised read-only verification; do not paste the admin key into chat or CI logs. |
| **P1** | **Google Sheet sharing review** | Confirm the owner/two editor accounts, external sharing and whether all three need edit rights; this is an organizer decision. Do not grant visitors Sheet access. |
| **P2** | **Rankings with inactive/VOID-only projects** | Overview is limited to active catalog entries, and the review button is disabled when accepted vote count is zero. Feedback for deactivated or fully excluded projects can still exist but may not be browsable through rankings; decide whether private review access should include these records. |
| **P2** | **Credential guessing and response size** | Long random key limits practical guessing; no durable per-admin throttling or per-person revocation is implemented. Admin API currently scans Feedback for each overview and review; evaluate performance before ~300-project event load. |

## 4. Test evidence and boundaries

- `test/admin.test.js`: fake local admin key; rejects unauthenticated result/moderation access; exact weighted score; original text absent from overview; paginated project-bound reviews; no writes on reads; moderation and pause/resume in mocked Sheets only.
- `test/admin-ui.test.js`: fake `google.script.run`; delayed logout callbacks, stale private results, text-only review rendering, duplicate pagination, and project-switch races, **without Google access**.
- Existing `scripts/verify-admin-access.mjs`: real published login shell with a deliberately invalid key. It cannot verify authorized login or a real moderation audit.
- GitHub Actions `Deploy VoiceVote Apps Script` is configured to pull the existing app, overlay reviewed sources, deploy the same web app, then run catalog, POST-probe and invalid-admin-key checks, with deployment rollback on smoke-test failure. Check the specific run before marking this update deployed.

**Verified release evidence:** [PR #22](https://github.com/drcharan287-sketch/science-fair-feedback/pull/22) merged into `main` as `588baad4`. The [Apps Script production workflow](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42004182528) completed successfully, updating the existing deployment to **version 23**. All **41** contract tests passed; the live catalog, no-write POST probe, and deliberately invalid admin login passed. A subsequent [nonwriting POST verification](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42004325921) passed. A fresh read-only Sheet check still found two feedback records and one owner + two editors with no broad sharing role. No production records or moderation state were changed.

**Not established by this review:** independent penetration-test assurance, secret rotation, named-user identity, actual signed-in organizer acceptance, audit failure recovery, physical iPhone Safari behavior, or real Telugu/Hindi translation.

## 5. Administrator handoff checklist

1. Review Google Sheet → Share: verify one owner plus two named editors belong to approved organizers, no public link permission, and remove excessive privileges as needed.
2. Keep the admin access key private. Sign out after use; avoid shared/public computers. Avoid opening protected reviews during screen sharing.
3. Verify the Admin Console at its existing `?action=admin` URL using the key locally, **without transmitting it to ChatGPT**. Confirm ranking counts, language totals and one project review load; do not edit records.
4. Check the authorized pass-mode status remains **preparation**. Do not activate visitor passes until school management adopts a distribution process.
5. Before event operation, resolve audit-write failure behavior and establish organizer accountability/recovery procedures.

**Next best step:** Verify the reviewed Admin HTML deployment and CI invalid-key check, update `PROJECT_STATUS.md` with evidence, and then plan the remaining authorized organizer check without changing any feedback record.
