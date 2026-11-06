// Non-writing production roster sign-off. Public Apps Script catalog is
// compared with the reviewed authoritative 424-project Pages snapshot.
// Never invokes action=save or requests private feedback.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const snap=JSON.parse(fs.readFileSync('projects.json','utf8'));
const resultsSource=fs.readFileSync('results.js','utf8');
const match=resultsSource.match(/const SCRIPT_URL = '([^']+)'/);
assert.ok(match,'Published Results backend URL must exist');
const backend=new URL(match[1]);
assert.equal(backend.protocol,'https:');
assert.equal(backend.hostname,'script.google.com');
assert.equal(snap.projects.length,424);
let lastError;
for(let attempt=1;attempt<=5;attempt++){
  try{
    const url=new URL(backend);
    url.searchParams.set('action','catalog');
    url.searchParams.set('callback','voiceVoteFinalCatalog');
    url.searchParams.set('_',String(Date.now())+'-'+attempt);
    const response=await fetch(url,{redirect:'follow',
      signal:AbortSignal.timeout(25000),headers:{Accept:'application/javascript'}});
    assert.equal(response.ok,true,'Public catalog GET must succeed');
    const text=(await response.text()).trim();
    const matched=/^voiceVoteFinalCatalog\(([\s\S]*)\);?$/.exec(text);
    assert.ok(matched,'JSONP callback must match explicit read-only request');
    const data=JSON.parse(matched[1].replace(/;\s*$/,''));
    assert.equal(data.success,true,'Backend catalog must be available');
    assert.equal(data.projects?.length,424,'Backend must expose exactly the 424 authoritative projects');
    const items=new Map(data.projects.map(p=>[String(p.id),p]));
    assert.equal(items.size,424,'Backend IDs must be unique');
    for(const row of snap.projects){
      const p=items.get(row.id);
      assert.ok(p,'Project ID missing from live backend: '+row.id);
      assert.equal(String(p.grade),row.grade);
      assert.equal(String(p.section),row.section);
      assert.equal(String(p.project),row.project);
    }
    assert.equal([...items.values()].some(p=>
      p.project==='XenoChat'||p.project==='VoiceVote'),false,
      'Retired demonstration projects are not permitted');
    console.log('PASS: production Apps Script public catalog exactly equals reviewed 424-row authority; zero vote POSTs or feedback reads.');
    lastError=null;
    break;
  }catch(error){
    lastError=error;
    if(attempt<5)await new Promise(resolve=>setTimeout(resolve,1200));
  }
}
if(lastError)throw lastError;
