// Live browser-only POST diagnostic. It never writes feedback or submits action=save.
// Tests a top-level HTML form POST from the GitHub Pages origin to Apps Script.
import { chromium } from 'playwright-core';

const pageUrl = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const appUrl = 'https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec';

const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--no-sandbox'] });
try {
  const page = await browser.newPage({ acceptDownloads:false });
  const response = await page.goto(pageUrl, {waitUntil:'domcontentloaded',timeout:30000});
  if (!response?.ok()) throw new Error('VoiceVote frontend returned HTTP '+response?.status());
  // Browser form request avoids browser CORS/JSONP and intentionally has no save data.
  await page.evaluate((appUrl) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = appUrl;
    form.target = '_self';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'action';
    input.value = 'probe';
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }, appUrl);
  let ready=false;
  for(let i=0; i<40; i++) {
    for (const frame of page.frames()) {
      try {
        const content=await frame.locator('body').innerText({timeout:1500});
        if(content.includes('VoiceVote POST connection ready')){ready=true;break;}
      }catch {}
    }
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,600));
  }
  if(!ready) {
    console.error('Final top-level browser URL:',page.url());
    console.error('Frame URLs:',page.frames().map(f=>f.url()).map(u=>u.slice(0,140)));
    throw new Error('Apps Script POST probe did not display its success receipt');
  }
  console.log('Live browser POST probe PASSED. No Feedback rows were written.');
}finally{
  await browser.close();
}
