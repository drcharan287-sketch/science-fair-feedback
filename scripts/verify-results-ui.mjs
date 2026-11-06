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
    let approved=false,postCount=0,unexpected=0,privateCalls=0;
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
          body:cb+'('+JSON.stringify(approved?privatePayload:
            {success:false,mode:'DENIED',message:'Expired presenter session'})+');'});
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
    assert.ok(await page.locator('#leaderboardCards .rank-card').count()>0);
    assert.equal(await page.locator('#totalVotes').innerText(),'—',
      'Demo must not show genuine live vote totals');
    assert.equal(await page.locator('#feedbackCards .quote-card').count(),3);
    assert.ok((await page.locator('#presenterVotingLink').getAttribute('href')).includes('#presenter='),
      'Faculty demo must point to the verified no-save Voting UI');
    await page.locator('#presenterShowLive').click();
    assert.match(await page.locator('#modeTitle').innerText(),/PRIVATE LIVE/i);
    assert.equal(await page.locator('#totalVotes').innerText(),'15');
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),2);
    await page.locator('#gradeFilter').selectOption('9');
    assert.equal(await page.locator('#leaderboardCards .rank-card').count(),1);
    assert.match(await page.locator('#leaderboardCards').innerText(),/Synthetic Rain Harvest/);
    await page.locator('#brightToggle').click();
    assert.equal(await page.evaluate(()=>document.body.classList.contains('bright')),true);
    await page.locator('#autoplayToggle').click();
    assert.equal(await page.locator('#autoplayToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#resetView').click();
    assert.equal(await page.locator('#autoplayToggle').getAttribute('aria-pressed'),'false');
    await page.locator('#presenterShowDemo').click();
    assert.match(await page.locator('#modeTitle').innerText(),/DEMO/);
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
