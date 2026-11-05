# VoiceVote deployment automation

This repository owns the frontend (`index.html`, `voicevote-catalog.js`) and the backend (`apps-script/Code.gs`). Codex modifies code through reviewed pull requests. On merges to `main`, GitHub Pages publishes the frontend according to existing Pages settings. GitHub Actions tests the project; if backend files changed, a separate workflow updates the **existing** Apps Script web app via `clasp`, without copying code into the Apps Script editor.

## One-time setup (Google account owner)

1. Review `apps-script/Code.gs` against the deployed Feedback 360 Apps Script. The repository copy includes the `YOUR_SPREADSHEET_ID` placeholder; its value is inserted only during deployment. Verify both `Feedback` and `Projects` sheet tabs. The GitHub version includes existing catalog/save JSONP handlers.
2. Enable Google Apps Script API in your Google account at https://script.google.com/home/usersettings and authorize the existing Apps Script project as necessary. Google consent cannot be delegated to Codex automatically.
3. From Google Apps Script **Project Settings**, identify the **Script ID**. From **Deploy → Manage deployments**, identify the existing web app **Deployment ID**. These are not interchangeable. Get the sheet's **Spreadsheet ID** from its URL.
4. On your own trusted PC, once: install a supported Node.js version, run `npm install -g @google/clasp@3.4.1`, and run `clasp login` with the Google account owning the Apps Script project. This writes a sensitive `~/.clasprc.json` credential file. Do not upload, email, commit, or paste this credential in ChatGPT or a Codex prompt.
5. Open the GitHub repository's **Settings → Environments** and create `voicevote-production`. Add environment **variables** `APPS_SCRIPT_ID` and `APPS_SCRIPT_DEPLOYMENT_ID`. Add environment **secrets** `VOICEVOTE_SPREADSHEET_ID` and `CLASPRC_JSON` (complete contents of the local `~/.clasprc.json` credential file). The credential stays in GitHub Secrets, never repository code. Use required reviewers where available; never merge unreviewed workflow changes.
6. Verify this script/deployment/sheet mapping and the live project files before first release. Prefer to validate against a separate Google test script and sheet first. The workflow **pulls the existing Apps Script project** before overlaying the backend. `clasp pull` names the backend `Code.js` locally even though the Apps Script editor calls it `Code.gs`. The workflow updates this pulled `Code.js`, preserving `Index.html`, the manifest and any other live files. If the pulled `Code.js`, `Index.html`, or manifest is missing, it stops rather than pushing a partial project.

## How updates work

- `voicevote-ci.yml`: run Node contract tests on PRs and pushes to `main`.
- `voicevote-google-check.yml` (installed on `main`): check Google authentication, the existing script/deployment IDs, remote files, and the hosted catalog read-only; runs when that workflow is updated and can be run on demand. No feedback is submitted or Apps Script source pushed.
- `deploy-apps-script.yml`: after `apps-script/**` changes land on `main`, run tests, pull the remote project, replace only the pulled backend `Code.js` in that retrieved copy, and use `clasp push --force` + `clasp update-deployment` with the configured existing deployment ID. It can also be run manually via GitHub **Actions → Deploy VoiceVote Apps Script → Run workflow**. The manual **verify** mode (default) performs read-only checks without a push or deployment; choose **deploy** only when authorized.
- The workflow verifies that the deployment ID belongs to the configured Apps Script project before any push. After deployment, `scripts/smoke-catalog.mjs` makes a read-only request to the published catalog and fails the workflow if the expected JSONP data cannot be loaded. This post-deploy check does not save feedback. If the smoke test fails after updating the existing web app, GitHub Actions automatically restores the previously deployed immutable version. The script project's editable HEAD source may still contain the new code; the public deployment version is restored.
- No additional copy/paste of code is required for subsequent feature changes. Only initial OAuth authorization / storing CI credentials is interactive.
- Google Sheets catalog rows are data, so project names/sections can continue to be edited in Sheets without modifying code.

## Safeguards and limitations

- `clasp push` replaces **all** code in the online Apps Script project. The pull-first workflow is intended to preserve other live files. Still compare the live project with the repository before enabling the first production run; existing unsaved source edits could be overwritten. The workflow does **not** configure the web app execute-as/access settings.
- The workflow currently relies on a Google OAuth refresh token in a GitHub environment secret. Keep the environment restricted and review all workflow edits; rotate/revoke credentials if compromised.
- Successful simulated tests do not prove that the live Apps Script deployment is authorized. Verify read-only catalog loading, do a separately approved save to a test spreadsheet, check translation, and test speech recognition/microphone permissions on actual devices.
- Feedback submission now uses a top-level HTTPS `POST` body and an Apps Script HTML receipt. Legacy JSONP `GET` saving is rejected server-side; JSONP is retained only for the read-only project catalog. Keep reviewing privacy, spreadsheet permissions and response safety before the school event.
- If any step fails, inspect the GitHub Actions logs; do not manually copy code into production to bypass errors.
