/**
 * Sync the PUBLIC Projects catalog from the existing Apps Script endpoint to
 * GitHub Pages' same-origin projects.json. Read-only: NEVER calls action=save.
 * Avoids asking visitors' browsers to follow Google JSONP redirects.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { validateProjectEntries } from './catalog-integrity.mjs';

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

// Any ambiguous identity or non-submittable field rejects this sync. The last
// valid projects.json remains untouched until organizers fix the Sheet data.
const projects = validateProjectEntries(payload.projects);
const next = JSON.stringify({success:true,projects}, null, 2) + '\n';
await writeFile('projects.json', next, 'utf8');
console.log('Read-only catalog sync validated ' + projects.length + ' active projects.');
