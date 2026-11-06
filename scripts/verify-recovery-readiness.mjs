// VoiceVote non-writing failure/recovery browser suite.
// Runs in disposable browser contexts. No production action=save ever reaches Google.
// Synthetic receipt pages deliberately do NOT prove that Google Sheets saved data.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin = new URL(site).origin;
const browser = await chromium.launch({
  channel: 'chrome', headless: true, args: ['--no-sandbox']
});
const errors = [];
let totalInterceptedPosts = 0;

function syntheticReceipt(mode) {
  const destination = site + (mode === 'success' ? '?vote=success' : '?vote=retry');
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<h1 id="syntheticReceipt">TEST RECEIPT ONLY — NEVER SENT TO GOOGLE</h1>' +
    '<a id="receiptReturn" href="' + destination + '">Return to VoiceVote</a>' +
    '</body></html>';
}
async function newIsolatedPage(mode = 'block') {
  const context = await browser.newContext();
  const page = await context.newPage();
  let intercepted = 0;
  page.on('pageerror', error => errors.push(error.message));
  // All non-GitHub requests are intercepted, including Google endpoints.
  // Even synthetic success/retry is generated locally: no real save can occur.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && request.method() === 'GET') {
      return route.continue();
    }
    if (url.hostname === 'script.google.com' &&
        url.pathname.endsWith('/exec') && request.method() === 'POST') {
      intercepted++;
      totalInterceptedPosts++;
      if (mode === 'interrupt') return route.abort('failed');
      if (mode === 'success' || mode === 'retry') {
        return route.fulfill({
          status: 200, contentType: 'text/html', body: syntheticReceipt(mode)
        });
      }
      return route.abort('blockedbyclient');
    }
    return route.abort('blockedbyclient');
  });
  return { context, page, get count() { return intercepted; } };
}
async function loadPage(page) {
  const response = await page.goto(site + '?recoveryReadiness=' + Date.now(), {
    waitUntil: 'domcontentloaded', timeout: 25000
  });
  assert.ok(response?.ok(), 'GitHub Pages app must be accessible');
  await page.waitForFunction(() => {
    const field = document.getElementById('studentClass');
    return field && !field.disabled && [...field.options].some(x => x.value);
  }, null, { timeout: 16000 });
}
async function fillVote(page) {
  const grade=(await page.locator('#studentClass option').evaluateAll(nodes =>
    nodes.map(n=>n.value).filter(Boolean)))[0];
  assert.ok(grade,'Active class/grade must exist for recovery test');
  await page.selectOption('#studentClass',grade);
  const section=(await page.locator('#section option').evaluateAll(nodes =>
    nodes.map(n=>n.value).filter(Boolean)))[0];
  assert.ok(section,'Active section must exist for recovery test');
  await page.selectOption('#section',section);
  const project=(await page.locator('#project option').evaluateAll(nodes =>
    nodes.map(n=>n.value).filter(Boolean)))[0];
  assert.ok(project,'Active project must exist for recovery test');
  await page.selectOption('#project',project);
  await page.fill('#feedback', 'SIMULATED ONLY — never sent to Google');
  await page.locator('.star[data-value="5"]').click();
  await page.waitForFunction(() => {
    const button = document.getElementById('submitBtn');
    return button && !button.disabled;
  }, null, { timeout: 7000 });
}
async function inspectLock(page, kind) {
  const result = await page.evaluate(() => ({
    pending: localStorage.getItem('voicevote_pending_v1'),
    voted: localStorage.getItem('voicevote_voted_v1'),
    submitDisabled: document.getElementById('submitBtn').disabled,
    feedbackDisabled: document.getElementById('feedback').disabled,
    message: document.getElementById('voteGuardStatus').textContent
  }));
  assert.equal(result.submitDisabled, true, 'Submit must stay disabled (' + kind + ')');
  assert.equal(result.feedbackDisabled, true, 'Feedback must stay locked (' + kind + ')');
  return result;
}
try {
  // A. Block BOTH live-first Google catalog and backup snapshot: visitor
  // selection must fail closed and recover when the backup is reachable again.
  {
    const a = await newIsolatedPage();
    const { page, context } = a;
    await page.route('**/projects.json*', route => route.abort('failed'));
    const response = await page.goto(site + '?catalogFault=' + Date.now(), {
      waitUntil: 'domcontentloaded', timeout: 25000
    });
    assert.ok(response?.ok());
    await page.waitForFunction(() => {
      const b=document.getElementById('retryCatalogBtn');
      const status=document.getElementById('catalogStatus');
      const grade=document.getElementById('studentClass');
      return b && !b.hidden && grade.disabled &&
        /retry|unable to load projects/i.test(status?.textContent||'');
    }, null, { timeout: 18000 });
    assert.equal(await page.locator('#submitBtn').isDisabled(), true);
    assert.equal(await page.locator('#studentClass').isDisabled(),true);
    assert.match(await page.locator('#catalogStatus').textContent(), /retry|Unable to load/i);
    assert.equal(a.count, 0);
    await page.unroute('**/projects.json*');
    await page.locator('#retryCatalogBtn').click();
    await page.waitForFunction(() => {
      const b = document.getElementById('studentClass');
      return b && !b.disabled && [...b.options].some(o => o.value);
    }, null, { timeout: 16000 });
    await fillVote(page);
    await context.setOffline(true);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    await page.locator('#submitBtn').click();
    assert.match(await page.locator('#status').textContent(), /offline/i);
    assert.equal(await page.locator('#networkStatus').isVisible(), true);
    const flags = await page.evaluate(() => ({
      pending: localStorage.getItem('voicevote_pending_v1'),
      voted: localStorage.getItem('voicevote_voted_v1'),
      inputDisabled: document.getElementById('feedback').disabled
    }));
    assert.equal(flags.pending, null, 'Known-offline case must not create a pending lock');
    assert.equal(flags.voted, null);
    assert.equal(flags.inputDisabled, false, 'Feedback remains editable while offline');
    assert.equal(a.count, 0);
    await context.setOffline(false);
    await page.waitForFunction(() => !document.getElementById('networkStatus').hidden, null, { timeout: 200 }).catch(() => {});
    await page.waitForFunction(() => document.getElementById('networkStatus').hidden,
      null, { timeout: 3000 });
    console.log('PASS: blocked catalog fallback, retry after recovery, known-offline preflight; 0 POSTs');
    await context.close();
  }

  // B. Unknown server result after an interrupted POST. NEVER automatically
  // clear the pending marker, including after Refresh or Back navigation.
  {
    const a = await newIsolatedPage('interrupt');
    const { page, context } = a;
    await loadPage(page);
    await fillVote(page);
    try { await page.locator('#submitBtn').click({ timeout: 6000 }); }
    catch (e) {
      // The intercepted navigation intentionally fails. Continue from the
      // original site on the same disposable browser context.
      if (a.count === 0) throw e;
    }
    assert.equal(a.count, 1, 'Exactly one intercepted POST attempt');
    // Chromium can finish navigating the original tab to chrome-error://
    // *after* an aborted POST. A second tab shares the same localStorage
    // but cannot race the first tab's error-page navigation.
    // The context-wide route still blocks EVERY POST in both tabs.
    const recoveryPage = await context.newPage();
    recoveryPage.on('pageerror', error => errors.push(error.message));
    const reopened = await recoveryPage.goto(site + '?recoveryLocked=' + Date.now(),
      { waitUntil: 'domcontentloaded', timeout: 25000 });
    assert.ok(reopened?.ok(), 'Read-only recovery tab should load the public page');
    // The catalog selector is EXPECTED to remain disabled while pending.
    // Waiting for an enabled selector would incorrectly fail a valid lockout.
    await recoveryPage.waitForFunction(() =>
      localStorage.getItem('voicevote_pending_v1') === '1' &&
      document.getElementById('submitBtn')?.disabled === true &&
      document.getElementById('voteGuardStatus')?.hidden === false,
      null, { timeout: 12000 });
    let lock = await inspectLock(recoveryPage, 'interrupted + new load');
    assert.equal(lock.pending, '1');
    assert.equal(lock.voted, null);
    assert.match(lock.message, /may already be saved|awaiting confirmation/i);
    assert.match(lock.message, /organizer/i);
    await recoveryPage.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    lock = await inspectLock(recoveryPage, 'Refresh');
    assert.equal(lock.pending, '1');
    await recoveryPage.goto(site + '?recoveryBack=' + Date.now(),
      { waitUntil: 'domcontentloaded', timeout: 25000 });
    await recoveryPage.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
    lock = await inspectLock(recoveryPage, 'Back');
    assert.equal(lock.pending, '1');
    await recoveryPage.evaluate(() => submitFeedback());
    assert.equal(a.count, 1, 'No duplicate POST after interrupted navigation/Back/Refresh');
    console.log('PASS: interrupted save stays locked across reload, Back and direct submit call');
    await context.close();
  }

  // C. Simulate *only* the browser handling of an authoritative success
  // receipt; its persistence must survive Reload/Back.
  {
    const a = await newIsolatedPage('success');
    const { page, context } = a;
    await loadPage(page);
    await fillVote(page);
    await page.locator('#submitBtn').click();
    await page.locator('#syntheticReceipt').waitFor({ timeout: 10000 });
    assert.equal(a.count, 1);
    assert.equal(await page.locator('#syntheticReceipt').isVisible(), true);
    await page.locator('#receiptReturn').click();
    await page.waitForFunction(() =>
      localStorage.getItem('voicevote_voted_v1') === '1', null, { timeout: 10000 });
    let lock = await inspectLock(page, 'synthetic success return');
    assert.equal(lock.voted, '1');
    assert.equal(lock.pending, null);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    lock = await inspectLock(page, 'synthetic success after Refresh');
    assert.equal(lock.voted, '1');
    await page.goto(site + '?afterSuccess=' + Date.now(),
      { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
    lock = await inspectLock(page, 'synthetic success after Back');
    assert.equal(lock.voted, '1');
    await page.evaluate(() => submitFeedback());
    assert.equal(a.count, 1, 'No re-submit after successful receipt');
    console.log('PASS: synthetic success receipt locks across Back/Refresh, no second POST');
    await context.close();
  }

  // D. Synthetic rejected receipt explicitly returns with vote=retry:
  // only then may a visitor edit and try again. No auto-resubmission.
  {
    const a = await newIsolatedPage('retry');
    const { page, context } = a;
    await loadPage(page);
    await fillVote(page);
    await page.locator('#submitBtn').click();
    await page.locator('#syntheticReceipt').waitFor({ timeout: 10000 });
    assert.equal(a.count, 1);
    await page.locator('#receiptReturn').click();
    // A rejection receipt clears the pending lock before the live-first
    // Google catalog necessarily finishes loading. Wait for BOTH conditions:
    // storage is unlocked AND the public form can actually be used again.
    await page.waitForFunction(() =>
      localStorage.getItem('voicevote_pending_v1') === null &&
      document.getElementById('submitBtn')?.disabled === false &&
      document.getElementById('feedback')?.disabled === false,
      null, { timeout: 25000 });
    assert.equal(await page.locator('#feedback').isEnabled(), true);
    assert.equal(await page.locator('#submitBtn').isEnabled(), true);
    assert.equal(a.count, 1, 'Receipt return should NOT auto-submit');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    assert.equal(await page.locator('#feedback').isEnabled(), true);
    assert.equal(a.count, 1);
    console.log('PASS: synthetic rejected receipt explicitly unlocks for manual retry');
    await context.close();
  }

  assert.deepEqual(errors, [], 'No unhandled browser errors should escape into the app');
  assert.equal(totalInterceptedPosts, 3, 'Only synthetic/interrupted POSTs expected');
  console.log('PASS all recovery-readiness tests. All Google POSTs intercepted; production feedback unchanged.');
} finally {
  await browser.close();
}
