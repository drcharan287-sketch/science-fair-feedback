// Browser-only smoke for smart-board / mobile Results. All Apps Script calls
// are intercepted with synthetic responses. NEVER sends a real vote/POST.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site='https://drcharan287-sketch.github.io/science-fair-feedback/';
const fixtures={
  DEMO:{success:true,mode:'DEMO',totalProjects:407},
  LIVE:{success:true,mode:'LIVE',totalProjects:407,acceptedVotes:15,ratedProjects:8,
    languages:[{code:'en-IN',count:10},{code:'te-IN',count:5}],
    gradeCounts:[{grade:'6',count:100}],highlights:[]},
  PUBLISHED:{success:true,mode:'PUBLISHED',totalProjects:407,acceptedVotes:15,ratedProjects:8,
    languages:[{code:'en-IN',count:10},{code:'te-IN',count:5}],
    gradeCounts:[{grade:'6',count:100}],
    rankings:[
      {id:'SYN-1',grade:'6',section:'Test Section',project:'Synthetic Solar City',votes:8,weighted:4.231,rank:1},
      {id:'SYN-2',grade:'9',section:'Test Section',project:'Synthetic Rain Harvest',votes:7,weighted:4.208,rank:1}
    ],
    highlights:[{project:'Synthetic Solar City',grade:'6',language:'en-IN',
      quote:'<img src=x onerror=alert(1)> Synthetic example',translation:''}]}
};
const sizes=[
  {name:'Senses-classroom 1920x1080 board',viewport:{width:1920,height:1080}},
  {name:'Android-sized parent phone',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
  {name:'Small parent phone',viewport:{width:360,height:760},isMobile:true,hasTouch:true}
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
  for(const size of sizes){
    const ctx=await browser.newContext({
      viewport:size.viewport,isMobile:Boolean(size.isMobile),hasTouch:Boolean(size.hasTouch)
    });
    let payload=fixtures.DEMO;
    let sentPost=0,realBackendReads=0;
    const page=await ctx.newPage();
    const pageErrors=[];
    page.on('pageerror',err=>pageErrors.push(err.message));
    await page.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      if(req.method()!=='GET'){sentPost++;return route.abort('blockedbyclient');}
      if(u.origin===new URL(site).origin)return route.continue();
      if(u.host==='script.google.com'&&u.searchParams.get('action')==='publicResults'){
        const callback=u.searchParams.get('callback')||'notDefined';
        assert.match(callback,/^voiceVotePublicResults_\d+$/);
        return route.fulfill({status:200,contentType:'application/javascript',
          body:callback+'('+JSON.stringify(payload)+');'});
      }
      realBackendReads++;
      return route.abort('blockedbyclient');
    });
    const load=async requested=>{
      payload=fixtures[requested];
      const reply=await page.goto(site+'results.html?mode=PUBLISHED&test='+Date.now(),{
        waitUntil:'domcontentloaded',timeout:30000
      });
      assert.ok(reply?.ok(),size.name+': Results route failed');
      await page.waitForFunction(mode=>document.body.dataset.resultsMode===mode,requested,{timeout:12000});
      await page.waitForTimeout(80);
      const width=await page.evaluate(()=>({
        viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth
      }));
      assert.ok(width.scrollWidth<=width.viewport+2,
        size.name+': horizontal overflow '+JSON.stringify(width));
    };
    await load('DEMO');
    assert.match(await page.locator('#modeTitle').innerText(),/DEMO/);
    assert.match(await page.locator('#modeDetails').innerText(),/fictional/i);
    assert.ok((await page.locator('#leaderboardCards .rank-card').count())>0);
    assert.match(await page.locator('#feedbackIntro').innerText(),/automatically/i);
    assert.equal(await page.locator('#feedbackCards .quote-card').count(),3);
    await page.locator('#brightToggle').click();
    assert.equal(await page.evaluate(()=>document.body.classList.contains('bright')),true);
    await page.locator('#autoplayToggle').click();
    assert.equal(await page.locator('#autoplayToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#resetView').click();
    assert.equal(await page.locator('#autoplayToggle').getAttribute('aria-pressed'),'false');

    await load('LIVE');
    assert.match(await page.locator('#modeTitle').innerText(),/LIVE/);
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),0,
      'LIVE cannot reveal grade standings');
    assert.equal(await page.locator('#totalVotes').innerText(),'15');
    assert.equal(await page.locator('#feedbackCards .quote-card').count(),3);
    assert.match(await page.locator('#feedbackCards').innerText(),/multilingual|translated/i);

    await load('PUBLISHED');
    assert.match(await page.locator('#modeTitle').innerText(),/PUBLISHED/);
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),2);
    assert.equal(await page.locator('#feedbackCards .quote-card').count(),3);
    assert.equal(await page.locator('#feedbackCards img').count(),0,
      'Public display never renders submitted free-text feedback as HTML');
    assert.equal((await page.locator('#feedbackCards').innerText()).includes('<img src=x'),false,
      'Even an injected backend highlight must never be rendered publicly');
    await page.locator('#gradeFilter').selectOption('9');
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),1);
    assert.match(await page.locator('#leaderboardCards').innerText(),/Synthetic Rain Harvest/);
    assert.equal(await page.locator('a[href*="practice.html"]').count(),0,
      'No public invitation to practice on Results');
    assert.deepEqual(pageErrors,[],size.name+': script exception');
    assert.equal(sentPost,0,'No voting requests allowed from Results');
    assert.equal(realBackendReads,0,'No real external backend/API requests allowed');
    console.log('PASS '+size.name+': DEMO/LIVE/PUBLISHED gating, visual overflow, controls; no votes');
    await ctx.close();
  }
  console.log('PASS Results read-only smart-board and mobile browser scenarios');
}finally{await browser.close();}
