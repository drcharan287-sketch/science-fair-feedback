/**
 * VoiceVote Google Apps Script — project-catalog extension.
 * Existing Feedback sheet columns and save request parameters are preserved.
 * Required tabs: Feedback; Projects (Class/Grade | Section | Project Name | Active).
 * Replace the placeholder with the ID of your own spreadsheet before deployment.
 */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'test') {
    return ContentService.createTextOutput('VoiceVote backend connected successfully!');
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
  return jsonpResponse_(saveFeedback_(params), params.callback);
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
  if (params.action !== 'save') {
    return HtmlService.createHtmlOutput('<h1>Unsupported request</h1>');
  }
  // For POST, require a unique request ID to protect against double submission.
  if (!/^[a-f0-9-]{36}$/i.test(String(params.submissionId || ''))) {
    return voiceVoteReceipt_({ success: false, message: 'Invalid submission ID.' });
  }
  return voiceVoteReceipt_(saveFeedback_(params));
}

/** A top-level HTML receipt avoids browser-blocked cross-origin JSONP callbacks.
 *  Submitted text travels in an HTTPS POST body, not a GET URL. */
function voiceVoteReceipt_(result) {
  const success = result && result.success === true;
  const title = success ? 'Thank you! Feedback saved.' : 'Feedback not confirmed';
  const explanation = success
    ? (result.duplicate ? 'Your feedback was previously saved; no duplicate was added.' :
        'Your feedback was saved successfully in VoiceVote.')
    : 'The save could not be confirmed. Do not resubmit immediately; ask the science fair organizer to check the Feedback sheet.';
  const pageUrl = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>VoiceVote feedback receipt</title><style>' +
    'body{box-sizing:border-box;min-height:100vh;margin:0;padding:32px 15px;' +
    'background:linear-gradient(135deg,#08152e,#102b50,#075985);font:16px Arial,sans-serif;color:white;}' +
    'main{max-width:560px;margin:10vh auto;padding:36px;border-radius:22px;' +
    'background:#203857;border:1px solid #ffffff30;text-align:center;}' +
    'h1{font-size:26px;color:#67e8f9;}p{line-height:1.6}a{display:inline-block;' +
    'margin-top:20px;padding:14px 22px;border-radius:10px;color:white;' +
    'background:#0891b2;text-decoration:none;font-weight:bold}</style></head>' +
    '<body><main><h1 id="voiceVoteReceipt">' + title + '</h1><p>' + explanation + '</p>' +
    '<a href="' + pageUrl + '" target="_top" rel="noopener">Return to VoiceVote</a>' +
    '</main></body></html>';
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
    if (!project || !studentClass || !section || !feedback ||
        !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Missing or invalid feedback details.');
    }
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Feedback');
    if (!sheet) {
      throw new Error('Create a sheet tab named "Feedback".');
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      // POST requests use a browser-generated ID so accidental retries do not
      // append the same feedback twice. Legacy GET requests remain compatible.
      const submissionId = String(params.submissionId || '').trim();
      if (submissionId && !/^[a-f0-9-]{36}$/i.test(submissionId)) {
        throw new Error('Invalid submission ID.');
      }
      const props = submissionId ? PropertiesService.getScriptProperties() : null;
      const key = submissionId ? 'vv:' + submissionId : '';
      if (props && props.getProperty(key)) {
        return { success: true, duplicate: true, message: 'This feedback was already saved.' };
      }
      const headers = [
        'Date', 'Project', 'Class', 'Section', 'Original Feedback',
        'Rating', 'Language', 'English Translation'
      ];
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(headers);
      }
      const languages = {
        'te-IN': 'te', 'hi-IN': 'hi', 'ta-IN': 'ta',
        'kn-IN': 'kn', 'en-IN': 'en'
      };
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
        safeSheetText_(language), safeSheetText_(translation)
      ]);
      if (props) props.setProperty(key, String(Date.now()));
    } finally {
      lock.releaseLock();
    }
    result = { success: true, message: 'Feedback saved successfully!' };
  } catch (error) {
    result = { success: false, message: error.message };
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
  if (gradeCol < 0 || sectionCol < 0 || projectCol < 0) {
    throw new Error('Projects tab must contain Class/Grade, Section and Project Name headers.');
  }
  const output = [];
  const seen = {};
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
    output.push({ grade: grade, section: section, project: project });
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
