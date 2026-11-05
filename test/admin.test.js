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
function setup(projectRows=PROJECTS, aliasRows=[]) {
  let sheetOpens = 0;
  const props = new Map();
  const sheets = {};
  const faults = { auditAppend:false, auditFinalize:false, auditFlush:false,
    failOnFlush:0, feedbackWrite:false, propertyWrite:false };
  let uuidCounter = 0, flushCount = 0;
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
      setValue: value => {
        if (faults.feedbackWrite) throw new Error('Simulated feedback write failure');
        feedbackRows[r-1][c-1] = value;return feedback;
      }
    }),
    appendRow: row => feedbackRows.push([...row])
  };
  sheets.Feedback = feedback;
  sheets.Projects = {getDataRange:()=>({getDisplayValues:()=>projectRows})};
  if (aliasRows.length) {
    sheets['Roster Rename Aliases'] = {
      getLastRow:()=>aliasRows.length+1,
      getRange:()=>({getValues:()=>aliasRows})
    };
  }
  const ss = {
    getSheetByName: name => sheets[name]||null,
    insertSheet: name => {
      const rows = [];
      const sheet = {
        rows,
        getLastRow: () => rows.length,
        appendRow: r => {
          if (faults.auditAppend && name === 'Admin Action Log' && r[0] !== 'Date') {
            throw new Error('Simulated audit append failure');
          }
          rows.push([...r]);
        },
        getRange: (r,c,h=1,w=1) => ({
          getValues: () => Array.from({length:h},(_,i) =>
            Array.from({length:w},(_,j)=>rows[r+i-1]?.[c+j-1] ?? '')),
          setValue: value => {
            if (faults.auditFinalize && name === 'Admin Action Log' && c === 6) {
              throw new Error('Simulated audit finalization failure');
            }
            rows[r-1] ||= [];rows[r-1][c-1] = value;
          },
          setValues: values => values.forEach((a,i)=>a.forEach((v,j)=>{
            rows[r+i-1] ||= [];rows[r+i-1][c+j-1] = v;
          }))
        })
      };
      sheets[name]=sheet;
      return sheet;
    }
  };
  const context = {
    Date, JSON, Math,
    ContentService:{MimeType:{JAVASCRIPT:'javascript'},createTextOutput:t=>({text:t,setMimeType(){return this}})},
    SpreadsheetApp:{openById:()=>{sheetOpens++;return ss},
      flush:()=>{
        flushCount++;
        if(faults.auditFlush || faults.failOnFlush === flushCount) {
          throw new Error('Simulated audit flush failure');
        }
      }},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>props.get(k) ?? null,
      setProperty:(k,v)=>{
        if(faults.propertyWrite)throw new Error('Simulated property write failure');
        props.set(k,String(v));
      }
    })},
    HtmlService:{
      createHtmlOutputFromFile:name=>({name,setTitle(t){this.title=t;return this}}),
      createHtmlOutput:html=>({html,setTitle(t){this.title=t;return this}})
    },
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},
      computeDigest:(_,v)=>Array.from(createHash('sha256').update(String(v)).digest()),
      getUuid:()=> 'fake-audit-id-' + ++uuidCounter},
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
  return {context,props,sheets,feedbackRows,faults,opens:()=>sheetOpens};
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


test('audit append failure prevents moderation, preserves vote and creates no secret log',()=>{
  const a=setup();
  const vote=a.context.adminGetVoterActivity(DEMO_KEY).find(x=>x.row===2);
  a.faults.auditAppend=true;
  assert.throws(()=>a.context.adminSetVoteStatus(DEMO_KEY,2,vote.rowProof,'VOID',
    'Exclude because this was a duplicate'),/audit append/);
  assert.equal(a.feedbackRows[1][10],'','Feedback vote must not change when journal append fails');
  assert.equal(a.feedbackRows[1][4],'ఈ ప్రాజెక్టు చాలా బాగుంది');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,0);
  assert.equal(a.sheets['Admin Action Log'].rows.length,1,'Header may exist, but no mutation');
});

test('audit flush failure blocks the protected write and unresolved intent blocks retry',()=>{
  const a=setup();
  a.faults.auditFlush=true;
  assert.throws(()=>a.context.adminSetVotingOpen(DEMO_KEY,false,'Pause for morning break'),
    /audit flush/);
  assert.equal(a.props.has('VOICEVOTE_VOTING_DISABLED'),false);
  assert.equal(a.sheets['Admin Action Log'].rows[1][5],'PENDING');
  a.faults.auditFlush=false;
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,1);
  assert.throws(()=>a.context.adminSetVotingOpen(DEMO_KEY,false,'Retry same pause event'),
    /Unresolved PENDING admin audit/);
  assert.equal(a.props.has('VOICEVOTE_VOTING_DISABLED'),false);
  assert.equal(a.sheets['Admin Action Log'].rows.length,2,
    'Unsafe retries must not append another event');
});

test('audit finalize failure leaves visible PENDING journal and prevents further changes',()=>{
  const a=setup();
  const vote=a.context.adminGetVoterActivity(DEMO_KEY).find(x=>x.row===2);
  a.faults.auditFinalize=true;
  assert.throws(()=>a.context.adminSetVoteStatus(DEMO_KEY,2,vote.rowProof,'VOID',
    'Exclude after independent review'),/needs reconciliation/);
  assert.equal(a.feedbackRows[1][10],'VOID','Write may have succeeded before audit finalization');
  assert.equal(a.feedbackRows.length,3,'No feedback row may be deleted');
  const record=a.sheets['Admin Action Log'].rows[1];
  assert.equal(record[1],'EXCLUDE_VOTE');
  assert.equal(record[2],2);
  assert.equal(record[5],'PENDING');
  assert.equal(record[7],'VALID');
  assert.equal(record[8],'VOID');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,1);
  assert.equal(a.context.adminGetOverview(DEMO_KEY).excludedVotes,1);
  assert.throws(()=>a.context.adminSetVotingOpen(DEMO_KEY,false,'Attempt unrelated pause now'),
    /Unresolved PENDING admin audit/);
  assert.equal(a.props.has('VOICEVOTE_VOTING_DISABLED'),false);
});

test('protected property write failure leaves intent without claiming applied change',()=>{
  const a=setup();
  a.faults.propertyWrite=true;
  assert.throws(()=>a.context.adminSetVotingOpen(DEMO_KEY,false,'Pause before awards start'),
    /needs reconciliation/);
  assert.equal(a.context.adminGetOverview(DEMO_KEY).votingOpen,true);
  const entry=a.sheets['Admin Action Log'].rows[1];
  assert.equal(entry[1],'PAUSE_VOTING');
  assert.equal(entry[5],'PENDING');
  assert.equal(entry[7],'OPEN');
  assert.equal(entry[8],'PAUSED');
});

test('successful journal entry marks APPLIED and legacy log rows remain intact',()=>{
  const a=setup();
  const vote=a.context.adminGetVoterActivity(DEMO_KEY).find(x=>x.row===2);
  a.context.adminSetVoteStatus(DEMO_KEY,2,vote.rowProof,'VOID',
    'Exclusion explicitly authorized');
  const journal=a.sheets['Admin Action Log'];
  assert.equal(journal.rows[1][5],'APPLIED');
  assert.match(journal.rows[1][6],/^fake-audit-id-/);
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,0);
  // Simulate a five-column sheet created by the earlier app release.
  journal.rows[0]=journal.rows[0].slice(0,5);
  journal.rows.splice(1,1,[new Date(),'PAUSE_VOTING','','Prior action','Admin credential']);
  a.context.adminSetVotingOpen(DEMO_KEY,false,'New audited pause action');
  assert.equal(journal.rows[1].length,5,'Legacy record must be unchanged');
  assert.equal(journal.rows[0][5],'State');
  assert.equal(journal.rows[2][5],'APPLIED');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,0);
});


test('target flush failure leaves durable PENDING instead of an inaccurate APPLIED audit',()=>{
  const a=setup();
  const vote=a.context.adminGetVoterActivity(DEMO_KEY).find(x=>x.row===2);
  a.faults.failOnFlush=2; // First flush persists journal; second flush targets data.
  assert.throws(()=>a.context.adminSetVoteStatus(DEMO_KEY,2,vote.rowProof,'VOID',
    'Failure while flushing the protected change'),/needs reconciliation/);
  assert.equal(a.feedbackRows[1][10],'VOID',
    'In-memory target may have changed even when persistence confirmation failed');
  const log=a.sheets['Admin Action Log'].rows;
  assert.equal(log[1][5],'PENDING','Must not report APPLIED before target flush succeeds');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,1);
  assert.throws(()=>a.context.adminSetVotingOpen(DEMO_KEY,false,
    'Unsafe additional change blocked'),/Unresolved PENDING admin audit/);
});


test('explicit owner reconciliation can unblock future changes without erasing intent',()=>{
  const a=setup();
  a.faults.auditFlush=true;
  assert.throws(()=>a.context.adminSetVotingOpen(DEMO_KEY,false,
    'Simulate intent-flush uncertainty'),/audit flush failure/);
  a.faults.auditFlush=false;
  const journal=a.sheets['Admin Action Log'];
  assert.equal(journal.rows[1][5],'PENDING');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,1);
  assert.equal(a.context.adminGetOverview(DEMO_KEY).votingOpen,true);
  // Simulates the OWNER checking that no property change occurred, recording
  // evidence separately and explicitly marking the original intent NOT_APPLIED.
  journal.rows[1][5]='NOT_APPLIED';
  assert.equal(a.context.adminGetOverview(DEMO_KEY).auditPendingActions,0);
  a.context.adminSetVotingOpen(DEMO_KEY,false,'New authorized pause after investigation');
  assert.equal(a.context.adminGetOverview(DEMO_KEY).votingOpen,false);
  assert.equal(journal.rows.length,3,'Original intent is retained, not removed');
  assert.equal(journal.rows[1][5],'NOT_APPLIED');
  assert.equal(journal.rows[2][5],'APPLIED');
});


test('renamed project retains legacy feedback ranking via stable ID and reviewed alias',()=>{
  const newCatalog=[
    ['Class/Grade','Section','Project Name','Active','Project ID'],
    ['6','Heidelberg','AI XenoChat','TRUE','LEG-6-HEIDELBERG-XENOCHAT'],
    ['9','Keats','VoiceVote','TRUE','LEG-9-KEATS-VOICEVOTE']
  ];
  const a=setup(newCatalog,[
    ['LEG-6-HEIDELBERG-XENOCHAT','6','Heidelberg','XenoChat',
     '6','Heidelberg','AI XenoChat','2026-11-05','VI_HEIDELBERG|1|1',
     'Organizer-verified rename','School organizer']
  ]);
  let data=a.context.adminGetOverview(DEMO_KEY);
  const renamed=data.projects.find(x=>x.project==='AI XenoChat');
  assert.equal(renamed.id,'LEG-6-HEIDELBERG-XENOCHAT');
  assert.equal(renamed.votes,1,'Historic votes follow the same team');
  assert.equal(renamed.weighted,3.75);
  assert.equal(a.context.adminGetReviews(DEMO_KEY,renamed.id,0).total,1);
  assert.equal(a.feedbackRows[1][1],'XenoChat','Historical text remains unchanged');
  assert.equal(a.feedbackRows.length,3,'Read-only view never appends data');
  // A new ID-linked feedback row also resolves after renaming.
  a.feedbackRows.push([
    new Date('2026-11-05T12:00:00Z'),'AI XenoChat','6','Heidelberg',
    'Synthetic vote',5,'en-IN','Synthetic vote','test-new-id','', '',
    '','LEG-6-HEIDELBERG-XENOCHAT'
  ]);
  data=a.context.adminGetOverview(DEMO_KEY);
  assert.equal(data.projects.find(x=>x.project==='AI XenoChat').votes,2);
  assert.equal(a.context.adminGetReviews(DEMO_KEY,renamed.id,0).total,2);
});

test('unreviewed old title does not silently join a renamed project',()=>{
  const a=setup([
    ['Class/Grade','Section','Project Name','Active','Project ID'],
    ['6','Heidelberg','New Name','TRUE','LEG-6-HEIDELBERG-XENOCHAT'],
    ['9','Keats','VoiceVote','TRUE','LEG-9-KEATS-VOICEVOTE']
  ]);
  const d=a.context.adminGetOverview(DEMO_KEY);
  assert.equal(d.projects.find(x=>x.project==='New Name').votes,0);
  assert.equal(d.acceptedVotes,1);
  assert.equal(a.feedbackRows[1][1],'XenoChat');
});

test('conflicting old-title alias fails closed rather than moving a vote',()=>{
  const a=setup([
    ['Class/Grade','Section','Project Name','Active','Project ID'],
    ['6','Heidelberg','XenoChat','TRUE','LEG-6-HEIDELBERG-XENOCHAT'],
    ['9','Keats','VoiceVote','TRUE','LEG-9-KEATS-VOICEVOTE']
  ],[
    ['LEG-9-KEATS-VOICEVOTE','6','Heidelberg','XenoChat',
     '9','Keats','VoiceVote','2026-11-05','','Bad alias','']
  ]);
  assert.throws(()=>a.context.adminGetOverview(DEMO_KEY),/Conflicting project rename alias/);
});
