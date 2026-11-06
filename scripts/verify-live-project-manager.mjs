// Inspect the deployed Apps Script Admin login shell after the VV-30 release.
// This reads no private data and never signs in. Never authenticate, read
// feedback, issue passes, create votes, or change the organizer's browser state.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const url='https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec?action=admin';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  let verified=false,lastError='';
  for(let attempt=0;attempt<4&&!verified;attempt++){
    try{
      await page.goto(url+'&presentationCheck='+attempt,{
        waitUntil:'domcontentloaded',timeout:30000});
      let loginFrame;
      for(let poll=0;poll<35&&!loginFrame;poll++){
        for(const frame of page.frames()){
          try{
            if(await frame.locator('#loginForm').count()>0){loginFrame=frame;break;}
          }catch(_){}
        }
        if(!loginFrame)await new Promise(r=>setTimeout(r,500));
      }
      assert.ok(loginFrame,'Public login shell must render in Google HtmlService');
      const result=await loginFrame.evaluate(()=>{
        const rank=document.getElementById('rankHeading');
        const loginHeading=document.querySelector('#loginPanel h1');
        const brand=document.querySelector('.top .brand');
        const titleStyle=loginHeading?getComputedStyle(loginHeading):null;
        return {
          rankHeader:rank?.textContent||'',
          headingSize:titleStyle?parseFloat(titleStyle.fontSize):0,
          headingColor:titleStyle?.color||'',
          brandSize:brand?parseFloat(getComputedStyle(brand).fontSize):0,
          adminHidden:document.getElementById('adminPanel')?.hidden,
          projectManagerTab:document.getElementById('projectsTab')?.textContent.trim()||'',
          projectManagerHidden:document.getElementById('projectsPanel')?.hidden,
          projectManagerControls:['managerForm','managerNew','managerSave','managerDeactivate',
            'managerReactivate','managerRefresh'].every(id=>!!document.getElementById(id))
        };
      });
      assert.equal(result.rankHeader,'Overall rank','PR58 rank header not deployed');
      // HtmlService may strip/minify CSS comments and move styles into an
      // iframe. Test the actual rendered hierarchy instead of source markers.
      assert.ok(result.headingSize>result.brandSize&&result.headingSize>=33,
        'PR58 Admin login title hierarchy not deployed '+JSON.stringify(result));
      assert.equal(result.headingColor,'rgb(248, 252, 255)',
        'PR58 admin title treatment not deployed '+JSON.stringify(result));
      assert.equal(result.adminHidden,true,'Protected Admin controls must stay hidden');
      assert.equal(result.projectManagerTab,'Manage projects','VV-30 tab not deployed');
      assert.equal(result.projectManagerHidden,true,'Manager must remain hidden before sign-in');
      assert.equal(result.projectManagerControls,true,'Add/Edit/Deactivate controls absent');
      console.log('PASS production Apps Script public Admin login shell includes VV30 project manager, rank scope and heading hierarchy; private dashboard remains locked. No sign-in/data read.');
      verified=true;
    }catch(error){
      lastError=String(error.message);
      if(attempt<3)await new Promise(r=>setTimeout(r,3500));
    }
  }
  if(!verified)throw new Error('Admin presentation release could not be verified: '+lastError);
}finally{await browser.close();}
