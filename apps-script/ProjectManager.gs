/**
 * Event-day project management. This is a private google.script.run surface:
 * every exposed function validates the same strong admin key as AdminApi.gs.
 * Never add an unauthenticated doGet/doPost roster mutation endpoint.
 */
function voiceVoteManagerText_(value, label, max) {
  const v=String(value == null ? '' : value).replace(/\s+/g,' ').trim();
  if (!v || v.length>max || /[\u0000-\u001f\u007f]/.test(v) ||
      /^[=+@'-]/.test(v)) {
    throw new Error('Invalid '+label+'. Enter plain text without formula prefixes.');
  }
  return v;
}
function voiceVoteManagerRows_(ss) {
  const sheet=ss.getSheetByName('Projects');
  if (!sheet) throw new Error('Projects sheet is missing.');
  const grid=sheet.getDataRange().getValues();
  const expected=['Class/Grade','Section','Project Name','Active','Project ID','Source Key'];
  if (!grid.length || expected.some(function(value,i){
    return String(grid[0][i]||'').trim()!==value;
  })) throw new Error('Projects columns A-F do not match the protected project schema.');
  const items=[];
  for (let i=1;i<grid.length;i++) {
    const row=grid[i];
    if (!String(row[0]||'').trim() && !String(row[2]||'').trim()) continue;
    const id=String(row[4]||'').trim();
    if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
      throw new Error('Missing or invalid Project ID in row '+(i+1)+'.');
    const active=!['FALSE','NO','0','INACTIVE','N'].includes(String(row[3]).trim().toUpperCase());
    const item={
      row:i+1,grade:String(row[0]||'').trim(),section:String(row[1]||'').trim(),
      project:String(row[2]||'').trim(),active:active,id:id,
      sourceKey:String(row[5]||'').trim()
    };
    item.version=adminDigest_(JSON.stringify([
      item.row,item.grade,item.section,item.project,item.active,item.id,item.sourceKey
    ]));
    items.push(item);
  }
  if (new Set(items.map(function(x){return x.id})).size!==items.length) {
    throw new Error('Duplicate stable Project IDs. Correct the roster before editing.');
  }
  return {sheet:sheet,items:items};
}
function voiceVoteManagerKey_(grade,section,project) {
  return JSON.stringify([
    String(grade).trim(),String(section).trim().toLocaleLowerCase(),
    String(project).trim().replace(/\s+/g,' ').toLocaleLowerCase()
  ]);
}
function voiceVoteManagerCollision_(items,grade,section,project,ignoreId) {
  const wanted=voiceVoteManagerKey_(grade,section,project);
  return items.find(function(item){
    return item.id!==ignoreId &&
      voiceVoteManagerKey_(item.grade,item.section,item.project)===wanted;
  });
}
/** Drop the read-only presenter summary cache after a roster change. */
function voiceVoteManagerInvalidateResults_() {
  try {
    if(typeof publicResultsCache_!=='function')return;
    const cache=publicResultsCache_();
    if(!cache || typeof cache.remove!=='function')return;
    ['PUBLISHED','DEMO'].forEach(function(mode){
      cache.remove(publicResultsCacheKey_(mode));
    });
  } catch (_) {
    // A cache miss only causes the existing at-most-45-second TTL fallback;
    // never obscure a successfully audited project mutation.
  }
}
function voiceVoteManagerVotes_(ss,item) {
  const votes=adminRawVotes_(ss).filter(function(v) {
    return v.status!=='VOID' &&
      (v.projectId===item.id || (!v.projectId && v.grade===item.grade &&
        v.section===item.section && v.project===item.project));
  });
  return {count:votes.length, legacy:votes.some(function(v){return !v.projectId})};
}
/** Private, bounded project list including deactivated rows; no vote content. */
function adminGetManagedProjects(key) {
  adminRequireKey_(key);
  const ss=adminSheet_(),source=voiceVoteManagerRows_(ss);
  // Read Feedback just once, even when the event has hundreds of projects.
  const idCounts=Object.create(null),legacyCounts=Object.create(null);
  adminRawVotes_(ss).forEach(function(v){
    if(v.status==='VOID')return;
    if(v.projectId)idCounts[v.projectId]=(idCounts[v.projectId]||0)+1;
    else {
      const k=adminProjectLegacyKey_(v);
      legacyCounts[k]=(legacyCounts[k]||0)+1;
    }
  });
  return {
    projects:source.items.map(function(item){
      const legacy=legacyCounts[adminProjectLegacyKey_(item)]||0;
      return Object.assign({},item,{
        votes:(idCounts[item.id]||0)+legacy,legacyVotes:legacy>0
      });
    }),
    total:source.items.length,
    active:source.items.filter(function(item){return item.active}).length,
    pendingAuditActions:adminAuditPending_(ss).length
  };
}
/**
 * ADD / EDIT / DEACTIVATE / REACTIVATE only. No destructive delete.
 * A row-version digest prevents stale tabs from silently overwriting changes.
 */
function adminChangeProject(key,payload) {
  adminRequireKey_(key);
  const data=payload && typeof payload==='object'?payload:{};
  const action=String(data.action||'').toUpperCase();
  if (!['ADD','EDIT','DEACTIVATE','REACTIVATE'].includes(action))
    throw new Error('Unsupported project action.');
  const reason=voiceVoteManagerText_(data.reason,'change reason',400);
  if (reason.length<8) throw new Error('A reason of at least 8 characters is required.');
  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss=adminSheet_(),source=voiceVoteManagerRows_(ss),items=source.items;
    if (adminAuditPending_(ss).length)
      throw new Error('Unresolved admin audit action. Ask organizer to reconcile the audit log.');
    let grade,section,project,record;
    if (action==='ADD'||action==='EDIT') {
      grade=voiceVoteManagerText_(data.grade,'class/grade',3);
      section=voiceVoteManagerText_(data.section,'section',80);
      project=voiceVoteManagerText_(data.project,'project name',200);
      if (!/^(3|4|5|6|7|8|9)$/.test(grade))
        throw new Error('Select an existing class/grade from 3 through 9.');
      if (!items.some(function(x){return x.grade===grade && x.section===section;}))
        throw new Error('Choose a section already registered for the selected grade.');
    }
    if(action==='ADD'){
      if(voiceVoteManagerCollision_(items,grade,section,project,''))
        throw new Error('A project with that name already exists in this grade/section. Edit or reactivate it instead.');
      let id;
      for(let attempts=0;attempts<4;attempts++){
        const token=String(Utilities.getUuid()).replace(/-/g,'').toUpperCase();
        if(!/^[A-F0-9]{24,}$/.test(token))throw new Error('Secure project identifier unavailable.');
        id='VVP-EVENT-'+token.slice(0,24);
        if(!items.some(function(x){return x.id===id}))break;
        id='';
      }
      if(!id)throw new Error('Could not allocate a unique Project ID.');
      const sourceKey='EVENT-20261107|'+id;
      const row=source.sheet.getLastRow()+1;
      const entry=[Number(grade),section,project,true,id,sourceKey,'EVENT-DAY','2026-11-07'];
      adminAuditedChange_(ss,'ADD_PROJECT',row,reason,'',JSON.stringify(entry),function(){
        source.sheet.appendRow(entry);
      });
      voiceVoteManagerInvalidateResults_();
      return {success:true,action:action,id:id,project:project,changed:true};
    }
    const id=String(data.id||'').trim();
    record=items.find(function(item){return item.id===id});
    if(!record)throw new Error('Project no longer exists. Refresh the manager.');
    if(String(data.expectedVersion||'')!==record.version)
      throw new Error('Project changed since you loaded it. Refresh before trying again.');
    const affected=voiceVoteManagerVotes_(ss,record);
    if(action==='EDIT'){
      if(!record.active)throw new Error('Reactivate the project before editing it.');
      if(voiceVoteManagerCollision_(items,grade,section,project,id))
        throw new Error('Another project already uses this grade, section and name.');
      if(record.grade===grade && record.section===section && record.project===project)
        return {success:true,action:action,id:id,project:project,changed:false};
      if(affected.legacy)
        throw new Error('Legacy votes without Project IDs use the old title. Organizer must reconcile them before renaming or moving this project.');
      adminAuditedChange_(ss,'EDIT_PROJECT',record.row,reason,
        JSON.stringify([record.grade,record.section,record.project,record.id]),
        JSON.stringify([grade,section,project,record.id]),function(){
          source.sheet.getRange(record.row,1,1,3).setValues([[Number(grade),section,project]]);
        });
      voiceVoteManagerInvalidateResults_();
      return {success:true,action:action,id:id,project:project,changed:true,affectedVotes:affected.count};
    }
    const active=action==='REACTIVATE';
    if(record.active===active) return {success:true,action:action,id:id,project:record.project,changed:false};
    if(active && voiceVoteManagerCollision_(items,record.grade,record.section,record.project,id))
      throw new Error('Another project already uses this grade, section and name.');
    if(!active && affected.count>0 && data.confirmAffectedVotes!==true)
      throw new Error('This project has '+affected.count+' valid vote(s). Confirm hiding it from active rankings before deactivating.');
    adminAuditedChange_(ss,active?'REACTIVATE_PROJECT':'DEACTIVATE_PROJECT',
      record.row,reason,record.active?'ACTIVE':'INACTIVE',active?'ACTIVE':'INACTIVE',function(){
        source.sheet.getRange(record.row,4).setValue(active);
      });
    voiceVoteManagerInvalidateResults_();
    return {success:true,action:action,id:id,project:record.project,
      changed:true,affectedVotes:affected.count};
  } finally {
    lock.releaseLock();
  }
}
