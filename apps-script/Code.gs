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
    } finally {
      lock.releaseLock();
    }
    result = { success: true, message: 'Feedback saved successfully!' };
  } catch (error) {
    result = { success: false, message: error.message };
  }
  return jsonpResponse_(result, params.callback);
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
