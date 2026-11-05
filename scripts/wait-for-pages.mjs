// Gate browser smoke on the EXACT published HTML and visual assets from this
// checkout. GET-only; never reads private data or submits feedback.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const site='https://drcharan287-sketch.github.io/science-fair-feedback/';
const files=["index.html","results.html","results.css","results.js","voicevote-theme.css","practice.html","practice-vote.css","practice-vote.js"];
const digest = s => createHash('sha256')
  .update(String(s).replace(/\r\n/g,'\n').trim()).digest('hex');
const expected={};
for(const file of files)expected[file]=digest(
  await readFile(new URL('../'+file,import.meta.url),'utf8')
);
let lastError='',observed='',miss='';
const retries=45;
for(let attempt=1;attempt<=retries;attempt++){
  try{
    for(const file of files){
      const url=site+file+'?pagesGate='+Date.now()+'-'+attempt;
      const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw Error(file+' HTTP '+r.status);
      observed=digest(await r.text());
      if(observed!==expected[file]){
        miss=file;throw Error(file+' has not reached this checkout');
      }
    }
    console.log('PASS: published HTML, Results scripts and design assets all match the exact checked-out source. Read-only smoke may proceed.');
    process.exit(0);
  }catch(e){lastError=String(e?.message||e);}
  if(attempt%5===0)console.log('Waiting for Pages (attempt '+attempt+'/'+retries+'): '+lastError);
  if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,4000));
}
throw Error('Pages did not publish exact source after '+retries+' GET-only checks: '+
  lastError+' expected='+String(expected[miss]||'').slice(0,12)+' observed='+observed.slice(0,12));
