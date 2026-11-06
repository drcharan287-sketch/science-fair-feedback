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
        const grade=document.getElementById('studentClass');
        return !!grade&&!grade.disabled&&Array.from(grade.options).some(o=>o.value);
      }, null, { timeout: 25000 });
      // Event-day Admin additions and deactivations legitimately change the
      // catalog; do not hardcode a specific project's presence.
      const grades=await page.locator('#studentClass option').evaluateAll(nodes=>
        nodes.map(n=>n.value).filter(Boolean));
      assert.ok(grades.length>0,'A live project grade must exist');
      for(const grade of grades.slice(0,2)){
        await page.selectOption('#studentClass',grade);
        const sections=await page.locator('#section option').evaluateAll(nodes=>
          nodes.map(n=>n.value).filter(Boolean));
        assert.ok(sections.length>0,'A live section must exist for Grade '+grade);
        await page.selectOption('#section',sections[0]);
        const projects=await page.locator('#project option').evaluateAll(nodes=>
          nodes.map(n=>n.value).filter(Boolean));
        assert.ok(projects.length>0,'At least one active project expected for Grade '+grade);
      }
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
  console.log('Live Chromium browser test PASSED: two active grade/section/project paths loaded from the current catalog.');
} finally {
  await browser.close();
}
