// Live, GET-only VoiceVote public Results API safety check.
// Never reads a private review endpoint, submits a vote or mutates the Sheet.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const match=html.match(/\bconst\s+SCRIPT_URL\s*=\s*["'](https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)["']/);
assert.ok(match,'Missing Apps Script /exec URL in the public form');
const callback='voiceVoteReadOnlyResultsProbe';
const url=new URL(match[1]);
url.searchParams.set('action','publicResults');
url.searchParams.set('callback',callback);
const response=await fetch(url,{redirect:'follow',
  signal:AbortSignal.timeout(30000),headers:{Accept:'application/javascript'}});
assert.ok(response.ok,'Public results GET returned HTTP '+response.status);
const source=(await response.text()).trim();
const wrapper=new RegExp('^'+callback+'\\(([\\s\\S]*?)\\);?$');
const received=wrapper.exec(source);
assert.ok(received,'Public results endpoint did not return expected safe JSONP callback');
const data=JSON.parse(received[1]);
assert.equal(data.success,true,'Public results backend did not accept GET');
assert.ok(['DEMO','LIVE','PUBLISHED'].includes(data.mode),'Invalid public mode');
assert.ok(Number.isInteger(data.totalProjects)&&data.totalProjects>=1,'Missing catalog count');
const forbidden=['adminKey','deviceHash','rowProof','submissionId','original','protectedVotes','legacyVotes','feedbackRows'];
for(const key of forbidden)assert.equal(Object.hasOwn(data,key),false,'Forbidden private field '+key);
if(data.mode==='DEMO'){
  for(const key of ['acceptedVotes','languages','rankings','highlights','ratedProjects']){
    assert.equal(Object.hasOwn(data,key),false,'DEMO must not read/display '+key);
  }
}else{
  assert.ok(Number.isInteger(data.acceptedVotes)&&data.acceptedVotes>=0);
  assert.ok(Array.isArray(data.languages));
  assert.ok(Array.isArray(data.highlights));
  for(const item of data.highlights){
    assert.ok(Object.keys(item).every(k=>['project','grade','language','quote','translation'].includes(k)));
    assert.ok(typeof item.quote==='string'&&item.quote.length<=240);
  }
  if(data.mode==='LIVE')assert.equal(Object.hasOwn(data,'rankings'),false,
    'LIVE must not expose rankings');
  else{
    assert.ok(Array.isArray(data.rankings));
    for(const item of data.rankings){
      assert.ok(Object.keys(item).every(k=>
        ['id','grade','section','project','votes','average','weighted','rank'].includes(k)));
      assert.ok(Number.isFinite(item.weighted));
    }
  }
}
console.log('PASS read-only public Results API: mode='+data.mode+
  ', catalog='+data.totalProjects+
  ', no private identifiers/feedback or unapproved rankings in response.');
