const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const voting = fs.readFileSync('index.html','utf8');
const results = fs.readFileSync('results.html','utf8');
const resultsCss = fs.readFileSync('results.css','utf8');
const qrPath = path.join('assets','curiosity-carnival-voting-qr.png');

test('Curiosity Carnival theme is visible in both public Voting and private Results', () => {
  assert.match(voting,/<h1 class="carnival-heading">Curiosity Carnival<\/h1>/);
  assert.match(results,/<h1 id="heroTitle" class="carnival-hero-heading">Curiosity Carnival<\/h1>/);
  assert.match(results,/<h2 class="hero-idea-title">Every great idea/);
});

test('private faculty Results displays a real, packaged visitor-voting QR', () => {
  assert.match(results,/class="board-qr-card"/);
  assert.match(results,/VISITORS · SCAN TO VOTE/);
  assert.match(results,/src="assets\/curiosity-carnival-voting-qr\.png"/);
  assert.match(results,/alt="[^"]+public VoiceVote feedback form"/);
  assert.match(results,/Enlarge QR for the smart board/);
  assert.ok(fs.existsSync(qrPath),'QR image must be included with GitHub Pages');
  const png=fs.readFileSync(qrPath);
  assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(png.readUInt32BE(16),360);
  assert.equal(png.readUInt32BE(20),360);
  assert.ok(png.length>2000,'Do not replace with empty or decorative image');
});

test('QR stays in protected Results shell; public Voting does not expose Results links', () => {
  assert.match(results,/<div class="page-shell" id="pageShell" hidden>/);
  const start=results.indexOf('id="pageShell" hidden');
  const qr=results.indexOf('class="board-qr-card"');
  assert.ok(start>=0 && qr>start,'QR must appear only in ticket-protected shell');
  assert.doesNotMatch(voting,/<a[^>]+href="(?:\.\/)?results\.html[^"]*"/i);
  assert.match(resultsCss,/\.board-qr-card/);
  assert.match(resultsCss,/html:fullscreen \.board-qr-frame/);
});