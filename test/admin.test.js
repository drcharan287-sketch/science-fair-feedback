const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const DEMO_KEY = 'THIS_IS_ONLY_A_FAKE_LOCAL_ADMIN_TEST_KEY_123456789';
const DEMO_HASH = createHash('sha256').update(DEMO_KEY).digest('hex');
const PROJECTS = [
  ['Class/Grade','Section','Project Name','Active'],
  ['6','Heidelberg','XenoChat','TRUE'],
  ['9','Keats','VoiceVote','TRUE']
];
function setup() {
  let sheetOpens = 0;
  const props = new Map();
  const sheets = {};
  const feedbackRows = [
    ['Date','Project','Class','Section','Original Feedback','Rating','Language','English Translation','Submission ID','Device hash','Vote status'],
    [new Date('2026-11-04T12:00:00Z'),'XenoChat','6','Heidelberg','ఈ ప్రాజెక్టు చాలా బాగుంది',5,'te-IN','This project is very good.','','',''],
    [new Date('2026-11-04T13:00:00Z'),'VoiceVote','9','Keats','Interesting use of AI',4,'en-IN','Interesting use of AI','01234567-abcd-4def-abcd-0123456789ab','ab'.repeat(32),'']
  ];
  const feedback = {
    getLastRow: () => feedbackRows.length,
    getRange: (r,c,count=1,width=1) => ({
      getValues: () => feedbackRows.slice(r-1,r-1+count).map(row =>
        Array.from({length:width}, (_,i)=>row[c-1+i] ?? '')),
      setValue: value => {feedbackRows[r-1][c-1] = value;return feedback;}
    }),
    appendRow: row => feedbackRows.push([...row])
  };
  sheets.Feedback = feedback;
  sheets.Projects = {getDataRange:()=>({getDisplayValues:()=>PROJECTS})};
  const ss = {
    getSheetByName: name => sheets[name]||null,
    insertSheet: name => {
      const rows = [];
      const sheet = {appendRow: r => rows.push([...r]), rows};
      sheets[name]=sheet;
      return sheet;
    }
  };
  const context = {
    Date, JSON, Math,
    ContentService:{MimeType:{JAVASCRIPT:'javascript'},createTextOutput:t=>({text:t,setMimeType(){return this}})},
    SpreadsheetApp:{openById:()=>{sheetOpens++;return ss}},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>props.get(k) ?? null,
      setProperty:(k,v)=>props.set(k,String(v))
    })},
    HtmlService:{
      createHtmlOutputFromFile:name=>({name,setTitle(t){this.title=t;return this}}),
      createHtmlOutput:html=>({html,setTitle(t){this.title=t;return this}})
    },
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},
      computeDigest:(_,v)=>Array.from(createHash('sha256').update(String(v)).digest())},
    LanguageApp:{translate:t=>t},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  vm.runInContext(fs.readFileSync('apps-script/VisitorPasses.gs','utf8'),context);
  const adminSource=fs.readFileSync('apps-script/AdminApi.gs','utf8');
  assert.match(adminSource,/VOICEVOTE_ADMIN_KEY_SHA256/);
  const testSource=adminSource.replace(
    /(VOICEVOTE_ADMIN_KEY_SHA256\s*=\s*')[a-f0-9]{64}(')/,
    (_,a,b)=>a+DEMO_HASH+b
  );
  assert.notEqual(testSource,adminSource,'Must swap production hash for local fake key');
  vm.runInContext(testSource,context);
  return {context,props,sheets,feedbackRows,opens:()=>sheetOpens};
}

test('anonymous and incorrect admin credentials cannot read private results or moderate voters',()=>{
  const a=setup();
  assert.throws(()=>a.context.adminGetOverview(''),/denied/);
  assert.throws(()=>a.context.adminGetOverview('wrong password'),/denied/);
  assert.throws(()=>a.context.adminGetReviews('bad','some project',0),/denied/);
  assert.throws(()=>a.context.adminGetVoterActivity('bad'),/denied/);
  assert.throws(()=>a.context.adminSetVotingOpen('bad',false,'No one should vote'),/denied/);
  assert.throws(()=>a.context.adminSetVoteStatus('bad',2,'fake','VOID','Bad feedback'),/denied/);
  assert.equal(a.opens(),0,'Invalid credentials must never even open the private sheet');
  assert.equal(a.feedbackRows.length,3);
  assert.equal(a.props.size,0);
  const shell=a.context.doGet({parameter:{action:'admin'}});
  assert.equal(shell.name,'Admin');
  assert.match(shell.title,/Admin Console/);
  assert.equal(shell.html,undefined,'Admin shell must not include private content');
});

test('rankings count active projects and do not disclose review content',()=>{
  const a=setup(), d=a.context.adminGetOverview(DEMO_KEY);
  assert.equal(d.totalProjects,2);
  assert.equal(d.acceptedVotes,2);
  assert.equal(d.ratedProjects,2);
  assert.equal(d.protectedVotes,1);
  assert.equal(d.legacyVotes,1);
  assert.equal(d.votingOpen,true);
  assert.deepEqual(Array.from(d.languages,x=>x.code).sort(),['en-IN','te-IN']);
  assert.ok(d.projects[0].weighted >= d.projects[1].weighted);
  assert.equal(d.projects.every(x=>!('original' in x)&&!('translation' in x)),true);
  assert.ok(!JSON.stringify(d).includes('ఈ ప్రాజెక్టు'));
  const key=JSON.stringify(['6','Heidelberg','XenoChat']);
  const reviews=a.context.adminGetReviews(DEMO_KEY,key,0);
  assert.equal(reviews.total,1);
  assert.equal(reviews.reviews[0].translation,'This project is very good.');
  assert.equal(reviews.reviews[0].language,'te-IN');
});

test('moderation excludes a vote without deleting it and keeps an action log',()=>{
  const a=setup();
  const voters=a.context.adminGetVoterActivity(DEMO_KEY);
  assert.equal(voters.length,2);
  assert.equal(voters[0].protected,true);
  const legacy=voters.find(v=>v.row===2);
  assert.equal(legacy.protected,false);
  assert.throws(()=>a.context.adminSetVoteStatus(DEMO_KEY,2,legacy.rowProof,'VOID','short'),/reason/);
  assert.throws(()=>a.context.adminSetVoteStatus(DEMO_KEY,2,'tampered','VOID','Vote was inappropriate'),/changed/);
  const updated=a.context.adminSetVoteStatus(DEMO_KEY,2,legacy.rowProof,'VOID','Off-topic audience comment');
  assert.equal(updated.changed,true);
  assert.equal(a.feedbackRows[1][10],'VOID');
  assert.equal(a.feedbackRows[1][4],'ఈ ప్రాజెక్టు చాలా బాగుంది');
  let d=a.context.adminGetOverview(DEMO_KEY);
  assert.equal(d.acceptedVotes,1);
  assert.equal(d.excludedVotes,1);
  assert.equal(a.sheets['Admin Action Log'].rows.length,2);
  a.context.adminSetVoteStatus(DEMO_KEY,2,legacy.rowProof,'VALID','Organizer restored this entry');
  assert.equal(a.feedbackRows[1][10],'');
  d=a.context.adminGetOverview(DEMO_KEY);
  assert.equal(d.acceptedVotes,2);
});

test('organizer can pause and resume ALL new votes without changing old feedback',()=>{
  const a=setup();
  const base={
    action:'save', project:'VoiceVote',studentClass:'9',section:'Keats',
    rating:'5',language:'en-IN',feedback:'A new valid vote',
    submissionId:'123e4567-e89b-42d3-a456-426614174000',
    deviceToken:'123e4567-e89b-42d3-a456-426614174001'
  };
  a.context.adminSetVotingOpen(DEMO_KEY,false,'Pause during the prize ceremony');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).votingOpen,false);
  const paused=a.context.doPost({parameter:base});
  assert.match(paused.html,/Feedback not confirmed/);
  assert.equal(a.feedbackRows.length,3,'Paused votes must not append');
  a.context.adminSetVotingOpen(DEMO_KEY,true,'Resume audience rating period');
  const saved=a.context.doPost({parameter:base});
  assert.match(saved.html,/Thank you! Feedback saved/);
  assert.equal(a.feedbackRows.length,4);
  assert.equal(a.context.adminGetOverview(DEMO_KEY).acceptedVotes,3);
  assert.equal(a.sheets['Admin Action Log'].rows.length,3);
});

test('admin frontend never embeds private feedback nor the admin key',()=>{
  const html=fs.readFileSync('apps-script/Admin.html','utf8');
  assert.match(html,/id="loginPanel"/);
  assert.match(html,/id="reviewPanel"/);
  assert.match(html,/id="votersPanel"/);
  assert.match(html,/adminGetReviews/);
  assert.match(html,/adminSetVoteStatus/);
  assert.doesNotMatch(html,/afc91f1a0a1b2e685269a01488122f43986bf7d8de45fc32483d9a33d1c54a69/);
  assert.doesNotMatch(html,/\bAIza[a-zA-Z0-9_-]+/);
  assert.ok(!html.includes('textContent = r.original + "<"'),'Review text must be rendered safely');
});


test('rankings use the documented weighted score, with no review text in overview',()=>{
  const a=setup();
  const ranked=a.context.adminGetOverview(DEMO_KEY);
  const first=ranked.projects.find(p=>p.project==='XenoChat');
  const second=ranked.projects.find(p=>p.project==='VoiceVote');
  assert.equal(first.votes,1);
  assert.equal(first.average,5);
  assert.equal(first.weighted,3.75,'One five-star rating and the five-vote prior');
  assert.equal(second.weighted,3.583);
  assert.equal(ranked.projects[0].project,'XenoChat');
  assert.equal(JSON.stringify(ranked).includes('Interesting use of AI'),false);
  const activity=a.context.adminGetVoterActivity(DEMO_KEY);
  assert.ok(activity.every(row=>
    !('original' in row) && !('translation' in row) &&
    !('deviceHash' in row) && !('submissionId' in row)));
});

test('on-demand private reviews are project-bound, paginated and require a key',()=>{
  const a=setup();
  const key=JSON.stringify(['6','Heidelberg','XenoChat']);
  for(let i=0;i<35;i++){
    a.feedbackRows.push([
      new Date('2026-11-05T00:00:00Z'),'XenoChat','6','Heidelberg',
      'Synthetic private review '+i,5,'en-IN','Synthetic translated text '+i,
      'test-id-'+i,'', ''
    ]);
  }
  const first=a.context.adminGetReviews(DEMO_KEY,key,0);
  const second=a.context.adminGetReviews(DEMO_KEY,key,30);
  assert.equal(first.total,36);
  assert.equal(first.reviews.length,30);
  assert.equal(second.total,36);
  assert.equal(second.reviews.length,6);
  assert.notEqual(first.reviews[0].original,second.reviews[0].original);
  assert.throws(()=>a.context.adminGetReviews('invalid',key,30),/denied/);
  assert.throws(()=>a.context.adminGetReviews(DEMO_KEY,'["999","none","unknown"]',0),/Unknown project/);
  assert.equal(a.sheets['Admin Action Log'],undefined,'Read-only reviews cannot create an audit sheet');
  assert.equal(a.feedbackRows.length,38,'Read-only request never removes an existing row');
});
