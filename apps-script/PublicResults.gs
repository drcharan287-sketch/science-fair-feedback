/**
 * VoiceVote presenter-only Results API.
 * Public/anonymous requests are ALWAYS DEMO and never read Feedback.
 * Authenticated short-lived presenter tickets unlock aggregate live results
 * without opening the admin key, individual reviews, or visitor identifiers.
 * No manual feedback approval queue exists.
 */
const VOICEVOTE_PUBLIC_RESULTS_MODE_KEY = 'VOICEVOTE_PUBLIC_RESULTS_MODE';
const VOICEVOTE_RESULTS_MODES = ['DEMO','LIVE','PUBLISHED'];

function publicResultsMode_() {
  // Fail closed even if older deployments left LIVE/PUBLISHED in script props.
  // Real aggregates now require a separately validated presenter capability.
  return 'DEMO';
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
  return 'voicevote-results-v3-'+mode;
}
function publicResultsSaveCache_(cache, mode, result) {
  if (!cache) return;
  try {
    // An organizer mode change is always rechecked before reading this cache.
    // The result contains only approved public fields for that mode.
    cache.put(publicResultsCacheKey_(mode),JSON.stringify(result),45);
  } catch (_) { /* Uncached read-only fallback is always safe. */ }
}
function publicSummary_(internalScope) {
  // Only server code can pass the PRIVATE capability scope. Never pass a
  // request parameter here, or infer authority from a URL mode selector.
  const mode = internalScope === 'PRIVATE_PRESENTER_RESULTS' ? 'PUBLISHED' : 'DEMO';
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
    if (Object.prototype.hasOwnProperty.call(VOICEVOTE_FEEDBACK_LANGUAGE_CODES, language)) {
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
 * After the private-presenter conversion, anonymous public publication is
 * permanently disabled. Retain this RPC for older Admin clients, but reject
 * LIVE/PUBLISHED rather than reviving public results accidentally.
 */
function presenterSummary_(ticket) {
  if (!publicVerifyPresenterSession_(ticket)) {
    return {success:false,mode:'DENIED',message:'Private presenter access is required or has expired.'};
  }
  const payload = publicSummary_('PRIVATE_PRESENTER_RESULTS');
  // Deliberately do not expose an APPROVED/PUBLIC flag: this is a private view.
  return Object.assign({},payload,{mode:'PRESENTER_LIVE',
    message:'Private live audience aggregates. No individual visitor reviews.'});
}

/**
 * PRIVATE READ-ONLY project feedback: a faculty presenter explicitly opens
 * one rated project in the protected Live Results screen. Never bundle
 * comments in presenterSummary_() or publicResults(). A public visitor URL,
 * missing/expired presenter token, or unknown ID must fail BEFORE reading
 * the Feedback sheet.
 *
 * Only valid rated votes are shown; excluded/VOID votes remain in the
 * administrator-only audit/review tools. No device token, pass, submission ID,
 * row number, voter identity, or admin credential is returned. Pagination
 * limits accidental projection and response size on the smart board.
 */
function presenterProjectReviews_(ticket, projectId, offset) {
  if (!publicVerifyPresenterSession_(ticket)) {
    return {success:false,mode:'DENIED',
      message:'Faculty presenter access is required or has expired.'};
  }
  const id = String(projectId || '').trim();
  if (!id || id.length > 180) {
    return {success:false,mode:'DENIED',message:'Select a known project.'};
  }
  const projects = readProjectCatalog_();
  const known = projects.some(function(p) { return adminProjectId_(p) === id; });
  if (!known) {
    return {success:false,mode:'DENIED',message:'Select a known project.'};
  }
  // Read only after permission and project identity have both been validated.
  const ss = adminSheet_();
  const resolveVote = adminProjectLookup_(ss,projects);
  const page = Math.max(0,Math.min(10000,Math.floor(Number(offset)||0)));
  const size = 8;
  const matches = adminRawVotes_(ss).filter(function(v) {
    return v.status === 'VALID' && v.rating >= 1 && v.rating <= 5 &&
      resolveVote(v) === id;
  }).reverse();
  return {
    success:true,mode:'PRESENTER_REVIEWS',projectId:id,total:matches.length,
    offset:page,hasMore:page+size<matches.length,
    reviews:matches.slice(page,page+size).map(function(v) {
      return {
        rating:v.rating,language:v.language,time:v.time,
        original:String(v.original || '').slice(0,2000),
        translation:String(v.translation || '').slice(0,6000)
      };
    })
  };
}

/** Legacy publication RPC kept only for explicitly returning to DEMO. */
function adminSetPublicResultsMode(key, requested, reason) {
  adminRequireKey_(key);
  const mode = String(requested || '').trim().toUpperCase();
  const why = String(reason || '').trim();
  if (mode !== 'DEMO') {
    throw new Error('Public results publication is disabled. Use the private presenter display.');
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


/**
 * Temporary owner-presenter ticket for the EXISTING Voting UI.
 *
 * Only the already-authenticated Admin Console can issue a ticket. Tokens are
 * never embedded in public GitHub source or exposed in a normal voting link.
 * The 64-hex opaque capability goes in the URL fragment (not sent to GitHub
 * Pages by the browser), and is valid for no more than two hours.
 *
 * Important: this ticket grants only a NO-WRITE demo UI. It is not a voting
 * credential and cannot change actual feedback or Results publication.
 */
const VOICEVOTE_PRESENTER_TTL_SECONDS = 7200;
function presenterTicketCacheKey_(token) {
  return 'voicevote-presenter-v1-' + adminDigest_(String(token));
}
function adminCreatePresenterSession(key) {
  adminRequireKey_(key);
  if (typeof CacheService === 'undefined') {
    throw new Error('Temporary presenter sessions are unavailable.');
  }
  const a = Utilities.getUuid().replace(/-/g,'').toLowerCase();
  const b = Utilities.getUuid().replace(/-/g,'').toLowerCase();
  const ticket = a + b;
  if (!/^[a-f0-9]{64}$/.test(ticket)) {
    throw new Error('Cannot generate a secure presenter session.');
  }
  const cache = CacheService.getScriptCache();
  if (!cache) throw new Error('Temporary presenter sessions are unavailable.');
  cache.put(presenterTicketCacheKey_(ticket), 'PRESENTER', VOICEVOTE_PRESENTER_TTL_SECONDS);
  return {token:ticket,expiresInSeconds:VOICEVOTE_PRESENTER_TTL_SECONDS};
}
function publicVerifyPresenterSession_(token) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(t)) return false;
  try {
    const cache = CacheService.getScriptCache();
    return !!cache && cache.get(presenterTicketCacheKey_(t)) === 'PRESENTER';
  } catch (_) {
    // Cache expiry/outage is a DENIAL, never a reason to permit demo or vote.
    return false;
  }
}
