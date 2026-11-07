// Local-only Admin Console regression tests. No production key, Google services,
// spreadsheet reads/writes or live administrator sessions are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const html = fs.readFileSync('apps-script/Admin.html','utf8');
  class Element {
    constructor(id='') {
      this.id=id;this.value='';this.textContent='';this.hidden=false;
      this.disabled=false;this.children=[];this.listeners={};this.open=false;
      this.classList={toggle() {},add() {},remove() {}};
    }
    replaceChildren(...items) {this.children=[...items];}
    appendChild(el){this.children.push(el);return el;}
    add(el){this.children.push(el);}
    addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
    dispatchEvent(event){for(const fn of this.listeners[event.type] || [])fn.call(this,event);}
    click(){if(!this.disabled)this.dispatchEvent({type:'click'});}
    focus(){this.focused=true;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatchEvent({type:'close'});}
    scrollIntoView(){}
    select(){}
  }
  const elements = Object.fromEntries(
    [...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element(id)])
  );
  const document={
    getElementById: id => elements[id] || null,
    createElement: tag => new Element(tag)
  };
  const requests=[];
  function runner(success, failure) {
    return new Proxy({}, {get(_target,name) {
      if(name==='withSuccessHandler') return cb=>runner(cb,failure);
      if(name==='withFailureHandler') return cb=>runner(success,cb);
      return (...args)=>requests.push({name,args,success,failure});
    }});
  }
  const context={document,console,
    Option: function(label,value){this.textContent=label;this.value=value;},
    confirm:()=>true,prompt:()=>'Organizer-approved local test',
    navigator:{clipboard:null},
    google:{script:{run:runner(null,null)}}
  };
  context.window=context;
  const script=html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(script,'Admin inline controller must exist');
  vm.runInNewContext(script[1],context);
  const dispatch=(id,name='click')=>elements[id].dispatchEvent({
    type:name,preventDefault(){}
  });
  const login=(overview)=>{
    elements.adminKey.value='THIS-IS-A-FAKE-LOCAL-KEY-NOT-PRODUCTION';
    dispatch('loginForm','submit');
    const request=requests.at(-1);
    assert.equal(request.name,'adminGetOverview');
    request.success(overview);
  };
  return {elements,requests,dispatch,login};
}

function overview() {
  return {
    totalProjects:2,ratedProjects:2,acceptedVotes:2,excludedVotes:0,
    protectedVotes:1,legacyVotes:1,votingOpen:true,
    languages:[{code:'te-IN',votes:1},{code:'hi-IN',votes:1}],
    projects:[
      {id:'["6","Heidelberg","XenoChat"]',rank:1,grade:'6',
       section:'Heidelberg',project:'XenoChat',votes:1,average:5,weighted:3.75},
      {id:'["9","Keats","VoiceVote"]',rank:2,grade:'9',
       section:'Keats',project:'VoiceVote',votes:1,average:5,weighted:3.75}
    ]
  };
}

test('sign-out removes private results and drops delayed overview and voter RPCs',()=>{
  const a=harness();a.login(overview());
  assert.equal(a.elements.adminPanel.hidden,false);
  assert.equal(a.elements.rankingRows.children.length,2);
  a.dispatch('refreshBtn');
  const oldOverview=a.requests.at(-1);
  assert.equal(oldOverview.name,'adminGetOverview');
  a.dispatch('votersTab');
  const oldVoters=a.requests.at(-1);
  assert.equal(oldVoters.name,'adminGetVoterActivity');
  a.dispatch('logoutBtn');
  assert.equal(a.elements.adminPanel.hidden,true);
  assert.equal(a.elements.loginPanel.hidden,false);
  assert.equal(a.elements.adminKey.value,'');
  assert.equal(a.elements.rankingRows.children.length,0);
  assert.equal(a.elements.voterRows.children.length,0);
  assert.equal(a.elements.reviewsList.children.length,0);
  assert.equal(a.elements.voteCount.textContent,'');
  assert.equal(a.elements.adminStatus.textContent,'');
  oldOverview.success(overview());
  oldVoters.success([{time:'later',project:'private',grade:'9',section:'A',status:'VALID',protected:true}]);
  oldVoters.failure(new Error('late failure'));
  assert.equal(a.elements.rankingRows.children.length,0);
  assert.equal(a.elements.voterRows.children.length,0);
  assert.equal(a.elements.adminStatus.textContent,'');
});

test('review text is on demand, safely rendered, and cannot reappear after sign-out',()=>{
  const a=harness();a.login(overview());
  assert.equal(a.requests.filter(r=>r.name==='adminGetReviews').length,0);
  const button=a.elements.rankingRows.children[0].children.at(-1).children[0];
  button.click();
  const request=a.requests.at(-1);
  assert.equal(request.name,'adminGetReviews');
  assert.equal(request.args[2],0);
  assert.equal(a.elements.moreReviews.disabled,true);
  a.dispatch('moreReviews'); // even programmatic event must not duplicate an in-flight request
  assert.equal(a.requests.filter(r=>r.name==='adminGetReviews').length,1);
  const unsafe='<img src=x onerror=alert(1)>';
  request.success({total:2,reviews:[{
    rating:5,language:'te-IN',status:'VALID',original:unsafe,
    translation:'Great project',time:'2026-11-05'
  }]});
  assert.equal(a.elements.reviewsList.children.length,1);
  const reviewCard=a.elements.reviewsList.children[0];
  assert.equal(reviewCard.children[1].textContent,unsafe,
    'User-supplied comment must be rendered as plain text, not HTML');
  assert.equal(a.elements.moreReviews.disabled,false);
  a.dispatch('moreReviews');
  const second=a.requests.at(-1);
  assert.equal(second.name,'adminGetReviews');
  assert.equal(second.args[2],1);
  a.dispatch('logoutBtn');
  second.success({total:2,reviews:[{rating:1,language:'en-IN',status:'VALID',
    original:'late private review',translation:'late private review',time:'2026-11-05'}]});
  assert.equal(a.elements.reviewsList.children.length,0);
  assert.equal(a.elements.reviewsStatus.textContent,'');
});

test('switching projects invalidates older review pagination responses',()=>{
  const a=harness();a.login(overview());
  const buttons=a.elements.rankingRows.children.map(row=>row.children.at(-1).children[0]);
  buttons[0].click();
  const first=a.requests.at(-1);
  buttons[1].click();
  const second=a.requests.at(-1);
  first.success({total:1,reviews:[{rating:5,original:'wrong project',translation:'',
    language:'en-IN',status:'VALID',time:'2026-11-05'}]});
  assert.equal(a.elements.reviewsList.children.length,0);
  second.success({total:1,reviews:[{rating:4,original:'correct project',translation:'',
    language:'en-IN',status:'VALID',time:'2026-11-05'}]});
  assert.equal(a.elements.reviewsList.children.length,1);
  assert.equal(a.elements.reviewsList.children[0].children[1].textContent,'correct project');
});


test('unresolved audit warning is visible only during an authenticated admin session',()=>{
  const a=harness();
  a.login({...overview(),auditPendingActions:2});
  assert.equal(a.elements.auditAlert.hidden,false);
  assert.match(a.elements.auditAlert.textContent,/2 unresolved administrator action/);
  a.dispatch('logoutBtn');
  assert.equal(a.elements.auditAlert.hidden,true);
  assert.equal(a.elements.auditAlert.textContent,'');
});

test('faculty presenter session creates three private links and no public publication controls',()=>{
  const a=harness();
  a.login(overview());
  a.dispatch('createPresenterLink');
  const pending=a.requests.at(-1);
  assert.equal(pending.name,'adminCreatePresenterSession');
  const ticket='a'.repeat(64);
  pending.success({token:ticket,expiresInSeconds:7200});
  for(const id of ['ownerPresenterLink','ownerResultsDemoLink','ownerResultsLiveLink']){
    assert.equal(a.elements[id].hidden,false);
    assert.ok(a.elements[id].href.includes('#presenter='+ticket));
    assert.ok(!a.elements[id].href.includes('THIS-IS-A-FAKE-LOCAL-KEY'));
  }
  assert.ok(a.elements.ownerResultsDemoLink.href.includes('results.html'));
  assert.ok(a.elements.ownerResultsDemoLink.href.includes('view=demo'));
  assert.ok(a.elements.ownerResultsLiveLink.href.includes('view=live'));
  assert.ok(a.elements.ownerPresenterLink.href.endsWith('#presenter='+ticket));
  assert.equal(a.elements.publicDisplaySettings,undefined,
    'Old public results publication controls must be absent');
  assert.equal(a.elements.savePublicDisplayMode,undefined);
});

test('project rankings table scrolls vertically and horizontally with sticky headers',()=>{
  const html=fs.readFileSync('apps-script/Admin.html','utf8');
  assert.match(html, /#rankingsPanel \.table-wrap\s*\{[^}]*max-height:min\(65vh,640px\)/);
  assert.match(html, /#rankingsPanel \.table-wrap\s*\{[^}]*overflow-x:auto;overflow-y:scroll/);
  assert.match(html, /th\s*\{[^}]*position:sticky;top:0/);
  assert.match(html, /class="table-wrap" role="region" tabindex="0" aria-label="Scrollable project rankings"/);
  // The other Admin lists do not acquire a new restrictive max-height.
  assert.match(html, /<section id="votersPanel"[^>]*>[\s\S]*?<div class="table-wrap">/);
});


test('Admin overall and class-specific ranks are scoped correctly and unrated remain unranked',()=>{
  const a=harness();
  const data=overview();
  data.projects=[
    {...data.projects[0],rank:1,weighted:4.1,grade:'6',votes:3},
    {...data.projects[1],rank:2,weighted:4.0,grade:'9',votes:2},
    {id:'three',rank:3,grade:'9',section:'B',project:'Model Three',
      votes:1,average:5,weighted:3.9},
    {id:'four',rank:4,grade:'9',section:'C',project:'Unrated Model',
      votes:0,average:0,weighted:0}
  ];
  data.totalProjects=4;data.ratedProjects=3;data.acceptedVotes=6;
  a.login(data);
  const displayedRanks=()=>a.elements.rankingRows.children.map(tr=>tr.children[0].textContent);
  assert.deepEqual(displayedRanks(),['1','2','3','—'],
    'All classes has global rank without awards for unrated projects');
  assert.equal(a.elements.rankHeading.textContent,'Overall rank');
  a.elements.classFilter.value='9';
  a.dispatch('classFilter','change');
  assert.deepEqual(displayedRanks(),['1','2','—'],
    'Class 9 starts at 1, unlike the global positions 2 and 3');
  assert.equal(a.elements.rankHeading.textContent,'Grade rank');
  a.elements.rankSearch.value='Model Three';
  a.dispatch('rankSearch','input');
  assert.deepEqual(displayedRanks(),['2'],
    'Searching must not promote an existing grade #2 to #1');
});


test('event-day project tab uses authenticated RPCs and preserves immutable IDs on correction',()=>{
  const a=harness();
  a.login(overview());
  a.dispatch('projectsTab');
  const listing=a.requests.at(-1);
  assert.equal(listing.name,'adminGetManagedProjects');
  const projects=[
    {id:'VVP-SIX',grade:'6',section:'Heidelberg',project:'Xeno Chat App',
      active:true,sourceKey:'VI_HEIDELBERG|5|1',version:'immutable-version-six',votes:0},
    {id:'VVP-NINE',grade:'9',section:'Keats',project:'VoiceVote App',
      active:true,sourceKey:'IX_KEATS|7|1',version:'immutable-version-nine',votes:4}
  ];
  listing.success({projects,total:2,active:2,pendingAuditActions:0});
  assert.equal(a.elements.projectsPanel.hidden,false);
  a.elements.managerProject.value='VVP-NINE';
  a.dispatch('managerProject','change');
  assert.equal(a.elements.managerName.value,'VoiceVote App');
  assert.match(a.elements.managerImpact.textContent,/4 valid vote/);
  a.elements.managerName.value='VoiceVote AI Project';
  a.elements.managerReason.value='Teacher approved spelling correction';
  const beforeEdit=a.requests.length;
  a.dispatch('managerSave');
  assert.equal(a.elements.managerConfirmDialog.open,true);
  assert.equal(a.elements.managerConfirmTitle.textContent,'Save project corrections');
  assert.equal(a.elements.managerConfirmProject.textContent,'VoiceVote AI Project');
  assert.match(a.elements.managerConfirmRisk.textContent,/Permanent project ID stays VVP-NINE/);
  assert.equal(a.requests.length,beforeEdit,'Opening confirmation must never write');
  a.dispatch('managerConfirmProceed');
  assert.equal(a.elements.managerConfirmDialog.open,false);
  const edit=a.requests.at(-1);
  assert.equal(edit.name,'adminChangeProject');
  assert.equal(edit.args[1].action,'EDIT');
  assert.equal(edit.args[1].id,'VVP-NINE');
  assert.equal(edit.args[1].expectedVersion,'immutable-version-nine');
  assert.equal(edit.args[1].project,'VoiceVote AI Project');
  assert.equal(edit.args[1].reason,'Teacher approved spelling correction');
  edit.success({changed:true,id:'VVP-NINE',project:'VoiceVote AI Project'});
  assert.ok(a.requests.some(r=>r.name==='adminGetOverview'));
  assert.equal(a.requests.at(-1).name,'adminGetManagedProjects');
});

test('event-day Admin can stage add, deactivation and reactivate with no browser vote',()=>{
  const a=harness();
  a.login(overview());
  a.dispatch('projectsTab');
  a.requests.at(-1).success({projects:[
    {id:'VVP-NINE',grade:'9',section:'Keats',project:'VoiceVote App',
      active:true,sourceKey:'IX_KEATS|7|1',version:'digest',votes:2}
  ],total:1,active:1,pendingAuditActions:0});
  a.elements.managerGrade.value='9';
  a.dispatch('managerGrade','change');
  a.elements.managerSection.value='Keats';
  a.elements.managerName.value='Solar Purifier';
  a.elements.managerReason.value='Approved after morning roll call';
  const initialCalls=a.requests.length;
  a.dispatch('managerForm','submit');
  assert.equal(a.elements.managerConfirmDialog.open,true);
  assert.equal(a.elements.managerConfirmTitle.textContent,'Add new project');
  assert.equal(a.requests.length,initialCalls);
  a.dispatch('managerConfirmCancel');
  assert.equal(a.elements.managerConfirmDialog.open,false);
  assert.equal(a.requests.length,initialCalls,'Cancel must not invoke Admin mutations');
  a.dispatch('managerForm','submit');
  a.dispatch('managerConfirmProceed');
  const add=a.requests.at(-1);
  assert.equal(add.name,'adminChangeProject');
  assert.equal(add.args[1].action,'ADD');
  assert.equal(add.args[1].id,'');
  assert.equal(add.args[1].grade,'9');
  assert.equal(add.args[1].section,'Keats');
  assert.equal(add.args[1].project,'Solar Purifier');
  assert.doesNotMatch(JSON.stringify(add.args),/action=save/);
  add.failure(new Error('Synthetic rejection — no mutation'));
  a.elements.managerProject.value='VVP-NINE';
  a.dispatch('managerProject','change');
  a.elements.managerReason.value='Project temporarily withdrawn by teacher';
  a.dispatch('managerDeactivate');
  assert.equal(a.elements.managerConfirmDialog.open,true);
  assert.match(a.elements.managerConfirmRisk.textContent,/hide 2 valid vote/);
  a.dispatch('managerConfirmProceed');
  const deactivate=a.requests.at(-1);
  assert.equal(deactivate.args[1].action,'DEACTIVATE');
  assert.equal(deactivate.args[1].expectedVersion,'digest');
  assert.equal(deactivate.args[1].confirmAffectedVotes,true);
  assert.equal(a.elements.managerDeactivate.disabled,true);
  assert.ok(!a.requests.some(r=>r.name==='doPost'||r.name==='saveFeedback'));
});

test('sign-out closes project confirmation without dispatching any pending edit',()=>{
  const a=harness();a.login(overview());a.dispatch('projectsTab');
  a.requests.at(-1).success({projects:[{
    id:'VVP-NINE',grade:'9',section:'Keats',project:'VoiceVote App',
    active:true,sourceKey:'IX_KEATS|7|1',version:'version-1',votes:0
  }],total:1,active:1,pendingAuditActions:0});
  a.elements.managerProject.value='VVP-NINE';a.dispatch('managerProject','change');
  a.elements.managerReason.value='Teacher approved temporary deactivation';
  const before=a.requests.length;
  a.dispatch('managerDeactivate');
  assert.equal(a.elements.managerConfirmDialog.open,true);
  a.dispatch('logoutBtn');
  assert.equal(a.elements.managerConfirmDialog.open,false);
  a.dispatch('managerConfirmProceed');
  assert.equal(a.requests.length,before,'Stale confirmation must not mutate after logout');
  assert.equal(a.elements.managerConfirmProject.textContent,'');
});


test('Admin Pause/Resume controls call only private audited RPCs and update visible states',()=>{
  const a=harness();a.login(overview());
  assert.equal(a.elements.pauseBtn.disabled,false);
  assert.equal(a.elements.resumeBtn.disabled,true);
  const before=a.requests.length;
  a.dispatch('pauseBtn');
  assert.equal(a.requests.length,before+1);
  const pause=a.requests.at(-1);
  assert.equal(pause.name,'adminSetVotingOpen');
  assert.equal(pause.args[1],false);
  assert.ok(pause.args[0].length>20,'Existing private admin key must be included');
  assert.ok(pause.args[2].length>=8,'Organizer reason required');
  assert.match(a.elements.adminStatus.textContent,/Saving voting control/);
  pause.success({votingOpen:false,changed:true});
  const pausedOverview=a.requests.at(-1);
  assert.equal(pausedOverview.name,'adminGetOverview');
  pausedOverview.success({...overview(),votingOpen:false});
  assert.match(a.elements.votingState.textContent,/Voting is PAUSED/i);
  assert.equal(a.elements.pauseBtn.disabled,true);
  assert.equal(a.elements.resumeBtn.disabled,false);
  a.dispatch('resumeBtn');
  const resume=a.requests.at(-1);
  assert.equal(resume.name,'adminSetVotingOpen');
  assert.equal(resume.args[1],true);
  resume.success({votingOpen:true,changed:true});
  const resumedOverview=a.requests.at(-1);
  resumedOverview.success({...overview(),votingOpen:true});
  assert.match(a.elements.votingState.textContent,/Voting is OPEN/i);
  assert.equal(a.elements.pauseBtn.disabled,false);
  assert.equal(a.elements.resumeBtn.disabled,true);
  assert.equal(a.requests.filter(r=>r.name==='adminChangeProject'||r.name==='doPost').length,0,
    'No test project or real vote is created by this simulation');
});
