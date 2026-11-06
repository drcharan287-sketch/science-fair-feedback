// Non-writing live production roster-health check. The static 424-project
// Pages snapshot is a historical source baseline, NOT the event-day authority.
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
    // 424 is the archived 6-Nov source baseline, NOT an immutable live
    // count after organizer-approved event-day additions/deactivations.
    // Only authenticated Admin mutations change the live Google roster.
    assert.ok(Array.isArray(data.projects) && data.projects.length>0,
      'Live catalog must contain active projects');
    const items=new Map(data.projects.map(p=>[String(p.id||''),p]));
    assert.equal(items.size,data.projects.length,'Active Project IDs must be unique');
    const names=new Set();
    for(const p of data.projects){
      assert.match(String(p.id||''),/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
      assert.ok(String(p.grade||'').trim() && String(p.section||'').trim() &&
        String(p.project||'').trim(),'Active project must have grade, section and name');
      const nameKey=[p.grade,p.section,String(p.project).toLocaleLowerCase()].join('|');
      assert.equal(names.has(nameKey),false,'Duplicate live grade/section/project');
      names.add(nameKey);
    }
    assert.equal([...items.values()].some(p=>
      p.project==='XenoChat'||p.project==='VoiceVote'),false,
      'Retired demonstration projects are not permitted');
    console.log('PASS: production live active catalog has '+data.projects.length+
      ' valid unique projects; archived snapshot baseline is '+snap.projects.length+
      '. Event-day changes are expected to alter live count; zero vote POSTs.');
    lastError=null;
    break;
  }catch(error){
    lastError=error;
    if(attempt<5)await new Promise(resolve=>setTimeout(resolve,1200));
  }
}
if(lastError)throw lastError;
