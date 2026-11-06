// Isolated event-day project-manager contracts. Never connects to Google.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');

const KEY='LOCAL_FAKE_PRIVATE_TEST_KEY_000000000000000000000001';
const HASH=createHash('sha256').update(KEY).digest('hex');

function harness() {
  const headers=['Class/Grade','Section','Project Name','Active','Project ID','Source Key','Session Header','Last Seen'];
  const data=[
    headers,
    [6,'Heidelberg','Xeno Chat App',true,'VVP-SIX','VI_HEIDELBERG|5|1','', ''],
    [9,'Keats','VoiceVote App',true,'VVP-NINE','IX_KEATS|7|1','',''],
    [9,'Keats','Offline Robot',false,'VVP-OFF','IX_KEATS|8|1','','']
  ];
  const feedback=[['Date','Project','Class','Section','Original Feedback','Rating','Language','English Translation','Submission ID','Device hash','Vote status','Pass serial','Project ID']];
  const sheets={};
  let reads=0,releaseCount=0,flushCount=0,failFlush=0,uuid=0;
  function sheet(rows){
    return {
      rows,
      getLastRow:()=>rows.length,
      getDataRange:()=>({getValues:()=>rows.map(r=>[...r]),getDisplayValues:()=>rows.map(r=>r.map(String))}),
      appendRow:row=>{rows.push([...row]);},
      getRange:(row,col,height=1,width=1)=>({
        getValues:()=>Array.from({length:height},(_,i)=>
          Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??'')),
        setValue:value=>{rows[row-1] ||= [];rows[row-1][col-1]=value;},
        setValues:values=>values.forEach((arr,i)=>arr.forEach((value,j)=>{
          rows[row-1+i] ||= [];rows[row-1+i][col-1+j]=value;
        }))
      })
    };
  }
  sheets.Projects=sheet(data);
  sheets.Feedback=sheet(feedback);
  const ss={
    getSheetByName:name=>sheets[name]||null,
    insertSheet:name=>{sheets[name]=sheet([]);return sheets[name];}
  };
  const context={
    SpreadsheetApp:{openById:()=>{reads++;return ss},flush:()=>{
      flushCount++;if(failFlush===flushCount)throw Error('Simulated flush crash');
    }},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){releaseCount++}})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},
      computeDigest:(_type,value)=>Array.from(createHash('sha256').update(String(value)).digest()),
      getUuid:()=>('123e4567-e89b-42d3-a456-'+String(++uuid).padStart(12,'0'))},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
    SpreadsheetAppId:'test', SPREADSHEET_ID:'test',
    safeSheetText_:v=>String(v)
  };
  vm.createContext(context);
  const source=fs.readFileSync('apps-script/AdminApi.gs','utf8').replace(
    /(VOICEVOTE_ADMIN_KEY_SHA256\s*=\s*')[a-f0-9]{64}(')/,
    (_m,a,b)=>a+HASH+b);
  vm.runInContext(source,context);
  vm.runInContext(fs.readFileSync('apps-script/ProjectManager.gs','utf8'),context);
  return {context,sheets,data,feedback,reads:()=>reads,lockReleases:()=>releaseCount,
    crashNextFlush:()=>{failFlush=flushCount+2}};
}
const input=(action,changes={})=>({
  action,grade:'9',section:'Keats',project:'Solar Powered Water Purifier',
  reason:'Teacher approved event-day project update',...changes
});

test('manager is private and does not open Sheets with invalid credentials',()=>{
  const a=harness();
  assert.throws(()=>a.context.adminGetManagedProjects(''),/denied/);
  assert.throws(()=>a.context.adminChangeProject('bad',input('ADD')),/denied/);
  assert.equal(a.reads(),0);
});
test('add project generates unique stable ID, source key and durable audit; does not touch Feedback',()=>{
  const a=harness(),before=JSON.stringify(a.feedback);
  const result=a.context.adminChangeProject(KEY,input('ADD'));
  assert.equal(result.success,true);
  assert.match(result.id,/^VVP-EVENT-[A-F0-9]{24}$/);
  assert.equal(a.data.length,5);
  assert.equal(a.data[4][2],'Solar Powered Water Purifier');
  assert.equal(a.data[4][3],true);
  assert.equal(a.data[4][4],result.id);
  assert.match(a.data[4][5],/^EVENT-20261107\|VVP-EVENT-/);
  assert.equal(JSON.stringify(a.feedback),before);
  const log=a.sheets['Admin Action Log'].rows;
  assert.equal(log[1][1],'ADD_PROJECT');
  assert.equal(log[1][5],'APPLIED');
  assert.equal(a.lockReleases(),1);
  assert.equal(a.context.adminGetManagedProjects(KEY).total,4);
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD')),/already exists/i);
  assert.equal(a.data.length,5);
});
test('disallows dangerous and duplicate titles, unknown grades/sections',()=>{
  const a=harness();
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD',{project:'=IMPORTXML("x")'})),/Invalid project name/);
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD',{project:'VoiceVote App'})),/already exists/);
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD',{project:'Offline Robot'})),/already exists/);
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD',{grade:'10'})),/existing class/);
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD',{section:'Missing'})),/section already registered/);
  assert.equal(a.data.length,4);
});
test('edits preserve immutable ID, stale versions rejected and legacy unkeyed votes protected',()=>{
  const a=harness(),projects=a.context.adminGetManagedProjects(KEY).projects;
  const original=projects.find(p=>p.id==='VVP-NINE');
  const update=input('EDIT',{id:original.id,expectedVersion:original.version,
    project:'VoiceVote AI App'});
  a.context.adminChangeProject(KEY,update);
  assert.equal(a.data[2][2],'VoiceVote AI App');
  assert.equal(a.data[2][4],'VVP-NINE');
  assert.equal(a.data[2][5],'IX_KEATS|7|1');
  assert.throws(()=>a.context.adminChangeProject(KEY,update),/changed since/);
  const fresh=a.context.adminGetManagedProjects(KEY).projects.find(p=>p.id==='VVP-NINE');
  a.feedback.push([new Date('2026-11-07T12:00:00Z'),'VoiceVote AI App','9','Keats',
    'Legacy','5','en-IN','Legacy','','','','','']);
  assert.throws(()=>a.context.adminChangeProject(KEY,input('EDIT',{
    id:fresh.id,expectedVersion:fresh.version,project:'Renamed Again'})),/Legacy votes/);
  assert.equal(a.data[2][2],'VoiceVote AI App');
});
test('deactivation is reversible, requires vote-impact confirmation and keeps stored feedback',()=>{
  const a=harness(),project=a.context.adminGetManagedProjects(KEY).projects.find(p=>p.id==='VVP-NINE');
  a.feedback.push([new Date(),'VoiceVote App','9','Keats','Loved it',5,'en-IN','Loved it',
    'synthetic','hash','','','VVP-NINE']);
  const payload=input('DEACTIVATE',{id:project.id,expectedVersion:project.version});
  assert.throws(()=>a.context.adminChangeProject(KEY,payload),/Confirm hiding/);
  assert.equal(a.data[2][3],true);
  a.context.adminChangeProject(KEY,{...payload,confirmAffectedVotes:true});
  assert.equal(a.data[2][3],false);
  assert.equal(a.feedback.length,2);
  assert.equal(a.context.adminGetManagedProjects(KEY).active,1);
  const newer=a.context.adminGetManagedProjects(KEY).projects.find(p=>p.id==='VVP-NINE');
  a.context.adminChangeProject(KEY,input('REACTIVATE',{id:newer.id,expectedVersion:newer.version}));
  assert.equal(a.data[2][3],true);
  assert.equal(a.data[2][4],'VVP-NINE');
  assert.equal(a.feedback.length,2);
});
test('unresolved crash after project change fails closed and prevents repeat writes',()=>{
  const a=harness();
  a.crashNextFlush();
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD')),/needs reconciliation/);
  assert.equal(a.data.length,5,'The project row may have committed before an audit flush failure');
  assert.equal(a.sheets['Admin Action Log'].rows[1][5],'PENDING');
  assert.throws(()=>a.context.adminChangeProject(KEY,input('ADD',{project:'Another Model'})),/Unresolved/);
  assert.equal(a.data.length,5,'No second mutation is allowed while audit pending');
});
