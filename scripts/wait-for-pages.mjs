// Read-only gate: the browser smoke suite must inspect the published HTML
// from this exact checked-out commit, not an old GitHub Pages build.
// This script makes only GET requests and never contacts Google Apps Script.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const site = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const digest = s => createHash('sha256')
  .update(String(s).replace(/\r\n/g, '\n').trim())
  .digest('hex');
const expected = digest(source);
let observed = '';
let lastError = '';
const retries = 45;
for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    const url = site + '?pagesGate=' + Date.now() + '-' + attempt;
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    observed = digest(await response.text());
    if (observed === expected) {
      console.log('PASS: published GitHub Pages HTML matches checkout SHA-256. Read-only browser tests can proceed.');
      process.exit(0);
    }
    lastError = 'published HTML hash differs from checked-out index.html';
  } catch (error) {
    lastError = String(error && error.message || error);
  }
  if (attempt % 5 === 0) console.log('Waiting for updated Pages publication (attempt ' + attempt + '/' + retries + '): ' + lastError);
  if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 4000));
}
throw new Error('Published Pages did not match checkout after ' + retries +
  ' read-only checks. ' + lastError + '; expected=' + expected.slice(0, 12) +
  ', observed=' + observed.slice(0, 12) + '. Browser smoke not run on a stale release.');
