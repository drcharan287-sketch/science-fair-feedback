// Entirely synthetic private Admin UI browser acceptance.
// No real admin key, Google access, live edits, votes, or POST requests.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const origin=(process.env.VOICEVOTE_SITE_BASE||'http://127.0.0.1:8787/');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
  for(const viewport of [{width:390,height:844},{width:1280,height:820}]){
    const page=await browser.newPage({viewport});
    let writes=0;const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(route.request().method()!=='GET'){writes++;return route.abort('blockedbyclient');}
      if(u.origin===new URL(origin).origin)return route.continue();
      return route.abort('blockedbyclient');
    });
    await page.addInitScript(()=>{
      const entries=[
        {id:'VVP-STAGED',grade:'9',section:'Keats',project:'VoiceVote App',
          active:true,version:'STAGED-VERSION-1',sourceKey:'IX_KEATS|7|1',votes:3,legacyVotes:false},
        {id:'VVP-INACTIVE',grade:'6',section:'Heidelberg',project:'Inactive Example',
          active:false,version:'STAGED-VERSION-2',sourceKey:'VI_HEIDELBERG|2|1',votes:0,legacyVotes:false}
      ];
      const overview={projects:entries.map(p=>({...p,weighted:0,average:0,rank:1})),
        totalProjects:2,ratedProjects:1,acceptedVotes:3,excludedVotes:0,
        protectedVotes:3,legacyVotes:0,votingOpen:true,languages:[],
        auditPendingActions:0};
      window.__adminCalls=[];
      window.confirm=()=>true;
      const runner=(success,failure)=>new Proxy({}, {get(_t,name){
        if(name==='withSuccessHandler')return cb=>runner(cb,failure);
        if(name==='withFailureHandler')return cb=>runner(success,cb);
        return (...args)=>{
          window.__adminCalls.push({name,args});
          if(name==='adminGetOverview')return success?.(overview);
          if(name==='adminGetManagedProjects')return success?.({
            projects:entries,total:entries.length,active:1,pendingAuditActions:0});
          if(name==='adminChangeProject')return success?.({
            changed:true,id:args[1].id||'VVP-EVENT-FAKE-ID',project:args[1].project});
          failure?.(new Error('Unexpected fake method '+name));
        };
      }});
      window.google={script:{run:runner(null,null)}};
    });
    const response=await page.goto(new URL('apps-script/Admin.html',origin).toString(),
      {waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(response?.ok(),true);
    await page.locator('#adminKey').fill('FAKE-ADMIN-KEY-NEVER-USED-IN-PRODUCTION');
    await page.locator('#loginBtn').click();
    await page.locator('#projectsTab').click();
    await page.waitForFunction(()=>document.querySelector('#managerProject')?.options.length===3);
    assert.equal(await page.locator('#projectsPanel').isVisible(),true);
    assert.match(await page.locator('#managerStatus').innerText(),/1 active of 2 project/i);
    await page.locator('#managerGrade').selectOption('9');
    await page.locator('#managerSection').selectOption('Keats');
    await page.locator('#managerName').fill('New Solar Purifier');
    await page.locator('#managerReason').fill('Teacher added a new project today');
    await page.locator('#managerAdd').click();
    assert.equal(await page.locator('#managerConfirmDialog').isVisible(),true);
    assert.equal(await page.locator('#managerConfirmTitle').innerText(),'Add new project');
    assert.match(await page.locator('#managerConfirmLocation').innerText(),/Grade 9 · Keats/);
    assert.equal(await page.locator('#managerConfirmProject').innerText(),'New Solar Purifier');
    assert.match(await page.locator('#managerConfirmReason').innerText(),/Teacher added/);
    assert.equal(await page.evaluate(()=>window.__adminCalls.filter(x=>x.name==='adminChangeProject').length),0,
      'Showing the confirmation must not write');
    await page.locator('#managerConfirmCancel').click();
    assert.equal(await page.locator('#managerConfirmDialog').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__adminCalls.filter(x=>x.name==='adminChangeProject').length),0,
      'Cancelling must not send an Admin change');
    await page.locator('#managerAdd').click();
    await page.locator('#managerConfirmProceed').click();
    const added=await page.evaluate(()=>window.__adminCalls.filter(x=>x.name==='adminChangeProject').at(-1));
    assert.equal(added.args[1].action,'ADD');
    assert.equal(added.args[1].project,'New Solar Purifier');
    await page.locator('#managerProject').selectOption('VVP-STAGED');
    await page.locator('#managerReason').fill('Teacher temporarily withdrew this exhibit');
    await page.locator('#managerDeactivate').click();
    assert.equal(await page.locator('#managerConfirmDialog').isVisible(),true);
    assert.match(await page.locator('#managerConfirmRisk').innerText(),/hide 3 valid vote/);
    await page.locator('#managerConfirmProceed').click();
    const deactivated=await page.evaluate(()=>window.__adminCalls.filter(x=>x.name==='adminChangeProject').at(-1));
    assert.equal(deactivated.args[1].action,'DEACTIVATE');
    assert.equal(deactivated.args[1].expectedVersion,'STAGED-VERSION-1');
    assert.equal(deactivated.args[1].confirmAffectedVotes,true);
    await page.locator('#logoutBtn').click();
    assert.equal(await page.locator('#adminPanel').isVisible(),false);
    assert.equal(await page.locator('#managerProject option').count(),1);
    assert.equal(await page.locator('#managerSelectionInfo').innerText(),'');
    assert.equal(await page.locator('#managerConfirmProject').innerText(),'');
    assert.equal(writes,0,'No actual POST is allowed by this browser rehearsal');
    assert.deepEqual(errors,[],'No uncaught Admin JS errors');
    console.log('PASS staged '+viewport.width+'px Admin Add/Deactivate, secure signout, no Google writes');
    await page.close();
  }
}finally{await browser.close();}
