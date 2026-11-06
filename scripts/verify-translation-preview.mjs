// No-write browser verification for translated speech in the SAME parent/owner UI.
// All Google requests are simulated; real Feedback is never submitted.
// Live Google POST preview connectivity is checked separately after deployment.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const site=process.env.VOICEVOTE_SITE_BASE ||
  'https://drcharan287-sketch.github.io/science-fair-feedback/';
const siteOrigin=new URL(site).origin;
const presenterTicket='a'.repeat(64);
const screens=[
  {label:'Senses smart-board 1920x1080',viewport:{width:1920,height:1080}},
  {label:'Parent Android 390x844',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
];
const translations={
  'te-IN':'This science fair is very good.',
  'hi-IN':'The science project is excellent.',
  'ta-IN':'This is a good science experiment.',
  'kn-IN':'This project is very creative.'
};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 for(const screen of screens){
  const ctx=await browser.newContext(screen);
  await ctx.addInitScript(()=>{
    class SpeechMock {
      start(){window.__recognizer=this;}
      stop(){this.stopped=true;}
    }
    Object.defineProperty(window,'SpeechRecognition',{value:SpeechMock,configurable:true});
    Object.defineProperty(window,'webkitSpeechRecognition',{value:SpeechMock,configurable:true});
  });
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let savedPOSTs=0,previewPOSTs=0,unexpected=0;
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='GET' && url.origin===siteOrigin) return route.continue();
    if(url.hostname==='script.google.com'){
      const cb=url.searchParams.get('callback');
      const action=url.searchParams.get('action');
      if(req.method()==='GET' && action==='catalog' && cb) {
        return route.fulfill({status:200,contentType:'application/javascript',body:
          cb+'('+JSON.stringify({success:true,projects:[
            {grade:'9',section:'Keats',project:'VoiceVote App'}
          ]})+');'});
      }
      if(req.method()==='GET' && action==='presenterVerify' && cb){
        return route.fulfill({status:200,contentType:'application/javascript',
          body:cb+'('+JSON.stringify({success:true})+');'});
      }
      if(req.method()==='POST'){
        const fields=new URLSearchParams(req.postData()||'');
        if(fields.get('action')==='translatePreview'){
          previewPOSTs++;
          assert.ok(['te-IN','hi-IN','ta-IN','kn-IN'].includes(fields.get('language')));
          assert.ok(fields.get('feedback'));
          assert.match(fields.get('requestId'),/^[a-f0-9-]{36}$/i);
          assert.equal(fields.has('deviceToken'),false);
          assert.equal(fields.has('submissionId'),false);
          const payload={
            type:'voicevote-translation-preview',
            requestId:fields.get('requestId'),success:true,
            translation:translations[fields.get('language')]
          };
          const body='<!doctype html><html><body><script>'+
            'window.top.postMessage('+JSON.stringify(payload)+','+
            JSON.stringify(siteOrigin)+');<\/script></body></html>';
          return route.fulfill({status:200,contentType:'text/html',body});
        }
        savedPOSTs++;
      }
    }
    unexpected++;return route.abort('blockedbyclient');
  });

  const open=async demo=>{
    const uri=demo?site+'#presenter='+presenterTicket:site;
    const response=await page.goto(uri,{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response?.ok());
    await page.waitForFunction(()=>document.querySelector('#studentClass')?.disabled===false,
      null,{timeout:20000});
    await page.locator('#studentClass').selectOption('9');
    await page.locator('#section').selectOption('Keats');
    await page.locator('#project').selectOption('VoiceVote App');
    assert.equal(await page.locator('#englishTranslationPanel').isVisible(),false);
  };

  await open(false);
  const phrase='సైన్స్ ఫెయిర్ చాలా బాగుంది';
  assert.equal(await page.locator('#language option').count(),23,
    'Voting must offer the 22 scheduled languages plus English');
  await page.locator('#language').selectOption('te-IN');
  await page.locator('#startBtn').click();
  await page.evaluate(p=>{
    const r=window.__recognizer;
    r.onresult({resultIndex:0,results:[{0:{transcript:'సైన్స్'},isFinal:true}]});
    r.onresult({resultIndex:0,results:[
      {0:{transcript:'సైన్స్'},isFinal:true},
      {0:{transcript:'సైన్స్ ఫెయిర్'},isFinal:false}
    ]});
    const segments=[
      {0:{transcript:'సైన్స్'},isFinal:true},
      {0:{transcript:'సైన్స్ ఫెయిర్'},isFinal:true},
      {0:{transcript:p},isFinal:true}
    ];
    r.onresult({resultIndex:0,results:segments});
    r.onresult({resultIndex:0,results:segments});
    r.onend();
  },phrase);
  assert.equal(await page.locator('#feedback').inputValue(),phrase,
    'Repeated final recognition callbacks may not repeat first words');
  await page.waitForFunction(expected=>
    document.querySelector('#englishTranslationText')?.textContent===expected,
    translations['te-IN'],{timeout:15000});
  assert.equal(await page.locator('#englishTranslationPanel').isVisible(),true);
  assert.equal(await page.locator('#feedback').inputValue(),phrase,
    'Translation preview may not edit original text');
  await page.locator('#feedback').fill('మరొక మంచి ప్రాజెక్ట్');
  await page.waitForFunction(expected=>
    document.querySelector('#englishTranslationText')?.textContent===expected,
    translations['te-IN'],{timeout:15000});

  await page.locator('#language').selectOption('hi-IN');
  assert.equal(await page.locator('#feedback').inputValue(),'',
    'Changing from Telugu to Hindi must remove the old transcript');
  assert.equal(await page.locator('#englishTranslationText').textContent(),'',
    'No previous-language English preview can remain');
  await page.locator('#feedback').fill('यह प्रोजेक्ट बहुत अच्छा है');
  await page.waitForFunction(expected=>
    document.querySelector('#englishTranslationText')?.textContent===expected,
    translations['hi-IN'],{timeout:15000});
  assert.equal(await page.locator('#englishTranslationPanel').isVisible(),true);
  for(const language of ['ta-IN','kn-IN']){
    await page.locator('#language').selectOption(language);
    assert.equal(await page.locator('#feedback').inputValue(),'',
      'Switching to '+language+' must clear previous-language feedback');
    await page.locator('#feedback').fill(language==='ta-IN'?'அருமையான அறிவியல் திட்டம்':'ಅದ್ಭುತ ವಿಜ್ಞಾನ ಯೋಜನೆ');
    await page.waitForFunction(expected=>
      document.querySelector('#englishTranslationText')?.textContent===expected,
      translations[language],{timeout:15000});
  }
  await page.locator('#language').selectOption('en-IN');
  assert.equal(await page.locator('#feedback').inputValue(),'',
    'Returning to English must clear non-English feedback');
  assert.equal(await page.locator('#englishTranslationPanel').isVisible(),false);
  assert.equal(await page.locator('#englishTranslationText').textContent(),'');
  assert.equal(savedPOSTs,0,'Parent preview never sends a save POST');

  // A fragment-only navigation would reuse the existing page rather than
  // re-run the owner-ticket bootstrap; add a harmless test query to reload.
  await page.goto(site+'?presenterSmoke=1#presenter='+presenterTicket,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#presenterBanner')?.textContent.includes('OWNER DEMONSTRATION'));
  await page.locator('#language').selectOption('te-IN');
  await page.locator('#feedback').fill('ఇది చాలా మంచి ఆలోచన');
  await page.waitForFunction(expected=>
    document.querySelector('#englishTranslationText')?.textContent===expected,
    translations['te-IN'],{timeout:15000});
  await page.locator('#language').selectOption('hi-IN');
  assert.equal(await page.locator('#feedback').inputValue(),'',
    'Owner demo must clear the old Telugu transcript on language switch');
  assert.equal(await page.locator('#englishTranslationText').textContent(),'',
    'Owner demo must also clear its previous English preview');
  assert.equal(savedPOSTs,0,'Demo translation preview never saves a vote');
  assert.ok(previewPOSTs>=6,'Translation previews should be real isolated POST actions');
  assert.equal(unexpected,0,'No unexpected external requests');
  assert.deepEqual(errors,[],screen.label+' JS errors');
  console.log('PASS '+screen.label+': repeated speech fix, English previews in parent and owner UI, 4 languages, zero save POST');
  await ctx.close();
 }
}finally{await browser.close();}
