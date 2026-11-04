// Read-only smoke test for a deployed Google Apps Script catalog.
// This performs no action=save request and never modifies Google Sheets.
const deploymentId = process.env.DEPLOYMENT_ID || '';
if (!/^[a-zA-Z0-9_-]+$/.test(deploymentId)) {
  throw new Error('Invalid/missing DEPLOYMENT_ID');
}
const url = new URL(`https://script.google.com/macros/s/${deploymentId}/exec`);
url.searchParams.set('action', 'catalog');
url.searchParams.set('callback', 'voiceVoteSmoke');

const response = await fetch(url, {
  redirect: 'follow',
  signal: AbortSignal.timeout(25000),
  headers: { 'Accept': 'application/javascript' }
});
if (!response.ok) throw new Error(`Catalog endpoint returned HTTP ${response.status}`);
const body = (await response.text()).trim();
const match = /^voiceVoteSmoke\(([\s\S]*)\);?$/.exec(body);
if (!match) {
  throw new Error('Catalog endpoint returned no expected JSONP callback; check published version and public web app access.');
}
let payload;
try {
  payload = JSON.parse(match[1].replace(/;\s*$/, ''));
} catch {
  throw new Error('Catalog JSONP returned invalid JSON.');
}
if (!payload || payload.success !== true || !Array.isArray(payload.projects)) {
  throw new Error(`Catalog backend rejected the request: ${String(payload?.message || 'unexpected payload')}`);
}
if (payload.projects.length === 0) {
  throw new Error('Catalog returned no active projects: check the Projects tab, spreadsheet ID and published version.');
}
for (const project of payload.projects) {
  if (!project || ['grade','section','project'].some(k => !String(project[k] ?? '').trim())) {
    throw new Error('Catalog returned an incomplete project record.');
  }
}
console.log(`Read-only catalog smoke test passed: ${payload.projects.length} projects returned.`);
