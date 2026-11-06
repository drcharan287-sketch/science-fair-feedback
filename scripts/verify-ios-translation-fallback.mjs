// iPhone-Chrome-LIKE Chromium emulation, NOT native iOS WebKit.
// Verifies a user-gesture top-level translation POST when iframe messaging fails.
// No real Google API, Sheets, vote submission, or browser lock is touched.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const site=process.env.VOICEVOTE_SITE_BASE ||
  'https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin=new URL(site).origin;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try {
  const ctx=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1'
  });
  let savePosts=0,previewPosts=0,unexpected=0;
  await ctx.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin===origin && req.method()==='GET')return route.continue();
    if(u.hostname==='script.google.com' && req.method()==='GET'){
      const cb=u.searchParams.get('callback');
      if(u.searchParams.get('action')==='catalog'){
        return route.fulfill({status:200,contentType:'application/javascript',body:
          cb+'('+JSON.stringify({success:true,projects:[
            {grade:'9',section:'Keats',project:'VoiceVote',id:'SYN-VOICE'}
          ]})+');'});
      }
      if(u.searchParams.get('action')==='presenterVerify'){
        return route.fulfill({status:200,contentType:'application/javascript',body:
          cb+'({"success":true});'});
      }
    }
    if(u.hostname==='script.google.com' && req.method()==='POST'){
      const data=new URLSearchParams(req.postData()||'');
      if(data.get('action')==='translatePreview'){
        previewPosts++;
        if(data.get('view')==='standalone'){
          assert.equal(data.get('language'),'te-IN');
          assert.equal(data.get('feedback'),'ఈ ప్రాజెక్టు బాగుంది');
          assert.equal(data.has('deviceToken'),false);
          assert.equal(data.has('submissionId'),false);
          return route.fulfill({status:200,contentType:'text/html',body:
            '<!doctype html><html><body><h1>VoiceVote Translation preview</h1>'+
            '<p>Original Telugu feedback</p><p>This project is good.</p></body></html>'});
        }
        // iOS iframe embedded previews may fail. Simulate that safely.
        return route.abort('blockedbyclient');
      }
      if(data.get('action')==='save')savePosts++;
    }
    unexpected++;
    return route.abort('blockedbyclient');
  });
  async function check(url,owner) {
    const page=await ctx.newPage();
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response?.ok());
    await page.waitForFunction(()=>
      document.getElementById('language')&&!document.getElementById('language').disabled,
      null,{timeout:20000});
    await page.locator('#language').selectOption('te-IN');
    await page.locator('#feedback').fill('ఈ ప్రాజెక్టు బాగుంది');
    assert.equal(await page.locator('#openTranslationPageBtn').isVisible(),true,
      'iPhone Chrome should offer a separate translation tab');
    const [popup]=await Promise.all([
      page.waitForEvent('popup',{timeout:15000}),
      page.locator('#openTranslationPageBtn').click()
    ]);
    await popup.waitForLoadState('domcontentloaded');
    assert.match(await popup.locator('body').innerText(),/This project is good/);
    assert.equal(await page.locator('#feedback').inputValue(),'ఈ ప్రాజెక్టు బాగుంది',
      'Opening translation must preserve the editable original');
    await popup.close();
    await page.locator('#language').selectOption('hi-IN');
    assert.equal(await page.locator('#feedback').inputValue(),'',
      'Switching after a translated Telugu utterance must clear feedback');
    assert.equal(await page.locator('#openTranslationPageBtn').isVisible(),false);
    console.log('PASS iPhone-like Chromium '+(owner?'owner no-save demo':'parent Voting')+
      ': top-level translation popup, no save, original preserved, switching clears.');
    await page.close();
  }
  await check(site+'?iphoneTranslationSmoke=1',false);
  await check(site+'?iphoneTranslationSmoke=2#presenter='+'a'.repeat(64),true);
  assert.equal(savePosts,0);
  assert.equal(previewPosts>=2,true);
  assert.equal(unexpected,0,'No unexpected requests escaped interception');
  await ctx.close();
} finally {await browser.close();}
