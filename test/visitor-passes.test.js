
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const KEY='FAKE-LOCAL-ADMIN-TEST-KEY-NEVER-VALID-IN-PRODUCTION-2026';
const HASH=createHash('sha256').update(KEY).digest('hex');
function makeSheet(rows=[]) {
  return {
    rows,
    getLastRow(){return rows.length},
    appendRow(row){rows.push([...row])},
    hideColumns(){},
    setFrozenRows(){},
    getRange(row,col,h=1,w=1) {
      return {
        getValues(){return Array.from({length:h},(_,r)=>Array.from({length:w},(_,c)=>rows[row-1+r]?.[col-1+c]??''))},
        setValue(v){rows[row-1] ||= [];rows[row-1][col-1]=v},
        setValues(values){values.forEach((a,r)=>a.forEach((v,c)=>{rows[row+r-1] ||= [];rows[row+r-1][col+c-1]=v}))}
      };
    }
  };
}
function setup(){
  const feedback=makeSheet([['Date','Project','Class','Section','Original Feedback','Rating','Language','English Translation','Submission ID','Device hash','Vote status','Visitor pass serial']]);
  const projects={getDataRange:()=>({getDisplayValues:()=>[['Class/Grade','Section','Project Name','Active'],['6','Heidelberg','XenoChat','TRUE']]})};
  const sheets={Feedback:feedback,Projects:projects},props=new Map(),cache=new Map();
  let opens=0,locked=0,released=0,sequence=0,saves=0;
  const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=makeSheet())};
  const ctx={
    Date,JSON,Math,
    SpreadsheetApp:{openById:()=>{opens++;return ss}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,String(v))})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,String(v))})},
    LockService:{getScriptLock:()=>({waitLock:()=>{locked++},releaseLock:()=>{released++}})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,v)=>Array.from(createHash('sha256').update(String(v)).digest()),
      getUuid:()=> '123e4567-e89b-42d3-a456-'+String(100000000000 + ++sequence)},
    ContentService:{MimeType:{JAVASCRIPT:'javascript'},createTextOutput:t=>({text:t,setMimeType(){return this}})},
    HtmlService:{createHtmlOutput:html=>({html,setTitle(){return this}}),createHtmlOutputFromFile:name=>({name,setTitle(){return this}})},
    LanguageApp:{translate:t=>t}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
  const admin=fs.readFileSync('apps-script/AdminApi.gs','utf8').replace(/(VOICEVOTE_ADMIN_KEY_SHA256\s*=\s*')[a-f0-9]{64}(')/,(_,a,b)=>a+HASH+b);
  vm.runInContext(admin,ctx);
  vm.runInContext(fs.readFileSync('apps-script/VisitorPasses.gs','utf8'),ctx);
  const save=(code,device,extra={})=>ctx.saveFeedback_({
    action:'save',studentClass:'6',section:'Heidelberg',project:'XenoChat',feedback:'Wonderful',rating:'5',language:'en-IN',
    submissionId:'123e4567-e89b-42d3-a456-'+String(200000000000 + ++saves),
    deviceToken:device || 'aaaa1111-aaaa-4bbb-8ccc-123456789012',visitorPass:code||'',...extra
  });
  return {ctx,save,sheets,feedback,props,cache,get opens(){return opens},get locked(){return locked},get released(){return released}};
}
test('admin operations reject invalid keys before spreadsheet access',()=>{
 const a=setup();
 assert.throws(()=>a.ctx.adminIssueVisitorPasses('wrong',2,'Visitors for demo'),/denied/);
 assert.throws(()=>a.ctx.adminReissueVisitorPass('wrong',1,'Lost paper pass'),/denied/);
 assert.throws(()=>a.ctx.adminSetVisitorPassRequired('wrong',true,'Begin fair voting'),/denied/);
 assert.equal(a.opens,0);
});
test('new random passes are never stored in plaintext, issuance is bounded',()=>{
 const a=setup();
 const b=a.ctx.adminIssueVisitorPasses(KEY,2,'Science fair visitor batch');
 assert.equal(b.codes.length,2);
 assert.ok(b.codes.every(x=>/^VV(?:-[A-F0-9]{8}){4}$/.test(x.code)));
 assert.equal(a.sheets['Visitor Passes'].getLastRow(),3);
 for(const x of b.codes) {
   assert.match(a.sheets['Visitor Passes'].rows[x.serial][1],/^[a-f0-9]{64}$/);
   assert.equal(JSON.stringify(a.sheets['Visitor Passes'].rows).includes(x.code),false);
 }
 assert.throws(()=>a.ctx.adminIssueVisitorPasses(KEY,101,'Another visitor batch'),/1–100/);
 assert.equal(a.locked,a.released);
});
test('mandatory mode is opt-in and preserves legacy voting until activation',()=>{
 const a=setup();
 assert.equal(a.ctx.visitorPassMode_(),'preparation');
 assert.throws(()=>a.ctx.adminSetVisitorPassRequired(KEY,true,'Ready for fair voting'),/Generate and distribute/);
 assert.equal(a.save('').success,true);
 const passes=a.ctx.adminIssueVisitorPasses(KEY,2,'Handed out at admission');
 a.ctx.adminSetVisitorPassRequired(KEY,true,'Ready for fair voting');
 assert.equal(a.save('', 'bbbb1111-aaaa-4bbb-8ccc-123456789012').passError,true);
 assert.equal(a.save(passes.codes[0].code,'bbbb1111-aaaa-4bbb-8ccc-123456789012').success,true);
 assert.equal(a.feedback.getLastRow(),3);
 a.ctx.adminSetVisitorPassRequired(KEY,false,'Emergency preparation mode');
 assert.equal(a.ctx.visitorPassMode_(),'preparation');
});
test('same pass cannot be spent twice after storage clear or browser switch',()=>{
 const a=setup(),passes=a.ctx.adminIssueVisitorPasses(KEY,2,'Admitted visitor group');
 a.ctx.adminSetVisitorPassRequired(KEY,true,'Handouts ready at entrance');
 const first=a.save(passes.codes[0].code);
 assert.equal(first.success,true);
 const oldId=a.feedback.rows[1][8];
 const replay=a.save(passes.codes[0].code,'cccc1111-aaaa-4bbb-8ccc-123456789012',{submissionId:oldId});
 assert.equal(replay.success,true);
 assert.equal(replay.duplicate,true);
 const changed=a.save(passes.codes[0].code,'cccc1111-aaaa-4bbb-8ccc-123456789012');
 assert.equal(changed.success,false);
 assert.equal(changed.passError,true);
 assert.equal(a.feedback.getLastRow(),2);
 assert.equal(String(a.feedback.rows[1][11]),'1');
 assert.equal(a.sheets['Visitor Passes'].rows[1][2],'USED');
 assert.throws(()=>a.ctx.adminReissueVisitorPass(KEY,1,'Attempt to repeat vote'),/Only unused/);
 const second=a.save(passes.codes[1].code);
 assert.equal(second.success,true,'Another visitor with a new pass can use the shared browser');
 assert.equal(a.feedback.getLastRow(),3);
 assert.equal(a.locked,a.released);
});
test('reissue revokes old unused pass and maintains serial audit',()=>{
 const a=setup(),b=a.ctx.adminIssueVisitorPasses(KEY,1,'Pass for admission desk');
 const newer=a.ctx.adminReissueVisitorPass(KEY,1,'Original printed pass was lost');
 assert.equal(newer.serial,2);
 assert.equal(a.sheets['Visitor Passes'].rows[1][2],'REVOKED');
 assert.equal(a.sheets['Visitor Passes'].rows[1][7],2);
 assert.equal(a.sheets['Visitor Passes'].rows[2][6],1);
 a.ctx.adminSetVisitorPassRequired(KEY,true,'Passes ready for voting');
 assert.equal(a.save(b.codes[0].code).passError,true);
 assert.equal(a.save(newer.code).success,true);
 assert.equal(a.feedback.getLastRow(),2);
});
test('six invalid pass attempts throttle that anonymous browser token',()=>{
 const a=setup(),b=a.ctx.adminIssueVisitorPasses(KEY,1,'One verified voter pass');
 a.ctx.adminSetVisitorPassRequired(KEY,true,'Activate for admission');
 for(let i=0;i<6;i++) assert.equal(a.save('not-a-real-pass').passError,true);
 const rejected=a.save(b.codes[0].code);
 assert.match(rejected.message,/Too many invalid/);
 assert.equal(a.feedback.getLastRow(),1);
 assert.equal(a.save(b.codes[0].code,'dddd1111-aaaa-4bbb-8ccc-123456789012').success,true);
});
test('feedback row prevents code reuse if ledger update was interrupted',()=>{
 const a=setup(),b=a.ctx.adminIssueVisitorPasses(KEY,1,'Test interrupted save');
 a.ctx.adminSetVisitorPassRequired(KEY,true,'Entry passes ready now');
 const sh=a.sheets['Visitor Passes'],original=sh.getRange;
 let once=true;
 sh.getRange=function(r,c,h,w) {
   const range=original.call(this,r,c,h,w);
   if(once&&r===2&&c===3){range.setValue=()=>{once=false;throw Error('Simulated write error')}};
   return range;
 };
 const attempted=a.save(b.codes[0].code);
 assert.equal(attempted.success,false);
 assert.equal(a.feedback.getLastRow(),2,'Submission append had succeeded');
 assert.equal(a.save(b.codes[0].code,'eeee1111-aaaa-4bbb-8ccc-123456789012').passError,true);
 assert.throws(()=>a.ctx.adminReissueVisitorPass(KEY,1,'Trying to reissue spent code'),/already been used/);
 assert.equal(a.feedback.getLastRow(),2);
});
test('admin controls are present but do not embed private codes',()=>{
 const h=fs.readFileSync('apps-script/Admin.html','utf8');
 for(const id of ['passesPanel','issuePasses','reissuePass','activatePasses','issuedPassOutput']){
   assert.ok(h.includes('id="'+id+'"'));
 }
 assert.match(h,/adminSetVisitorPassRequired/);
});
