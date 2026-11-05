/* VoiceVote audience experience.
   No submission calls. Real rankings are shown ONLY if server mode=PUBLISHED.
   Every DOM string from a server response is inserted with textContent. */
(() => {
  'use strict';
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxk-Ex6bd0l3V9fiUrPoCGVHNmkUAm_4yY7xlGLHWFRZBSn6lCo0Pw0vZ0C-vgyIC26/exec';
  const $ = id => document.getElementById(id);
  const LANGUAGES = {'en-IN':'English','te-IN':'Telugu','hi-IN':'Hindi','ta-IN':'Tamil','kn-IN':'Kannada'};
  const DEMO_RANKINGS = Object.freeze([
    {id:'demo-01',grade:'3',section:'Sample Section A',project:'Future Green City',votes:94,weighted:4.71,rank:1},
    {id:'demo-02',grade:'3',section:'Sample Section B',project:'Amazing Nature Explorer',votes:82,weighted:4.62,rank:2},
    {id:'demo-03',grade:'6',section:'Sample Section C',project:'Water-Saving Wonder',votes:118,weighted:4.84,rank:1},
    {id:'demo-04',grade:'6',section:'Sample Section D',project:'Solar Energy Lab',votes:86,weighted:4.72,rank:2},
    {id:'demo-05',grade:'9',section:'Sample Section E',project:'Future Mobility Project',votes:104,weighted:4.86,rank:1},
    {id:'demo-06',grade:'9',section:'Sample Section F',project:'AI for a Better Tomorrow',votes:96,weighted:4.69,rank:2}
  ]);
  let mode='DEMO', current=null, selectedGrade='all', intervalId=null;
  let requestInFlight=false, sequence=0, lastCatalogCount=null;
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
        : ['AUDIENCE RESULTS · ORGANIZER PUBLISHED','Grade-wise audience ratings are now public. These are not official jury awards.'];
    put('modeTitle',message[0]);put('modeDetails',message[1]);put('modeSymbol',demo?'✧':live?'◉':'★');
    put('lastUpdated',demo?'Sample experience':data.updatedAt?'Updated '+new Date(data.updatedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'Read-only display');
    put('totalProjects',fmt(data.totalProjects ?? lastCatalogCount));
    put('totalVotes',fmt(data.acceptedVotes));put('ratedProjects',fmt(data.ratedProjects));
    put('languageCount',demo?'—':fmt((data.languages||[]).filter(x=>x.count>0).length));
    put('voteMetricHint',demo?'Real vote totals are not published in preview':'Valid anonymous ratings');
    put('rankingsHeading',demo?'Ideas worth celebrating.':live?'Discoveries in motion.':'Audience favourites by grade.');
    put('rankingsSubheading',demo?'Illustrative project cards, not actual rankings.':
      live?'Project rankings remain private until the organizers approve publication.':
        'Rated exhibits, ordered by the existing weighted audience score.');
    put('rankingNote',demo?'ALL SCORES AND REVIEWS SHOWN HERE ARE FICTIONAL. No winners are being announced.':
      live?'No leading projects are displayed during the fair. Audience activity is not a competition result.':
        'Audience appreciation is not an official jury award. Scores account for rating and number of votes.');
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
    if(!payload||payload.success!==true||!['DEMO','LIVE','PUBLISHED'].includes(payload.mode)){
      mode='DEMO';current=null;render();return;
    }
    // Never rely on query parameters or browser storage for publishing.
    if(payload.mode==='DEMO'){mode='DEMO';current=null;lastCatalogCount=Number(payload.totalProjects)||lastCatalogCount;}
    else {mode=payload.mode;current=payload;}
    render();
  }
  function loadSnapshotCount() {
    return fetch('./projects.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
      if(data&&data.success&&Array.isArray(data.projects)){
        lastCatalogCount=data.projects.length;
        if(mode==='DEMO')render();
      }
    }).catch(()=>{});
  }
  function refreshServer() {
    if(requestInFlight)return;
    requestInFlight=true;const seq=++sequence;
    const cb='voiceVotePublicResults_'+seq,script=document.createElement('script');
    let done=false;
    const finish=()=>{
      if(done)return false;
      done=true;requestInFlight=false;
      delete window[cb];script.remove();clearTimeout(timer);
      return true;
    };
    window[cb]=payload=>{if(!finish())return;apply(payload);};
    script.onerror=()=>{if(!finish())return;if(mode==='DEMO')render();put('lastUpdated','Demo · live connection unavailable');};
    const timer=setTimeout(()=>{if(!finish())return;if(mode==='DEMO')put('lastUpdated','Demo · live connection unavailable');},22000);
    const url=new URL(SCRIPT_URL);
    url.searchParams.set('action','publicResults');
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
  render();loadSnapshotCount();refreshServer();setInterval(()=>{if(!document.hidden)refreshServer();},75000);
})();
