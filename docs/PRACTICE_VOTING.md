# VoiceVote Practice Voting — unlimited, no-write rehearsal

**Launch URL:** https://drcharan287-sketch.github.io/science-fair-feedback/practice.html  
**Live parent voting URL (common QR):** https://drcharan287-sketch.github.io/science-fair-feedback/  
**Smart-board Results / Demo:** https://drcharan287-sketch.github.io/science-fair-feedback/results.html

## Why this exists

The live Voting UI correctly blocks repeat submissions after a browser has already voted. This remains important while visitor passes are deferred. Students must be able to explain VoiceVote repeatedly on 7 November without clearing browser storage, issuing additional votes, submitting test feedback or affecting grade rankings.

**Practice Voting is a standalone page and not a bypass of the real vote guard.** It deliberately does not load the live voting JavaScript, and its only fetch retrieves the public GitHub Pages `projects.json` catalogue. It has no Google Apps Script endpoint, no form POST, no device token, and no localStorage read/write. The saved live browser vote lock is never modified.

## Rehearsal (can repeat indefinitely)

1. Open the separate Practice URL or click **Try Practice Voting** on the locked real Voting page or from Results.
2. Select a real project from the public grade/section/project catalogue (currently 407; updates when the approved roster is published).
3. Select English, Telugu, Hindi, Tamil or Kannada. Use the browser microphone's native speech recognition, or type if recognition is unavailable. Edit the transcript.
4. Select 1–5 stars and choose **Show Sample Confirmation**.
5. A visually prominent sample receipt appears with the chosen project, edited text and stars. The receipt explicitly says **NOT SAVED**.
6. Choose **Try Another Practice Vote** to reset only the practice page; repeat as many times as needed.

**Important truth about AI:** The browser speech-to-text interaction uses the real browser recognition API when available (it may use the browser vendor's online speech service). Practice Mode does not call translation and does not show a fabricated translation. In the actual Voting app, non-English feedback is translated at real submission time; do not submit real votes just to rehearse translation. The public Results page shows independently labeled fictional statistics and comments during DEMO; practice receipts never change these fictional numbers.

## Safety and release evidence

- A previous real vote or an unresolved receipt **still blocks real Voting** on the same browser, and that previous state is unchanged by Practice.
- Project suggestions and transcript are displayed with textContent instead of user-supplied HTML.
- A browser test uses synthetic recognition in English, Telugu and Hindi at 1920×1080 / 390×844 / 360×760 layouts, and blocks all non-GitHub network requests and every POST.
- Tests complete two separate practice receipts, verify the existing `voicevote_voted_v1` and token remain unchanged, check the real Voting page still blocks submission, and assert no real feedback was written.
- Real microphone permissions, microphone quality, recognition latency and actual iPhone Safari compatibility need physical checks with the school's own device. Typing must remain a fully supported fallback.

**Never promote a practice submission into a real vote.** Parents should scan the original QR to submit their genuine one-time feedback; students and organizers should use the separate Practice link for demonstrations.

**Next step:** Practice the three-student presentation using the safe Practice page alongside the Results screen in DEMO, before updating tomorrow's teacher roster.
