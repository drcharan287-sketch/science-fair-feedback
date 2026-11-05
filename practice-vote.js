/*
 * VoiceVote Practice Voting — intentionally isolated from the real voting app.
 * It loads ONLY the same-origin public projects.json snapshot.
 * No Apps Script URL, no Google feedback submit, no localStorage/locks.
 * The practice confirmation is an in-memory visual demonstration, not a receipt.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = {
    ready: false, loading: false, submitted: false, recording: false,
    rating: 0, recognition: null, voiceError: false
  };

  const say = message => { $('status').textContent = String(message || ''); };

  function syncControls() {
    const locked = state.submitted || state.recording;
    $('startBtn').disabled = locked;
    $('stopBtn').disabled = !state.recording || state.submitted;
    $('feedback').disabled = locked;
    $('language').disabled = locked;
    document.querySelectorAll('.star').forEach(button => {
      button.disabled = locked;
    });
    $('submitBtn').disabled = !state.ready || locked ||
      !$('studentClass').value || !$('section').value || !$('project').value ||
      !$('feedback').value.trim() || !state.rating;
  }

  function paintStars() {
    document.querySelectorAll('.star').forEach(button => {
      const number = Number(button.dataset.value);
      button.classList.toggle('active',number <= state.rating);
      button.setAttribute('aria-pressed',String(number === state.rating));
    });
  }

  async function loadProjects() {
    if(state.loading) return;
    state.loading=true;
    state.ready=false;
    $('retryCatalogBtn').hidden=true;
    $('catalogStatus').textContent='Loading public project names for rehearsal…';
    syncControls();
    try {
      const response=await fetch('./projects.json', {
        cache:'no-store',credentials:'same-origin'
      });
      if(!response.ok)throw Error('Project list unavailable (HTTP '+response.status+').');
      const data=await response.json();
      if(!data || data.success!==true || !Array.isArray(data.projects) || !data.projects.length) {
        throw Error('The published project catalog is unavailable.');
      }
      // Reuse ONLY the grade/section/search dropdown controller, not the live
      // vote lock, submit routine, browser storage or Apps Script API.
      if(!window.VoiceVoteCatalogSelector)throw Error('Project selector could not load.');
      await window.VoiceVoteCatalogSelector.init({
        catalog:data.projects,
        gradeSelector:'#studentClass',
        sectionSelector:'#section',
        projectSelector:'#project',
        statusSelector:'#catalogStatus',
        searchSelector:'#projectSearch',
        searchResultsSelector:'#projectSearchResults',
        searchStatusSelector:'#projectSearchStatus',
        searchSelectedSelector:'#projectSearchSelected',
        isVoteLocked:()=>state.submitted,
        preserveExistingGrades:false
      });
      state.ready=true;
      $('catalogStatus').textContent=data.projects.length+
        ' real catalog projects available for this demonstration. No votes will be saved.';
      $('projectSearch').disabled=false;
      $('retryCatalogBtn').hidden=true;
    } catch(error) {
      state.ready=false;
      $('catalogStatus').textContent='Could not load projects: '+
        String(error&&error.message||error)+'. Check your connection and try again.';
      $('retryCatalogBtn').hidden=false;
    } finally {
      state.loading=false;
      syncControls();
    }
  }

  function recordingError(code) {
    if(code==='not-allowed'||code==='service-not-allowed') {
      return 'Microphone permission denied. Allow access in browser settings, or type instead.';
    }
    if(code==='no-speech')return 'No speech detected. Try again or type your feedback.';
    if(code==='network')return 'Speech service is unavailable. Try again or type your feedback.';
    return 'Speech recognition stopped ('+code+'). You can type or retry.';
  }

  function startRecording() {
    if(state.submitted || state.recording)return;
    const SpeechRecognition=window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SpeechRecognition) {
      say('Speech recognition is not supported in this browser. Typing works in Practice Mode.');
      return;
    }
    const recognition=new SpeechRecognition();
    recognition.lang=$('language').value;
    recognition.continuous=true;
    recognition.interimResults=true;
    let finalTranscript=$('feedback').value.trim();
    state.voiceError=false;
    state.recognition=recognition;

    recognition.onresult=event=>{
      let interim='';
      for(let i=event.resultIndex;i<event.results.length;i++){
        const phrase=String(event.results[i][0].transcript||'');
        if(event.results[i].isFinal) {
          finalTranscript += (finalTranscript?' ':'')+phrase.trim();
        } else interim+=phrase;
      }
      $('feedback').value=finalTranscript+(interim?' '+interim:'');
      syncControls();
    };
    recognition.onerror=event=>{
      state.voiceError=true;
      state.recording=false;
      say(recordingError(String(event?.error||'unknown')));
      syncControls();
    };
    recognition.onend=()=>{
      state.recording=false;
      if(state.recognition===recognition)state.recognition=null;
      syncControls();
      if(!state.voiceError && !state.submitted){
        say('Transcription complete. Edit the text before your sample confirmation.');
      }
    };
    try {
      recognition.start();
      state.recording=true;
      syncControls();
      say('Listening… Tap Stop, then review and edit your transcript.');
    } catch(error) {
      state.recognition=null;
      state.recording=false;
      say('Unable to start the microphone: '+String(error?.message||error)+'. You can type.');
      syncControls();
    }
  }

  function stopRecording() {
    if(!state.recording || !state.recognition)return;
    say('Finishing speech recognition…');
    try { state.recognition.stop(); }
    catch(_) {
      state.recording=false;
      state.voiceError=true;
      syncControls();
      say('Recording stopped unexpectedly. Review your text or try again.');
    }
  }

  function showPracticeReceipt() {
    if($('submitBtn').disabled || state.submitted || state.recording)return;
    // Deliberately no form, no POST, no localStorage and no server call here.
    const project=$('project').value;
    const grade=$('studentClass').value;
    const section=$('section').value;
    const feedback=$('feedback').value.trim();
    if(!state.ready || !project || !grade || !section || !feedback || !state.rating) {
      say('Choose a project, type or speak feedback, and select a star rating.');
      return;
    }
    $('receiptProject').textContent=project;
    $('receiptClass').textContent='Class '+grade+' · '+section;
    $('receiptStars').textContent='★'.repeat(state.rating)+'☆'.repeat(5-state.rating);
    $('receiptFeedback').textContent=feedback;
    state.submitted=true;
    document.querySelectorAll('[data-practice-step]').forEach(step=>{
      step.hidden=true;
    });
    $('practiceReceipt').hidden=false;
    syncControls();
    $('practiceReceipt').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function resetPractice() {
    if(state.recording)stopRecording();
    state.submitted=false;
    state.rating=0;
    state.recording=false;
    state.voiceError=false;
    $('feedback').value='';
    $('language').value='en-IN';
    $('studentClass').value='';
    $('studentClass').dispatchEvent(new Event('change',{bubbles:true}));
    $('projectSearch').value='';
    $('projectSearchSelected').textContent='';
    $('projectSearchResults').hidden=true;
    $('projectSearch').setAttribute('aria-expanded','false');
    $('projectSearchStatus').textContent='Search a project name or choose a class and section.';
    document.querySelectorAll('[data-practice-step]').forEach(step=>{
      step.hidden=false;
    });
    $('practiceReceipt').hidden=true;
    paintStars();
    say('New sample session ready. Previous sample was not saved.');
    syncControls();
    $('projectSearch').focus();
  }

  document.querySelectorAll('.star').forEach(button=>{
    button.addEventListener('click',()=>{
      if(state.recording||state.submitted)return;
      state.rating=Number(button.dataset.value)||0;
      paintStars();
      syncControls();
    });
  });
  $('startBtn').addEventListener('click',startRecording);
  $('stopBtn').addEventListener('click',stopRecording);
  $('submitBtn').addEventListener('click',showPracticeReceipt);
  $('restartPracticeBtn').addEventListener('click',resetPractice);
  $('retryCatalogBtn').addEventListener('click',loadProjects);
  document.addEventListener('input',syncControls);
  document.addEventListener('change',syncControls);
  syncControls();
  loadProjects();
})();
