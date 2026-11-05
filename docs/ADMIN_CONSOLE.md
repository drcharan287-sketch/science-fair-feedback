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
- Every mutation writes to a private Admin Action Log tab.

## Security
The existing public web app executes as the owner, so Session.getActiveUser().getEmail() is not a trustworthy identity check for anonymous visitors. The admin login therefore uses a randomly generated 256-bit key. Only its SHA-256 hash is versioned on public GitHub. Every admin API validates the key *before* opening the private Google Sheet; the key is not stored in browser localStorage, HTML or URLs.

Keep the plaintext key private. Anyone with the key has admin permissions, and the audit log cannot distinguish people sharing it. Rotate/redeploy if leaked. For individually authenticated administrators, consider a separate Google-authenticated admin deployment later.

## Release and tests
The production workflow overlays AdminApi.js and Admin.html while preserving the existing web app and public feedback flow. Contract tests cover no-access authorization, private review drilldown, votes, moderation and pause/resume. A read-only Chromium smoke test confirms an invalid key is rejected. It does not submit production feedback or open reviews.

## Future voter resets
Excluding a vote from rankings **does not** unlock that visitor's browser. A real re-vote exception needs a one-time, expiring, staff-issued reset code and a logged policy on whether the original vote is counted. Do not provide an unauthenticated public reset button. Browser tokens cannot guarantee one vote per person.
