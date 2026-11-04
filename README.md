# VoiceVote — science fair feedback

A static feedback page with a Google Apps Script web app and Google Sheets catalog.

## Configuration and backend contract

Set `SCRIPT_URL` in `index.html` to the deployed Google Apps Script **web app** URL, ending in exactly one `/exec`. The page and `voicevote-catalog.js` must be hosted together. The web app must be deployed with access appropriate for all visitors and must be able to read the intended spreadsheet's Projects sheet and write its Feedback sheet. After changing Apps Script code or permissions, update the web app deployment as appropriate. This repository does not contain the Apps Script source; deployment, spreadsheet IDs, sheet headers, permissions and actual backend behavior cannot be verified from the frontend alone.

The existing frontend expects JSONP (a JavaScript callback), not ordinary JSON or a POST endpoint:

- `action=catalog&callback=...` returns a callback containing `{success: true, projects: [{grade, section, project}, ...]}`. The backend is responsible for selecting active Projects sheet rows. Grade, section and project can be strings or numbers and must be nonempty. The selectors use these values as supplied (apart from trimming whitespace).
- `action=save` receives `studentClass`, `section`, `project`, `feedback`, `language`, `rating` and `callback` as query parameters and must invoke the callback with `{success: true}` only after saving, or `{success: false, message: "..."}` on failure.

If the catalog reports an error, check the URL, web app access, deployed code, spreadsheet access, Projects sheet and response format. An empty catalog means no active rows were returned. A script that loads without invoking the callback may indicate an authentication page, incompatible deployment or unsupported JSONP action. The frontend cannot distinguish all of these cases.

Saving uses a GET request and JSONP because that is the existing frontend contract. Feedback appears in the request URL and may be recorded in browser or server logs; JSONP also executes code from the configured endpoint. Use a trusted endpoint and consider a backend redesign if those properties are unsuitable. A missing save confirmation does not prove that saving failed: check the Feedback sheet before retrying to avoid a duplicate. Verify the deployed backend contract and perform a real submission only with authorization, preferably against a separate test spreadsheet/deployment.

## Tests

Run `node --test --test-isolation=none` with a recent Node.js version. Tests simulate the browser and backend; they do not contact Google or modify Sheets. They cover catalog filtering and errors, the save request fields, and preserving feedback until the backend confirms a save. They do not verify the live deployment, microphone permissions, or speech recognition in a real browser.
