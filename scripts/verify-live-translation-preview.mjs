// Actual Google Apps Script translation verification on the published Voting UI.
// All inputs are synthetic and non-personal. All production action=save POSTs
// are blocked, as are unrelated POST requests. No browser vote locks are written.
// A fifth English-selected Indic-script case checks PR #56 backend deployment.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site='https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin=new URL(site).origin;
const cases=[
  {name:'Telugu',lang:'te-IN',phrase:'ఈ విజ్ఞాన ప్రాజెక్టు చాలా బాగుంది'},
  {name:'Hindi',lang:'hi-IN',phrase:'यह विज्ञान परियोजना बहुत अच्छी है'},
  {name:'Tamil',lang:'ta-IN',phrase:'இந்த அறிவியல் திட்டம் மிகவும் நன்றாக உள்ளது'},
  {name:'Kannada',lang:'kn-IN',phrase:'ಈ ವಿಜ್ಞಾನ ಯೋಜನೆ ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ'},
  {name:'PR56 English-selected Telugu safety net',lang:'en-IN',
    phrase:'ఈ విజ్ఞాన ప్రాజెక్టు చాలా బాగుంది'}
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
let totalPreviewPosts=0,totalSavePosts=0;
try{
  for(const sample of cases){
    const context=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true});
    const page=await context.newPage();
    let previewPosts=0,savePosts=0,unexpected=0;
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      if(req.method()==='GET'&&u.origin===origin)return route.continue();
      if(req.method()==='GET'&&u.hostname==='script.google.com'&&
         u.searchParams.get('action')==='catalog'){
        const cb=u.searchParams.get('callback');
        if(cb&&/^[a-zA-Z0-9_]+$/.test(cb)){
          return route.fulfill({status:200,contentType:'application/javascript',
            body:cb+'('+JSON.stringify({success:true,projects:[
              {grade:'9',section:'Keats',project:'VoiceVote'}
            ]})+');'});
        }
      }
      if(req.method()==='POST'&&u.hostname==='script.google.com'){
        const p=new URLSearchParams(req.postData()||'');
        if(p.get('action')==='translatePreview'){
          previewPosts++;totalPreviewPosts++;
          assert.equal(p.get('language'),sample.lang);
          assert.equal(p.get('feedback'),sample.phrase);
          assert.match(p.get('requestId')||'',/^[a-f0-9-]{36}$/i);
          assert.equal(p.has('deviceToken'),false);
          assert.equal(p.has('submissionId'),false);
          return route.continue();
        }
        if(p.get('action')==='save'){savePosts++;totalSavePosts++;}
        else unexpected++;
        return route.abort('blockedbyclient');
      }
      // HtmlService's translation response redirects to Google-hosted HTML.
      // Allow only safe GETs there; never anonymous production data or saves.
      if(req.method()==='GET'&&u.protocol==='https:'&&(
        u.hostname==='script.google.com'||
        u.hostname==='script.googleusercontent.com'||
        u.hostname.endsWith('.googleusercontent.com')||
        u.hostname==='accounts.google.com'||
        u.hostname.endsWith('.gstatic.com')))return route.continue();
      unexpected++;
      return route.abort('blockedbyclient');
    });
    try{
      let verified=false;
      for(let attempt=1;attempt<=2;attempt++){
        await page.goto(site+'?translationPreviewCheck='+
          encodeURIComponent(sample.lang)+'-'+attempt,{
            waitUntil:'domcontentloaded',timeout:30000
          });
        await page.waitForFunction(()=>
          !document.querySelector('#language')?.disabled,
          null,{timeout:20000});
        await page.locator('#language').selectOption(sample.lang);
        await page.locator('#feedback').fill(sample.phrase);
        try{
          await page.waitForFunction(()=>{
            const status=document.querySelector('#englishTranslationStatus')?.textContent||'';
            const translated=document.querySelector('#englishTranslationText')?.textContent||'';
            return /translation ready/i.test(status)&&translated.trim().length>=8;
          },null,{timeout:29000});
          const translation=(await page.locator('#englishTranslationText').innerText()).trim();
          assert.ok(/[A-Za-z]{3,}/.test(translation),
            sample.name+' must return readable English text');
          assert.notEqual(translation,sample.phrase,
            sample.name+' must not just echo the original');
          assert.doesNotMatch(translation,/[\u0900-\u0D7F]/,
            sample.name+' must not leave untranslated Indic script');
          const locks=await page.evaluate(()=>({
            voted:localStorage.getItem('voicevote_voted_v1'),
            pending:localStorage.getItem('voicevote_pending_v1')
          }));
          assert.deepEqual(locks,{voted:null,pending:null},
            'Translation must not modify browser voting locks');
          assert.ok(previewPosts>0,'No preview POST was observed');
          assert.equal(savePosts,0,'A real vote POST must never occur');
          assert.deepEqual(errors,[],'No uncaught Voting JavaScript errors');
          console.log('PASS live Google '+sample.name+' -> English: '+
            JSON.stringify(translation)+'; previews '+previewPosts+
            '; votes 0; locks untouched');
          verified=true;
          break;
        }catch(error){
          const status=await page.locator('#englishTranslationStatus')
            .textContent().catch(()=>'(status missing)');
          console.error(sample.name+' attempt '+attempt+' failed: '+
            String(error.message).slice(0,200)+'; UI status: '+status+
            '; preview POSTs '+previewPosts+'; blocked '+unexpected);
          if(attempt===2)throw error;
          await new Promise(resolve=>setTimeout(resolve,3000));
        }
      }
      assert.equal(verified,true,sample.name+' never translated');
    }finally{
      await context.close();
    }
  }
  assert.equal(totalSavePosts,0,'No feedback may be saved during this check');
  assert.ok(totalPreviewPosts>=cases.length,'Expected preview for every language');
  console.log('PASS all five live translations including PR56 release sentinel. '+
    'All requests are read-only; no Feedback writes or browser locks.');
}finally{
  await browser.close();
}
