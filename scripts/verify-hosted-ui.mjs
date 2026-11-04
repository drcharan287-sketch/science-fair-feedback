// Read-only real-browser smoke test of published VoiceVote.
// Never clicks Submit or requests action=save.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const url = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('Browser JS error:', error.message));
  let success = false;
  let error;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await page.goto(url + '?smoketest=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 25000 });
      if (!response?.ok()) throw new Error('Site returned HTTP ' + response?.status());
      await page.waitForFunction(() => {
        const grade = document.getElementById('studentClass');
        return !!grade && !grade.disabled && Array.from(grade.options).some(o => o.value === '6');
      }, null, { timeout: 13000 });
      await page.selectOption('#studentClass', '6');
      await page.selectOption('#section', 'Heidelberg');
      const p1 = await page.locator('#project option').allTextContents();
      assert.ok(p1.includes('XenoChat'), 'Grade 6 / Heidelberg must include XenoChat');
      await page.selectOption('#studentClass', '9');
      await page.selectOption('#section', 'Keats');
      const p2 = await page.locator('#project option').allTextContents();
      assert.ok(p2.includes('VoiceVote'), 'Grade 9 / Keats must include VoiceVote');
      success = true;
      break;
    } catch (e) {
      error = e;
      if (attempt < 7) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (!success) {
    console.error('Final catalog status:', await page.locator('#catalogStatus').textContent().catch(() => 'unavailable'));
    throw error || new Error('No matching project selections');
  }
  console.log('Live Chromium browser test PASSED: both class/section/project selections loaded.');
} finally {
  await browser.close();
}
