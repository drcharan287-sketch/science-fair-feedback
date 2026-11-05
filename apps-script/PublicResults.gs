/**
 * VoiceVote audience-safe Results API.
 * Data classification:
 *  DEMO      - catalog count only; does NOT read Feedback.
 *  LIVE      - anonymous, aggregate participation only.
 *  PUBLISHED - aggregate rankings by stable project ID; explicit admin action.
 * Review text is NEVER read from Feedback for this endpoint.
 * The optional Public Highlights tab is a separate hand-curated allowlist.
 */
const VOICEVOTE_PUBLIC_RESULTS_MODE_KEY = 'VOICEVOTE_PUBLIC_RESULTS_MODE';
const VOICEVOTE_RESULTS_MODES = ['DEMO','LIVE','PUBLISHED'];
const VOICEVOTE_PUBLIC_HIGHLIGHTS_TAB = 'Public Highlights';

function publicResultsMode_() {
  const stored = String(PropertiesService.getScriptProperties()
    .getProperty(VOICEVOTE_PUBLIC_RESULTS_MODE_KEY) || 'DEMO').trim().toUpperCase();
  return VOICEVOTE_RESULTS_MODES.includes(stored) ? stored : 'DEMO';
}
function publicFiniteNumber_(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function publicResultsCache_() {
  try {
    return typeof CacheService === 'undefined' ? null : CacheService.getScriptCache();
  } catch (_) { return null; }
}
function publicResultsCacheKey_(mode) {
  return 'voicevote-public-v2-'+mode;
}
function publicResultsSaveCache_(cache, mode, result) {
  if (!cache) return;
  try {
    // An organizer mode change is always rechecked before reading this cache.
    // The result contains only approved public fields for that mode.
    cache.put(publicResultsCacheKey_(mode),JSON.stringify(result),45);
  } catch (_) { /* Uncached read-only fallback is always safe. */ }
}
function publicSummary_() {
  const mode = publicResultsMode_();
  const cache = publicResultsCache_();
  if (cache) {
    try {
      const cached = cache.get(publicResultsCacheKey_(mode));
      if (cached) return JSON.parse(cached);
    } catch (_) { /* Cache is an optimization, not an authorization control. */ }
  }
  const catalog = readProjectCatalog_();
  const payload = {
    success: true, mode: mode, totalProjects: catalog.length,
    message: mode === 'DEMO' ? 'Real rankings are not published.' :
      mode === 'LIVE' ? 'Only audience participation aggregates are public.' :
        'Audience choice rankings are published by an organizer.'
  };
  // A public request to preview or force a mode is never honored.
  if (mode === 'DEMO') {
    publicResultsSaveCache_(cache,mode,payload);
    return payload;
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const votes = adminRawVotes_(ss); // Only internal; NEVER serialize raw vote records.
  const resolveVote = adminProjectLookup_(ss,catalog);
  const byId = Object.create(null);
  const gradeCounts = Object.create(null);
  const languages = Object.create(null);
  catalog.forEach(function(p) {
    const id = adminProjectId_(p);
    byId[id] = { id: id, grade: String(p.grade), section: String(p.section),
      project: String(p.project), votes: 0, stars: 0 };
    gradeCounts[p.grade] = (gradeCounts[p.grade] || 0) + 1;
  });
  let acceptedVotes = 0;
  votes.forEach(function(v) {
    if (v.status === 'VOID' || v.rating < 1 || v.rating > 5) return;
    const item = byId[resolveVote(v)];
    if (!item) return; // Unknown/inactive projects are not awarded rankings.
    item.votes++;
    item.stars += v.rating;
    acceptedVotes++;
    const language = String(v.language || '');
    if (['en-IN','te-IN','hi-IN','ta-IN','kn-IN'].includes(language)) {
      languages[language] = (languages[language] || 0) + 1;
    }
  });
  payload.acceptedVotes = acceptedVotes;
  payload.ratedProjects = Object.values(byId).filter(function(p) { return p.votes > 0; }).length;
  payload.languages = Object.keys(languages).sort().map(function(code) {
    return {code:code, count:languages[code]};
  });
  payload.gradeCounts = Object.keys(gradeCounts).sort(function(a,b) {
    return Number(a)-Number(b);
  }).map(function(grade) { return {grade:String(grade),count:gradeCounts[grade]}; });
  payload.updatedAt = new Date().toISOString();
  payload.highlights = publicApprovedHighlights_(ss, byId);

  if (mode === 'PUBLISHED') {
    payload.rankings = Object.values(byId).filter(function(p) { return p.votes > 0; })
      .map(function(p) {
        return {
          id: p.id, grade:p.grade, section:p.section, project:p.project,
          votes:p.votes, average:Math.round(100*p.stars/p.votes)/100,
          weighted:Math.round(1000*(p.stars+17.5)/(p.votes+5))/1000
        };
      }).sort(function(a,b) {
        return b.weighted-a.weighted || b.votes-a.votes ||
          a.project.localeCompare(b.project) ||
          a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section);
      });
    // Rank is local to a grade, not a misleading global junior/senior contest.
    const byGrade = Object.create(null);
    payload.rankings.forEach(function(p) {
      byGrade[p.grade] = (byGrade[p.grade] || 0) + 1;
      p.rank = byGrade[p.grade];
    });
  }
  publicResultsSaveCache_(cache,mode,payload);
  return payload;
}

/**
 * Only explicitly approved, attribution-free excerpts may be displayed.
 * Sheet columns: Approval Status, Project ID, Quote, English Translation,
 * Language, Approved By. This never reads unrestricted Feedback text.
 */
function publicApprovedHighlights_(ss, byId) {
  const sheet = ss.getSheetByName(VOICEVOTE_PUBLIC_HIGHLIGHTS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const out = [];
  const data = sheet.getRange(2,1,Math.min(sheet.getLastRow()-1,200),6).getValues();
  data.forEach(function(row) {
    if (out.length >= 8) return;
    if (String(row[0] || '').trim().toUpperCase() !== 'APPROVED') return;
    const id = String(row[1] || '').trim();
    const source = byId[id];
    const quote = String(row[2] || '').trim();
    const approvedBy = String(row[5] || '').trim();
    if (!source || !quote || quote.length > 240 || !approvedBy) return;
    const code = String(row[4] || '').trim();
    out.push({
      project: source.project, grade: source.grade,
      language: ['en-IN','te-IN','hi-IN','ta-IN','kn-IN'].includes(code) ? code : 'en-IN',
      quote: quote,
      translation: String(row[3] || '').trim().slice(0,240)
    });
  });
  return out;
}

/** Authenticated, audited publication control. No automatic public promotion. */
function adminSetPublicResultsMode(key, requested, reason) {
  adminRequireKey_(key);
  const mode = String(requested || '').trim().toUpperCase();
  const why = String(reason || '').trim();
  if (!VOICEVOTE_RESULTS_MODES.includes(mode)) {
    throw new Error('Invalid public results mode.');
  }
  if (why.length < 8 || why.length > 200) {
    throw new Error('Provide a specific reason (8–200 characters).');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const current = publicResultsMode_();
    if (current === mode) return {mode:mode,changed:false};
    const ss = adminSheet_();
    adminAuditedChange_(ss,'PUBLIC_RESULTS_'+mode,'',why,current,mode,function() {
      PropertiesService.getScriptProperties()
        .setProperty(VOICEVOTE_PUBLIC_RESULTS_MODE_KEY,mode);
    });
    // Best effort: refresh public-mode caches after a verified organizer change.
    const cache = publicResultsCache_();
    if (cache) {
      try {
        cache.remove(publicResultsCacheKey_(current));
        cache.remove(publicResultsCacheKey_(mode));
      } catch (_) {}
    }
    return {mode:mode,changed:true};
  } finally {
    lock.releaseLock();
  }
}
