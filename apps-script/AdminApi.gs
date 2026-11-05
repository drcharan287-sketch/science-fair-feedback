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

function adminLog_(ss, kind, row, details) {
  let sheet = ss.getSheetByName(VOICEVOTE_ADMIN_AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(VOICEVOTE_ADMIN_AUDIT_SHEET);
    sheet.appendRow(['Date', 'Action', 'Feedback row', 'Reason / details', 'Actor']);
  }
  sheet.appendRow([new Date(), kind, row || '', safeSheetText_(details), 'Admin credential']);
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
    sheet.getRange(index, 11).setValue(status === 'VALID' ? '' : 'VOID');
    adminLog_(ss, status === 'VOID' ? 'EXCLUDE_VOTE' : 'RESTORE_VOTE', index, why);
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
    PropertiesService.getScriptProperties()
      .setProperty(VOICEVOTE_VOTING_DISABLED_KEY, open ? '0' : '1');
    adminLog_(ss, open ? 'RESUME_VOTING' : 'PAUSE_VOTING', '', why);
    return { votingOpen: open };
  } finally { lock.releaseLock(); }
}
