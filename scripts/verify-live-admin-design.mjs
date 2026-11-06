// Inspect only the public Apps Script Admin login shell to establish that the
// PR #58 design and grade-rank header were deployed. Never authenticate, read
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
        const css=Array.from(document.querySelectorAll('style'))
          .map(el=>el.textContent||'').join('\n');
        return {
          rankHeader:rank?.textContent||'',
          headingSize:loginHeading?parseFloat(getComputedStyle(loginHeading).fontSize):0,
          brandSize:brand?parseFloat(getComputedStyle(brand).fontSize):0,
          styleDeployed:css.includes('Console visual hierarchy'),
          adminHidden:document.getElementById('adminPanel')?.hidden
        };
      });
      assert.equal(result.rankHeader,'Overall rank','PR58 rank header not deployed');
      assert.equal(result.styleDeployed,true,'PR58 Admin style not deployed');
      assert.ok(result.headingSize>result.brandSize,
        'Admin sign-in title must be larger than its header brand '+JSON.stringify(result));
      assert.equal(result.adminHidden,true,'Protected Admin controls must stay hidden');
      console.log('PASS production Apps Script public Admin login shell includes PR58 rank scope, heading hierarchy; private dashboard remains locked. No sign-in/data read.');
      verified=true;
    }catch(error){
      lastError=String(error.message);
      if(attempt<3)await new Promise(r=>setTimeout(r,3500));
    }
  }
  if(!verified)throw new Error('Admin presentation release could not be verified: '+lastError);
}finally{await browser.close();}
