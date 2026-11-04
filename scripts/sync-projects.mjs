/**
 * Sync the PUBLIC Projects catalog from the existing Apps Script endpoint to
 * GitHub Pages' same-origin projects.json. Read-only: NEVER calls action=save.
 * Avoids asking visitors' browsers to follow Google JSONP redirects.
 */
import { readFile, writeFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const match = html.match(/\bconst\s+SCRIPT_URL\s*=\s*["'](https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec)["']/);
if (!match) throw new Error('Expected a single valid Google Apps Script /exec URL in index.html.');

const url = new URL(match[1]);
url.searchParams.set('action', 'catalog');
url.searchParams.set('callback', 'voiceVoteSnapshotSync');

const res = await fetch(url, {
  redirect: 'follow',
  signal: AbortSignal.timeout(30000),
  headers: { accept: 'application/javascript' }
});
if (!res.ok) throw new Error('Catalog endpoint returned HTTP ' + res.status);
const body = (await res.text()).trim();
const jsonp = /^voiceVoteSnapshotSync\(([\s\S]*?)\);?$/.exec(body);
if (!jsonp) throw new Error('Catalog endpoint did not return valid JSONP.');
const payload = JSON.parse(jsonp[1]);
if (!payload || payload.success !== true || !Array.isArray(payload.projects)) {
  throw new Error('Catalog rejected read-only request: ' + String(payload?.message || 'unexpected response'));
}

const seen = new Set();
const projects = payload.projects.map((item) => {
  if (!item || !['grade','section','project'].every(k => (typeof item[k] === 'number' || typeof item[k] === 'string') && String(item[k]).trim())) {
    throw new Error('Catalog includes an incomplete row; refusing to replace the previous snapshot.');
  }
  const p = { grade: String(item.grade).trim(), section: String(item.section).trim(), project: String(item.project).trim() };
  if (Object.values(p).some(v => v.length > 250)) throw new Error('Catalog field too long');
  return p;
}).filter(p => {
  const key = JSON.stringify(p);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}).sort((a,b) =>
  a.grade.localeCompare(b.grade,undefined,{numeric:true}) ||
  a.section.localeCompare(b.section,undefined,{numeric:true}) ||
  a.project.localeCompare(b.project,undefined,{numeric:true})
);
if (!projects.length) throw new Error('No active projects returned; existing snapshot retained.');
if (projects.length > 10000) throw new Error('Unexpectedly large project catalog; existing snapshot retained.');
const next = JSON.stringify({success:true,projects}, null, 2) + '\n';
await writeFile('projects.json', next, 'utf8');
console.log('Read-only catalog sync validated ' + projects.length + ' active projects.');
