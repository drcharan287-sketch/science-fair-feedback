/**
 * Private VoiceVote admin APIs.
 *
 * This script runs in the existing public "execute as owner" Apps Script
 * deployment, where Session.getActiveUser().getEmail() is NOT a trustworthy
 * admin identity. Never use Google email detection or a hidden page as auth.
 *
 * All public admin RPC methods MUST call adminRequireKey_ before any read/write.
 * The passphrase has 256 bits of entropy. Only its SHA-256 digest is versioned.
 * Neither private feedback nor the plaintext key appears in public GitHub Pages.
 */
const VOICEVOTE_ADMIN_KEY_SHA256 =
  'afc91f1a0a1b2e685269a01488122f43986bf7d8de45fc32483d9a33d1c54a69';
const VOICEVOTE_VOTING_DISABLED_KEY = 'VOICEVOTE_VOTING_DISABLED';
const VOICEVOTE_ADMIN_AUDIT_SHEET = 'Admin Action Log';

function adminDigest_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value));
  return bytes.map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function adminRequireKey_(key) {
  const supplied = String(key || '');
  if (supplied.length < 32 || supplied.length > 256) {
    throw new Error('Administrator access denied.');
  }
  const actual = adminDigest_(supplied);
  const expected = VOICEVOTE_ADMIN_KEY_SHA256;
  let diff = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let i = 0; i < length; i++) {
    diff |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  if (diff !== 0) throw new Error('Administrator access denied.');
  return true;
}

function adminSheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function adminRawVotes_(ss) {
  const sheet = ss.getSheetByName('Feedback');
  if (!sheet) throw new Error('Feedback sheet is missing.');
  const last = sheet.getLastRow();
  if (last <= 1) return [];
  return sheet.getRange(2, 1, last - 1, 11).getValues().map(function(row, index) {
    const status = String(row[10] || '').trim().toUpperCase();
    const date = row[0];
    const values = [String(date), ...row.slice(1, 8).map(String)];
    return {
      row: index + 2,
      rowProof: adminDigest_(JSON.stringify(values)),
      time: date instanceof Date ? date.toISOString() : String(date || ''),
      project: String(row[1] || ''),
      grade: String(row[2] || ''),
      section: String(row[3] || ''),
      original: String(row[4] || ''),
      rating: Number(row[5]) || 0,
      language: String(row[6] || ''),
      translation: String(row[7] || ''),
      protected: /^[0-9a-f]{64}$/i.test(String(row[9] || '')),
      status: status === 'VOID' ? 'VOID' : 'VALID'
    };
  });
}

function adminProjectId_(p) {
  return JSON.stringify([String(p.grade), String(p.section), String(p.project)]);
}

function adminGetOverview(key) {
  adminRequireKey_(key);
  const ss = adminSheet_();
  const projects = readProjectCatalog_();
  const votes = adminRawVotes_(ss);
  const scores = Object.create(null);
  const langCounts = Object.create(null);
  projects.forEach(function(p) {
    scores[adminProjectId_(p)] = { id: adminProjectId_(p), grade: p.grade,
      section: p.section, project: p.project, votes: 0, stars: 0 };
  });
  let accepted = 0;
  let excluded = 0;
  let protectedCount = 0;
  votes.forEach(function(v) {
    if (v.protected) protectedCount++;
    if (v.status === 'VOID') { excluded++; return; }
    const candidate = scores[adminProjectId_(v)];
    if (!candidate || v.rating < 1 || v.rating > 5) return;
    candidate.votes++;
    candidate.stars += v.rating;
    accepted++;
    langCounts[v.language] = (langCounts[v.language] || 0) + 1;
  });
  const rankings = Object.keys(scores).map(function(id) {
    const r = scores[id];
    const avg = r.votes ? r.stars / r.votes : 0;
    const weighted = r.votes ? (r.stars + 5 * 3.5) / (r.votes + 5) : 0;
    return { id: r.id, grade: r.grade, section: r.section, project: r.project,
      votes: r.votes, average: Math.round(avg * 100) / 100,
      weighted: Math.round(weighted * 1000) / 1000 };
  }).sort(function(a,b) {
    return b.weighted - a.weighted || b.votes - a.votes
      || a.project.localeCompare(b.project)
      || a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section);
  });
  rankings.forEach(function(r, i) { r.rank = i + 1; });
  return {
    projects: rankings,
    totalProjects: rankings.length,
    ratedProjects: rankings.filter(function(r) { return r.votes > 0; }).length,
    acceptedVotes: accepted,
    excludedVotes: excluded,
    protectedVotes: protectedCount,
    legacyVotes: votes.length - protectedCount,
    auditPendingActions: adminAuditPending_(ss).length,
    votingOpen: PropertiesService.getScriptProperties()
      .getProperty(VOICEVOTE_VOTING_DISABLED_KEY) !== '1',
    languages: Object.keys(langCounts).sort().map(function(k) {
      return { code: k, votes: langCounts[k] };
    })
  };
}

/** Only loads review text when a signed-in administrator clicks a project. */
function adminGetReviews(key, projectId, offset) {
  adminRequireKey_(key);
  const id = String(projectId || '');
  const known = readProjectCatalog_().some(function(p) { return adminProjectId_(p) === id; });
  if (!known) throw new Error('Unknown project.');
  const page = Math.max(0, Math.min(10000, Math.floor(Number(offset) || 0)));
  const ss = adminSheet_();
  const matches = adminRawVotes_(ss).filter(function(v) {
    return adminProjectId_(v) === id;
  }).reverse();
  return {
    total: matches.length,
    reviews: matches.slice(page, page + 30).map(function(v) {
      return { time: v.time, original: v.original, translation: v.translation,
        language: v.language, rating: v.rating, status: v.status };
    })
  };
}

/** Voter activity shows no raw tokens, browser fingerprints, or feedback text. */
function adminGetVoterActivity(key) {
  adminRequireKey_(key);
  return adminRawVotes_(adminSheet_()).reverse().slice(0, 100).map(function(v) {
    return {
      row: v.row,
      rowProof: v.rowProof,
      time: v.time,
      project: v.project,
      grade: v.grade,
      section: v.section,
      status: v.status,
      protected: v.protected
    };
  });
}

/**
 * A Sheets spreadsheet and Script Properties do not share a transaction.
 *
 * Write an auditable intent BEFORE any organizer mutation, flush it, perform
 * the mutation, then mark the intent APPLIED and flush. If a write fails or
 * its outcome is uncertain the journal stays PENDING and all further admin
 * mutations are blocked for manual reconciliation. A PENDING row is NOT proof
 * that its intended change happened. Existing 5-column audit history is kept.
 *
 * Called only while the existing ScriptLock is held, after key validation.
 */
const VOICEVOTE_AUDIT_HEADERS = [
  'Date', 'Action', 'Feedback row', 'Reason / details', 'Actor',
  'State', 'Event ID', 'Before', 'After'
];
function adminAuditSheet_(ss) {
  let sheet = ss.getSheetByName(VOICEVOTE_ADMIN_AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(VOICEVOTE_ADMIN_AUDIT_SHEET);
    sheet.appendRow(VOICEVOTE_AUDIT_HEADERS);
  } else {
    // The previous implementation used A:E. Extend, never replace, its rows.
    const extra = sheet.getRange(1, 6, 1, 4).getValues()[0];
    if (extra.every(function(v) { return !String(v || '').trim(); })) {
      sheet.getRange(1, 6, 1, 4)
        .setValues([VOICEVOTE_AUDIT_HEADERS.slice(5)]);
    } else if (extra.map(String).join('|') !==
               VOICEVOTE_AUDIT_HEADERS.slice(5).join('|')) {
      throw new Error('Audit journal header is unexpected; admin changes are blocked.');
    }
  }
  return sheet;
}
function adminAuditPending_(ss) {
  const sheet = ss.getSheetByName(VOICEVOTE_ADMIN_AUDIT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const states = sheet.getRange(2, 6, sheet.getLastRow() - 1, 2).getValues();
  // Legacy rows have no event ID and are not mistaken for interrupted intents.
  return states.map(function(row, i) {
    return { row: i + 2, state: String(row[0] || ''), id: String(row[1] || '') };
  }).filter(function(entry) { return entry.id && entry.state !== 'APPLIED'; });
}
function adminAuditBegin_(ss, kind, row, details, before, after) {
  if (adminAuditPending_(ss).length) {
    throw new Error('Unresolved PENDING admin audit action. No changes were made. ' +
      'An organizer must reconcile Admin Action Log before further admin changes.');
  }
  const sheet = adminAuditSheet_(ss);
  const id = Utilities.getUuid();
  sheet.appendRow([new Date(), kind, row || '', safeSheetText_(details),
    'Admin credential', 'PENDING', id, safeSheetText_(before), safeSheetText_(after)]);
  // Flush BEFORE changing protected state to eliminate ordinary log-write gaps.
  SpreadsheetApp.flush();
  return { sheet: sheet, row: sheet.getLastRow(), id: id };
}
function adminAuditedChange_(ss, kind, row, details, before, after, change) {
  const audit = adminAuditBegin_(ss, kind, row, details, before, after);
  try {
    change();
    audit.sheet.getRange(audit.row, 6).setValue('APPLIED');
    SpreadsheetApp.flush();
  } catch (error) {
    // The operation may have succeeded partially; do NOT automatically retry,
    // roll back, or claim it failed. The prior PENDING journal is evidence.
    throw new Error('Admin change result needs reconciliation (audit ' + audit.id +
      '). Check Admin Action Log and the affected record before retrying. ' +
      String(error && error.message || error));
  }
}


/**
 * Admin moderation: excludes/restores a vote from rankings without erasing it.
 * Deliberately DOES NOT reset the visitor's browser lock or erase device hashes.
 */
function adminSetVoteStatus(key, rowNumber, rowProof, newStatus, reason) {
  adminRequireKey_(key);
  const status = String(newStatus || '').toUpperCase();
  const why = String(reason || '').trim();
  if (!['VOID','VALID'].includes(status) || why.length < 8 || why.length > 400) {
    throw new Error('A valid status and reason (8–400 characters) are required.');
  }
  const index = Number(rowNumber);
  if (!Number.isInteger(index) || index < 2) throw new Error('Invalid feedback row.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = adminSheet_();
    const sheet = ss.getSheetByName('Feedback');
    if (index > sheet.getLastRow()) throw new Error('Feedback row no longer exists.');
    const votes = adminRawVotes_(ss);
    const vote = votes.find(function(v) { return v.row === index; });
    if (!vote || vote.rowProof !== rowProof) {
      throw new Error('Feedback changed since it was loaded. Refresh voter activity.');
    }
    if (vote.status === status) return { status: status, changed: false };
    adminAuditedChange_(ss,
      status === 'VOID' ? 'EXCLUDE_VOTE' : 'RESTORE_VOTE', index, why,
      vote.status, status, function() {
        sheet.getRange(index, 11).setValue(status === 'VALID' ? '' : 'VOID');
      });
    return { status: status, changed: true };
  } finally { lock.releaseLock(); }
}

/** Pauses or resumes ALL new votes. Existing records and token locks are kept. */
function adminSetVotingOpen(key, open, reason) {
  adminRequireKey_(key);
  const why = String(reason || '').trim();
  if (typeof open !== 'boolean' || why.length < 8 || why.length > 400) {
    throw new Error('Specify a valid voting state and an 8–400 character reason.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = adminSheet_();
    const properties = PropertiesService.getScriptProperties();
    const previouslyOpen = properties.getProperty(VOICEVOTE_VOTING_DISABLED_KEY) !== '1';
    if (previouslyOpen === open) return { votingOpen: open, changed: false };
    adminAuditedChange_(ss, open ? 'RESUME_VOTING' : 'PAUSE_VOTING', '', why,
      previouslyOpen ? 'OPEN' : 'PAUSED', open ? 'OPEN' : 'PAUSED', function() {
        properties.setProperty(VOICEVOTE_VOTING_DISABLED_KEY, open ? '0' : '1');
      });
    return { votingOpen: open, changed: true };
  } finally { lock.releaseLock(); }
}
