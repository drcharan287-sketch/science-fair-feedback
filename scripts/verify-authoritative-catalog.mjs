// Event-day roster contract: manifest is derived from the organizer's
// authoritative 6 November Excel handout, not from student names or legacy demo.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('docs/authoritative-roster-2026-11-06.json','utf8'));
const snapshot=JSON.parse(fs.readFileSync('projects.json','utf8'));
assert.equal(manifest.totalProjects,424);
assert.equal(manifest.sourceTabs,44);
assert.equal(manifest.sourceSha256,'aa7f4dd370f7bbbb46bb89f6e6ed4f6f6f9f1938f056fa6de84742cde4fd8ba1');
assert.equal(snapshot.success,true);
assert.equal(snapshot.projects.length,424);
assert.equal(manifest.projects.length,424);
const sourceKeys=new Set(),ids=new Set(),named=new Set();
const normalized=s=>String(s).normalize('NFKC').trim().toLocaleLowerCase();
const byId=new Map(snapshot.projects.map(p=>[p.id,p]));
for(const entry of manifest.projects){
  assert.ok(!sourceKeys.has(entry.sourceKey),'duplicate source key '+entry.sourceKey);
  sourceKeys.add(entry.sourceKey);
  assert.ok(!ids.has(entry.id),'duplicate stable project id '+entry.id);
  ids.add(entry.id);
  const identity=[entry.grade,entry.section,normalized(entry.project)].join('|');
  assert.ok(!named.has(identity),'ambiguous project selection '+identity);
  named.add(identity);
  assert.equal(entry.project.length<=200,true);
  const onPage=byId.get(entry.id);
  assert.ok(onPage,'Project not in published snapshot: '+entry.id);
  assert.deepEqual(onPage,{grade:entry.grade,section:entry.section,project:entry.project,id:entry.id});
}
assert.deepEqual(Object.fromEntries([...new Set(snapshot.projects.map(p=>p.grade))].map(grade=>
  [grade,snapshot.projects.filter(p=>p.grade===grade).length])),{
  '3':62,'4':55,'5':51,'6':55,'7':60,'8':70,'9':71
});
assert.equal(snapshot.projects.some(p=>p.project==='XenoChat'||p.project==='VoiceVote'),false,
  'Remove legacy demonstration-only projects');
assert.equal(snapshot.projects.filter(p=>p.grade==='8'&&p.section==='Raman').length,10);
assert.equal(snapshot.projects.filter(p=>p.grade==='9'&&p.section==='Keats').length,11);
console.log('PASS: authoritative 424-project snapshot, 44 source tabs, unique ID/title/source keys, no legacy demos, grade counts verified.');
