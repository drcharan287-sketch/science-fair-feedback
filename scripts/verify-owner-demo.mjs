// End-to-end no-writing browser exercise of BOTH real parent vote lock and
// owner-demonstration-on-the-SAME-UI. Owner ticket approval is intercepted
// (mocked); actual issuance/expiry is tested separately in Apps Script unit tests.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const site=process.env.VOICEVOTE_SITE_BASE ||
  'https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin=new URL(site).origin;
const ticket='a'.repeat(64);
const screens=[
 {label:'Board 1920x1080',viewport:{width:1920,height:1080}},
 {label:'Mobile 390x844',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 for(const screen of screens){
  const context=await browser.newContext(screen);
  await context.addInitScript(()=>{
    class Recognition {
      start(){window.__presenterRecognizer=this;}
      stop(){this.stopped=true;}
    }
    Object.defineProperty(window,'SpeechRecognition',{value:Recognition,configurable:true});
  });
  const page=await context.newPage();
  const errors=[];
  let externalWrites=0,otherExternalCalls=0,approved=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()!=='GET'){externalWrites++;return route.abort('blockedbyclient');}
    if(url.origin===origin)return route.continue();
    if(url.host==='script.google.com'){
      const callback=url.searchParams.get('callback');
      if(url.searchParams.get('action')==='presenterVerify'){
        assert.equal(url.searchParams.get('ticket'),ticket);
        assert.equal(callback,'voiceVotePresenterVerify');
        return route.fulfill({status:200,contentType:'application/javascript',
          body:callback+'('+JSON.stringify({success:approved})+');'});
      }
      if(url.searchParams.get('action')==='catalog'&&callback){
        return route.fulfill({status:200,contentType:'application/javascript',
          body:callback+'('+JSON.stringify({success:true,projects:[
            {grade:'9',section:'Keats',project:'VoiceVote App',id:'VVP-IX_KEATS-G7-S1'}
          ]})+');'});
      }
    }
    otherExternalCalls++;return route.abort('blockedbyclient');
  });
  await page.goto(site,{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(()=>{
    localStorage.setItem('voicevote_voted_v1','1');
    localStorage.setItem('voicevote_pending_v1','1');
    localStorage.setItem('voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000');
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('voteGuardStatus').hidden);
  assert.equal(await page.locator('#submitBtn').isDisabled(),true);
  assert.equal(await page.locator('a[href*="practice.html"]').count(),0,
    'Parents must never see Practice mode links');

  await page.goto(site+'?vote=retry#presenter='+ticket,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('presenterBanner')?.textContent.includes('Expired'));
  assert.equal(await page.locator('#submitBtn').isDisabled(),true,
    'Denied owner session stays locked, not a real-vote bypass');
  assert.equal(await page.locator('#presenterReceipt').isVisible(),false);

  approved=true;
  await page.goto(site+'?vote=success#presenter='+ticket,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('presenterBanner')?.textContent.includes('OWNER DEMONSTRATION'));
  await page.waitForFunction(()=>!document.getElementById('studentClass').disabled);
  assert.equal(await page.locator('#voteGuardStatus').isVisible(),false);
  assert.equal(await page.locator('#presenterReceipt').isVisible(),false);
  const voteType=await page.evaluate(()=>({
    heading:parseFloat(getComputedStyle(document.querySelector('.carnival-heading')).fontSize),
    editorial:parseFloat(getComputedStyle(document.querySelector('.header .logo')).fontSize),
    subtitle:parseFloat(getComputedStyle(document.querySelector('.header h2')).fontSize)
  }));
  assert.ok(voteType.heading>voteType.editorial&&voteType.editorial>voteType.subtitle,
    screen.label+' voting heading must exceed editorial line and subtitle: '+JSON.stringify(voteType));
  const view=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(view.scroll<=view.width+2,screen.label+' overflow '+JSON.stringify(view));
  await page.locator('#studentClass').selectOption('9');
  await page.locator('#section').selectOption('Keats');
  await page.locator('#project').selectOption('VoiceVote App');
  for(const [lang,phrase] of [['en-IN','Great science idea'],['te-IN','చాలా మంచి ప్రాజెక్టు'],['hi-IN','बढ़िया विज्ञान परियोजना']]){
    await page.locator('#feedback').fill('');
    await page.locator('#language').selectOption(lang);
    await page.locator('#startBtn').click();
    assert.equal(await page.evaluate(()=>window.__presenterRecognizer?.lang),lang);
    await page.evaluate(text=>{
      const r=window.__presenterRecognizer;
      r.onresult({resultIndex:0,results:[{0:{transcript:text},isFinal:true}]});
      r.onend();
    },phrase);
    assert.equal(await page.locator('#feedback').inputValue(),phrase);
  }
  await page.locator('#feedback').fill('Owner demonstration only');
  await page.locator('.star[data-value="5"]').click();
  await page.locator('#submitBtn').click();
  assert.equal(await page.locator('#presenterReceipt').isVisible(),true);
  assert.match(await page.locator('#presenterReceipt').innerText(),/NOTHING SAVED|not saved|not counted/i);
  assert.equal(await page.locator('#presenterReceiptStars').innerText(),'★★★★★');
  await page.locator('#presenterTryAgain').click();
  assert.equal(await page.locator('#presenterReceipt').isVisible(),false);
  await page.locator('#feedback').fill('Second owner demonstration');
  await page.locator('.star[data-value="3"]').click();
  await page.locator('#submitBtn').click();
  assert.equal(await page.locator('#presenterReceiptStars').innerText(),'★★★☆☆');
  const storage=await page.evaluate(()=>({
    voted:localStorage.getItem('voicevote_voted_v1'),
    pending:localStorage.getItem('voicevote_pending_v1'),
    device:localStorage.getItem('voicevote_device_token_v1')
  }));
  assert.deepEqual(storage,{
    voted:'1',pending:'1',device:'123e4567-e89b-42d3-a456-426614174000'
  });
  assert.equal(externalWrites,0,'No owner-demo or parent vote POSTs in tests');
  assert.equal(otherExternalCalls,0,'No unexpected network requests');
  assert.deepEqual(errors,[],screen.label+' JavaScript errors');
  console.log('PASS '+screen.label+' parent locked, owner ticket gated, 2 local demos, 3 languages, no writes');
  await context.close();
 }
}finally{await browser.close();}
