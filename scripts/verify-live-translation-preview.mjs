// Actual Google Apps Script translation preview smoke: one synthetic phrase,
// strictly no action=save, no feedback sheet writes, no persistent voter lock.
// Run ONLY after Pages and Apps Script deployment; false/empty text fails.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site='https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin=new URL(site).origin;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true});
  const page=await context.newPage();
  let previewPosts=0,savePosts=0,unexpected=0;
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(req.method()==='GET' && u.origin===origin)return route.continue();
    if(req.method()==='GET'&&u.hostname==='script.google.com'&&u.searchParams.get('action')==='catalog'){
      const cb=u.searchParams.get('callback');
      if(cb&&/^[a-zA-Z0-9_]+$/.test(cb)){
        return route.fulfill({status:200,contentType:'application/javascript',
          body:cb+'('+JSON.stringify({success:true,projects:[
            {grade:'9',section:'Keats',project:'VoiceVote'}
          ]})+');'});
      }
    }
    if(req.method()==='POST' && u.hostname==='script.google.com'){
      const params=new URLSearchParams(req.postData()||'');
      if(params.get('action')==='translatePreview'){
        previewPosts++;
        assert.equal(params.get('language'),'hi-IN');
        assert.match(params.get('requestId')||'',/^[a-f0-9-]{36}$/i);
        assert.equal(params.has('deviceToken'),false);
        assert.equal(params.has('submissionId'),false);
        return route.continue();
      }
      // Google HtmlService may issue internal iframe requests without an
      // action field. They are NOT VoiceVote votes, and are blocked safely.
      // Count ONLY action=save as a potential real feedback submission.
      if(params.get('action')==='save')savePosts++;
      else unexpected++;
      return route.abort('blockedbyclient');
    }
    // Apps Script HtmlService redirects its safe response into a Google-hosted
    // document. Allow GETs for that response, never external POSTs or saves.
    if(req.method()==='GET' && u.protocol==='https:' &&
      (u.hostname==='script.google.com' ||
       u.hostname==='script.googleusercontent.com' ||
       u.hostname.endsWith('.googleusercontent.com') ||
       u.hostname==='accounts.google.com' ||
       u.hostname.endsWith('.gstatic.com')))return route.continue();
    unexpected++;return route.abort('blockedbyclient');
  });
  let verified=false;
  for(let attempt=1;attempt<=2;attempt++){
    await page.goto(site+'?translationPreviewCheck='+attempt,{
      waitUntil:'domcontentloaded',timeout:30000
    });
    await page.waitForFunction(()=>!document.querySelector('#language')?.disabled,
      null,{timeout:20000});
    await page.locator('#language').selectOption('hi-IN');
    await page.locator('#feedback').fill('यह विज्ञान परियोजना बहुत अच्छी है');
    try{
      await page.waitForFunction(()=>{
        const label=document.querySelector('#englishTranslationStatus')?.textContent||'';
        const value=document.querySelector('#englishTranslationText')?.textContent||'';
        return /translation ready/i.test(label)&&value.length>=8;
      },null,{timeout:29000});
      const output=await page.locator('#englishTranslationText').innerText();
      assert.ok(!output.includes('यह विज्ञान'), 'English preview must not echo original Hindi');
      assert.ok(/[A-Za-z]/.test(output), 'English preview needs actual Latin/English output');
      const storage=await page.evaluate(()=>({
        voted:localStorage.getItem('voicevote_voted_v1'),
        pending:localStorage.getItem('voicevote_pending_v1')
      }));
      assert.deepEqual(storage,{voted:null,pending:null},
        'Translation must not touch real vote locks');
      assert.ok(previewPosts>=1,'No translation POST observed');
      assert.equal(savePosts,0,'No actual vote POST should be sent');
      // Browser vendors may load optional Google assets; only GETs are allowed.
      assert.deepEqual(errors,[],'No uncaught app JavaScript errors');
      console.log('PASS ACTUAL Google read-only English translation preview; '+previewPosts+
        ' preview POST(s); zero real vote POSTs; no browser vote lock.');
      verified=true;
      break;
    }catch(err){
      const status=await page.locator('#englishTranslationStatus').textContent().catch(()=>'(missing)');
      console.error('Live preview attempt '+attempt+' did not complete. UI status: '+status+
        '; allowed preview requests: '+previewPosts+'; other blocked requests: '+unexpected);
      if(attempt===2)throw err;
      await new Promise(r=>setTimeout(r,5000));
    }
  }
  assert.equal(verified,true,'Actual Google translation preview never completed.');
}finally{await browser.close();}
