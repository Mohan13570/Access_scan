/**
 * access scan1 — Automated Verification & Live Test Script
 */

const { chromium } = require('@playwright/test');
const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION1_PATH = path.resolve(__dirname, '..', 'access_scan1');
const REPO_ROOT = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const filePath = path.join(REPO_ROOT, req.url.split('?')[0]);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    let mime = 'text/plain';
    if (filePath.endsWith('.html')) mime = 'text/html';
    else if (filePath.endsWith('.js')) mime = 'application/javascript';
    else if (filePath.endsWith('.css')) mime = 'text/css';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[access scan1 Test Server] Listening on ${baseUrl}`);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION1_PATH}`,
      `--load-extension=${EXTENSION1_PATH}`,
      '--no-sandbox',
    ],
  });

  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    console.log('1. Loading demo page with access scan1...');
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForTimeout(1200);

    // Verify dock HUD
    const dock = await page.locator('#access-scan-dock').count();
    assert.strictEqual(dock, 1, 'access scan1 dock HUD must be visible on page');
    console.log('✓ PASS: access scan1 dock HUD mounted successfully.');

    // Verify highlight exists
    const highlighted = await page.locator('.access-scan-active-target, .access-scan-active-section').count();
    assert.ok(highlighted > 0, 'An active reticle target or section must be highlighted');
    console.log(`✓ PASS: Active reticle highlighted (${highlighted} element).`);

    // Test Spacebar switch trigger
    console.log('2. Triggering Switch (Spacebar)...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);

    // Test virtual keyboard activation
    console.log('3. Activating username field...');
    await page.focus('#username');
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);

    const kbCount = await page.locator('#access-scan-keyboard-root').count();
    assert.strictEqual(kbCount, 1, 'In-page keyboard must open on editable field');
    console.log('✓ PASS: In-page keyboard opened on input activation.');

    // Test typing via keyboard switch
    console.log('4. Selecting row and character in keyboard...');
    await page.keyboard.press('Space'); // select row -> switch to key level
    await page.waitForTimeout(300);
    await page.keyboard.press('Space'); // select key -> types word/letter
    await page.waitForTimeout(400);

    const typedVal = await page.locator('#username').inputValue();
    assert.ok(typedVal.length > 0, 'Keyboard switch must insert text into input field');
    console.log(`✓ PASS: Text typed into field: "${typedVal}"`);

    // Test Escape closing keyboard
    console.log('5. Pressing Escape to close keyboard...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const kbAfterEsc = await page.locator('#access-kb-matrix').count();
    assert.strictEqual(kbAfterEsc, 0, 'Escape must close the keyboard matrix');
    console.log('✓ PASS: Keyboard closed cleanly on Escape.');

    // Test Pause (P)
    console.log('6. Testing Pause/Resume toggle (P)...');
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    const dockText = await page.locator('#access-scan-dock-text').textContent();
    assert.strictEqual(dockText, 'PAUSED', 'Pressing P must pause scanner');
    console.log('✓ PASS: Scanner paused with "P".');

    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    const dockTextResumed = await page.locator('#access-scan-dock-text').textContent();
    assert.notStrictEqual(dockTextResumed, 'PAUSED', 'Pressing P again must resume scanner');
    console.log('✓ PASS: Scanner resumed successfully.');

    // Test popup
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extId = sw.url().split('/')[2];
    console.log(`7. Testing access scan1 popup (ID: ${extId})...`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extId}/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    const popupTitle = await popupPage.locator('.brand h3').textContent();
    assert.strictEqual(popupTitle, 'access scan1', 'Popup title must be "access scan1"');

    const toggleBtn = popupPage.locator('#toggleBtn');
    assert.ok(await toggleBtn.isVisible(), 'toggleBtn should be visible');
    await toggleBtn.click();
    await popupPage.waitForTimeout(300);
    console.log('✓ PASS: Popup controls toggled cleanly.');

    await popupPage.close();

    console.log('Checking for any errors...');
    assert.strictEqual(errors.length, 0, `No errors should occur: ${JSON.stringify(errors)}`);

    console.log('========================================================');
    console.log('✓ SUCCESS: access scan1 extension verified and running!');
    console.log('========================================================');
  } finally {
    await context.close();
    server.close();
  }
});
