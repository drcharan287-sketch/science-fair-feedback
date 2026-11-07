import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
// All server requests are intercepted: this test never casts a real vote.
const url=process.env.VOICEVOTE_SITE_BASE||'http://127.0.0.1:8787/';
const origin=new URL(url).origin;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try {
  for (const viewport of [{width:390,height:844},{width:1280,height:820}]) {
    const context=await browser.newContext({viewport});
    await context.addInitScript(()=>{
      class FakeSpeech {
        start(){window.__testSpeech=this;}
        stop(){this.stopped=true;this.onend?.();}
      }
      Object.defineProperty(window,'SpeechRecognition',{value:FakeSpeech,configurable:true});
    });
    const page=await context.newPage(), errors=[];
    let writes=0,unexpected=0;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const req=route.request(),dest=new URL(req.url());
      if(req.method()!=='GET'){writes++;return route.abort('blockedbyclient');}
      if(dest.origin===origin)return route.continue();
      const cb=dest.searchParams.get('callback');
      if(dest.hostname==='script.google.com' &&
         dest.searchParams.get('action')==='catalog' && cb &&
         /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)){
        return route.fulfill({status:200,contentType:'application/javascript',
          body:cb+'('+JSON.stringify({success:true,projects:[
            {grade:'9',section:'Keats',project:'VoiceVote App',id:'VVP-STAGED-ONLY'}
          ]})+');'});
      }
      unexpected++;return route.abort('blockedbyclient');
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>!document.getElementById('studentClass')?.disabled,
      null,{timeout:25000});
    const feedback=page.locator('#feedback');
    assert.equal(await feedback.getAttribute('maxlength'),'4000');
    assert.match(await page.locator('#feedbackLimitHint').innerText(),/Scroll inside the box/);
    const text=('Science fair visitors enjoyed this demonstration.\n').repeat(65);
    await feedback.fill(text);
    const metrics=await feedback.evaluate(el=>{
      el.scrollTop=el.scrollHeight;
      return {overflow:getComputedStyle(el).overflowY,scroll:el.scrollHeight,
        client:el.clientHeight,top:el.scrollTop};
    });
    assert.equal(metrics.overflow,'auto');
    assert.ok(metrics.scroll>metrics.client&&metrics.top>0,
      viewport.width+'px feedback box must scroll independently: '+JSON.stringify(metrics));
    await feedback.fill('a'.repeat(3750));
    assert.match(await page.locator('#feedbackLimitNotice').innerText(),/250 characters remaining/);
    await feedback.fill('a'.repeat(4000));
    assert.equal(await page.locator('#feedbackLength').innerText(),'4,000 / 4,000');
    assert.match(await page.locator('#feedbackLimitNotice').innerText(),/Maximum length reached/);
    await feedback.fill('');
    await page.locator('#startBtn').click();
    await page.evaluate(()=>window.__testSpeech.onresult({
      results:[{0:{transcript:'S'.repeat(4500)},isFinal:true}]
    }));
    assert.equal((await feedback.inputValue()).length,4000);
    assert.equal(await page.evaluate(()=>window.__testSpeech.stopped),true);
    assert.match(await page.locator('#status').innerText(),/voice feedback limit was reached/i);
    assert.equal(await feedback.isEnabled(),true);
    const layout=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(layout.scroll<=layout.w+2,'Unexpected horizontal page scroll');
    assert.equal(writes,0);assert.equal(unexpected,0);assert.deepEqual(errors,[]);
    console.log('PASS long feedback '+viewport.width+'px: 4k speech cap, scroll, counter, no POST');
    await context.close();
  }
}finally{await browser.close();}
