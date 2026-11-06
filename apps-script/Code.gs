/**
 * VoiceVote Google Apps Script — project-catalog extension.
 * Existing Feedback sheet columns and save request parameters are preserved.
 * Required tabs: Feedback; Projects (Class/Grade | Section | Project Name | Active).
 * Replace the placeholder with the ID of your own spreadsheet before deployment.
 */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
// India's 22 Eighth Schedule languages, plus English for visitors.
// Translation-service codes do not guarantee browser speech or Google coverage;
// when a translation is unavailable the original is preserved in Feedback.
const VOICEVOTE_FEEDBACK_LANGUAGE_CODES = Object.freeze({
  'en-IN':'en', 'as-IN':'as', 'bn-IN':'bn', 'brx-IN':'brx',
  'doi-IN':'doi', 'gu-IN':'gu', 'hi-IN':'hi', 'kn-IN':'kn',
  'ks-IN':'ks', 'gom-IN':'gom', 'mai-IN':'mai', 'ml-IN':'ml',
  'mni-Mtei-IN':'mni-Mtei', 'mr-IN':'mr', 'ne-IN':'ne',
  'or-IN':'or', 'pa-IN':'pa', 'sa-IN':'sa', 'sat-Olck-IN':'sat',
  'sd-IN':'sd', 'ta-IN':'ta', 'te-IN':'te', 'ur-IN':'ur'
});
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'test') {
    return ContentService.createTextOutput('VoiceVote backend connected successfully!');
  }
  if (params.action === 'admin') {
    // The HTML shell itself is public, but every data/RPC action requires
    // the 256-bit administrator key. Never return feedback from doGet.
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('VoiceVote | AI Admin Console');
  }
  if (params.action === 'publicResults') {
    let payload;
    try { payload = publicSummary_(); }
    catch (_) { payload = {success:false,mode:'DEMO',message:'Results temporarily unavailable.'}; }
    return jsonpResponse_(payload,params.callback);
  }
  if (params.action === 'presenterVerify') {
    // Opaque, short-lived ticket verification only. No admin key, vote,
    // person, feedback, or private dashboard data is ever returned.
    return jsonpResponse_({
      success: publicVerifyPresenterSession_(params.ticket)
    }, params.callback);
  }
  if (params.action === 'catalog') {
    let result;
    try {
      result = { success: true, projects: readProjectCatalog_() };
    } catch (error) {
      result = { success: false, message: error.message, projects: [] };
    }
    return jsonpResponse_(result, params.callback);
  }
  if (params.action !== 'save') {
    return ContentService.createTextOutput('VoiceVote is running.');
  }
  // GET submissions lack reliable same-origin protection and expose private
  // feedback in the URL. Reject all GET saves, including legacy clients.
  return jsonpResponse_({ success: false, message: 'POST required for feedback submission.' }, params.callback);
}

function doPost(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'probe') {
    // Read-only permission and layout check: no Feedback row is appended.
    try {
      PropertiesService.getScriptProperties().getProperty('voicevote_probe');
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Feedback');
      if (!sheet) throw new Error('Feedback sheet unavailable');
      return HtmlService.createHtmlOutput(
        '<!doctype html><html><head><meta charset="utf-8"><title>VoiceVote probe</title></head>' +
        '<body><h1 id="voiceVoteProbe">VoiceVote POST connection ready</h1></body></html>'
      );
    } catch (error) {
      return HtmlService.createHtmlOutput('<h1>VoiceVote POST probe failed</h1>');
    }
  }
  if (params.action === 'translatePreview') {
    // PREVIEW ONLY: never touch the Feedback sheet, visitor lock, or ranking.
    // The browser sends text in a POST body, never a GET query string.
    return voiceVoteTranslationPreview_(params);
  }
  if (params.action !== 'save') {
    return HtmlService.createHtmlOutput('<h1>Unsupported request</h1>');
  }
  // For POST, require a unique request ID to protect against double submission.
  if (!/^[a-f0-9-]{36}$/i.test(String(params.submissionId || ''))) {
    return voiceVoteReceipt_({ success: false, message: 'Invalid submission ID.' });
  }
  return voiceVoteReceipt_(saveFeedback_(params));
}

/**
 * Read-only English preview on the existing Voting page (and owner demo).
 * An invisible form POST avoids CORS/GET-query exposure of feedback text;
 * HtmlService posts a response to the GitHub Pages parent via postMessage.
 * The response is not saved, audited, cached, or written to any sheet.
 */
function voiceVoteTranslationPreview_(params) {
  const requestId = String(params.requestId || '').trim().toLowerCase();
  const language = String(params.language || '').trim();
  const feedback = String(params.feedback || '').trim();
  const languages = VOICEVOTE_FEEDBACK_LANGUAGE_CODES;
  const result = {type:'voicevote-translation-preview',requestId:requestId,success:false};
  if (!/^[a-f0-9-]{36}$/.test(requestId) ||
      (!Object.prototype.hasOwnProperty.call(languages,language) || language === 'en-IN') ||
      !feedback || feedback.length > 2000) {
    result.message = 'English translation preview is unavailable for this request.';
  } else {
    try {
      const translated = String(LanguageApp.translate(feedback,languages[language],'en') || '').trim();
      if (!translated) throw new Error('Empty translation');
      result.success = true;
      result.translation = translated.slice(0,6000);
    } catch (_) {
      result.message = 'Could not translate now. You can still submit your original feedback.';
    }
  }
  // Do NOT interpolate raw feedback directly into HTML. JSON is escaped for
  // script-element and Unicode-syntax safety, preventing script injection.
  const payload = JSON.stringify(result).replace(/</g,'\\u003c')
    .replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>' +
    '<body><script>(function(){' +
    'try{window.top.postMessage(' + payload +
      ',"https://drcharan287-sketch.github.io");}catch(e){}' +
    '})();<\/script></body></html>';
  return HtmlService.createHtmlOutput(page)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** A top-level HTML receipt avoids browser-blocked cross-origin JSONP callbacks.
 *  Submitted text travels in an HTTPS POST body, not a GET URL. */
function voiceVoteReceipt_(result) {
  const success = result && result.success === true;
  const alreadyVoted = result && result.alreadyVoted === true;
  const passDenied = result && result.passError === true;
  const title = success ? 'Thank you! Feedback saved.'
    : alreadyVoted ? 'This browser has already voted.'
    : passDenied ? 'Visitor pass not accepted' : 'Feedback not confirmed';
  const explanation = success
    ? (result.duplicate ? 'Your feedback was previously saved; no duplicate was added.' :
        'Your feedback was saved successfully in VoiceVote.')
    : alreadyVoted
      ? 'Only one project rating and feedback is allowed per browser for this science fair. No additional feedback was recorded.'
      : passDenied
        ? 'An unused visitor voting pass is required, or the supplied pass cannot be accepted. Check your code with an organizer. No new feedback was recorded.'
        : 'The save could not be confirmed. Do not resubmit immediately; ask the science fair organizer to check the Feedback sheet.';
  // Success/duplicate receipts no longer send visitors to a second voting form.
  // Failure keeps its explicit ?vote=retry recovery path.
  const retryUrl = 'https://drcharan287-sketch.github.io/science-fair-feedback/?vote=retry';
  const action = success || alreadyVoted
    ? '<button type="button" id="receiptClose" onclick="try{window.close()}catch(e){}document.getElementById(&quot;receiptCloseHelp&quot;).hidden=false">Close</button>' +
      '<p id="receiptCloseHelp" class="close-help" hidden>You can safely close this browser tab. No further submission is needed.</p>'
    : '<a id="receiptRetry" href="' + retryUrl +
      '" target="_top" rel="noopener">Return to VoiceVote to review the error</a>';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#102b50">' +
    '<title>VoiceVote feedback receipt</title><style>' +
    '*{box-sizing:border-box}html{min-height:100%}body{min-height:100vh;min-height:100dvh;margin:0;' +
    'padding:28px 18px;display:flex;align-items:center;justify-content:center;' +
    'background:linear-gradient(135deg,#08152e,#102b50);' +
    'font:18px/1.55 Arial,sans-serif;color:white}' +
    'main{width:100%;max-width:640px;padding:clamp(34px,6vw,54px);border-radius:24px;' +
    'background:#203857;border:1px solid #ffffff40;text-align:center;' +
    'box-shadow:0 24px 70px #0005}' +
    'h1{font-size:clamp(27px,5vw,36px);line-height:1.22;color:#67e8f9;margin:0 0 24px}' +
    'p{font-size:clamp(18px,3.8vw,21px);line-height:1.55;margin:0 0 20px}' +
    'button,a{display:inline-flex;align-items:center;justify-content:center;min-width:180px;' +
    'min-height:56px;margin-top:18px;padding:14px 26px;border:0;border-radius:12px;' +
    'color:white;background:#0891b2;font-size:19px;font-weight:700;text-decoration:none;cursor:pointer}' +
    'button:focus-visible,a:focus-visible{outline:3px solid #facc15;outline-offset:4px}' +
    '.close-help{margin:22px auto 0;font-size:17px;color:#e0f2fe}' +
    '[hidden]{display:none!important}' +
    '@media(max-width:480px){body{padding:18px 14px}main{padding:36px 22px;border-radius:22px}' +
    'h1{font-size:29px}p{font-size:19px}button,a{width:100%;font-size:20px;min-height:60px}}' +
    '</style></head><body><main><h1 id="voiceVoteReceipt">' +
    title + '</h1><p>' + explanation + '</p>' + action + '</main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('VoiceVote feedback receipt');
}

function saveFeedback_(params) {
  let result;
  try {
    const project = String(params.project || '').trim();
    const studentClass = String(params.studentClass || '').trim();
    const section = String(params.section || '').trim();
    const feedback = String(params.feedback || '').trim();
    const rating = Number(params.rating);
    const language = String(params.language || 'en-IN');
    const submissionId = String(params.submissionId || '').trim();
    const deviceToken = String(params.deviceToken || '').trim();
    const requestedProjectId = String(params.projectId || '').trim();
    const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    if (!project || !studentClass || !section || !feedback ||
        !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        feedback.length > 2000 || project.length > 200) {
      throw new Error('Missing, invalid or excessively long feedback details.');
    }
    if (!uuid.test(submissionId) || !uuid.test(deviceToken)) {
      throw new Error('A valid browser voting token is required. Reload the updated VoiceVote page.');
    }
    if (!Object.prototype.hasOwnProperty.call(VOICEVOTE_FEEDBACK_LANGUAGE_CODES, language)) {
      throw new Error('Unsupported feedback language.');
    }
    const selectedProject = readProjectCatalog_().find(function(item) {
      return item.grade === studentClass && item.section === section && item.project === project;
    });
    if (!selectedProject) {
      throw new Error('This project is not in the active science fair catalog.');
    }
    // A stale or forged project ID must never be associated with a different
    // visible selection. Older clients omit it; the server resolves it from
    // the active catalog, preserving the existing common QR and browser flow.
    if (requestedProjectId && requestedProjectId !== (selectedProject.id || '')) {
      throw new Error('Project details changed. Reload VoiceVote and choose the project again.');
    }
    // Store only the SHA-256 digest, never a raw browser token or hardware ID.
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, deviceToken);
    const deviceHash = bytes.map(function(byte) {
      return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
    }).join('');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Feedback');
    if (!sheet) {
      throw new Error('Create a sheet tab named "Feedback".');
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      // The submission ID is the cross-network retry identity, even when an
      // earlier save succeeded but the browser never displayed its receipt.
      const existing = sheet.getLastRow();
      let previousTokens = [];
      if (existing > 1) {
        previousTokens = sheet.getRange(2, 9, existing - 1, 2).getValues();
        for (let i = 0; i < previousTokens.length; i++) {
          if (String(previousTokens[i][0]) === submissionId) {
            return { success: true, duplicate: true, message: 'This feedback was already saved.' };
          }
        }
      }
      if (PropertiesService.getScriptProperties().getProperty('vv:' + submissionId)) {
        return { success: true, duplicate: true, message: 'This feedback was already saved.' };
      }
      // In preparation mode, a visitor may use the existing browser-token
      // flow without a pass. A supplied pass, even before mandatory activation,
      // is always checked and redeemed exactly once.
      const passEntry = visitorPassValidateForVote_(ss, params.visitorPass, deviceHash, sheet);
      if (passEntry.legacy) {
        for (let i = 0; i < previousTokens.length; i++) {
          if (String(previousTokens[i][1]) === deviceHash) {
            return { success: false, alreadyVoted: true,
              message: 'This browser has already voted.' };
          }
        }
      }
      // A server-side pause wins even if a visitor is using an older page.
      // Check after duplicate-ID handling, so a retry of an earlier success
      // still returns its original receipt rather than writing a new row.
      if (PropertiesService.getScriptProperties()
          .getProperty('VOICEVOTE_VOTING_DISABLED') === '1') {
        return { success: false, message: 'Voting is temporarily paused by the organizers.' };
      }
      const headers = [
        'Date', 'Project', 'Class', 'Section', 'Original Feedback',
        'Rating', 'Language', 'English Translation', 'Submission ID',
        'Device hash', 'Vote status', 'Visitor pass serial', 'Project ID'
      ];
      if (sheet.getLastRow() === 0) sheet.appendRow(headers);
      const languages = VOICEVOTE_FEEDBACK_LANGUAGE_CODES;
      let translation = feedback;
      const sourceLanguage = Object.prototype.hasOwnProperty.call(languages, language)
        ? languages[language] : '';
      if (sourceLanguage !== 'en') {
        try {
          translation = LanguageApp.translate(feedback, sourceLanguage, 'en');
        } catch (translationError) {
          translation = 'Translation unavailable: ' + feedback;
        }
      }
      sheet.appendRow([
        new Date(), safeSheetText_(project), safeSheetText_(studentClass),
        safeSheetText_(section), safeSheetText_(feedback), rating,
        safeSheetText_(language), safeSheetText_(translation),
        submissionId, deviceHash, '', passEntry.legacy ? '' : passEntry.serial,
        selectedProject.id || ''
      ]);
      // If ledger finalization fails after append, Feedback!L still proves
      // this serial was used; a second attempt is blocked under the same lock.
      visitorPassFinalize_(passEntry, sheet.getLastRow(), submissionId);
    } finally {
      lock.releaseLock();
    }
    result = { success: true, message: 'Feedback saved successfully!' };
  } catch (error) {
    const message = String(error && error.message || 'Feedback not confirmed.');
    result = {
      success: false,
      message: message,
      passError: /\bpass\b/i.test(message)
    };
  }
  return result;
}
/** Read public catalog rows; blank Active values count as active. */
function readProjectCatalog_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Projects');
  if (!sheet) {
    throw new Error('Create a sheet tab named "Projects" with Class/Grade, Section, Project Name, Active columns.');
  }
  const rows = sheet.getDataRange().getDisplayValues();
  if (rows.length === 0) return [];
  const headers = rows[0].map(function (value) {
    return String(value).trim().toLowerCase();
  });
  function indexOfAny(names) {
    for (let i = 0; i < names.length; i++) {
      const pos = headers.indexOf(names[i]);
      if (pos !== -1) return pos;
    }
    return -1;
  }
  const gradeCol = indexOfAny(['class/grade', 'grade', 'class']);
  const sectionCol = indexOfAny(['section']);
  const projectCol = indexOfAny(['project name', 'project']);
  const activeCol = indexOfAny(['active']);
  const idCol = indexOfAny(['project id', 'project id (stable)', 'id']);
  if (gradeCol < 0 || sectionCol < 0 || projectCol < 0) {
    throw new Error('Projects tab must contain Class/Grade, Section and Project Name headers.');
  }
  const output = [];
  const seen = {};
  const seenIds = Object.create(null);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const grade = String(row[gradeCol] || '').trim();
    const section = String(row[sectionCol] || '').trim();
    const project = String(row[projectCol] || '').trim();
    const active = activeCol < 0 ? '' : String(row[activeCol] || '').trim().toLowerCase();
    if (!grade || !section || !project) continue;
    if (['false', 'no', '0', 'inactive', 'n'].indexOf(active) !== -1) continue;
    const key = JSON.stringify([grade, section, project]);
    if (seen[key]) continue;
    seen[key] = true;
    const id = idCol < 0 ? '' : String(row[idCol] || '').trim();
    if (id && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
      throw new Error('Invalid stable project ID in Projects row ' + (i + 1) + '.');
    }
    if (id && seenIds[id]) {
      throw new Error('Duplicate stable project ID in Projects row ' + (i + 1) + '.');
    }
    if (id) seenIds[id] = true;
    const entry = { grade: grade, section: section, project: project };
    if (id) entry.id = id;
    output.push(entry);
  }
  return output;
}
function jsonpResponse_(result, callbackName) {
  const candidate = String(callbackName || 'voiceVoteResponse');
  const callback = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(candidate)
    ? candidate : 'voiceVoteResponse';
  const payload = JSON.stringify(result).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback + '(' + payload + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function safeSheetText_(value) {
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
