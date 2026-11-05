// Pure project roster integrity tests. No Google connection, Sheet changes or votes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectEntries } from '../scripts/catalog-integrity.mjs';

test('valid names survive sorting without changing identities used by backend', () => {
  const input = [
    {grade:'9',section:'Keats',project:'VoiceVote'},
    {grade:6,section:'Heidelberg',project:'XenoChat'},
    {grade:'9',section:'Wordsworth',project:'Solar System'}
  ];
  const before = JSON.stringify(input);
  const output = validateProjectEntries(input);
  assert.deepEqual(output.map(x => x.grade),['6','9','9']);
  assert.equal(output[0].project,'XenoChat');
  assert.equal(JSON.stringify(input),before,'Validator may not rewrite the incoming data');
});

test('same title in two different sections is allowed and separately identifiable', () => {
  const result = validateProjectEntries([
    {grade:'8',section:'Darwin',project:'Solar System'},
    {grade:'8',section:'Newton',project:'Solar System'}
  ]);
  assert.equal(result.length,2);
});

test('identical grade/section/title twice is blocked rather than silently collapsed', () => {
  assert.throws(()=>validateProjectEntries([
    {grade:3,section:'Buntings',project:'Solar system'},
    {grade:'3',section:'Buntings',project:'Solar system'}
  ]),/Ambiguous catalog identity/);
});

test('case, spacing and Unicode variants cannot create ambiguous voting identities', () => {
  const pairs = [
    ['Solar System','solar system'],
    ['Water   purifier','water purifier'],
    ['Robot Lab','Ｒｏｂｏｔ Lab'],
    ['Solar System',' Solar System ']
  ];
  for (const [a,b] of pairs) {
    assert.throws(()=>validateProjectEntries([
      {grade:'6',section:'Heidelberg',project:a},
      {grade:'6',section:' HEIDELBERG ',project:b}
    ]),/Ambiguous catalog identity/,a+' versus '+b);
  }
});

test('empty, malformed, oversized and control-character project entries are rejected', () => {
  assert.throws(()=>validateProjectEntries([]),/No active projects/);
  assert.throws(()=>validateProjectEntries([{grade:'9',section:'Keats'}]),/invalid project/);
  assert.throws(()=>validateProjectEntries([{grade:'9',section:'Keats',project:'X'.repeat(201)}]),/oversized/);
  assert.throws(()=>validateProjectEntries([{grade:'9',section:'Keats',project:'Robot\nLab'}]),/control-character/);
  assert.throws(()=>validateProjectEntries([{grade:'9',section:'Keats',project:''}]),/empty/);
});

test('300 distinct project rows remain valid at event scale', () => {
  const rows = Array.from({length:300},(_,i)=>({
    grade:String(3 + Math.floor(i/50)),
    section:'Section '+String(1+(i%5)),
    project:'Project '+String(i+1).padStart(3,'0')
  }));
  assert.equal(validateProjectEntries(rows).length,300);
});

test('published snapshot remains valid under the same identity rules', async () => {
  const { readFile } = await import('node:fs/promises');
  const liveSnapshot = JSON.parse(await readFile(new URL('../projects.json',import.meta.url),'utf8'));
  assert.equal(liveSnapshot.success,true);
  const entries=validateProjectEntries(liveSnapshot.projects);
  assert.ok(entries.some(x=>x.grade==='6'&&x.section==='Heidelberg'&&x.project==='XenoChat'));
  assert.ok(entries.some(x=>x.grade==='9'&&x.section==='Keats'&&x.project==='VoiceVote'));
});


test('stable project IDs survive snapshot validation without altering display strings',()=>{
  const rows=[
    {grade:'6',section:'Heidelberg',project:'XenoChat',id:'LEG-6-HEIDELBERG-XENOCHAT'},
    {grade:'9',section:'Keats',project:'VoiceVote',id:'LEG-9-KEATS-VOICEVOTE'}
  ];
  assert.deepEqual(validateProjectEntries(rows),rows);
});

test('duplicate IDs, malformed IDs and IDs shared by different teams are blocked',()=>{
  assert.throws(()=>validateProjectEntries([
    {grade:'6',section:'A',project:'First team',id:'VVP-GROUP-1'},
    {grade:'9',section:'B',project:'Second team',id:'VVP-GROUP-1'}
  ]),/Duplicate stable project ID/);
  assert.throws(()=>validateProjectEntries([
    {grade:'6',section:'A',project:'First team',id:'invalid space'}
  ]),/Invalid stable project ID/);
  assert.throws(()=>validateProjectEntries([
    {grade:'6',section:'A',project:'First team',id:'=formula'}
  ]),/Invalid stable project ID/);
});
