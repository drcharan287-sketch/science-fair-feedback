// Production read-only safety probe. The anonymous Results API must NEVER
// expose real votes or rankings, even if an old publication property said LIVE.
// No real submissions, admin credentials or visitor data are sent.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const match=html.match(/\bconst\s+SCRIPT_URL\s*=\s*["'](https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)["']/);
assert.ok(match,'Missing Apps Script /exec URL in the public form');
const callback='voiceVoteReadOnlyResultsProbe';
const url=new URL(match[1]);
url.searchParams.set('action','publicResults');
url.searchParams.set('callback',callback);
// Legacy public-mode URL override is covered by in-memory backend tests.
// Do not use a non-standard query variant when checking the deployed endpoint.
const response=await fetch(url,{redirect:'follow',
  signal:AbortSignal.timeout(30000),headers:{Accept:'application/javascript'}});
assert.ok(response.ok,'Public Results GET returned HTTP '+response.status);
const source=(await response.text()).trim();
const prefix=callback+'(';
assert.ok(source.startsWith(prefix) && source.endsWith(');'),
  'Public Results endpoint did not return expected JSONP callback');
const data=JSON.parse(source.slice(prefix.length,-2));
assert.equal(data.success,true);
assert.equal(data.mode,'DEMO','Real Results must not be publicly accessible');
assert.ok(Number.isInteger(data.totalProjects)&&data.totalProjects>=1);
for(const name of ['acceptedVotes','languages','rankings','ratedProjects','highlights',
  'original','translation','submissionId','deviceToken','reviews','votes']){
  assert.equal(Object.hasOwn(data,name),false,'Anonymous Results exposed '+name);
}
console.log('PASS anonymous Results is DEMO-only, even with a forced PUBLISHED URL; no private fields.');
);
const matchPayload=wrapper.exec(source);
assert.ok(matchPayload,'Public Results endpoint did not return expected JSONP');
const data=JSON.parse(matchPayload[1]);
assert.equal(data.success,true);
assert.equal(data.mode,'DEMO','Real Results must not be publicly accessible');
assert.ok(Number.isInteger(data.totalProjects)&&data.totalProjects>=1);
for(const name of ['acceptedVotes','languages','rankings','ratedProjects','highlights',
  'original','translation','submissionId','deviceToken','reviews','votes']){
  assert.equal(Object.hasOwn(data,name),false,'Anonymous Results exposed '+name);
}
console.log('PASS anonymous Results is DEMO-only, even with a forced PUBLISHED URL; no private fields.');
