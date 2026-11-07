// VV-33 — optional voice-based project Quick Find; entirely synthetic.
// Both voice results and the live project catalog are mocked. No saved votes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const site=process.env.VOICEVOTE_SITE_BASE||'http://127.0.0.1:8787/';
const origin=new URL(site).origin;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try {
  for(const viewport of [{width:390,height:844},{width:1280,height:820}]){
    const context=await browser.newContext({viewport});
    await context.addInitScript(()=>{
      class SearchSpeechMock{
        start(){window.__vvLastSpeech=this;}
        stop(){this.stopRequested=true;}
        abort(){this.abortRequested=true;}
      }
      Object.defineProperty(window,'SpeechRecognition',{value:SearchSpeechMock,configurable:true});
    });
    const page=await context.newPage();
    const errors=[];let writes=0,unexpected=0;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET'){writes++;return route.abort('blockedbyclient');}
      if(url.origin===origin)return route.continue();
      if(url.hostname==='script.google.com' && url.searchParams.get('action')==='catalog'){
        const cb=url.searchParams.get('callback');
        if(cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)){
          return route.fulfill({status:200,contentType:'application/javascript',body:
            cb+'('+JSON.stringify({success:true,projects:[
              {grade:'6',section:'Heidelberg',project:'Xeno Chat App',id:'VVP-DEMO-G6'},
              {grade:'9',section:'Keats',project:'Xeno Chat App',id:'VVP-DEMO-G9'},
              {grade:'9',section:'Keats',project:'Fire Detector',id:'VVP-DEMO-FIRE'}
            ]})+');'});
        }
      }
      unexpected++;return route.abort('blockedbyclient');
    });
    await page.goto(site,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>!document.getElementById('projectSearchVoiceBtn')?.disabled,
      null,{timeout:25000});
    assert.equal(await page.locator('#oneTimeVoteNotice').isVisible(),true,
      'One-time vote warning must remain visible on phone and desktop');
    assert.equal(await page.locator('#projectSearchVoiceBtn').getAttribute('aria-label'),
      'Speak a project name');
    await page.locator('#feedback').fill('Parent draft that must not change');
    await page.locator('#projectSearchVoiceBtn').click();
    assert.equal(await page.locator('#projectSearchVoiceBtnText').innerText(),'Stop');
    assert.equal(await page.locator('#startBtn').isDisabled(),true);
    assert.equal(await page.locator('#submitBtn').isDisabled(),true);
    const state=await page.evaluate(()=>({lang:window.__vvLastSpeech.lang,
      continuous:window.__vvLastSpeech.continuous}));
    assert.equal(state.lang,'en-IN');
    assert.equal(state.continuous,false);
    await page.evaluate(()=>window.__vvLastSpeech.onresult({
      results:[{0:{transcript:'Xeno Chat App'},isFinal:true}]
    }));
    assert.equal(await page.locator('#projectSearch').inputValue(),'Xeno Chat App');
    assert.equal(await page.locator('#projectSearchResults button').count(),2,
      'The parent must choose among same-name project grades/sections');
    assert.equal(await page.locator('#studentClass').inputValue(),'',
      'A speech guess cannot auto-select or vote for a project');
    assert.equal(await page.locator('#feedback').inputValue(),'Parent draft that must not change');
    await page.evaluate(()=>window.__vvLastSpeech.onend());
    assert.equal(await page.locator('#projectSearchVoiceBtnText').innerText(),'Speak');
    await page.locator('#projectSearchResults button').first().click();
    assert.equal(await page.locator('#project').inputValue(),'Xeno Chat App');
    assert.match(await page.locator('#projectSearchSelected').innerText(),/Selected: Xeno Chat App/);
    assert.ok(await page.locator('#section').inputValue());
    await page.locator('#projectSearchVoiceBtn').click();
    await page.evaluate(()=>window.__vvLastSpeech.onerror({error:'not-allowed'}));
    assert.match(await page.locator('#projectSearchVoiceStatus').innerText(),/permission or browser speech service was blocked/i);
    assert.equal(await page.locator('#projectSearch').isEnabled(),true,
      'Typing remains possible after microphone rejection');
    await page.locator('#projectSearch').fill('fire');
    assert.match(await page.locator('#projectSearchResults button').first().innerText(),/Fire Detector/);
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(dimensions.scroll<=dimensions.width+2,
      'No mobile horizontal overflow: '+JSON.stringify(dimensions));
    assert.equal(writes,0,'Voice project lookup must never submit feedback');
    assert.equal(unexpected,0,'Voice lookup must not contact any other external service from application JS');
    assert.deepEqual(errors,[],'No JavaScript runtime exceptions');
    console.log('PASS Voice Quick Find '+viewport.width+'px: short speech, duplicate choice, fallback, zero writes');
    await context.close();
  }
}finally{await browser.close();}
