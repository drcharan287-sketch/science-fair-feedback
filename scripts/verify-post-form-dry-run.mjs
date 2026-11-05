// Real Chromium dry run: intercept ALL external traffic before filling a feedback form.
// This script NEVER forwards a real action=save request to Google Apps Script.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin = new URL(site).origin;
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try {
  // Each run simulates a fresh visitor without previous vote history.
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try { if (location.hostname.endsWith('github.io')) localStorage.clear(); }
    catch (_) { /* browser storage might be unavailable */ }
  });
  const page = await context.newPage();
  let captured = null;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      return route.continue();
    }
    if (url.hostname === 'script.google.com' &&
        url.pathname.endsWith('/exec') && request.method() === 'POST') {
      captured = {method:request.method(),url:url.toString(),body:request.postData()};
      return route.fulfill({
        status:200,contentType:'text/html',
        body:'<!doctype html><html><body><h1>Dry-run confirmation only; Google was never contacted.</h1></body></html>'
      });
    }
    // All other cross-origin requests—including legacy JSONP GET saves—are blocked.
    return route.abort('blockedbyclient');
  });

  let error;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      captured = null;
      const response = await page.goto(site + '?postDryRun=' + Date.now(), {
        waitUntil:'domcontentloaded',timeout:25000
      });
      assert.ok(response?.ok(),'Live GitHub Pages site must be accessible');
      await page.waitForFunction(() =>
        document.getElementById('studentClass') &&
        !document.getElementById('studentClass').disabled &&
        Array.from(document.getElementById('studentClass').options).some(o=>o.value==='9'),
        null,{timeout:12000}
      );
      await page.selectOption('#studentClass','9');
      await page.selectOption('#section','Keats');
      await page.selectOption('#project','VoiceVote');
      await page.fill('#feedback','AUTOMATED DRY RUN - never transmitted to Google.');
      await page.locator('.star[data-value="5"]').click();
      // Project selections are populated before the app's final ready callback.
      // Wait for the actual Submit button too, rather than racing that callback.
      try {
        await page.waitForFunction(() => {
          const b = document.getElementById('submitBtn');
          return b && !b.disabled;
        }, null, { timeout: 7000 });
      } catch (e) {
        const state = await page.evaluate(() => ({
          status: document.getElementById('status')?.textContent,
          catalogStatus: document.getElementById('catalogStatus')?.textContent,
          voted: localStorage.getItem('voicevote_voted_v1'),
          catalogReady: typeof catalogReady === 'boolean' ? catalogReady : 'unavailable',
          hasLocalVote: typeof hasLocalVote === 'function' ? hasLocalVote() : 'unavailable',
          submitDisabled: document.getElementById('submitBtn')?.disabled
        }));
        throw new Error('VoiceVote submit was disabled: ' + JSON.stringify(state));
      }
      await page.locator('#submitBtn').click({ timeout: 10000 });

      for(let i=0;i<50 && !captured;i++){
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(captured, 'Submitting should create a cross-origin POST; no GET save is allowed');
      assert.equal(captured.method,'POST');
      const destination = new URL(captured.url);
      assert.equal(destination.searchParams.get('feedback'),null,'Feedback must not appear in URL');
      const fields = new URLSearchParams(captured.body || '');
      assert.equal(fields.get('action'),'save');
      assert.equal(fields.get('studentClass'),'9');
      assert.equal(fields.get('section'),'Keats');
      assert.equal(fields.get('project'),'VoiceVote');
      assert.equal(fields.get('rating'),'5');
      assert.equal(fields.get('feedback'),'AUTOMATED DRY RUN - never transmitted to Google.');
      assert.match(fields.get('submissionId')||'',/^[a-f0-9-]{36}$/i);
      assert.match(fields.get('deviceToken')||'',/^[a-f0-9-]{36}$/i, 'Persistent anonymous browser token must be included in POST');
      console.log('Live POST form dry run PASSED. Request intercepted; absolutely no feedback was sent to Google.');
      error=null;
      break;
    }catch(e){
      error=e;
      if(attempt<7)await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  if(error)throw error;
}finally{
  await browser.close();
}
