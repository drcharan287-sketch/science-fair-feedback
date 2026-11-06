/* VoiceVote PRIVATE faculty/student presentation screen.
   No real data or even demo screen is shown until a temporary owner-issued
   presenter ticket is validated by Apps Script on each refresh.
   Anonymous publicResults API always responds DEMO. No vote submission.
   All untrusted DOM strings use textContent, never innerHTML. */
(() => {
  'use strict';
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec';
  const $ = id => document.getElementById(id);
  const LANGUAGES = {
    'en-IN':'English','as-IN':'Assamese','bn-IN':'Bengali','brx-IN':'Bodo',
    'doi-IN':'Dogri','gu-IN':'Gujarati','hi-IN':'Hindi','kn-IN':'Kannada',
    'ks-IN':'Kashmiri','gom-IN':'Konkani','mai-IN':'Maithili','ml-IN':'Malayalam',
    'mni-Mtei-IN':'Manipuri','mr-IN':'Marathi','ne-IN':'Nepali','or-IN':'Odia',
    'pa-IN':'Punjabi','sa-IN':'Sanskrit','sat-Olck-IN':'Santali','sd-IN':'Sindhi',
    'ta-IN':'Tamil','te-IN':'Telugu','ur-IN':'Urdu'
  };
  const DEMO_RANKINGS = Object.freeze([
    {id:'demo-01',grade:'3',section:'Sample Section A',project:'Future Green City',votes:94,weighted:4.71,rank:1},
    {id:'demo-02',grade:'3',section:'Sample Section B',project:'Amazing Nature Explorer',votes:82,weighted:4.62,rank:2},
    {id:'demo-03',grade:'6',section:'Sample Section C',project:'Water-Saving Wonder',votes:118,weighted:4.84,rank:1},
    {id:'demo-04',grade:'6',section:'Sample Section D',project:'Solar Energy Lab',votes:86,weighted:4.72,rank:2},
    {id:'demo-05',grade:'9',section:'Sample Section E',project:'Future Mobility Project',votes:104,weighted:4.86,rank:1},
    {id:'demo-06',grade:'9',section:'Sample Section F',project:'AI for a Better Tomorrow',votes:96,weighted:4.69,rank:2}
  ]);
  const DEMO_FEEDBACK = {
    'demo-01':[{rating:5,language:'te-IN',original:'ఈ పచ్చని నగరం చాలా బాగుంది.',translation:'This green city is very good.'}],
    'demo-02':[{rating:5,language:'hi-IN',original:'प्रकृति के बारे में बहुत अच्छी जानकारी मिली।',translation:'I learned a lot about nature.'}],
    'demo-03':[{rating:5,language:'en-IN',original:'The water-saving model was practical.',translation:'The water-saving model was practical.'}],
    'demo-04':[{rating:4,language:'te-IN',original:'సౌర శక్తి వివరణ స్పష్టంగా ఉంది.',translation:'The solar energy explanation was clear.'}],
    'demo-05':[{rating:5,language:'en-IN',original:'A creative transport model.',translation:'A creative transport model.'}],
    'demo-06':[{rating:5,language:'hi-IN',original:'एआई का उपयोग रचनात्मक है।',translation:'The use of AI is creative.'}]
  };
  const launch = new URLSearchParams(String(window.location.hash || '').replace(/^#/,''));
  const presenterToken = String(launch.get('presenter') || '');
  let presenterVerified=false, presenterView=launch.get('view')==='live'?'LIVE':'DEMO';
  let mode='DEMO', current=null, selectedGrade='all', intervalId=null;
  let requestInFlight=false, sequence=0, lastCatalogCount=null;
  let reviewProject=null,reviewOffset=0,reviewEpoch=0,reviewBusy=false,reviewCleanup=null,reviewTrigger=null;
  function denyAccess(message) {
    closeReviews(true);
    presenterVerified=false;current=null;mode='DEMO';selectedGrade='all';
    if(intervalId){clearInterval(intervalId);intervalId=null;}
    $('pageShell').hidden=true;
    $('presenterBar').hidden=true;
    $('liveBannerControls').hidden=true;
    $('presenterAccessGate').hidden=false;
    put('presenterAccessMessage',message ||
      'Access has expired. Create a new presenter link from the authenticated Admin Console.');
  }
  function present() {
    if(!presenterVerified)return;
    mode=presenterView==='LIVE'&&current?'PUBLISHED':'DEMO';
    $('presenterShowDemo').setAttribute('aria-pressed',String(presenterView==='DEMO'));
    $('presenterShowLive').setAttribute('aria-pressed',String(presenterView==='LIVE'));
    $('presenterShowDemo').classList.toggle('active',presenterView==='DEMO');
    $('presenterShowLive').classList.toggle('active',presenterView==='LIVE');
    $('liveBannerControls').hidden=presenterView!=='LIVE';
    render();
  }
  function setPresenterView(view) {
    if(!presenterVerified)return;
    closeReviews(true);
    presenterView=view==='LIVE'?'LIVE':'DEMO';
    selectedGrade='all';
    if(presenterView==='DEMO')setAuto(false);
    // Refreshing the authorized page must reopen the CURRENT view, using
    // the SAME temporary faculty token; there is no new Admin issuance.
    // The presenter capability remains in the URL fragment only.
    const params=new URLSearchParams(String(window.location.hash||'').replace(/^#/,''));
    if(params.get('presenter')===presenterToken){
      params.set('view',presenterView.toLowerCase());
      try { history.replaceState(null,'',location.pathname+location.search+'#'+params.toString()); }
      catch (_) { /* Live view remains functional even without history API. */ }
    }
    present();
  }
  const gradesFrom = list => [...new Set(list.map(p => String(p.grade)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const put = (id,text) => {const el=$(id);if(el)el.textContent=String(text);};
  const make = (tag,cls,txt) => {
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(txt!==undefined)el.textContent=String(txt);
    return el;
  };
  const fmt = x => (x === null || x === undefined || x === '') ? '—' :
    Number.isFinite(Number(x)) ? new Intl.NumberFormat('en-IN').format(Number(x)) : '—';
  const escapeLess = value => Math.max(0,Math.min(100,Number(value)||0));
  function samplePayload() {
    return {mode:'DEMO',totalProjects:lastCatalogCount,acceptedVotes:null,ratedProjects:null,
      languages:[],rankings:DEMO_RANKINGS};
  }
  function sourceData() {
    return mode==='DEMO' ? samplePayload() : current || {mode:'DEMO'};
  }
  function renderMode(data) {
    mode=data.mode;
    document.body.dataset.resultsMode=mode;
    const demo=mode==='DEMO', live=mode==='LIVE';
    const message=demo
      ? ['DEMO MODE · SAMPLE DATA','These examples are fictional. No actual rankings or visitor comments are being published.']
      : live
        ? ['LIVE INSIGHTS · RANKINGS PRIVATE','Real, anonymous participation totals only. Organizers have not published project rankings.']
        : ['Curiosity Carnival','Trending Projects · Private live audience ratings by grade, not official jury results.'];
    put('modeTitle',message[0]);put('modeDetails',message[1]);put('modeSymbol',demo?'✧':live?'◉':'★');
    put('lastUpdated',demo?'Sample experience':data.updatedAt?'Updated '+new Date(data.updatedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'Read-only display');
    put('totalProjects',fmt(data.totalProjects ?? lastCatalogCount));
    put('totalVotes',fmt(data.acceptedVotes));put('ratedProjects',fmt(data.ratedProjects));
    put('languageCount',demo?'—':fmt((data.languages||[]).filter(x=>x.count>0).length));
    put('voteMetricHint',demo?'Real vote totals are not published in preview':'Valid anonymous ratings');
    put('rankingsHeading',demo?'Ideas worth celebrating.':live?'Discoveries in motion.':'Audience favourites by grade.');
    put('rankingsSubheading',demo?'Illustrative project cards, not actual rankings.':
      live?'Project rankings remain private until the organizers approve publication.':
        'Private presenter view: rated exhibits ordered by the existing weighted audience score.');
    put('rankingNote',demo?'ALL SCORES AND REVIEWS SHOWN HERE ARE FICTIONAL. No winners are being announced.':
      live?'No leading projects are displayed during the fair. Audience activity is not a competition result.':
        'Private audience appreciation is not an official jury award. Scores account for rating and number of votes.');
    put('feedbackIntro','Feedback is recorded and translated automatically during a real submission; no student approval queue is needed.');
  }
  function renderGradeFilter(data) {
    const select=$('gradeFilter');
    // Even in demo, only sample grades are shown; in LIVE, no rank filters.
    const grades=mode==='DEMO'?gradesFrom(DEMO_RANKINGS):
      mode==='PUBLISHED'?gradesFrom(data.rankings||[]):[];
    const keep=grades.includes(selectedGrade)?selectedGrade:'all';
    select.replaceChildren(new Option('All grades','all'));
    grades.forEach(g=>select.add(new Option('Grade '+g,g)));
    selectedGrade=keep;select.value=keep;
    select.disabled=mode==='LIVE'||grades.length<2;
  }
  function renderRankings(data) {
    const host=$('leaderboardCards');host.replaceChildren();
    if(mode==='LIVE'){
      host.appendChild(make('div','empty-collection','The spotlight is on every exhibit. Rankings will appear only after organizer approval.'));
      return;
    }
    const list=(data.rankings||[]).filter(p=>selectedGrade==='all'||String(p.grade)===selectedGrade);
    if(!list.length){
      host.appendChild(make('div','empty-collection','No rated projects to display yet.'));
      return;
    }
    const limited=list.slice(0,mode==='DEMO'?6:15);
    limited.forEach((item,index)=>{
      const card=make('article','rank-card'+(index===0?' featured':''));
      const number=make('div','rank-number'+(index===0?'':' other'),String(item.rank||index+1).padStart(2,'0'));
      number.setAttribute('aria-label','Grade rank '+(item.rank||index+1));
      const name=make('div','rank-main');
      name.appendChild(make('strong','',item.project));
      name.appendChild(make('span','', 'Grade '+item.grade+' · '+item.section));
      const score=make('div','rank-score');
      score.appendChild(make('strong','',Number(item.weighted).toFixed(2)+' ★'));
      score.appendChild(make('span','',fmt(item.votes)+' ratings'+(mode==='DEMO'?' · SAMPLE':'')));
      const details=make('button','feedback-open-btn',mode==='DEMO'?'Sample feedback':'View feedback');
      details.type='button';
      details.setAttribute('aria-label','View '+(mode==='DEMO'?'sample ':'')+'feedback for '+item.project);
      details.addEventListener('click',()=>openReviews(item,details));
      score.appendChild(details);
      card.append(number,name,score);host.appendChild(card);
    });
  }
  function renderLanguages(data) {
    const host=$('languageBars');host.replaceChildren();
    const list=(data.languages||[]).filter(r=>r.count>0).slice(0,5);
    if(!list.length){host.appendChild(make('p','empty-collection','Language activity will appear here once feedback is received.'));return;}
    const max=Math.max(1,...list.map(r=>Number(r.count)||0));
    list.forEach(entry=>{
      const row=make('div','language-row'), meta=make('div','language-meta');
      meta.append(make('span','',LANGUAGES[entry.code]||'Other'),make('span','',fmt(entry.count)+(mode==='DEMO'?' sample':'')));
      const track=make('div','track');const inner=make('div','track-inner');
      inner.style.width=escapeLess((Number(entry.count)||0)/max*100)+'%';
      track.appendChild(inner);row.append(meta,track);host.appendChild(row);
    });
  }
  function render() {
    const data=sourceData();
    renderMode(data);renderGradeFilter(data);renderRankings(data);renderLanguages(data);
  }
  function apply(payload) {
    if(!payload||payload.success!==true||payload.mode!=='PRESENTER_LIVE' ||
       !Array.isArray(payload.rankings)){
      denyAccess('Presenter authorization expired or unavailable. Open a fresh private link from the Admin Console.');
      return;
    }
    presenterVerified=true;
    // The HTML/JS shell remains hidden until the server verifies the
    // capability. No real data is accepted from anonymous publicResults.
    current=Object.assign({},payload,{mode:'PUBLISHED'});
    lastCatalogCount=Number(payload.totalProjects)||lastCatalogCount;
    $('presenterAccessGate').hidden=true;
    $('pageShell').hidden=false;
    $('presenterBar').hidden=false;
    $('presenterVotingLink').href='./#presenter='+encodeURIComponent(presenterToken);
    present();
  }
  function refreshServer() {
    if(!/^[a-f0-9]{64}$/i.test(presenterToken)) {
      denyAccess('This display is reserved for faculty and student presenters. Ask an organizer for a private presenter link.');
      return;
    }
    if(requestInFlight)return;
    requestInFlight=true;const seq=++sequence;
    const cb='voiceVotePresenterResults_'+seq,script=document.createElement('script');
    let done=false;
    const finish=()=>{
      if(done)return false;
      done=true;requestInFlight=false;
      delete window[cb];script.remove();clearTimeout(timer);
      return true;
    };
    window[cb]=payload=>{if(!finish())return;apply(payload);};
    script.onerror=()=>{
      if(!finish())return;
      denyAccess('Private live results cannot be reached. Reconnect and reopen an authorized presenter link.');
    };
    const timer=setTimeout(()=>{
      if(!finish())return;
      denyAccess('Private results request timed out. Refresh with a valid presenter link.');
    },22000);
    const url=new URL(SCRIPT_URL);
    url.searchParams.set('action','presenterResults');
    url.searchParams.set('ticket',presenterToken);
    url.searchParams.set('callback',cb);
    url.searchParams.set('_',String(Date.now()));
    script.src=url.toString();document.head.appendChild(script);
  }
  function rotateGrade() {
    const select=$('gradeFilter');
    if(select.disabled||select.options.length<3)return;
    const values=[...select.options].map(x=>x.value).filter(x=>x!=='all');
    const idx=values.indexOf(selectedGrade);
    selectedGrade=values[(idx+1)%values.length];select.value=selectedGrade;
    renderRankings(sourceData());
  }
  function setAuto(yes) {
    const button=$('autoplayToggle');
    if(intervalId){clearInterval(intervalId);intervalId=null;}
    if(yes)intervalId=setInterval(()=>{if(!document.hidden)rotateGrade();},9000);
    button.setAttribute('aria-pressed',String(Boolean(yes)));
    button.textContent=yes?'Ⅱ Pause rotation':'▶ Auto-rotate grades';
    // A projector presenter wants grade cards in view, not merely an offscreen
    // filter changing under the opening hero. Do not auto-scroll parent phones.
    if(yes && window.innerWidth>=900 && $('leaderboard')) {
      $('leaderboard').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  $('presenterShowDemo').addEventListener('click',()=>setPresenterView('DEMO'));
  $('presenterShowLive').addEventListener('click',()=>setPresenterView('LIVE'));
  $('liveDemoButton').addEventListener('click',()=>setPresenterView('DEMO'));
  $('liveRefreshButton').addEventListener('click',()=>{if(presenterVerified)refreshServer();});
  $('liveBrightnessButton').addEventListener('click',()=>{if(presenterVerified)$('brightToggle').click();});
  $('liveFullScreenButton').addEventListener('click',()=>{if(presenterVerified)$('screenToggle').click();});
  $('gradeFilter').addEventListener('change',e=>{
    selectedGrade=e.target.value;renderRankings(sourceData());
  });
  $('autoplayToggle').addEventListener('click',()=>setAuto(!intervalId));
  $('resetView').addEventListener('click',()=>{setAuto(false);selectedGrade='all';render();window.scrollTo({top:0,behavior:'smooth'});});
  $('brightToggle').addEventListener('click',()=>{
    const light=document.body.classList.toggle('bright');
    $('brightToggle').setAttribute('aria-label',light?'Switch to dark-room display':'Switch to bright-room display');
  });
  $('screenToggle').addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    }catch(_){put('lastUpdated','Full screen is unavailable on this device');}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshServer();});
  // Gated by default; no synthetic or real board shown to visitors.
  denyAccess('Verifying private presenter access…');
  refreshServer();
  setInterval(()=>{if(!document.hidden && presenterToken)refreshServer();},45000);
})();
