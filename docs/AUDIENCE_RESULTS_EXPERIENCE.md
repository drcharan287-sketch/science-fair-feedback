# VoiceVote — one voting experience, owner demonstration and audience results

**Reviewed:** 5 November 2026  
**Public Voting/common QR:** https://drcharan287-sketch.github.io/science-fair-feedback/  
**Audience Results:** https://drcharan287-sketch.github.io/science-fair-feedback/results.html  
**Owner Demonstration:** Launch a temporary link from the **authenticated Admin Console**. Do not share the link; it opens the **same Voting page** and expires within two hours.

## Three purposes, no duplicate public Practice application

**Parents:** Use the common event QR for a real vote. Once submitted or pending, the existing browser lock protects against another submission on that browser. Nothing about this safety behavior is changed by the Results mode.

**Owner and student presenters:** The owner opens the existing Admin Console, signs in, expands **Owner Demonstration**, and clicks **Create temporary owner demo link**. The generated link uses an opaque, short-lived ticket in the URL *fragment*, verified with a read-only Apps Script request. An expired/invalid link cannot unlock the page. Only the authenticated, verified owner session enables repeated in-memory sample confirmations using the exact same grade/section/project, speech recognition, editable transcript and star UI as the real Voting page. No form POST, Feedback write, browser-token change, or ranking change occurs. A sample receipt explicitly says **NOTHING SAVED**. To rehearse again, click **Demonstrate Again**.

**Audience:** Results stays a separate, optimized 16:9 smart-board/phone page. It supports fullscreen, high-contrast bright-room mode, and grade-wise spotlight rotation. Results publication is independent of presenter demonstration and of real voting permissions.

## AI — truthful demonstration

Speech-to-text uses the browser's native recognition API when supported and appropriate microphone permission is granted. Real submit translates supported non-English feedback into English in the Apps Script backend. **The owner demo and the parent Voting page now display a real English translation preview immediately below the editable transcript for Telugu, Hindi, Tamil and Kannada.** The preview calls the existing Google `LanguageApp.translate` service through a read-only `action=translatePreview` HTTPS POST using a hidden frame and a verified message response. Transcripts are never sent in a URL, and preview requests cannot save feedback or consume a vote. The preview refreshes after speech stops or typing pauses; it may fail if Google is unavailable, without blocking real feedback. English-only hides the preview. The submitted original text remains editable and authoritative; a **separate** translation is generated during a real save. Presenters can demonstrate actual translation without casting a test vote.

## Feedback, rankings and privacy

Feedback is automatically recorded and translated when parents submit. There is **no public feedback approval queue and no requirement for students to moderate reviews**.

The public Results API never returns individual original or translated visitor comments, browser identifiers, tokens, or admin keys. Instead the page displays the actual pipeline (speech → translation → score calculation), and aggregated language/participation trends. Full original and translated reviews remain available on demand in the existing private Admin Console; it retains optional exceptional vote-exclusion and audit controls, which are not a per-comment approval process.

Audience Results server-owned modes:
- **DEMO:** default; preview of interface cards labeled clearly **fictional**; real project count only, and no fake participation totals or visitor comments.
- **LIVE:** real anonymous participation aggregates, *no project rankings*.
- **PUBLISHED:** grade-wise weighted audience rankings, enabled only by a signed-in organizer after an audited decision. Ratings are **not** official jury awards.

The weighted score is `(total_stars + 17.5) / (valid_votes + 5)`. A mode-specific 45-second cache reduces repeated read-only Sheet access; the server checks publication mode for every request. A URL parameter cannot force results publication.

## No-write release checklist

- Run `node --test` on the PR before merging.
- Ensure the direct public Voting page is still locked after an already-recorded or pending submission and shows no Practice link.
- Test an invalid/expired presenter fragment: locked and no POST.
- Test a server-verified presenter fragment: allow two or more sample confirmations in the same Voting interface; never change `localStorage` or send a POST. Test English, Telugu and Hindi mocked speech recognition, transcript editing and stars on board/phone viewports.
- Validate Results has no public comment approval workflow or dynamic visitor quote rendering, and publication modes still gate numerical rankings.
- After merge, run the published read-only browser test suite; verify 407 active projects/stable IDs and unchanged production feedback count.
- The actual Senses Electronics smart board, Android Chrome microphone, and iPhone Safari require physical-device acceptance checks before the fair.

## Simplicity rules

No public Practice link. No separate Practice voting application. No manual feedback approvals. No browser-storage resets for demos. No visitor-pass rollout. Preserve the live QR, stable project identities, feedback records and Google-hosted receipt.

**Next constructive step:** Validate owner-generated temporary demo access on the actual demonstration device, rehearse twice using the common Voting page, and keep Results in its existing DEMO publication state until the organizer deliberately changes it.
