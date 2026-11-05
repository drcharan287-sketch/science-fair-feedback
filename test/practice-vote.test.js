import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const practice=readFileSync('practice.html','utf8');
const script=readFileSync('practice-vote.js','utf8');
const voting=readFileSync('index.html','utf8');
const results=readFileSync('results.html','utf8');

test('Practice page explicitly separates saved real votes from sample receipts',()=>{
  assert.match(practice,/PRACTICE MODE · NO REAL VOTE/);
  assert.match(practice,/SAMPLE RECEIPT ONLY/);
  assert.match(practice,/NOT SAVED/);
  assert.match(practice,/Translation happens on real submission/);
  assert.match(practice,/href="\.\/results\.html"/);
  assert.match(practice,/data-practice-step/g);
  assert.doesNotMatch(practice,/<form\b/i);
  assert.doesNotMatch(practice,/<script[^>]+src="https?:/i);
});

test('Practice JS cannot submit to Google, change real locks or create a voting identity',()=>{
  assert.match(script,/fetch\('\.\/projects\.json'/);
  assert.match(script,/VoiceVoteCatalogSelector\.init/);
  assert.match(script,/recognition\.lang=\$\('language'\)\.value/);
  assert.match(script,/receiptFeedback'\)\.textContent=feedback/);
  assert.match(script,/function resetPractice\(/);
  assert.doesNotMatch(script,/script\.google\.com|SCRIPT_URL/);
  assert.doesNotMatch(script,/localStorage|sessionStorage|navigator\.sendBeacon/);
  assert.doesNotMatch(script,/\.submit\(|method\s*=\s*['"]POST/);
  assert.doesNotMatch(script,/fetch\([^\n]*method\s*:\s*['"]POST/i);
});

test('A locked real browser offers Practice Voting without disabling vote guards',()=>{
  assert.match(voting,/id="practiceCallout"/);
  assert.match(voting,/href="\.\/practice\.html"/);
  assert.match(voting,/practiceCallout\.hidden = !locked/);
  assert.match(voting,/submitButton\.disabled = locked \|\|/);
  assert.match(voting,/const VISITOR_PASSES_ENABLED = false/);
  assert.match(voting,/function isVoteLocked\(\)/);
  assert.match(results,/href="\.\/practice\.html"/);
});

test('No demo practice operation can claim to translate feedback or change public rankings',()=>{
  assert.match(script,/Translation happens on real submission/);
  assert.match(script,/not transmitted/);
  assert.doesNotMatch(practice,/Practice vote counted|AI translated successfully/i);
  assert.match(practice,/Nothing you submit here is sent to Google Sheets or added to rankings/);
});
