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
      this.disabled=false;this.children=[];this.listeners={};
      this.classList={toggle() {},add() {},remove() {}};
    }
    replaceChildren(...items) {this.children=[...items];}
    appendChild(el){this.children.push(el);return el;}
    add(el){this.children.push(el);}
    addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
    dispatchEvent(event){for(const fn of this.listeners[event.type] || [])fn.call(this,event);}
    click(){if(!this.disabled)this.dispatchEvent({type:'click'});}
    focus(){this.focused=true;}
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
