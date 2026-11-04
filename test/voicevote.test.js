const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app() {
  class Element {
    constructor() { this.options = []; this.value = ''; this.disabled = false; this.textContent = ''; this.listeners = {}; this.dataset = {}; this.classList = { toggle() {}, remove() {} }; }
    add(option) { this.options.push(option); }
    replaceChildren() { this.options = []; this.value = ''; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn.call(this, event); }
    remove() { this.removed = true; }
  }
  const elements = Object.fromEntries(['studentClass', 'section', 'project', 'catalogStatus', 'submitBtn', 'status', 'language', 'feedback'].map(id => [id, new Element()]));
  elements.language.value = 'hi-IN';
  elements.submitBtn.disabled = true;
  const stars = Array.from({ length: 5 }, (_, i) => { const e = new Element(); e.dataset.value = String(i + 1); return e; });
  const scripts = [];
  const document = {
    querySelector: s => elements[s.slice(1)], getElementById: id => elements[id],
    querySelectorAll: s => s === '.star' ? stars : [],
    createElement: () => new Element(), head: { appendChild: tag => scripts.push(tag) }
  };
  const context = { document, console: { error() {} }, URLSearchParams, Option: function(text, value) { this.textContent = text; this.value = value; }, Event: function(type) { this.type = type; }, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('voicevote-catalog.js', 'utf8'), context);
  const html = fs.readFileSync('index.html', 'utf8');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { context, elements, stars, scripts };
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
    assert.equal(a.elements.studentClass.disabled, true, mode);
    assert.match(a.elements.catalogStatus.textContent, /Unable to load projects:/, mode);
    assert.equal(tag.removed, true);
  }
});

test('save uses existing JSONP fields, preserves feedback on failure, and clears only on confirmation', async () => {
  const a = app();
  respond(a, { success: true, projects: [{ grade: '6', section: 'A', project: 'Robot' }] }); await tick();
  a.elements.studentClass.value = '6'; a.elements.studentClass.dispatchEvent(new a.context.Event('change'));
  a.elements.section.value = 'A'; a.elements.section.dispatchEvent(new a.context.Event('change'));
  a.elements.project.value = 'Robot'; a.elements.feedback.value = 'Great & clever';
  a.stars[3].dispatchEvent(new a.context.Event('click'));
  let pending = a.context.submitFeedback();
  const { url } = respond(a, { success: false, message: 'Save failed' });
  await pending;
  assert.equal(url.searchParams.get('action'), 'save');
  assert.equal(url.searchParams.get('studentClass'), '6');
  assert.equal(url.searchParams.get('section'), 'A');
  assert.equal(url.searchParams.get('project'), 'Robot');
  assert.equal(url.searchParams.get('feedback'), 'Great & clever');
  assert.equal(url.searchParams.get('language'), 'hi-IN');
  assert.equal(url.searchParams.get('rating'), '4');
  assert.equal(a.elements.feedback.value, 'Great & clever');
  assert.match(a.elements.status.textContent, /Save failed/);
  pending = a.context.submitFeedback(); respond(a, { success: true }); await pending;
  assert.equal(a.elements.feedback.value, '');
  assert.match(a.elements.status.textContent, /saved successfully/);
});
