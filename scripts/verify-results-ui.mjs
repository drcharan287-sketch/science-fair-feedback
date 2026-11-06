// Non-writing browser verification: faculty Results is private, with actual
// aggregates only after an owner-issued presenter ticket. Static GitHub Pages
// HTML remains public but its CONTENT and DATA stay locked without authorization.
// All Apps Script calls are intercepted; no votes or real records are touched.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const site=process.env.VOICEVOTE_SITE_BASE ||
  'https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin=new URL(site).origin;
const ticket='a'.repeat(64);
const privatePayload={
  success:true,mode:'PRESENTER_LIVE',totalProjects:407,
  acceptedVotes:15,ratedProjects:8,
  languages:[{code:'en-IN',count:10},{code:'te-IN',count:5}],
  rankings:[
    {id:'SYN-1',grade:'6',section:'Test Section',project:'Synthetic Solar City',
      votes:8,weighted:4.231,rank:1},
    {id:'SYN-2',grade:'9',section:'Test Section',project:'Synthetic Rain Harvest',
      votes:7,weighted:4.208,rank:1}
  ]
};
const sizes=[
  {name:'Senses 1920x1080 board',viewport:{width:1920,height:1080}},
  {name:'Android phone 390x844',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
  {name:'Small phone 360x760',viewport:{width:360,height:760},isMobile:true,hasTouch:true}
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
  for(const size of sizes){
    const ctx=await browser.newContext({
      viewport:size.viewport,isMobile:!!size.isMobile,hasTouch:!!size.hasTouch
    });
    const page=await ctx.newPage();
    let approved=false,postCount=0,unexpected=0,privateCalls=0,reviewCalls=0;
    const privateReviews=Array.from({length:9},(_,i)=>({
      rating:5,language:i===0?'hi-IN':'en-IN',
      original:i===0?'यह मॉडल बहुत अच्छा है <img src=x onerror=alert(1)>':'Helpful feedback '+i,
      translation:i===0?'This model is very good.':'Helpful feedback '+i
    }));
    let liveVoteCount=15,serverUpdatedAt='2026-11-06T07:39:00.000Z';
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      if(req.method()!=='GET'){postCount++;return route.abort('blockedbyclient');}
      if(u.origin===origin)return route.continue();
      if(u.hostname==='script.google.com' && u.searchParams.get('action')==='presenterResults'){
        privateCalls++;
        assert.equal(u.searchParams.get('ticket'),ticket);
        const cb=u.searchParams.get('callback');
        assert.match(cb,/^voiceVotePresenterResults_\d+$/);
        return route.fulfill({status:200,contentType:'application/javascript',
          body:cb+'('+JSON.stringify(approved?Object.assign({},privatePayload,{
            acceptedVotes:liveVoteCount,updatedAt:serverUpdatedAt
          }):{success:false,mode:'DENIED',message:'Expired presenter session'})+');'});
      }
      if(u.hostname==='script.google.com' && u.searchParams.get('action')==='presenterReviews'){
        reviewCalls++;
        assert.equal(u.searchParams.get('ticket'),ticket);
        assert.equal(u.searchParams.get('projectId'),'SYN-1');
        const offset=Number(u.searchParams.get('offset'));
        const cb=u.searchParams.get('callback');
        assert.match(cb,/^voiceVotePresenterReviews_\d+$/);
        const reply=approved?
          {success:true,mode:'PRESENTER_REVIEWS',projectId:'SYN-1',total:9,
            reviews:privateReviews.slice(offset,offset+8),hasMore:offset+8<9}:
          {success:false,mode:'DENIED',message:'Presenter access expired'};
        return route.fulfill({status:200,contentType:'application/javascript',
          body:cb+'('+JSON.stringify(reply)+');'});
      }
      unexpected++;return route.abort('blockedbyclient');
    });
    const visit=async suffix=>{
      const reply=await page.goto(site+'results.html?smoke='+Date.now()+suffix,
        {waitUntil:'domcontentloaded',timeout:30000});
      assert.ok(reply?.ok(),size.name+' route missing');
    };
    // Anonymous QR visitor or direct URL does not expose even fictional
    // faculty screen, and never asks the backend for private aggregates.
    await visit('#leaderboard');
    assert.equal(await page.locator('#pageShell').isVisible(),false);
    assert.equal(await page.locator('.board-qr-card').isVisible(),false,
      'Visitor QR display belongs only in authenticated faculty shell');
    assert.equal(await page.locator('#presenterBar').isVisible(),false);
    assert.equal(await page.locator('#presenterAccessGate').isVisible(),true);
    assert.match(await page.locator('#presenterAccessMessage').innerText(),/reserved for faculty/i);
    assert.equal(privateCalls,0,'Anonymous visitors never initiate a private results request');
    // Guessed ticket is rejected by backend and cannot unlock the display.
    await visit('#presenter='+ticket+'&view=live');
    await page.waitForFunction(()=>
      document.querySelector('#presenterAccessMessage')?.textContent.includes('expired'),null,{timeout:12000});
    assert.equal(await page.locator('#pageShell').isVisible(),false);
    approved=true;
    await visit('#presenter='+ticket+'&view=demo');
    await page.waitForFunction(()=>
      document.body.dataset.resultsMode==='DEMO' &&
      !document.querySelector('#pageShell').hidden,null,{timeout:12000});
    assert.match(await page.locator('#modeTitle').innerText(),/DEMO/);
    assert.match(await page.locator('#modeDetails').innerText(),/fictional/i);
    assert.match(await page.locator('#heroTitle').innerText(),/Curiosity Carnival/);
    const boardQR=page.locator('.board-qr-image');
    assert.equal(await boardQR.isVisible(),true,'Presenter board QR is visible after authorization');
    assert.equal(await boardQR.evaluate(img=>img.complete && img.naturalWidth>0),true,
      'The school QR asset must load on the published screen');
    assert.match(await page.locator('.board-qr-expand').getAttribute('href'),
      /assets\/curiosity-carnival-voting-qr\.png$/,
      'QR enlarge link must point to the same public scan image');
    assert.ok(await page.locator('#leaderboardCards .rank-card').count()>0);
    const beforeDemoReviews=reviewCalls;
    // The existing fixed presenter toolbar can cover the bottom of a small
    // viewport. Position the project action in the safe center first.
    await page.locator('.feedback-open-btn').first().evaluate(el=>
      el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
    var hit=await page.locator('.feedback-open-btn').first().evaluate(el=>{
      const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
      const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {viewport:[innerWidth,innerHeight],scrollY,button:[r.left,r.top,r.width,r.height],
        parent:[p.left,p.top,p.width,p.height],atCenter:top?.outerHTML?.slice(0,155),
        pointer:getComputedStyle(el).pointerEvents};
    });
    console.log('Feedback click diagnostics',size.name,JSON.stringify(hit));
    await page.locator('.feedback-open-btn').first().click();
    assert.equal(await page.locator('#projectFeedbackOverlay').isVisible(),true);
    assert.match(await page.locator('#projectFeedbackEyebrow').innerText(),/FICTIONAL/);
    assert.match(await page.locator('#projectFeedbackList').innerText(),/Original feedback/i);
    assert.equal(reviewCalls,beforeDemoReviews,'Demo comments are local fiction only');
    await page.locator('#projectFeedbackClose').click();
    assert.equal(await page.locator('#projectFeedbackOverlay').isVisible(),false);
    assert.equal(await page.locator('#totalVotes').innerText(),'—',
      'Demo must not show genuine live vote totals');
    assert.equal(await page.locator('#feedbackCards .quote-card').count(),3);
    assert.ok((await page.locator('#presenterVotingLink').getAttribute('href')).includes('#presenter='),
      'Faculty demo must point to the verified no-save Voting UI');
    await page.locator('#presenterShowLive').click();
    assert.match(await page.locator('#modeTitle').innerText(),/Curiosity Carnival/i);
    assert.match(await page.locator('#modeDetails').innerText(),/Trending Projects/i);
    for(const selector of ['.topbar','.hero','.board-qr-card','#feedbackJourney','.story-strip','.page-footer']){
      assert.equal(await page.locator(selector).isVisible(),false,
        'Private Live must hide its introductory/teaching section: '+selector);
    }
    assert.equal(await page.locator('.status-banner').isVisible(),true);
    assert.equal(await page.locator('#totalVotes').innerText(),'15');
    assert.match(await page.locator('#lastUpdated').innerText(),/^Updated /);
    assert.equal(await page.locator('#lastUpdated').isVisible(),true,
      'Updated time must stay visible in private Live on every viewport');
    assert.match(await page.evaluate(()=>location.hash),/view=live/,
      'Live view selection should survive browser refresh on the same private ticket');
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),2);
    assert.equal(reviewCalls,0,'Live aggregate refresh must never include individual comments');
    // The existing fixed presenter toolbar can cover the bottom of a small
    // viewport. Position the project action in the safe center first.
    await page.locator('.feedback-open-btn').first().evaluate(el=>
      el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
    var hit=await page.locator('.feedback-open-btn').first().evaluate(el=>{
      const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
      const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {viewport:[innerWidth,innerHeight],scrollY,button:[r.left,r.top,r.width,r.height],
        parent:[p.left,p.top,p.width,p.height],atCenter:top?.outerHTML?.slice(0,155),
        pointer:getComputedStyle(el).pointerEvents};
    });
    console.log('Feedback click diagnostics',size.name,JSON.stringify(hit));
    await page.locator('.feedback-open-btn').first().click();
    await page.waitForFunction(()=>document.querySelectorAll('.project-feedback-card').length===8,
      null,{timeout:12000});
    assert.equal(reviewCalls,1,'Only one explicit project review request');
    assert.equal(await page.locator('#projectFeedbackList img').count(),0,
      'Review text must never become executable markup');
    assert.match(await page.locator('#projectFeedbackList').innerText(),/This model is very good/);
    await page.locator('#projectFeedbackMore').click();
    await page.waitForFunction(()=>document.querySelectorAll('.project-feedback-card').length===9,
      null,{timeout:12000});
    assert.equal(reviewCalls,2,'Pagination fetches only the selected project');
    await page.locator('#projectFeedbackDone').click();
    assert.equal(await page.locator('#projectFeedbackOverlay').isVisible(),false);
    await page.locator('#gradeFilter').selectOption('9');
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),1);
    assert.match(await page.locator('#leaderboardCards').innerText(),/Synthetic Rain Harvest/);
    await page.locator('#liveBrightnessButton').click();
    assert.equal(await page.evaluate(()=>document.body.classList.contains('bright')),true);
    assert.equal(await page.locator('#liveFullScreenButton').isVisible(),true);
    await page.locator('#autoplayToggle').click();
    assert.equal(await page.locator('#autoplayToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#resetView').click();
    assert.equal(await page.locator('#autoplayToggle').getAttribute('aria-pressed'),'false');
    // Simulate new submissions: clicking Refresh reuses the SAME ticket and
    // fetches updated server aggregates without reopening Admin or voting.
    const beforeRefreshCalls=privateCalls;
    liveVoteCount=17;serverUpdatedAt='2026-11-06T08:09:00.000Z';
    await page.locator('#liveRefreshButton').click();
    await page.waitForFunction(()=>document.querySelector('#totalVotes')?.textContent==='17',null,{timeout:12000});
    assert.ok(privateCalls>beforeRefreshCalls);
    assert.match(await page.locator('#lastUpdated').innerText(),/Updated /);
    // Browser reload must return to Live (not reset to Demo), keep the same
    // presenter capability, and revalidate/fetch rather than reissue it.
    const beforeReloadCalls=privateCalls;
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>document.body.dataset.resultsMode==='PUBLISHED' &&
      document.querySelector('#totalVotes')?.textContent==='17',null,{timeout:12000});
    assert.ok(privateCalls>beforeReloadCalls);
    assert.equal(await page.locator('.hero').isVisible(),false);
    assert.equal(await page.locator('#lastUpdated').isVisible(),true);
    await page.locator('#liveDemoButton').click();
    assert.match(await page.locator('#modeTitle').innerText(),/DEMO/);
    assert.equal(await page.locator('.hero').isVisible(),true);
    assert.equal(await page.locator('.board-qr-card').isVisible(),true,
      'QR and education remain available to authorized faculty Demo');
    assert.match(await page.evaluate(()=>location.hash),/view=demo/);
    assert.equal(await page.locator('#totalVotes').innerText(),'—');
    const width=await page.evaluate(()=>({
      width:innerWidth,scroll:document.documentElement.scrollWidth
    }));
    assert.ok(width.scroll<=width.width+2,
      size.name+' horizontal overflow '+JSON.stringify(width));
    // Reload after expiry: previous in-memory real values must not remain visible.
    approved=false;
    await visit('#presenter='+ticket+'&view=live');
    await page.waitForFunction(()=>document.querySelector('#pageShell')?.hidden &&
      /expired/i.test(document.querySelector('#presenterAccessMessage')?.textContent||''),null,{timeout:12000});
    assert.equal(await page.locator('#pageShell').isVisible(),false);
    assert.deepEqual(errors,[],size.name+' JavaScript exceptions');
    assert.equal(postCount,0,'Private board cannot save a vote');
    assert.equal(unexpected,0,'No non-test backend requests');
    console.log('PASS '+size.name+': public denied, ticketed demo/private live, expiry fail-closed, no vote');
    await ctx.close();
  }
}finally{await browser.close();}
