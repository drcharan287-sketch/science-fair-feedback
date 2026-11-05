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

  await page.locator('#projectSearch').fill('Xeno');
  await page.locator('#projectSearchResults button').first().click();
  assert.equal(await page.locator('#studentClass').inputValue(), '6');
  assert.equal(await page.locator('#section').inputValue(), 'Heidelberg');
  assert.equal(await page.locator('#project').inputValue(), 'XenoChat');
  assert.match(await page.locator('#projectSearchSelected').innerText(), /XenoChat/);

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
  // Another attendee may use the SAME device when they supply a different pass.
  await page.locator('#visitorPass').fill('VV-123E4567-E89B42D3-A4564266-14174000');
  assert.equal(await page.locator('#newVisitorBtn').isDisabled(),false);
  await page.locator('#newVisitorBtn').click();
  assert.equal(await page.locator('#submitBtn').isDisabled(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('voicevote_voted_v1')),null);
  assert.equal(await page.locator('#visitorPass').inputValue(),'VV-123E4567-E89B42D3-A4564266-14174000');
  if (errors.length) throw new Error('Browser exceptions: '+errors.join('; '));
  console.log('Live hosted search and full voting lockout PASSED. No feedback requests were made.');
} finally {
  await browser.close();
}
