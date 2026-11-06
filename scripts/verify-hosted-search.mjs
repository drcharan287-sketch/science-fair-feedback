// Tests the PUBLISHED GitHub Pages UI after its Pages workflow completes.
// No form is submitted and no production Feedback data is written.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const browser = await chromium.launch({
  channel: 'chrome', headless: true, args: ['--no-sandbox']
});

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(site, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.locator('#projectSearch').waitFor({state: 'visible'});
  await page.waitForFunction(() => {
    const search = document.getElementById('projectSearch');
    return search && !search.disabled;
  }, null, {timeout: 20000});

  const grade=(await page.locator('#studentClass option').evaluateAll(nodes=>
    nodes.map(n=>n.value).filter(Boolean)))[0];
  assert.ok(grade,'At least one grade is required');
  await page.selectOption('#studentClass',grade);
  const section=(await page.locator('#section option').evaluateAll(nodes=>
    nodes.map(n=>n.value).filter(Boolean)))[0];
  assert.ok(section,'At least one active section is required');
  await page.selectOption('#section',section);
  const title=(await page.locator('#project option').evaluateAll(nodes=>
    nodes.map(n=>n.value).filter(Boolean)))[0];
  assert.ok(title,'At least one active project is required');
  await page.locator('#projectSearch').fill(title);
  await page.locator('#projectSearchResults button').first().click();
  assert.ok(await page.locator('#studentClass').inputValue());
  assert.ok(await page.locator('#section').inputValue());
  assert.equal(await page.locator('#project').inputValue(),title);
  assert.ok((await page.locator('#projectSearchSelected').innerText()).includes(title));

  // Simulate an already STARTED submission in this disposable browser only.
  // Do not click Submit and do not call action=save.
  await page.evaluate(() => localStorage.setItem('voicevote_pending_v1', '1'));
  await page.goto(site, {waitUntil: 'domcontentloaded',timeout:30000});
  await page.waitForFunction(() => {
    const status = document.getElementById('voteGuardStatus');
    return status && !status.hidden;
  },null,{timeout:15000});
  for (const selector of ['#submitBtn','#studentClass','#section','#project',
    '#projectSearch','#feedback','#language','#startBtn','#stopBtn','.star[data-value="5"]']) {
    assert.equal(await page.locator(selector).isDisabled(), true, selector+' must be locked');
  }
  assert.match(await page.locator('#voteGuardStatus').innerText(), /submission|voting is paused/i);

  await page.goto(site+'?vote=retry',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(() => {
    const search=document.getElementById('projectSearch');
    return search && !search.disabled;
  },null,{timeout:15000});
  const pending=await page.evaluate(()=>localStorage.getItem('voicevote_pending_v1'));
  assert.equal(pending, null, 'Explicit failure receipt clears pending lock');

  await page.goto(site+'?vote=success',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(() => {
    const status = document.getElementById('voteGuardStatus');
    return status && !status.hidden && /already submitted|already been recorded/i.test(status.textContent);
  },null,{timeout:15000});
  for(const selector of ['#submitBtn','#studentClass','#section','#project',
    '#projectSearch','#feedback','#language','#startBtn','#stopBtn','.star[data-value="5"]']) {
    assert.equal(await page.locator(selector).isDisabled(), true, selector+' must remain locked');
  }
  // Management deferred visitor passes. They must not be accessible in the
  // attendee experience, and an already-confirmed vote must stay locked.
  assert.equal(await page.locator('#visitorPassFeature').isVisible(), false);
  assert.equal(await page.locator('#newVisitorBtn').isVisible(), false);
  assert.equal(await page.locator('#visitorPass').isDisabled(), true);
  assert.equal(await page.locator('#submitBtn').isDisabled(), true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('voicevote_voted_v1')), '1');
  if (errors.length) throw new Error('Browser exceptions: '+errors.join('; '));
  console.log('Hosted search, deferred-pass privacy and confirmed-vote lockout PASSED. No feedback requests were made.');
} finally {
  await browser.close();
}
