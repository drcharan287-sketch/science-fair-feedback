// Non-writing browser checks on the published VoiceVote application.
// Simulates speech recognition lifecycle and narrow-screen viewports.
// It DOES NOT validate actual microphone quality or run iPhone Safari.
// All non-GitHub traffic is blocked; production POSTs can never leave this test.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const site = 'https://drcharan287-sketch.github.io/science-fair-feedback/';
const origin = new URL(site).origin;
const profiles = [
  { label: 'Android-sized Chromium simulation', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 },
  { label: 'iPhone-sized Chromium simulation (NOT Safari)', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
];
const languages = [
  ['en-IN', 'A useful science project'],
  ['te-IN', 'ఈ ప్రాజెక్టు చాలా బాగుంది'],
  ['hi-IN', 'यह विज्ञान परियोजना अच्छी है']
];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport, isMobile: profile.isMobile,
      hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor
    });
    await context.addInitScript(() => {
      // Mock only the recognition API, not the VoiceVote application.
      class RecognitionMock {
        start() { window.__vvRecognizer = this; }
        stop() { this.stopRequested = true; }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: RecognitionMock, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: RecognitionMock, configurable: true });
    });
    const page = await context.newPage();
    const uncaught = [];
    let outboundAttempts = 0;
    page.on('pageerror', error => uncaught.push(error.message));
    await page.route('**/*', route => {
      const request = route.request();
      const destination = new URL(request.url());
      if (destination.origin === origin && request.method() === 'GET') return route.continue();
      outboundAttempts++;
      return route.abort('blockedbyclient');
    });

    const response = await page.goto(site + '?voiceReadiness=' + Date.now(), {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    assert.ok(response?.ok(), profile.label + ': public site failed to load');
    await page.waitForFunction(() => {
      const grade = document.getElementById('studentClass');
      return grade && !grade.disabled && Array.from(grade.options).some(o => o.value === '9');
    }, null, { timeout: 15000 });

    assert.equal(await page.locator('#visitorPassFeature').isVisible(), false,
      'Deferred voting passes must remain invisible to attendees');
    assert.equal(await page.locator('#newVisitorBtn').isVisible(), false,
      'Deferred alternate-attendee control must remain invisible');
    const width = await page.evaluate(() => ({
      viewport: innerWidth, document: document.documentElement.scrollWidth
    }));
    assert.ok(width.document <= width.viewport + 2,
      profile.label + ': horizontal scrolling detected: ' + JSON.stringify(width));

    for (const [language, phrase] of languages) {
      await page.locator('#feedback').fill('');
      await page.locator('#language').selectOption(language);
      await page.locator('#startBtn').click();
      const selected = await page.evaluate(() => ({
        language: window.__vvRecognizer?.lang,
        continuous: window.__vvRecognizer?.continuous,
        interimResults: window.__vvRecognizer?.interimResults
      }));
      assert.equal(selected.language, language, 'Speech language should match selected language');
      assert.equal(selected.interimResults, true);
      assert.equal(await page.locator('#submitBtn').isDisabled(), true,
        'Cannot submit while recognition is running');
      assert.equal(await page.locator('#language').isDisabled(), true,
        'Cannot change language during recording');
      await page.evaluate(text => {
        window.__vvRecognizer.onresult({
          resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: false }]
        });
      }, phrase);
      assert.equal(await page.locator('#feedback').inputValue(), ' ' + phrase);
      await page.locator('#stopBtn').click();
      assert.equal(await page.locator('#submitBtn').isDisabled(), true,
        'Still waiting for asynchronous recognition completion');
      await page.evaluate(text => {
        const speech = window.__vvRecognizer;
        speech.onresult({
          resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }]
        });
        speech.onend();
      }, phrase);
      assert.equal(await page.locator('#feedback').inputValue(), phrase);
      assert.equal(await page.locator('#feedback').isEnabled(), true);
      assert.equal(await page.locator('#language').isEnabled(), true);
      await page.locator('#feedback').fill(phrase + ' — edited');
      assert.equal(await page.locator('#feedback').inputValue(), phrase + ' — edited',
        'Editable transcript must survive completion');
    }

    for (const [errorName, expected] of [
      ['not-allowed', 'Microphone permission was denied'],
      ['no-speech', 'No speech detected'],
      ['network', 'Voice recognition could not connect']
    ]) {
      await page.locator('#feedback').fill('');
      await page.locator('#startBtn').click();
      await page.evaluate(name => {
        const speech = window.__vvRecognizer;
        speech.onerror({ error: name });
        speech.onend();
      }, errorName);
      assert.match(await page.locator('#status').textContent(), new RegExp(expected));
      assert.equal(await page.locator('#feedback').isEnabled(), true,
        'Visitors should be able to type after voice errors');
    }

    assert.deepEqual(uncaught, [], profile.label + ': browser JS errors');
    assert.equal(outboundAttempts, 0, 'No external requests or POSTs were sent');
    console.log('PASS ' + profile.label +
      ': English/Telugu/Hindi mocked speech, editing, errors, responsive width; no vote submitted');
    await context.close();
  }
  console.log('PASS all non-writing mobile/multilingual readiness simulations. Real physical-device and translation checks remain pending.');
} finally {
  await browser.close();
}
