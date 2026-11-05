/**
 * Live smoke test of the admin page's privacy gate.
 * This makes only a read-only AUTHENTICATION attempt with a wrong key,
 * never reads private feedback, never writes/voids votes, never touches Sheets.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const url = 'https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec?action=admin';
const browser = await chromium.launch({
  channel: 'chrome', headless: true, args: ['--no-sandbox']
});
try {
  const page = await browser.newPage();
  let lastError = '';
  let passed = false;
  for(let i=0;i<5;i++) {
    try {
      await page.goto(url+'&check='+i, {waitUntil:'domcontentloaded',timeout:30000});
      let loginFrame = null;
      for(let t=0;t<30;t++) {
        for(const frame of page.frames()) {
          try {
            if(await frame.locator('#loginForm').count()) {loginFrame=frame;break;}
          } catch {}
        }
        if(loginFrame)break;
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      assert.ok(loginFrame, 'Google-hosted admin login panel should be available');
      // Never sends a valid secret. A public visitor must be refused.
      await loginFrame.locator('#adminKey').fill('INVALID_TEST_CREDENTIAL_NOT_A_REAL_ADMIN_SECRET_2026');
      await loginFrame.locator('#loginBtn').click();
      await loginFrame.waitForFunction(() => {
        const x=document.getElementById('loginError');
        return x && /denied|invalid|error/i.test(x.textContent);
      },null,{timeout:25000});
      assert.equal(await loginFrame.locator('#adminPanel').isVisible(),false);
      assert.equal(await loginFrame.locator('#loginPanel').isVisible(),true);
      console.log('Private admin access check PASSED: invalid credentials refused. No private data read.');
      passed=true;break;
    } catch(e) {
      lastError=e.message;
      if(i<4) await new Promise(resolve=>setTimeout(resolve,2500));
    }
  }
  if(!passed) throw new Error('Admin access smoke test failed: '+lastError);
} finally {
  await browser.close();
}
