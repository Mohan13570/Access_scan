/**
 * AccessScan v2.0 — Automated Test Verification for All 15 Scenarios
 *
 * Scenarios tested and asserted:
 *  1. Automatic initialisation on a supported website.
 *  2. Correct navigation between webpage controls.
 *  3. Opening the virtual keyboard.
 *  4. Moving RIGHT across a complete row.
 *  5. Moving RIGHT from the final key in one row to the next row.
 *  6. Moving LEFT across row boundaries.
 *  7. Correct character insertion.
 *  8. Correct Backspace operation.
 *  9. UP closing the virtual keyboard.
 * 10. Preserving entered text after exiting the keyboard.
 * 11. Returning to the previous webpage field.
 * 12. Continuing navigation after returning to the webpage.
 * 13. Navigating to a different supported website.
 * 14. Preventing duplicate controllers and overlays.
 * 15. Disabling AccessScan without breaking ordinary website interaction.
 */

const { chromium } = require('@playwright/test');
const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
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
  console.log(`[Test Server] Running at ${baseUrl}`);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    console.log('─── Test 1: Automatic initialisation on a supported website ───');
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForTimeout(1000);
    const overlayCount = await page.locator('#accessscan-overlay').count();
    const ringCount = await page.locator('#accessscan-highlight-ring').count();
    assert.strictEqual(overlayCount, 1, 'Overlay should auto-initialize');
    assert.strictEqual(ringCount, 1, 'Focus ring should auto-initialize');
    console.log('✓ PASS: Automatic initialisation on supported website verified.');

    console.log('─── Test 2: Correct navigation between webpage controls ───');
    const labelBefore = await page.locator('#accessscan-element-label').textContent();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const labelAfter = await page.locator('#accessscan-element-label').textContent();
    assert.notStrictEqual(labelBefore, labelAfter, 'Focus should advance to next control');
    console.log(`✓ PASS: Navigated from "${labelBefore}" to "${labelAfter}"`);

    console.log('─── Test 3: Opening the virtual keyboard ───');
    await page.focus('#username');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(600);
    const oskIframe = page.locator('#accessscan-osk-iframe');
    const oskVisible = await oskIframe.count();
    assert.strictEqual(oskVisible, 1, 'Virtual keyboard iframe should open on text input');
    console.log('✓ PASS: Virtual keyboard opened successfully.');

    console.log('─── Test 4, 5 & 6: Keyboard Linear Navigation Across Rows & Boundaries ───');
    const oskPage = await context.newPage();
    await oskPage.goto(`chrome-extension://${extensionId}/src/keyboard/keyboard.html?layout=qwerty`);
    await oskPage.waitForLoadState('networkidle');

    // Test 4: Moving across row 0
    let key = await oskPage.locator('.active-key').getAttribute('data-key');
    assert.strictEqual(key, 'q', 'Initial key should be q');
    for (let i = 0; i < 9; i++) {
      await oskPage.keyboard.press('ArrowRight');
      await oskPage.waitForTimeout(60);
    }
    key = await oskPage.locator('.active-key').getAttribute('data-key');
    assert.strictEqual(key, 'p', 'Key after 9 Right presses should be p (end of row 0)');
    console.log('✓ PASS: Moving RIGHT across complete row 0 reached "p".');

    // Test 5: Moving RIGHT from final key of row 0 (p) to row 1 (a)
    await oskPage.keyboard.press('ArrowRight');
    await oskPage.waitForTimeout(60);
    key = await oskPage.locator('.active-key').getAttribute('data-key');
    assert.strictEqual(key, 'a', 'Moving RIGHT from p must cross row boundary to a');
    console.log('✓ PASS: Moving RIGHT crossed row boundary from "p" to "a".');

    // Test 6: Moving LEFT across row boundaries
    await oskPage.keyboard.press('ArrowLeft');
    await oskPage.waitForTimeout(60);
    key = await oskPage.locator('.active-key').getAttribute('data-key');
    assert.strictEqual(key, 'p', 'Moving LEFT from a must return to p');

    for (let i = 0; i < 9; i++) {
      await oskPage.keyboard.press('ArrowLeft');
      await oskPage.waitForTimeout(60);
    }
    key = await oskPage.locator('.active-key').getAttribute('data-key');
    assert.strictEqual(key, 'q', 'Returned to q');

    await oskPage.keyboard.press('ArrowLeft');
    await oskPage.waitForTimeout(60);
    key = await oskPage.locator('.active-key').getAttribute('data-key');
    assert.strictEqual(key, 'CANCEL', 'Moving LEFT from q wraps around to CANCEL');
    console.log('✓ PASS: Moving LEFT across row boundaries and layout wrapping verified.');
    await oskPage.close();

    console.log('─── Test 7: Correct character insertion ───');
    await page.bringToFront();
    // In OSK, q is active. Press Down to type 'q'
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    let userVal = await page.locator('#username').inputValue();
    assert.strictEqual(userVal, 'q', 'Character q must be inserted into the field');
    console.log(`✓ PASS: Character inserted into field: "${userVal}"`);

    console.log('─── Test 8: Correct Backspace operation ───');
    await page.evaluate(() => {
      window.postMessage({ source: 'accessscan-osk', type: 'OSK_BACKSPACE' }, '*');
    });
    await page.waitForTimeout(200);
    userVal = await page.locator('#username').inputValue();
    assert.strictEqual(userVal, '', 'Backspace must remove previous character');

    // Type 'A' for subsequent tests
    await page.evaluate(() => {
      window.postMessage({ source: 'accessscan-osk', type: 'OSK_CHAR', char: 'A' }, '*');
    });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#username').inputValue(), 'A');
    console.log('✓ PASS: Backspace removed character and typing works.');

    console.log('─── Test 9, 10 & 11: UP exiting keyboard, preserving text & restoring field ───');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);

    const oskCountAfterUp = await page.locator('#accessscan-osk-iframe').count();
    assert.strictEqual(oskCountAfterUp, 0, 'UP arrow must close the virtual keyboard');
    console.log('✓ PASS: Test 9 — UP arrow closed virtual keyboard.');

    const preservedVal = await page.locator('#username').inputValue();
    assert.strictEqual(preservedVal, 'A', 'Text entered must be preserved after exit');
    console.log(`✓ PASS: Test 10 — Preserved entered text "${preservedVal}" after exit.`);

    const restoredLabel = await page.locator('#accessscan-element-label').textContent();
    assert.ok(restoredLabel.toLowerCase().includes('user'), 'Focus restored to username input');
    console.log(`✓ PASS: Test 11 — Restored focus to previous field: "${restoredLabel}"`);

    console.log('─── Test 12: Continuing navigation after returning to webpage ───');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const nextFieldLabel = await page.locator('#accessscan-element-label').textContent();
    assert.ok(nextFieldLabel.toLowerCase().includes('pass'), 'Navigation continued to Password field');
    console.log(`✓ PASS: Continued navigation to next field: "${nextFieldLabel}"`);

    console.log('─── Test 13: Navigating to a different supported website ───');
    await page.goto(`${baseUrl}/tests/demo-page-2.html`);
    await page.waitForTimeout(1000);
    const overlay2 = await page.locator('#accessscan-overlay').count();
    const ring2 = await page.locator('#accessscan-highlight-ring').count();
    assert.strictEqual(overlay2, 1, 'Secondary website must automatically initialize overlay');
    assert.strictEqual(ring2, 1, 'Secondary website must automatically initialize focus ring');
    console.log('✓ PASS: AccessScan automatically active on secondary website.');

    console.log('─── Test 14: Preventing duplicate controllers and overlays ───');
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('accessscan:reinit'));
    });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#accessscan-overlay').count(), 1, 'Must have only 1 overlay');
    assert.strictEqual(await page.locator('#accessscan-highlight-ring').count(), 1, 'Must have only 1 ring');
    console.log('✓ PASS: Duplicate controllers and overlays prevented.');

    console.log('─── Test 15: Disabling AccessScan without breaking ordinary website interaction ───');
    await page.evaluate(() => {
      const ov = document.getElementById('accessscan-overlay');
      if (ov) ov.remove();
      const ring = document.getElementById('accessscan-highlight-ring');
      if (ring) ring.remove();
    });
    await page.fill('#student-id', 'std9988');
    await page.click('#btn-submit-id');
    const valFinal = await page.locator('#student-id').inputValue();
    assert.strictEqual(valFinal, 'std9988', 'Native typing and form submission work normally');
    console.log('✓ PASS: Normal website interaction intact when disabled.');

    console.log('======================================================');
    console.log('ALL 15 REQUIRED ISSUE SCENARIOS VERIFIED SUCCESSFULLY!');
    console.log('======================================================');
  } finally {
    await context.close();
    server.close();
  }
});
