const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

function app(fetchProjects, search = '', stored = new Map(), hash = '', userAgent = '') {
  class Element {
    constructor() { this.options = []; this.value = ''; this.disabled = false; this.textContent = ''; this.listeners = {}; this.dataset = {}; this.children = []; this.style = {}; this.hidden = false; this.classList = { toggle() {}, remove() {} }; }
    focus() { this.focused = true; }
    blur() { this.focused = false; }
    scrollIntoView() { this.scrolled = true; }
    click() { this.dispatchEvent({type:'click'}); }
    querySelector(name) { return name === 'button' ? (this.children.find(x => x.type === 'button') || null) : null; }
    querySelectorAll(name) { return name === 'button' ? this.children.filter(x => x.type === 'button') : []; }
    appendChild(child) { this.children.push(child); }
    submit() { this.submitted = true; }
    add(option) { this.options.push(option); }
    replaceChildren() { this.options = []; this.children = []; this.value = ''; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn.call(this, event); }
    remove() { this.removed = true; }
  }
  const elements = Object.fromEntries(['studentClass', 'section', 'project', 'catalogStatus', 'retryCatalogBtn', 'submitBtn', 'status', 'language', 'feedback', 'voteGuardStatus', 'startBtn', 'stopBtn', 'projectSearch', 'projectSearchResults', 'projectSearchStatus', 'projectSearchSelected', 'visitorPass', 'newVisitorBtn', 'visitorPassFeature', 'networkStatus', 'presenterBanner', 'presenterReceipt',
    'presenterReceiptProject', 'presenterReceiptStars', 'presenterReceiptFeedback',
    'presenterTryAgain', 'presenterClose', 'englishTranslationPanel', 'englishTranslationStatus',
    'englishTranslationText', 'refreshTranslationBtn', 'openTranslationPageBtn'].map(id => [id, new Element()]));
  elements.language.value = 'hi-IN';
  elements.submitBtn.disabled = true;
  const stars = Array.from({ length: 5 }, (_, i) => { const e = new Element(); e.dataset.value = String(i + 1); return e; });
  const scripts = [];
  const forms = [];
  const document = {
    querySelector: s => elements[s.slice(1)], getElementById: id => elements[id],
    querySelectorAll: s => s === '.star' ? stars : [],
    createElement: () => new Element(), head: { appendChild: tag => scripts.push(tag) },
    body: { appendChild: node => forms.push(node) }
  };
  const windowListeners = {};
  const context = { document, console: { error() {} }, URLSearchParams, URL, Option: function(text, value) { this.textContent = text; this.value = value; }, Event: function(type) { this.type = type; }, 
    setTimeout: (fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;}, clearTimeout,
    navigator: { onLine: true, userAgent },
    addEventListener: (name, fn) => { (windowListeners[name] ||= []).push(fn); },
    dispatchWindowEvent: (name,detail) => (windowListeners[name] || []).forEach(fn => fn(detail)),
    crypto: { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000', getRandomValues: a => a.fill(7) },
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key,val) => {stored.set(key, String(val));}, removeItem: key => stored.delete(key) } };
  context.window = context;
  if (fetchProjects) context.fetch = fetchProjects;
  context.location = { search, hash, reload() { context.__reloaded = true; } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('voicevote-catalog.js', 'utf8'), context);
  const html = fs.readFileSync('index.html', 'utf8');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { context, elements, stars, scripts, forms, stored };
}
function respond(app, payload) {
  const tag = app.scripts.at(-1);
  const url = new URL(tag.src);
  app.context[url.searchParams.get('callback')](payload);
  return { tag, url };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('catalog URL and dependent selections reflect sheet rows, including numeric grades', async () => {
  const a = app();
  assert.equal(a.elements.studentClass.disabled, true);
  assert.match(fs.readFileSync('index.html', 'utf8'), /type="button" class="star" data-value="5" aria-label="5 stars"/);
  const { url, tag } = respond(a, { success: true, projects: [
    { grade: 6, section: ' A ', project: ' Volcano ' },
    { grade: '6', section: 'B', project: 'Solar' },
    { grade: '11', section: 'A', project: 'Robot' },
    { grade: '6', section: 'A', project: 'Volcano' }
  ] });
  await tick();
  assert.match(url.pathname, /\/exec$/);
  assert.doesNotMatch(url.pathname, /\/exec\/exec/);
  assert.equal(url.searchParams.get('action'), 'catalog');
  assert.equal(tag.removed, true);
  assert.deepEqual(a.elements.studentClass.options.map(o => o.value), ['', '6', '11']);
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.section.options.map(o => o.value), ['', 'A', 'B']);
  a.elements.section.value = 'A'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.project.options.map(o => o.value), ['', 'Volcano']);
  a.elements.studentClass.value = '11'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  assert.equal(a.elements.project.value, '');
  assert.equal(a.elements.project.disabled, true);
  a.elements.section.value = 'A'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.project.options.map(o => o.value), ['', 'Robot']);
});

test('catalog errors leave submission disabled with actionable status', async () => {
  for (const mode of ['backend', 'invalid', 'no-callback', 'network']) {
    const a = app(); const tag = a.scripts[0];
    if (mode === 'backend') respond(a, { success: false, message: 'Projects sheet missing' });
    if (mode === 'invalid') respond(a, { success: true, projects: [{ title: 'x' }] });
    if (mode === 'no-callback') tag.onload();
    if (mode === 'network') tag.onerror();
    await tick();
    assert.equal(a.elements.submitBtn.disabled, true, mode);
    assert.equal(a.elements.retryCatalogBtn.hidden, false, mode);
    assert.equal(a.elements.studentClass.disabled, true, mode);
    assert.match(a.elements.catalogStatus.textContent, /Unable to load projects:/, mode);
    assert.equal(tag.removed, true);
  }
});

test('browser sends one secure POST form with all feedback fields, not a JSONP GET URL', async () => {
  const a = app();
  respond(a, { success: true, projects: [{ grade: '6', section: 'A', project: 'Robot' }] }); await tick();
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value = 'A'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value = 'Robot'; a.elements.feedback.value = 'Great & clever';
  a.stars[3].dispatchEvent(new a.context.Event('click'));
  assert.equal(a.stars[3].attributes['aria-pressed'], 'true');
  a.context.submitFeedback();
  assert.equal(a.forms.length, 1);
  const form = a.forms[0];
  assert.equal(form.method, 'POST');
  assert.equal(form.target, '_self');
  assert.match(form.action, /\/exec$/);
  assert.equal(form.submitted, true);
  const fields = Object.fromEntries(form.children.map(x => [x.name, x.value]));
  assert.deepEqual(fields, {
    action: 'save',
    visitorPass: '',
    submissionId: '123e4567-e89b-42d3-a456-426614174000',
    deviceToken: '123e4567-e89b-42d3-a456-426614174000',
    studentClass: '6',
    section: 'A',
    project: 'Robot',
    projectId: '',
    language: 'hi-IN',
    feedback: 'Great & clever',
    rating: '4'
  });
  assert.equal(a.scripts.length, 1, 'Only the earlier read-only catalog JSONP tag should exist');
  assert.equal(a.elements.feedback.value, 'Great & clever', 'Browser must not clear content before a server receipt');
  assert.equal(a.elements.submitBtn.disabled, true);
  a.context.submitFeedback();
  assert.equal(a.forms.length, 1, 'Repeated clicks while navigating may not send duplicates');
});

test('submit prevents POST when a star rating or required selection is absent', async () => {
  const a = app();
  respond(a, { success: true, projects: [{grade:'6',section:'Heidelberg',project:'XenoChat'}] });
  await tick();
  a.elements.studentClass.value = '6';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value = 'Heidelberg';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value = 'XenoChat';
  a.elements.feedback.value = 'Useful project';
  a.context.submitFeedback();
  assert.equal(a.forms.length, 0, 'No rating should prevent form submission');
  assert.match(a.elements.status.textContent, /select a star rating/);
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.elements.project.value = '';
  a.context.submitFeedback();
  assert.equal(a.forms.length, 0, 'Missing project should prevent submission');
});

test('browser reuses an anonymous device token for repeat visits', async () => {
  const saved = new Map();
  const a = app(null, '', saved);
  respond(a, {success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.studentClass.value = '9'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value = 'Keats'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value = 'VoiceVote';
  a.elements.feedback.value = 'Useful'; a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  assert.equal(saved.get('voicevote_device_token_v1'),'123e4567-e89b-42d3-a456-426614174000');
  assert.equal(a.forms.length,1);
  const returning = app(null,'?vote=success',saved);
  respond(returning, {success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  assert.equal(saved.get('voicevote_voted_v1'),'1');
  assert.equal(returning.elements.submitBtn.disabled,true);
  assert.equal(returning.elements.voteGuardStatus.hidden,false);
  assert.match(returning.elements.voteGuardStatus.textContent,/already been recorded in this browser/);
  returning.context.submitFeedback();
  assert.equal(returning.forms.length,0);
});

test('browser vote token requires writable local storage', async () => {
  const a = app();
  respond(a, {success:true,projects:[{grade:'6',section:'Heidelberg',project:'XenoChat'}]});
  await tick();
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value = 'Heidelberg'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value = 'XenoChat'; a.elements.feedback.value = 'Good';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.localStorage.setItem = () => {throw Error('storage disabled');};
  a.context.submitFeedback();
  assert.equal(a.forms.length,0);
  assert.match(a.elements.status.textContent,/Unable to save the browser voting token/);
});

test('global quick-find searches 300 projects and selects correct class/section for duplicate names', async () => {
  const entries = Array.from({ length: 300 }, (_, i) => ({
    grade: String(6 + (i % 5)), section: i % 2 ? 'Keats' : 'Heidelberg',
    project: 'Project ' + String(i + 1).padStart(3, '0')
  }));
  entries[13].project = 'Solar Explorer';
  entries[24].project = 'Solar Explorer';
  const a = app();
  respond(a, { success: true, projects: entries });
  await tick();
  assert.equal(a.elements.projectSearch.disabled, false);
  a.elements.projectSearch.value = 'solar';
  a.elements.projectSearch.dispatchEvent(new a.context.Event('input'));
  assert.equal(a.elements.projectSearchResults.children.length, 2);
  assert.match(a.elements.projectSearchResults.children[0].textContent, /Solar Explorer/);
  a.elements.projectSearchResults.children[1].click();
  const chosen = entries[24];
  assert.equal(a.elements.studentClass.value, chosen.grade);
  assert.equal(a.elements.section.value, chosen.section);
  assert.equal(a.elements.project.value, 'Solar Explorer');
  assert.equal(a.elements.projectSearchResults.hidden, true);
  assert.match(a.elements.projectSearchSelected.textContent, /Selected: Solar Explorer/);
  assert.equal(a.elements.submitBtn.disabled, false);
});

test('quick-find gives useful feedback for zero matches and limits suggestions to twelve', async () => {
  const a = app();
  const entries = Array.from({ length: 300 }, (_, i) => ({
    grade: '9', section: 'Keats', project: 'Volcano Project ' + i
  }));
  respond(a, { success: true, projects: entries });
  await tick();
  a.elements.projectSearch.value = 'volcano';
  a.elements.projectSearch.dispatchEvent(new a.context.Event('input'));
  assert.equal(a.elements.projectSearchResults.children.length, 12);
  assert.match(a.elements.projectSearchStatus.textContent, /300 matching project/);
  a.elements.projectSearch.value = 'does-not-exist';
  a.elements.projectSearch.dispatchEvent(new a.context.Event('input'));
  assert.equal(a.elements.projectSearchResults.hidden, true);
  assert.match(a.elements.projectSearchStatus.textContent, /No active projects match/);
});

test('after a submission attempt the whole form stays locked when the QR is reopened', async () => {
  const saved = new Map();
  const a = app(null, '', saved);
  respond(a, {success:true,projects:[{grade:'6',section:'Heidelberg',project:'XenoChat'}]});
  await tick();
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value = 'Heidelberg'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value = 'XenoChat';
  a.elements.feedback.value = 'Test submission';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  assert.equal(saved.get('voicevote_pending_v1'),'1');
  const returning = app(null,'',saved);
  respond(returning, {success:true,projects:[{grade:'6',section:'Heidelberg',project:'XenoChat'}]});
  await tick();
  assert.equal(returning.elements.voteGuardStatus.hidden,false);
  assert.match(returning.elements.voteGuardStatus.textContent,/awaiting confirmation|voting is paused/i);
  for (const id of ['submitBtn','studentClass','section','project','language','feedback','startBtn','stopBtn','projectSearch']) {
    assert.equal(returning.elements[id].disabled, true, id + ' must be locked');
  }
  assert.ok(returning.stars.every(star => star.disabled));
  returning.context.submitFeedback();
  assert.equal(returning.forms.length,0);
  const confirmed = app(null,'?vote=success',saved);
  respond(confirmed, {success:true,projects:[{grade:'6',section:'Heidelberg',project:'XenoChat'}]});
  await tick();
  assert.equal(saved.get('voicevote_pending_v1'), undefined);
  assert.equal(saved.get('voicevote_voted_v1'), '1');
  assert.equal(confirmed.elements.feedback.disabled,true);
});

test('failed Google receipt clears only pending attempt to allow an explicit retry', async () => {
  const stored = new Map([['voicevote_pending_v1','1']]);
  const a = app(null,'?vote=retry',stored);
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  assert.equal(stored.has('voicevote_pending_v1'),false);
  assert.equal(a.elements.submitBtn.disabled,false);
  assert.equal(a.elements.feedback.disabled,false);
});


test('visitor passes remain hidden, and do not unlock a browser that already voted', async () => {
  const saved = new Map([
    ['voicevote_voted_v1','1'],
    ['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']
  ]);
  const a = app(null, '', saved);
  respond(a, {success:true,projects:[{grade:'6',section:'Heidelberg',project:'XenoChat'}]});
  await tick();
  assert.equal(a.elements.submitBtn.disabled,true);
  assert.equal(a.elements.visitorPassFeature.hidden,true);
  assert.equal(a.elements.visitorPass.disabled,true);
  assert.equal(a.elements.newVisitorBtn.hidden,true);
  assert.equal(a.elements.newVisitorBtn.disabled,true);
  a.elements.visitorPass.value='VV-123E4567-E89B42D3-A4564266-14174000';
  a.elements.visitorPass.dispatchEvent(new a.context.Event('input'));
  a.elements.newVisitorBtn.click();
  assert.equal(saved.get('voicevote_voted_v1'),'1');
  assert.equal(a.elements.submitBtn.disabled,true);
  assert.equal(a.forms.length,0);
  assert.doesNotMatch(a.elements.voteGuardStatus.textContent,/visitor pass/i);
  assert.match(fs.readFileSync('index.html','utf8'),/const VISITOR_PASSES_ENABLED = false/);
});

test('hidden visitor-pass fields cannot affect a standard submission', async () => {
  const a=app();
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.studentClass.value='9';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.elements.feedback.value='Good talk';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.elements.visitorPass.value='GUESS-123';
  a.context.submitFeedback();
  assert.equal(a.forms.length,1);
  const fields=Object.fromEntries(a.forms[0].children.map(x=>[x.name,x.value]));
  assert.equal(fields.visitorPass,'','Deferred code must never be sent from public UI');
});
// Run the versioned Apps Script with in-memory services, then execute its real
// JSONP response in the frontend VM. No Google services are contacted.
function backend(rows) {
  const writes = [];
  const receipts = new Map();
  let released = false;
  const projectSheet = rows && { getDataRange: () => ({ getDisplayValues: () => rows }) };
  const feedbackSheet = {
    getLastRow: () => writes.length,
    appendRow: row => writes.push(Array.from(row)),
    getRange: (row, col, count, width) => ({
      getValues: () => writes.slice(row - 1, row - 1 + count).map(r => r.slice(col - 1, col - 1 + width))
    })
  };
  const context = {
    ContentService: { MimeType: { JAVASCRIPT: 'javascript' }, createTextOutput: text => ({ text, setMimeType(type) { this.mime = type; return this; } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => name === 'Projects' ? projectSheet : feedbackSheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
    LanguageApp: { translate: (text, source, target) => `${source}:${target}:${text}` },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_, token) => Array.from(createHash('sha256').update(token).digest())
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => receipts.get(key),
      setProperty: (key, value) => receipts.set(key, value)
    }) },
    HtmlService: { XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},
      createHtmlOutput: html => ({
        html,
        setTitle(title) { this.title = title; return this; },
        setXFrameOptionsMode(mode){this.frameMode=mode;return this;}
      }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), context);
  vm.runInContext(fs.readFileSync('apps-script/VisitorPasses.gs', 'utf8'), context);
  vm.runInContext(fs.readFileSync('apps-script/PublicResults.gs', 'utf8'), context);
  return { context, writes, wasReleased: () => released };
}
function serve(a, b) {
  const tag = a.scripts.at(-1);
  const params = Object.fromEntries(new URL(tag.src).searchParams);
  const response = b.context.doGet({ parameter: params });
  assert.equal(response.mime, 'javascript');
  vm.runInContext(response.text, a.context);
  return params;
}

test('actual backend catalog and save JSONP interoperate with frontend', async () => {
  const a = app();
  const b = backend([
    ['Class/Grade', 'Section', 'Project Name', 'Active'],
    [' 6 ', 'A', 'Robot', 'YES'], ['6', 'A', 'Robot', ''],
    ['6', 'B', 'Hidden', 'NO'], ['7', 'B', 'Solar', ''],
    ['7', '', 'Incomplete', 'TRUE']
  ]);
  serve(a, b); await tick();
  assert.deepEqual(a.elements.studentClass.options.map(o => o.value), ['', '6', '7']);
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.section.options.map(o => o.value), ['', 'A']);
  a.elements.section.value = 'A'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.project.options.map(o => o.value), ['', 'Robot']);
  a.elements.project.value = 'Robot'; a.elements.feedback.value = '=great';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  const params = Object.fromEntries(a.forms[0].children.map(x => [x.name, x.value]));
  const receipt = b.context.doPost({ parameter: params });
  assert.match(receipt.html, /Thank you! Feedback saved/);
  assert.equal(params.language, 'hi-IN');
  assert.deepEqual(b.writes[0], ['Date', 'Project', 'Class', 'Section', 'Original Feedback', 'Rating', 'Language', 'English Translation', 'Submission ID', 'Device hash', 'Vote status', 'Visitor pass serial', 'Project ID']);
  assert.deepEqual(b.writes[1].slice(1, 8), ['Robot', '6', 'A', "'=great", 5, 'hi-IN', 'hi:en:=great']);
  assert.match(b.writes[1][9], /^[0-9a-f]{64}$/);
  assert.equal(b.wasReleased(), true);
  assert.equal(a.elements.feedback.value, '=great', 'Data remains until the browser navigates to the receipt');
});

test('actual backend reports catalog and save errors through JSONP', async () => {
  const a = app(); const b = backend(null);
  serve(a, b); await tick();
  assert.match(a.elements.catalogStatus.textContent, /Create a sheet tab named "Projects"/);
  assert.equal(a.elements.submitBtn.disabled, true);
  const response = b.context.doGet({ parameter: { action: 'save', callback: 'validCallback', rating: '8' } });
  let result;
  vm.runInNewContext(response.text, { validCallback: value => { result = value; } });
  assert.equal(result.success, false);
  assert.match(result.message, /POST required/);
  assert.equal(b.writes.length, 0);
  const invalid = b.context.doGet({ parameter: { action: 'catalog', callback: 'bad.name()' } });
  assert.match(invalid.text, /^voiceVoteResponse\(/);
});

// The public voting form now prefers the current Apps Script catalog over
// its static Pages snapshot: event-day additions/deactivations need no redeploy.
test('live Google catalog is authoritative even when a valid snapshot exists',async()=>{
  const seen=[];
  const a=app(async (url,options)=>{
    seen.push({url,options});
    return {ok:true,json:async()=>({success:true,catalogVersion:'2026-11-06-aa7f4dd3-424',
      projects:[{grade:'6',section:'Heidelberg',project:'Retired Static Name'}]})};
  });
  assert.equal(a.scripts.length,1,'Google catalog request should start before static fallback');
  const {url}=respond(a,{success:true,projects:[
    {grade:'6',section:'Heidelberg',project:'Xeno Chat App',id:'VVP-ONE'},
    {grade:'9',section:'Keats',project:'VoiceVote App',id:'VVP-TWO'}
  ]});
  await tick();
  assert.equal(url.searchParams.get('action'),'catalog');
  assert.equal(seen.length,0,'Static snapshot must not supersede a successful live catalog');
  assert.deepEqual(a.elements.studentClass.options.map(x=>x.value),['','6','9']);
  a.elements.studentClass.value='6';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Heidelberg';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.project.options.map(x=>x.value),['','Xeno Chat App']);
  assert.equal(a.elements.retryCatalogBtn.hidden,false,'Manual refresh must stay available');
});
test('when live endpoint fails, a versioned backup is visibly labeled as potentially stale',async()=>{
  const seen=[];
  const a=app(async (url,opts)=>{
    seen.push(url);
    return {ok:true,json:async()=>({success:true,catalogVersion:'2026-11-06-aa7f4dd3-424',
      projects:[{grade:'6',section:'Heidelberg',project:'Offline Backup'}]})};
  });
  a.scripts[0].onerror();
  await tick();
  assert.equal(seen.length,1);
  assert.match(seen[0],/projects\.json/);
  assert.deepEqual(a.elements.studentClass.options.map(x=>x.value),['','6']);
  assert.match(a.elements.catalogStatus.textContent,/BACKUP ONLY/i);
  assert.equal(a.elements.retryCatalogBtn.hidden,false);
});
test('a stale backup is rejected if the live school catalog cannot be read',async()=>{
  const a=app(async()=>({ok:true,json:async()=>({
    success:true,catalogVersion:'legacy-roster-407',
    projects:[{grade:'6',section:'Heidelberg',project:'XenoChat'}]
  })}));
  a.scripts[0].onerror();
  await tick();
  assert.equal(a.elements.studentClass.disabled,true);
  assert.equal(a.elements.retryCatalogBtn.hidden,false);
  assert.match(a.elements.catalogStatus.textContent,/Unable to load projects/i);
});
test('manual live refresh adds projects, preserves feedback and clears deactivated selection',async()=>{
  const a=app();
  respond(a,{success:true,projects:[
    {grade:'9',section:'Keats',project:'VoiceVote App',id:'VVP-OLD'}
  ]});
  await tick();
  a.elements.studentClass.value='9';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote App';
  a.elements.feedback.value='This is an unsent user transcript';
  const pending=a.scripts.length;
  a.elements.retryCatalogBtn.click();
  assert.equal(a.scripts.length,pending+1,'Manual refresh requests current Google catalog');
  respond(a,{success:true,projects:[
    {grade:'9',section:'Keats',project:'New Solar Purifier',id:'VVP-NEW'},
    {grade:'9',section:'Keats',project:'Second Team',id:'VVP-TWO'}
  ]});
  await tick();
  assert.equal(a.elements.studentClass.value,'9','Grade selection survives refresh');
  assert.equal(a.elements.section.value,'Keats','Section survives refresh');
  assert.equal(a.elements.project.value,'','Deactivated project must not stay selected');
  assert.ok(a.elements.project.options.some(x=>x.value==='New Solar Purifier'));
  assert.equal(a.elements.feedback.value,'This is an unsent user transcript',
    'Refreshing the catalog must never discard visitor feedback');
  assert.equal(a.forms.length,0,'Refresh must never send action=save');
});
test('snapshot service is not needed when the live Apps Script catalog succeeds',async()=>{
  const a=app(async()=>{throw new Error('Offline snapshot');});
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote App'}]});
  await tick();
  assert.deepEqual(a.elements.studentClass.options.map(o=>o.value),['','9']);
});

test('in-flight vote rejected if the organizer deactivates a project under the shared script lock',()=>{
  const rows=[['Class/Grade','Section','Project Name','Active','Project ID'],
    ['9','Keats','VoiceVote App','TRUE','VVP-EVENT-STABLE']];
  const b=backend(rows);
  b.context.LockService.getScriptLock=()=>({
    waitLock(){rows[1][3]='FALSE';},releaseLock(){}
  });
  const result=b.context.doPost({parameter:{
    action:'save',project:'VoiceVote App',projectId:'VVP-EVENT-STABLE',
    studentClass:'9',section:'Keats',feedback:'A safe simulated comment',
    rating:'5',language:'en-IN',
    submissionId:'123e4567-e89b-42d3-a456-426614174000',
    deviceToken:'123e4567-e89b-42d3-a456-426614174001'
  }});
  assert.match(result.html,/Feedback not confirmed/i,'Public receipt deliberately hides private exception details');
  assert.equal(b.writes.length,0,'Deactivated project must not receive a late vote');
});

test('secure POST probe makes no writes and duplicate POSTs append only once', () => {
  const b = backend([
    ['Class/Grade', 'Section', 'Project Name', 'Active'],
    ['6', 'Heidelberg', 'XenoChat', 'TRUE']
  ]);
  const probe = b.context.doPost({ parameter: { action: 'probe' } });
  assert.match(probe.html, /VoiceVote POST connection ready/);
  assert.equal(b.writes.length, 0);

  const params = {
    action: 'save', submissionId: '123e4567-e89b-42d3-a456-426614174000',
    deviceToken: '123e4567-e89b-42d3-a456-426614174000',
    project: 'XenoChat', studentClass: '6', section: 'Heidelberg',
    feedback: 'Works well', rating: '5', language: 'en-IN'
  };
  const first = b.context.doPost({ parameter: params });
  assert.match(first.html, /Thank you! Feedback saved/);
  assert.equal(b.writes.length, 2);
  const second = b.context.doPost({ parameter: params });
  assert.match(second.html, /previously saved; no duplicate was added/);
  assert.equal(b.writes.length, 2);
  assert.equal(b.wasReleased(), true);

  // A new submission ID cannot bypass the one-vote-per-browser restriction.
  const secondProject = b.context.doPost({ parameter: {
    ...params,
    submissionId: 'aaaabbbb-cccc-4ddd-8eee-123456789abc',
    project: 'XenoChat', feedback: 'Trying again'
  } });
  assert.match(secondProject.html, /This browser has already voted/);
  assert.equal(b.writes.length, 2);
  assert.equal(b.writes[1][8], params.submissionId);
  assert.notEqual(b.writes[1][9], params.deviceToken, 'Do not store raw device tokens');

  const missingToken = b.context.doPost({ parameter: { ...params, deviceToken: '' } });
  assert.match(missingToken.html, /Feedback not confirmed/);
  assert.equal(b.writes.length, 2);

  const invalid = b.context.doPost({ parameter: { ...params, submissionId: 'bad-id' } });
  assert.match(invalid.html, /Feedback not confirmed/);
  assert.equal(b.writes.length, 2);
});


test('speech capture waits for the final transcript before submitting feedback', async () => {
  const a = app();
  respond(a, {success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.studentClass.value='9';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  let recognizer;
  class FakeSpeechRecognition {
    constructor() { recognizer=this; }
    start() { this.started=true; }
    stop() { this.stopRequested=true; }
  }
  a.context.webkitSpeechRecognition=FakeSpeechRecognition;
  a.context.startRecording();
  assert.equal(recognizer.started,true);
  assert.equal(recognizer.lang,'hi-IN','recording honors selected language');
  assert.equal(a.elements.submitBtn.disabled,true,'no submission while recognition is live');
  assert.equal(a.elements.language.disabled,true,'language cannot change mid-utterance');
  assert.equal(a.elements.feedback.disabled,true,'manual edits cannot be overwritten by interim speech');
  assert.equal(a.elements.stopBtn.disabled,false);
  a.context.submitFeedback();
  assert.equal(a.forms.length,0,'direct submit call cannot bypass recording lock');
  recognizer.onresult({resultIndex:0,results:[{0:{transcript:'Creative scientific presentation'},isFinal:true}]});
  a.context.stopRecording();
  assert.equal(recognizer.stopRequested,true);
  assert.equal(a.elements.submitBtn.disabled,true,'stopping is asynchronous; still wait for final result');
  recognizer.onend();
  assert.equal(a.elements.submitBtn.disabled,false);
  assert.equal(a.elements.feedback.disabled,false);
  assert.equal(a.elements.stopBtn.disabled,true);
  assert.match(a.elements.status.textContent,/Review or edit/);
  assert.equal(a.elements.feedback.value,'Creative scientific presentation');
  a.context.submitFeedback();
  assert.equal(a.forms.length,1);
  const fields=Object.fromEntries(a.forms[0].children.map(x=>[x.name,x.value]));
  assert.equal(fields.feedback,'Creative scientific presentation');
});

test('microphone permission errors survive onend and permit typed feedback', async () => {
  const a=app();
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  let recognizer;
  a.context.webkitSpeechRecognition=class {
    constructor(){recognizer=this;}
    start(){}
    stop(){}
  };
  a.context.startRecording();
  assert.equal(a.elements.startBtn.disabled,true);
  recognizer.onerror({error:'not-allowed'});
  recognizer.onend();
  assert.match(a.elements.status.textContent,/microphone permission OR unavailable recognition/i);
  assert.equal(a.elements.feedback.disabled,false);
  assert.equal(a.elements.startBtn.disabled,false);
  assert.equal(a.elements.stopBtn.disabled,true);
  assert.equal(a.forms.length,0);
});

test('unsupported speech recognition offers manual entry without blocking voting', async () => {
  const a=app();
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.context.startRecording();
  assert.match(a.elements.status.textContent,/type your feedback instead/);
  assert.equal(a.elements.feedback.disabled,false);
  assert.equal(a.elements.submitBtn.disabled,false);
  assert.match(fs.readFileSync('index.html','utf8'),/textarea id="feedback" maxlength="2000"/);
});


test('known-offline submission remains editable and does not create a pending vote', async () => {
  const a=app();
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.studentClass.value='9'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.elements.feedback.value='The model worked';
  a.stars[3].dispatchEvent(new a.context.Event('click'));
  a.context.navigator.onLine=false;
  a.context.dispatchWindowEvent('offline');
  assert.equal(a.elements.networkStatus.hidden,false);
  a.context.submitFeedback();
  assert.equal(a.forms.length,0,'Offline browser must not initiate a POST');
  assert.equal(a.stored.has('voicevote_pending_v1'),false,'Do not lock on a known offline state');
  assert.equal(a.elements.feedback.disabled,false,'Keep typed input editable');
  assert.match(a.elements.status.textContent,/Nothing was sent to Google/);
  a.context.navigator.onLine=true;
  a.context.dispatchWindowEvent('online');
  assert.equal(a.elements.networkStatus.hidden,true);
  a.context.submitFeedback();
  assert.equal(a.forms.length,1,'Online manual submit still uses the original POST path');
  assert.equal(a.stored.get('voicevote_pending_v1'),'1');
});

test('a pending unknown-result submission remains locked on pageshow/Back and displays organizer guidance', async () => {
  const stored=new Map([['voicevote_pending_v1','1']]);
  const a=app(null,'',stored);
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  let message=a.elements.voteGuardStatus.textContent;
  assert.match(message,/may already be saved/);
  assert.match(message,/ask an organizer to check/);
  a.context.dispatchWindowEvent('pageshow');
  assert.equal(a.elements.submitBtn.disabled,true);
  a.context.submitFeedback();
  assert.equal(a.forms.length,0,'Reload and Back must not re-submit unknown outcomes');
  assert.equal(stored.get('voicevote_pending_v1'),'1','Never auto-unlock uncertain submissions');
});

test('synchronous browser navigation failure resets only pending state and keeps feedback', async () => {
  const a=app();
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.studentClass.value='9'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.elements.feedback.value='Unsaved editing test';
  a.stars[3].dispatchEvent(new a.context.Event('click'));
  const create=a.context.document.createElement;
  a.context.document.createElement=function(tag){
    const element=create(tag);
    if(tag==='form') element.submit=()=>{ throw new Error('Mock local submit failed'); };
    return element;
  };
  a.context.submitFeedback();
  assert.equal(a.stored.has('voicevote_pending_v1'),false);
  assert.equal(a.stored.has('voicevote_voted_v1'),false);
  assert.equal(a.elements.feedback.value,'Unsaved editing test');
  assert.equal(a.elements.submitBtn.disabled,false);
  assert.match(a.elements.status.textContent,/Mock local submit failed/);
});


test('stable project ID flows from catalog to form and server rejects mismatches without saving', async () => {
  const a=app();
  const b=backend([
    ['Class/Grade','Section','Project Name','Active','Project ID'],
    ['6','Heidelberg','XenoChat','TRUE','VVP-VI_HEIDELBERG-G1-S1'],
    ['9','Keats','VoiceVote','TRUE','LEG-9-KEATS-VOICEVOTE']
  ]);
  serve(a,b); await tick();
  a.elements.studentClass.value='9';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.elements.feedback.value='An educational demonstration';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  const fields=Object.fromEntries(a.forms[0].children.map(x=>[x.name,x.value]));
  assert.equal(fields.projectId,'LEG-9-KEATS-VOICEVOTE');
  const rejected=b.context.doPost({parameter:{...fields,projectId:'VVP-FORGED-G10-S1'}});
  assert.match(rejected.html,/Feedback not confirmed/);
  assert.equal(b.writes.length,0,'Forged ID must not append or lock feedback');
  const accepted=b.context.doPost({parameter:fields});
  assert.match(accepted.html,/Thank you! Feedback saved/);
  assert.equal(b.writes[1][12],'LEG-9-KEATS-VOICEVOTE');
  assert.equal(b.writes.length,2);
});

test('older visitor form may omit project ID; server resolves it from active roster',()=>{
  const b=backend([
    ['Class/Grade','Section','Project Name','Active','Project ID'],
    ['6','Heidelberg','XenoChat','TRUE','LEG-6-HEIDELBERG-XENOCHAT']
  ]);
  const fields={
    action:'save',submissionId:'123e4567-e89b-42d3-a456-426614174000',
    deviceToken:'123e4567-e89b-42d3-a456-426614174001',
    studentClass:'6',section:'Heidelberg',project:'XenoChat',
    feedback:'Works',rating:'5',language:'en-IN'
  };
  assert.match(b.context.doPost({parameter:fields}).html,/Thank you! Feedback saved/);
  assert.equal(b.writes[1][12],'LEG-6-HEIDELBERG-XENOCHAT');
});


test('owner ticket does not bypass voting until backend verifies it', async()=>{
  const stored=new Map([
    ['voicevote_voted_v1','1'],
    ['voicevote_pending_v1','1'],
    ['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']
  ]);
  const ticket='a'.repeat(64);
  const a=app(null,'?vote=retry',stored,'#presenter='+ticket);
  // Receipt query parameters are powerless in an owner presenter session.
  assert.equal(stored.get('voicevote_pending_v1'),'1');
  assert.equal(a.elements.submitBtn.disabled,true);
  respond(a,{success:true,projects:[
    {grade:'9',section:'Keats',project:'VoiceVote',id:'LEG-9-KEATS-VOICEVOTE'}
  ]});
  await tick();
  assert.equal(a.elements.submitBtn.disabled,true,'Catalog alone cannot unlock demo');
  assert.equal(a.forms.length,0);
  a.context.submitFeedback();
  assert.equal(a.forms.length,0,'An unverified owner ticket must not create a POST');
  a.context.voiceVotePresenterVerify({success:true});
  assert.equal(a.elements.presenterBanner.hidden,false);
  assert.match(a.elements.presenterBanner.textContent,/OWNER DEMONSTRATION/);
  assert.equal(a.elements.studentClass.disabled,false,'Verified demo can use existing Voting UI');

  a.elements.studentClass.value='9';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.elements.feedback.value='Speech-to-text demonstration';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  assert.equal(a.elements.presenterReceipt.hidden,false);
  assert.equal(a.elements.presenterReceiptStars.textContent,'★★★★★');
  assert.match(a.elements.presenterReceiptFeedback.textContent,/Speech-to-text/);
  assert.equal(a.forms.length,0,'Demo cannot use Google save form');
  a.elements.presenterTryAgain.dispatchEvent(new a.context.Event('click'));
  assert.equal(a.elements.presenterReceipt.hidden,true);
  assert.equal(a.elements.feedback.value,'');
  assert.equal(a.elements.submitBtn.disabled,false,'Demo can rehearse again');
  a.elements.feedback.value='Second rehearsal';
  a.stars[2].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  assert.equal(a.forms.length,0);
  assert.equal(a.elements.presenterReceiptStars.textContent,'★★★☆☆');
  assert.equal(stored.get('voicevote_voted_v1'),'1');
  assert.equal(stored.get('voicevote_pending_v1'),'1');
  assert.equal(stored.get('voicevote_device_token_v1'),'123e4567-e89b-42d3-a456-426614174000');
});

test('a denied or malformed presenter ticket cannot unlock real Voting',async()=>{
  const locked=new Map([['voicevote_voted_v1','1']]);
  const a=app(null,'',locked,'#presenter='+'a'.repeat(64));
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.context.voiceVotePresenterVerify({success:false});
  assert.equal(a.elements.submitBtn.disabled,true);
  assert.equal(a.elements.studentClass.disabled,true);
  a.context.submitFeedback();
  assert.equal(a.forms.length,0);
  const malformed=app(null,'',new Map(),'#presenter=not-a-valid-ticket');
  respond(malformed,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  assert.equal(malformed.elements.submitBtn.disabled,true);
  malformed.context.submitFeedback();
  assert.equal(malformed.forms.length,0);
});


test('speech re-emitting old final fragments does not repeat words (English, Telugu, Hindi)',async()=>{
  for(const [lang,one,two,whole] of [
    ['en-IN','science','science fair','science fair is good'],
    ['te-IN','సైన్స్','సైన్స్ ఫెయిర్','సైన్స్ ఫెయిర్ చాలా బాగుంది'],
    ['hi-IN','विज्ञान','विज्ञान मेला','विज्ञान मेला बहुत अच्छा है']
  ]){
    const a=app();
    respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
    await tick();
    let speech;
    a.context.SpeechRecognition=function(){
      speech=this;
      this.start=function(){};
      this.stop=function(){if(this.onend)this.onend();};
    };
    a.elements.language.value=lang;
    a.context.startRecording();
    speech.onresult({resultIndex:0,results:[{0:{transcript:one},isFinal:true}]});
    assert.equal(a.elements.feedback.value,one,lang+' first word');
    speech.onresult({resultIndex:0,results:[
      {0:{transcript:one},isFinal:true},
      {0:{transcript:two},isFinal:false}
    ]});
    assert.equal(a.elements.feedback.value,two,lang+' cumulative interim replacement');
    const latest=[{0:{transcript:one},isFinal:true},
      {0:{transcript:two},isFinal:true},
      {0:{transcript:whole},isFinal:true}];
    speech.onresult({resultIndex:0,results:latest});
    speech.onresult({resultIndex:0,results:latest}); // browser callback repeats entire final set
    assert.equal(a.elements.feedback.value,whole,lang+' no repeated final words');
    speech.onend();
    assert.equal(a.elements.feedback.value,whole,lang+' finalized speech remains editable');
    assert.equal(a.elements.englishTranslationPanel.hidden,lang==='en-IN');
    a.elements.feedback.value=whole+' — edited';
    a.elements.feedback.dispatchEvent(new a.context.Event('input'));
    assert.equal(a.elements.feedback.value,whole+' — edited');
  }
});

test('English preview uses a separate POST action, never save or localStorage',async()=>{
  const stored=new Map([['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']]);
  const a=app(null,'',stored);
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.language.value='te-IN';
  a.elements.feedback.value='ఈ ప్రాజెక్టు చాలా బాగుంది';
  a.context.scheduleEnglishTranslation(true);
  await new Promise(resolve=>setTimeout(resolve,15));
  const form=a.forms.find(e=>e.method==='POST');
  assert.ok(form,'Translation preview creates POST form');
  const fields=Object.fromEntries(form.children.map(x=>[x.name,x.value]));
  assert.deepEqual(fields,{
    action:'translatePreview',requestId:'123e4567-e89b-42d3-a456-426614174000',
    language:'te-IN',feedback:'ఈ ప్రాజెక్టు చాలా బాగుంది'
  });
  assert.equal(form.submitted,true);
  assert.equal(a.elements.englishTranslationPanel.hidden,false);
  assert.equal(a.elements.englishTranslationText.textContent,'');
  a.context.dispatchWindowEvent('message',{
    origin:'https://evil.example.org',
    data:{type:'voicevote-translation-preview',
      requestId:fields.requestId,success:true,translation:'INJECTED'}
  });
  assert.equal(a.elements.englishTranslationText.textContent,'','Reject non-Google origin');
  a.context.dispatchWindowEvent('message',{
    origin:'https://script.google.com',
    data:{type:'voicevote-translation-preview',
      requestId:fields.requestId,success:true,
      translation:'This project is very good.'}
  });
  assert.equal(a.elements.englishTranslationText.textContent,'This project is very good.');
  assert.match(a.elements.englishTranslationStatus.textContent,/translation ready/i);
  assert.deepEqual(Array.from(stored),[
    ['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']
  ],'Preview cannot change browser vote eligibility');
  assert.equal(a.forms.filter(e=>e.method==='POST'&&e.submitted).length,1);
  assert.equal(a.forms.some(e=>e.children.some(x=>x.name==='submissionId')),false);

  a.elements.language.value='en-IN';
  a.elements.language.dispatchEvent(new a.context.Event('change'));
  assert.equal(a.elements.englishTranslationPanel.hidden,true);
  assert.equal(a.elements.englishTranslationText.textContent,'');
});

test('stale preview response after editing must not overwrite new text',async()=>{
  const a=app();
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.language.value='hi-IN';
  a.elements.feedback.value='पहला वाक्य';
  a.context.scheduleEnglishTranslation(true);
  await new Promise(resolve=>setTimeout(resolve,15));
  const req=a.forms.find(e=>e.method==='POST');
  const requestId=req.children.find(x=>x.name==='requestId').value;
  a.elements.feedback.value='नया वाक्य';
  a.elements.feedback.dispatchEvent(new a.context.Event('input'));
  a.context.dispatchWindowEvent('message',{
    origin:'https://script.googleusercontent.com',
    data:{type:'voicevote-translation-preview',requestId,success:true,translation:'Old result'}
  });
  assert.equal(a.elements.englishTranslationText.textContent,'');
  assert.equal(a.elements.feedback.value,'नया वाक्य');
});

test('read-only translation backend validates Telugu/Hindi/Tamil/Kannada, escapes HTML, never writes Feedback',()=>{
  const b=backend([
    ['Class/Grade','Section','Project Name','Active'],
    ['9','Keats','VoiceVote','TRUE']
  ]);
  const id='123e4567-e89b-42d3-a456-426614174000';
  for(const [language,expected] of [
    ['te-IN','te:en:'],['hi-IN','hi:en:'],['ta-IN','ta:en:'],['kn-IN','kn:en:']
  ]){
    const reply=b.context.doPost({parameter:{
      action:'translatePreview',requestId:id,language,feedback:'Nice experiment'
    }});
    assert.equal(reply.frameMode,'ALLOWALL');
    assert.match(reply.html,/voicevote-translation-preview/);
    assert.match(reply.html,new RegExp(expected));
    assert.match(reply.html,/window\.top\.postMessage/);
    assert.doesNotMatch(reply.html,/Feedback saved|saveFeedback_/);
  }
  const attacker='</script><img src=x onerror=alert(1)>';
  const safe=b.context.doPost({parameter:{
    action:'translatePreview',requestId:id,language:'hi-IN',feedback:attacker
  }});
  assert.ok(!safe.html.includes(attacker),'Preview must HTML-escape translation');
  assert.ok(safe.html.includes('u003c'),'Encoded HTML unsafe chars');
  for(const wrong of [
    {language:'en-IN',feedback:'hello',requestId:id},
    {language:'hi-IN',feedback:'hello',requestId:'wrong'},
    {language:'te-IN',feedback:'a'.repeat(2001),requestId:id}
  ]){
    const reply=b.context.doPost({parameter:{action:'translatePreview',...wrong}});
    assert.match(reply.html,/"success":false/);
  }
  assert.equal(b.writes.length,0,'Translation preview may never create a Feedback row or header');
});


test('Indian-script feedback selected as English is translated on preview and save',()=>{
  const b=backend([['Class/Grade','Section','Project Name','Active'],
    ['9','Keats','VoiceVote','TRUE']]);
  const id='123e4567-e89b-42d3-a456-426614174000';
  const original='ప్రాజెక్ట్ చాలా బాగుంది प्रोजेक्ट अच्छा है';
  const preview=b.context.doPost({parameter:{
    action:'translatePreview',requestId:id,language:'en-IN',feedback:original
  }});
  assert.match(preview.html,/"success":true/);
  assert.match(preview.html,/:en:/,'empty source code requests language auto-detection');
  assert.equal(b.writes.length,0);
  const result=b.context.doPost({parameter:{
    action:'save',submissionId:id,deviceToken:id,project:'VoiceVote',
    studentClass:'9',section:'Keats',feedback:original,rating:'4',language:'en-IN'
  }});
  assert.match(result.html,/Feedback saved/i);
  assert.equal(b.writes[1][6],'en-IN');
  assert.match(b.writes[1][7],/^:en:/);
});
test('translation retries Google auto-detection if selected language service fails',()=>{
  const b=backend([['Class/Grade','Section','Project Name','Active'],
    ['9','Keats','VoiceVote','TRUE']]);
  const sources=[];
  b.context.LanguageApp.translate=(text,source)=>{
    sources.push(source);
    if(source==='te')throw new Error('synthetic unsupported source');
    return 'This project is good';
  };
  const preview=b.context.doPost({parameter:{
    action:'translatePreview',requestId:'123e4567-e89b-42d3-a456-426614174000',
    language:'te-IN',feedback:'ఈ ప్రాజెక్టు చాలా బాగుంది'
  }});
  assert.match(preview.html,/"success":true/);
  assert.match(preview.html,/This project is good/);
  assert.deepEqual(sources,['te','']);
  assert.equal(b.writes.length,0);
});
test('iPhone language-specific speech rejection keeps keyboard/typing translation fallback',async()=>{
  const a=app(undefined,'',new Map(),'', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)');
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  let recog;
  a.context.webkitSpeechRecognition=class{
    constructor(){recog=this;}
    start(){} stop(){}
  };
  a.elements.language.value='te-IN';
  a.context.startRecording();
  recog.onerror({error:'service-not-allowed'});
  recog.onend();
  assert.match(a.elements.status.textContent,/unavailable recognition for this language/i);
  assert.match(a.elements.status.textContent,/keyboard Dictation/i);
  assert.equal(a.elements.feedback.disabled,false);
  a.elements.feedback.value='ఈ ప్రాజెక్టు చాలా బాగుంది';
  a.elements.feedback.dispatchEvent(new a.context.Event('input'));
  assert.equal(a.elements.englishTranslationPanel.hidden,false,'translation is independent of speech');
  a.elements.language.value='en-IN';
  a.elements.feedback.value='प्रोजेक्ट अच्छा है';
  a.elements.feedback.dispatchEvent(new a.context.Event('input'));
  assert.equal(a.elements.englishTranslationPanel.hidden,false,
    'English-labeled Indian script also receives a preview');
});

test('all 22 Eighth Schedule languages plus English are accepted; previews never save', () => {
  const b=backend([['Class/Grade','Section','Project Name','Active'],['9','Keats','VoiceVote','TRUE']]);
  const expected=[
    'as-IN','bn-IN','brx-IN','doi-IN','gu-IN','hi-IN','kn-IN','ks-IN',
    'gom-IN','mai-IN','ml-IN','mni-Mtei-IN','mr-IN','ne-IN','or-IN',
    'pa-IN','sa-IN','sat-Olck-IN','sd-IN','ta-IN','te-IN','ur-IN','en-IN'
  ];
  assert.deepEqual(
    Array.from(vm.runInContext('Object.keys(VOICEVOTE_FEEDBACK_LANGUAGE_CODES)',b.context)).sort(),
    expected.slice().sort()
  );
  const id='123e4567-e89b-42d3-a456-426614174000';
  for (const language of expected.filter(x=>x!=='en-IN')) {
    const preview=b.context.doPost({parameter:{action:'translatePreview',requestId:id,language,feedback:'A great model'}});
    assert.match(preview.html,/"success":true/,language+' should be accepted for best-effort preview');
    assert.match(preview.html,/voicevote-translation-preview/);
  }
  assert.equal(b.writes.length,0,'previews must never save feedback');
  const invalid=b.context.doPost({parameter:{action:'translatePreview',requestId:id,language:'xx-IN',feedback:'Hi'}});
  assert.match(invalid.html,/"success":false/);
});

test('successful and already-voted receipts offer Close; unsuccessful receipts preserve retry', () => {
  const b=backend([]);
  for (const result of [{success:true},{success:false,alreadyVoted:true}]) {
    const html=b.context.voiceVoteReceipt_(result).html;
    assert.match(html,/id="receiptClose"[^>]+>Close<\/button>/);
    assert.doesNotMatch(html,/Return to VoiceVote/);
    assert.match(html,/max-width:640px/);
    assert.match(html,/min-height:60px/);
    assert.match(html,/You can safely close this browser tab/);
  }
  const failed=b.context.voiceVoteReceipt_({success:false}).html;
  assert.match(failed,/id="receiptRetry"/);
  assert.match(failed,/\?vote=retry/);
  assert.doesNotMatch(failed,/id="receiptClose"/);
});

test('Voting offers all 22 scheduled Indian languages plus English in one selector', () => {
  const html=fs.readFileSync('index.html','utf8');
  const selector=html.match(/<select id="language"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selector,'the Voting language dropdown must exist');
  const actual=Array.from(selector[1].matchAll(/<option value="([^"]+)">/g),m=>m[1]);
  const expected=['en-IN','as-IN','bn-IN','brx-IN','doi-IN','gu-IN','hi-IN','kn-IN','ks-IN',
    'gom-IN','mai-IN','ml-IN','mni-Mtei-IN','mr-IN','ne-IN','or-IN','pa-IN','sa-IN',
    'sat-Olck-IN','sd-IN','ta-IN','te-IN','ur-IN'];
  assert.equal(actual.length,23);
  assert.deepEqual(actual.slice().sort(),expected.slice().sort());
  assert.match(html,/Microphone recognition varies by browser and language/);
});

test('language switch clears original and translated text, refuses stale translation and preserves vote state', async () => {
  const stored=new Map([['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']]);
  const a=app(null,'',stored);
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.language.value='hi-IN';
  a.elements.feedback.value='यह प्रयोग अच्छा है';
  a.context.scheduleEnglishTranslation(true);
  await new Promise(resolve=>setTimeout(resolve,15));
  const preview=a.forms.find(f=>f.method==='POST' && f.children.some(x=>x.name==='action' && x.value==='translatePreview'));
  assert.ok(preview);
  const requestId=preview.children.find(x=>x.name==='requestId').value;
  a.elements.language.value='te-IN';
  a.elements.language.dispatchEvent(new a.context.Event('change'));
  assert.equal(a.elements.feedback.value,'','old-language feedback must be cleared immediately');
  assert.equal(a.elements.feedback.lang,'te-IN','textarea language must follow selection');
  assert.equal(a.elements.englishTranslationText.textContent,'');
  assert.match(a.elements.status.textContent,/Previous feedback was cleared/);
  a.context.dispatchWindowEvent('message',{
    origin:'https://script.google.com',
    data:{type:'voicevote-translation-preview',requestId,success:true,translation:'STALE OLD LANGUAGE'}
  });
  assert.equal(a.elements.englishTranslationText.textContent,'','late response must stay hidden');
  a.elements.feedback.value='కొత్త అభిప్రాయం';
  a.elements.feedback.dispatchEvent(new a.context.Event('input'));
  a.elements.language.value='ur-IN';
  a.elements.language.dispatchEvent(new a.context.Event('change'));
  assert.equal(a.elements.feedback.value,'','typed text is cleared on next switch too');
  assert.equal(a.elements.englishTranslationText.textContent,'');
  assert.deepEqual(Array.from(stored),[
    ['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']
  ],'switching languages must not reset or mutate browser voting state');
  assert.ok(a.forms.every(f=>!f.children.some(x=>x.name==='action' && x.value==='save')),'no votes sent');
});

test('owner demo shares the same language reset and Close behavior without saving', async () => {
  const locked=new Map([['voicevote_voted_v1','1']]);
  const a=app(null,'',locked,'#presenter='+'a'.repeat(64));
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.context.voiceVotePresenterVerify({success:true});
  a.elements.language.value='hi-IN';
  a.elements.feedback.value='हिन्दी प्रतिक्रिया';
  a.elements.language.value='bn-IN';
  a.elements.language.dispatchEvent(new a.context.Event('change'));
  assert.equal(a.elements.feedback.value,'');
  a.elements.studentClass.value='9';
  a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value='Keats';
  a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value='VoiceVote';
  a.elements.feedback.value='ভালো';
  a.stars[4].dispatchEvent(new a.context.Event('click'));
  a.context.submitFeedback();
  assert.equal(a.elements.presenterReceipt.hidden,false);
  a.elements.presenterClose.dispatchEvent(new a.context.Event('click'));
  assert.equal(a.elements.presenterReceipt.hidden,true);
  assert.match(a.elements.status.textContent,/close this tab/i);
  assert.equal(a.forms.length,0);
  assert.equal(locked.get('voicevote_voted_v1'),'1');
});

test('visitor header contains only central VoiceVote brand; 23 languages, no Results navigation',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.doesNotMatch(html,/votenav-results|Explore the experience/i);
  assert.doesNotMatch(html,/文 5 languages/);
  assert.match(html,/22 Indian languages \+ English/);
  const css=fs.readFileSync('voicevote-theme.css','utf8');
  assert.match(css,/\.vote-topnav\{justify-content:center/);
});

test('iOS Chrome can open a real no-save preview in a separate browser tab',async()=>{
  const stored=new Map([['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']]);
  const a=app(null,'',stored,'','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) CriOS/123.0');
  respond(a,{success:true,projects:[{grade:'9',section:'Keats',project:'VoiceVote'}]});
  await tick();
  a.elements.language.value='te-IN';
  a.elements.feedback.value='ఈ ప్రాజెక్టు బాగుంది';
  a.context.scheduleEnglishTranslation();
  assert.equal(a.elements.openTranslationPageBtn.hidden,false,'iOS shows top-level fallback');
  a.elements.openTranslationPageBtn.click();
  const standalone=a.forms.find(f=>f.children.some(x=>x.name==='view'&&x.value==='standalone'));
  assert.ok(standalone);
  assert.equal(standalone.method,'POST');
  assert.equal(standalone.target,'_blank');
  assert.equal(standalone.submitted,true);
  const fields=Object.fromEntries(standalone.children.map(x=>[x.name,x.value]));
  assert.deepEqual(fields,{
    action:'translatePreview',view:'standalone',
    requestId:'123e4567-e89b-42d3-a456-426614174000',
    language:'te-IN',feedback:'ఈ ప్రాజెక్టు బాగుంది'
  });
  assert.equal(a.forms.some(f=>f.children.some(x=>x.name==='action'&&x.value==='save')),false);
  assert.deepEqual(Array.from(stored),[
    ['voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000']
  ]);
  a.elements.language.value='hi-IN';
  a.elements.language.dispatchEvent(new a.context.Event('change'));
  assert.equal(a.elements.feedback.value,'');
  assert.equal(a.elements.openTranslationPageBtn.hidden,true);
});

test('standalone Google translation HTML is escaped and cannot save feedback',()=>{
  const b=backend([['Class/Grade','Section','Project Name','Active'],
    ['9','Keats','VoiceVote','TRUE']]);
  const input='<img src=x onerror=alert(1)> & పరీక్ష';
  const reply=b.context.doPost({parameter:{action:'translatePreview',
    view:'standalone',language:'te-IN',
    feedback:input,requestId:'123e4567-e89b-42d3-a456-426614174000'}});
  assert.match(reply.html,/Translation preview/);
  assert.match(reply.html,/No vote submitted or saved/i);
  assert.ok(reply.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!reply.html.includes(input),'No raw HTML injection');
  assert.equal(b.writes.length,0,'Separate preview cannot append feedback');
});
