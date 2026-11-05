// Real-browser Practice Voting test. No feedback POST leaves the test.
// All non-GitHub network traffic is blocked. Browser storage is an isolated
// test context — never production feedback or a real parent's device.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const site='https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin=new URL(site).origin;
const profiles=[
  {label:'Smart-board 1920x1080',width:1920,height:1080,isMobile:false,hasTouch:false},
  {label:'Android parent 390x844',width:390,height:844,isMobile:true,hasTouch:true},
  {label:'Small phone 360x760',width:360,height:760,isMobile:true,hasTouch:true}
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try {
  for (const profile of profiles) {
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.isMobile,hasTouch:profile.hasTouch
    });
    await context.addInitScript(()=>{
      // Synthetic speech recognition only; actual microphone permission and
      // iOS Safari compatibility still need physical device validation.
      class MockSpeechRecognition {
        start(){window.__voiceVotePracticeRecognizer=this;}
        stop(){this.stopped=true;}
      }
      Object.defineProperty(window,'SpeechRecognition',{
        value:MockSpeechRecognition,configurable:true
      });
    });
    const page=await context.newPage();
    let outbound=0,posts=0;
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      if(req.method()!=='GET')posts++;
      if(req.method()==='GET'&&u.origin===origin)return route.continue();
      outbound++;return route.abort('blockedbyclient');
    });

    // Mimic a device that completed a real vote in the past.
    await page.goto(site,{waitUntil:'domcontentloaded',timeout:30000});
    await page.evaluate(()=>{
      localStorage.setItem('voicevote_voted_v1','1');
      localStorage.setItem('voicevote_device_token_v1','123e4567-e89b-42d3-a456-426614174000');
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#practiceCallout')?.hidden===false);
    assert.equal(await page.locator('#submitBtn').isDisabled(),true,
      'A past real vote must remain locked');
    assert.ok((await page.locator('#practiceCallout a').getAttribute('href')).endsWith('practice.html'));

    const receipt=await page.goto(site+'practice.html?repeat=true',{
      waitUntil:'domcontentloaded',timeout:30000
    });
    assert.ok(receipt?.ok(),'Practice page missing at '+profile.label);
    await page.waitForFunction(()=>{
      const select=document.getElementById('studentClass');
      return select && !select.disabled &&
        Array.from(select.options).some(o=>o.value==='9');
    },null,{timeout:15000});
    assert.match(await page.locator('.practice-safety').innerText(),/NO REAL VOTE/);
    assert.equal(await page.locator('#submitBtn').isDisabled(),true);
    const width=await page.evaluate(()=>({
      viewport:innerWidth,scroll:document.documentElement.scrollWidth
    }));
    assert.ok(width.scroll<=width.viewport+2,
      profile.label+' has horizontal overflow: '+JSON.stringify(width));

    await page.locator('#studentClass').selectOption('9');
    await page.locator('#section').selectOption('Keats');
    await page.locator('#project').selectOption('VoiceVote');

    const languages=[
      ['en-IN','A thoughtful student science exhibit'],
      ['te-IN','ఈ ప్రాజెక్టు చాలా బాగుంది'],
      ['hi-IN','यह विज्ञान परियोजना अच्छी है']
    ];
    for(const [language,phrase] of languages){
      await page.locator('#feedback').fill('');
      await page.locator('#language').selectOption(language);
      await page.locator('#startBtn').click();
      assert.equal(await page.evaluate(()=>window.__voiceVotePracticeRecognizer?.lang),language);
      assert.equal(await page.locator('#submitBtn').isDisabled(),true,
        'Cannot show simulated receipt while microphone active');
      await page.evaluate(text=>{
        const r=window.__voiceVotePracticeRecognizer;
        r.onresult({resultIndex:0,results:[{0:{transcript:text},isFinal:false}]});
      },phrase);
      await page.locator('#stopBtn').click();
      await page.evaluate(text=>{
        const r=window.__voiceVotePracticeRecognizer;
        r.onresult({resultIndex:0,results:[{0:{transcript:text},isFinal:true}]});
        r.onend();
      },phrase);
      assert.equal(await page.locator('#feedback').inputValue(),phrase);
      await page.locator('#feedback').fill(phrase+' — edited');
    }
    await page.locator('.star[data-value="5"]').click();
    assert.equal(await page.locator('#submitBtn').isEnabled(),true);
    await page.locator('#submitBtn').click();
    assert.equal(await page.locator('#practiceReceipt').isVisible(),true);
    assert.match(await page.locator('.receipt-warning').innerText(),/NOT SAVED/);
    assert.equal(await page.locator('#receiptProject').innerText(),'VoiceVote');
    assert.equal(await page.locator('#receiptStars').innerText(),'★★★★★');
    assert.match(await page.locator('#receiptFeedback').innerText(),/edited/);

    // Multiple practice sessions do not clear the real browser voting lock.
    await page.locator('#restartPracticeBtn').click();
    assert.equal(await page.locator('#practiceReceipt').isVisible(),false);
    assert.equal(await page.locator('#studentClass').inputValue(),'');
    assert.equal(await page.locator('#feedback').inputValue(),'');
    await page.locator('#projectSearch').fill('VoiceVote');
    await page.locator('#projectSearchResults button').filter({hasText:'Class 9 / Keats'}).first().click();
    assert.equal(await page.locator('#studentClass').inputValue(),'9');
    assert.equal(await page.locator('#project').inputValue(),'VoiceVote');
    await page.locator('#feedback').fill('Second practice session only');
    await page.locator('.star[data-value="4"]').click();
    await page.locator('#submitBtn').click();
    assert.equal(await page.locator('#practiceReceipt').isVisible(),true);
    assert.equal(await page.locator('#receiptStars').innerText(),'★★★★☆');

    const storage=await page.evaluate(()=>({
      voted:localStorage.getItem('voicevote_voted_v1'),
      token:localStorage.getItem('voicevote_device_token_v1'),
      pending:localStorage.getItem('voicevote_pending_v1')
    }));
    assert.equal(storage.voted,'1','Practice must not unlock past real vote');
    assert.equal(storage.token,'123e4567-e89b-42d3-a456-426614174000');
    assert.equal(storage.pending,null);
    assert.equal(posts,0,'Practice must not issue any vote/other POSTs');
    assert.equal(outbound,0,'Practice should not contact external services in mocked recognition');
    assert.deepEqual(errors,[],profile.label+' page exceptions');
    console.log('PASS '+profile.label+': two practice sessions, 3 languages, no feedback writes, real vote lock retained');
    await context.close();
  }
  console.log('PASS safe Practice Voting across board and phone viewports without backend submission');
}finally{
  await browser.close();
}
