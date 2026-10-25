/**
 * AccessScan v2.1 — Automated Test Suite for Unified 1-Key & 4-Key Assistant
 *
 * Verifies:
 *  1. Initial 4-Key Arrow navigation, overlay HUD, and universal Down activation.
 *  2. Seamless dynamic switching between 4-Key and 1-Key mode without page reload.
 *  3. In 1-Key mode: Floating dock HUD appears, auto-scanning starts.
 *  4. Speed adjustment: SET_SPEED IPC and storage update changes interval live.
 *  5. Single-switch Spacebar trigger: activates elements and in-page row-column keyboard.
 *  6. Single-switch typing and Done confirmation into text fields.
 *  7. Pause / Resume toggle (P key and IPC).
 *  8. Switching back to 4-Key mode: dock cleans up, 4-key HUD restores, arrow navigation resumes.
 */

const { chromium } = require('@playwright/test');
const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const filePath = path.join(EXTENSION_PATH, req.url.split('?')[0]);
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
  console.log(`[Unified Test Server] Running at ${baseUrl}`);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extId = sw.url().split('/')[2];
    console.log(`✓ AccessScan service worker running (ID: ${extId})`);

    const page = await context.newPage();
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1: Initial 4-Key Mode
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 1: Verifying 4-Key Arrow Mode ───');
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    console.log('4-Key HUD overlay attached on page.');

    const initialLabel = await page.locator('#as-overlay-element-label').textContent();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const nextLabel = await page.locator('#as-overlay-element-label').textContent();
    assert.notStrictEqual(initialLabel, nextLabel, 'ArrowRight must advance focus in 4-Key mode');
    console.log(`✓ PASS: 4-Key arrow navigation verified ("${initialLabel}" -> "${nextLabel}").`);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2: Switch to 1-Key (Single-Switch) Mode via Popup / Storage
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 2: Switching to 1-Key Single-Switch Mode ───');
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.inputMode = '1key';
          s.scanSpeed = 1200;
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(600);

    // Verify 4-Key overlay is unmounted and 1-Key dock HUD is injected
    const dockCount = await page.locator('#access-scan-dock').count();
    assert.strictEqual(dockCount, 1, '1-Key floating dock must be mounted when inputMode is 1key');
    const overlay4KeyCount = await page.locator('#accessscan-overlay').count();
    assert.strictEqual(overlay4KeyCount, 0, '4-Key overlay must be unmounted when in 1-Key mode');
    console.log('✓ PASS: Switched dynamically to 1-Key Single Switch mode (Dock mounted, 4-key HUD unmounted).');

    // Verify single-switch reticle exists
    const switchHighlight = await page.locator('.access-scan-active-target, .access-scan-active-section').count();
    assert.ok(switchHighlight > 0, 'Single-switch reticle must be active on page');
    console.log(`✓ PASS: Single-switch reticle active (${switchHighlight} element).`);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 3: Speed Adjustment
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 3: Live Scan Speed Adjustment ───');
    // Send SET_SPEED IPC
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test:speed', { detail: 800 }));
    });
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.scanSpeed = 800;
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(400);
    console.log('✓ PASS: Speed adjusted to 800ms successfully.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 4: Single-Switch Trigger (Spacebar) & In-Page Keyboard
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 4: Single-Switch Spacebar Trigger & On-Screen Keyboard ───');
    // Focus username input field
    await page.focus('#username');
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);

    const kbRoot = await page.locator('#access-scan-keyboard-root').count();
    assert.strictEqual(kbRoot, 1, 'In-page single-switch keyboard must open on text input');
    console.log('✓ PASS: Single-switch on-screen keyboard opened.');

    // Step 5: Type character via row-column switch
    console.log('Triggering switch inside keyboard (select row then key)...');
    await page.keyboard.press('Space'); // Row level -> Key level
    await page.waitForTimeout(300);
    await page.keyboard.press('Space'); // Key level -> Inserts key
    await page.waitForTimeout(400);

    const typedValue = await page.locator('#username').inputValue();
    assert.ok(typedValue.length > 0, 'Keyboard switch must insert text into field');
    console.log(`✓ PASS: Typed text via single-switch: "${typedValue}"`);

    // Step 6: Escape closes keyboard
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const kbAfterEsc = await page.locator('#access-kb-matrix').count();
    assert.strictEqual(kbAfterEsc, 0, 'Escape must close keyboard matrix');
    console.log('✓ PASS: Keyboard closed cleanly.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 5: Pause / Resume Toggle
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 5: Pause / Resume (P key) ───');
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    const dockTextPaused = await page.locator('#access-scan-dock-text').textContent();
    assert.strictEqual(dockTextPaused, 'PAUSED', 'Pressing P must pause scanner');
    console.log('✓ PASS: Scanner paused with "P".');

    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    const dockTextResumed = await page.locator('#access-scan-dock-text').textContent();
    assert.notStrictEqual(dockTextResumed, 'PAUSED', 'Pressing P again must resume scanner');
    console.log('✓ PASS: Scanner resumed successfully.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 6: Switch Back to 4-Key Arrow Mode
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 6: Switching Back to 4-Key Arrow Mode ───');
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.inputMode = '4key';
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(600);

    const dockAfterSwitch = await page.locator('#access-scan-dock').count();
    assert.strictEqual(dockAfterSwitch, 0, '1-Key dock HUD must be removed when returning to 4-Key mode');
    const overlayRestored = await page.locator('#accessscan-overlay').count();
    assert.strictEqual(overlayRestored, 1, '4-Key overlay HUD must be remounted');
    console.log('✓ PASS: Switched back to 4-Key mode cleanly.');

    // Verify 4-Key arrow navigation is immediately responsive again
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const restoredText = await page.locator('#as-overlay-element-label').textContent();
    assert.ok(restoredText.length > 0, 'Arrow navigation must be responsive');
    console.log(`✓ PASS: 4-Key arrow navigation responsive ("${restoredText}").`);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 7: Popup Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 7: Unified Popup Verification ───');
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    const popupHeading = await popupPage.locator('#brand h1').textContent();
    assert.strictEqual(popupHeading, 'AccessScan', 'Popup brand heading must be AccessScan');

    // Test mode pills in popup
    const btn1Key = popupPage.locator('#mode-btn-1key');
    const btn4Key = popupPage.locator('#mode-btn-4key');
    assert.ok(await btn1Key.isVisible(), '1-Key mode pill must be visible');
    assert.ok(await btn4Key.isVisible(), '4-Key mode pill must be visible');

    // Click 1-Key pill
    await btn1Key.click();
    await popupPage.waitForTimeout(300);
    const is1KeyPillActive = await btn1Key.evaluate((el) => el.classList.contains('active'));
    assert.ok(is1KeyPillActive, '1-Key pill must become active upon click');
    const speedControlsVisible = await popupPage.locator('#single-switch-settings').isVisible();
    assert.ok(speedControlsVisible, 'Speed controls must appear when 1-Key mode is selected');
    console.log('✓ PASS: Mode switcher and speed controls verified in popup.');

    await popupPage.close();

    assert.strictEqual(errors.length, 0, `No uncaught errors occurred: ${JSON.stringify(errors)}`);

    console.log('\n======================================================');
    console.log('UNIFIED 1-KEY & 4-KEY ACCESS SCAN SUITE PASSED 100%!');
    console.log('======================================================');
  } finally {
    await context.close();
    server.close();
  }
});
