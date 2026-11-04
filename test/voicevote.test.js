const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app(fetchProjects, search = '', stored = new Map()) {
  class Element {
    constructor() { this.options = []; this.value = ''; this.disabled = false; this.textContent = ''; this.listeners = {}; this.dataset = {}; this.children = []; this.style = {}; this.classList = { toggle() {}, remove() {} }; }
    appendChild(child) { this.children.push(child); }
    submit() { this.submitted = true; }
    add(option) { this.options.push(option); }
    replaceChildren() { this.options = []; this.value = ''; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn.call(this, event); }
    remove() { this.removed = true; }
  }
  const elements = Object.fromEntries(['studentClass', 'section', 'project', 'catalogStatus', 'retryCatalogBtn', 'submitBtn', 'status', 'language', 'feedback', 'voteGuardStatus', 'startBtn'].map(id => [id, new Element()]));
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
  const context = { document, console: { error() {} }, URLSearchParams, Option: function(text, value) { this.textContent = text; this.value = value; }, Event: function(type) { this.type = type; }, setTimeout, clearTimeout,
    crypto: { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000', getRandomValues: a => a.fill(7) },
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key,val) => {stored.set(key, String(val));} } };
  context.window = context;
  if (fetchProjects) context.fetch = fetchProjects;
  context.location = { search, reload() { context.__reloaded = true; } };
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
    submissionId: '123e4567-e89b-42d3-a456-426614174000',
    deviceToken: '123e4567-e89b-42d3-a456-426614174000',
    studentClass: '6',
    section: 'A',
    project: 'Robot',
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
  assert.match(returning.elements.voteGuardStatus.textContent,/already submitted feedback/);
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

// Run the versioned Apps Script with in-memory services, then execute its real
// JSONP response in the frontend VM. No Google services are contacted.
function backend(rows) {
  const writes = [];
  const receipts = new Map();
  let released = false;
  const projectSheet = rows && { getDataRange: () => ({ getDisplayValues: () => rows }) };
  const feedbackSheet = { getLastRow: () => writes.length, appendRow: row => writes.push(Array.from(row)) };
  const context = {
    ContentService: { MimeType: { JAVASCRIPT: 'javascript' }, createTextOutput: text => ({ text, setMimeType(type) { this.mime = type; return this; } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => name === 'Projects' ? projectSheet : feedbackSheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
    LanguageApp: { translate: (text, source, target) => `${source}:${target}:${text}` },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => receipts.get(key),
      setProperty: (key, value) => receipts.set(key, value)
    }) },
    HtmlService: { createHtmlOutput: html => ({
      html, setTitle(title) { this.title = title; return this; }
    }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), context);
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
  assert.deepEqual(b.writes[0], ['Date', 'Project', 'Class', 'Section', 'Original Feedback', 'Rating', 'Language', 'English Translation']);
  assert.deepEqual(b.writes[1].slice(1), ['Robot', '6', 'A', "'=great", 5, 'hi-IN', 'hi:en:=great']);
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
  assert.match(result.message, /invalid feedback/);
  assert.equal(b.writes.length, 0);
  const invalid = b.context.doGet({ parameter: { action: 'catalog', callback: 'bad.name()' } });
  assert.match(invalid.text, /^voiceVoteResponse\(/);
});

// The live GitHub Pages site has fetch(); it should load the same-origin public
// catalog without issuing a cross-origin Google JSONP request.
test('same-origin projects.json populates class and section without contacting Google', async () => {
  const seen = [];
  const a = app(async (url, options) => {
    seen.push({ url, options });
    return { ok: true, json: async () => ({ success: true, projects: [
      {grade:'6', section:'Heidelberg', project:'XenoChat'},
      {grade:'9', section:'Keats', project:'VoiceVote'}
    ] }) };
  });
  await tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, './projects.json');
  assert.equal(seen[0].options.credentials, 'same-origin');
  assert.equal(a.scripts.length, 0);
  assert.deepEqual(a.elements.studentClass.options.map(o => o.value), ['', '6', '9']);
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.section.options.map(o => o.value), ['', 'Heidelberg']);
  a.elements.section.value = 'Heidelberg'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  assert.deepEqual(a.elements.project.options.map(o => o.value), ['', 'XenoChat']);
  assert.equal(a.elements.catalogStatus.textContent, '1 project(s) available');
});

test('snapshot unavailable falls back to real Google JSONP catalog', async () => {
  const a = app(async () => { throw new Error('Snapshot unavailable'); });
  await tick();
  assert.equal(a.scripts.length, 1);
  const { url } = respond(a, { success: true, projects: [
    {grade:'9', section:'Keats', project:'VoiceVote'}
  ] });
  await tick();
  assert.equal(url.searchParams.get('action'), 'catalog');
  assert.deepEqual(a.elements.studentClass.options.map(o => o.value), ['', '9']);
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

  const invalid = b.context.doPost({ parameter: { ...params, submissionId: 'bad-id' } });
  assert.match(invalid.html, /Feedback not confirmed/);
  assert.equal(b.writes.length, 2);
});
