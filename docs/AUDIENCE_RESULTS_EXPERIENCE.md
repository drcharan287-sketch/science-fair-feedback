# VoiceVote — clean visitor / faculty presentation pipeline
**Updated:** 6 November 2026 (IST). This supersedes the old public Results modes and public Experience navigation.  
**Public QR:** https://drcharan287-sketch.github.io/science-fair-feedback/  
**Faculty screen shell:** https://drcharan287-sketch.github.io/science-fair-feedback/results.html — **restricted without a short-lived presenter ticket**.  
**Admin Console:** open the existing organizer-only Apps Script `/exec?action=admin` bookmark and authenticate.

## Three experiences — one public QR

| Audience | What they open | What happens |
| --- | --- | --- |
| Parents / visitors | Common QR → public Voting | Choose exhibit, speak/type/edit in 23 selectable languages, rate, submit. No link to Results or Practice. |
| Faculty / student presenters | Admin → **Faculty Presentation** → **Open Faculty Demo Screen** | Private page with clear example cards and an explanation of browser speech recognition, English translation, and numeric ranking. Example metrics are explicitly fictional; no real votes are cast. |
| Faculty / architect on Senses smart board | Admin → **Faculty Presentation** → **Open Private Live Results** | The same authorized presentation shell opens the real, read-only aggregate dashboard, language/participation metrics and grade-wise weighted rankings, refreshed approximately once a minute. No individual visitor comments. |
| Faculty / students rehearsing visitor workflow | Admin → **Faculty Presentation** → **Open No-Save Voting Demo** | The exact same Voting UI as parents, using a temporary owner-verified no-write ticket. Repeat without consuming a real browser vote or saving to Google. |

### How to launch faculty screens
1. Sign into the Admin Console using the existing organizer credential. Do **not** put the credential in a URL, chat, screenshot or GitHub file.
2. Expand **Faculty Presentation · Demo Voting and Private Live Results**.
3. Choose **Create temporary owner demo link**; three links appear.
4. For the Senses smart board, open **Open Private Live Results**. To teach the app pipeline first, open **Open Faculty Demo Screen** instead. Both have a Demo/Live switch once authorized.
5. Students can launch **Open No-Save Voting Demo** to demonstrate actual microphone/transcript/rating/translation without sending a real vote.
6. The temporary presenter capability expires after **two hours**. Reissue a fresh faculty link from the authenticated Admin Console when needed. Never paste the link into the parent QR or public materials.

**Important technical boundary:** GitHub Pages hosts static HTML publicly, so the `results.html` file can be fetched by anyone. The UI is locked/hidden until authorization, and the **backend** denies access to actual aggregates without a valid organizer-issued token. Direct visits such as `results.html#leaderboard`, forged fragments, expired tokens and public mode parameters cannot expose results. Presenter links are bearer capabilities: anyone possessing one can access the permitted aggregate screen until it expires, so restrict their distribution.

## Speech and English translation on iOS Chrome / Safari
- Web Speech is a browser/OS capability, **not guaranteed** for all 22 Eighth Schedule languages. Chrome on iPhone shares Apple's browser engine behavior and may stop recognition after one utterance. The UI uses a single-utterance lifecycle on iOS; press **Start** again if required, then review/edit the transcript.
- The normal English preview is a separate `action=translatePreview` HTML POST into a hidden frame. Some iOS/browser configurations can block that embedded response; this may look like a translation error even when the recognized original text exists.
- After speech stops, on iPhone/iPad use **Open English translation in a separate tab** if the inline preview is blank, timed out or incorrect. That top-level HTTPS POST transmits only the selected-language text in its body; the returned Google-hosted page shows the original and English preview and records **no vote**. Return to the original Voting tab to submit if desired.
- If the **original transcript itself is incorrect**, edit it before previewing or use the device keyboard's dictation/text entry. Translation of incorrect source text cannot be fixed by merely retrying.
- Google translation is best effort and may be unavailable for some languages or sentences. The original feedback remains authoritative and is preserved on actual save. A real vote creates a fresh server-side translation, separate from either preview.

## Reviews, results and approval policy
- **Feedback is saved immediately** on successful POST (subject to project, token, valid rating and voting-open checks); there is **no manual comment approval queue** and no requirement for students to approve submitted feedback.
- The Admin Console retains exceptional audited vote-exclusion/restore controls for integrity problems; they do not routinely approve or rewrite visitor text.
- Individual original-language and English-translated reviews remain private in Admin on-demand review drill-down, not on the presenter Results screen.
- Public `action=publicResults` is **DEMO-only**, regardless of legacy public setting. The Admin Console no longer offers LIVE/PUBLISHED public publication controls. Only ticket-validated `action=presenterResults` returns real aggregate standings.
- Weighted result formula: `(valid rating stars + 17.5) / (valid votes + 5)`. These are *audience appreciation* rankings, not official school/jury awards.

## Verification without consuming votes
Use a reviewed PR, `node --test`, staging browser checks with every cross-origin save intercepted, then exact published GitHub Pages checks. Verify: common QR contains no Results link; direct `results.html` route is locked; invalid and expired presenter tickets deny content; authorized faculty Demo and private Live work at 1920×1080 and phone widths; Admin can create the three links; no original/review data enters the public response; iOS separate preview contains only `action=translatePreview` and never submits a vote.

Real iPhone Chrome/Safari, actual Senses smart board microphone and live translation accuracy must be tested on hardware separately. Do not reset a production browser vote lock or submit test votes.

**Next constructive step:** Open a temporary faculty presenter link on the Senses board and run one coordinated iPhone Chrome/Safari Telugu/Hindi transcript + standalone English-preview acceptance batch without casting a real vote.
