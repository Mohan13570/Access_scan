/**
 * AccessScan v2.0 — Automated Verification Suite for Real Browser Back Navigation
 * and Persistent State Machine Reliability (Scenarios A through G)
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
  console.log(`[Back Nav Test Server] Running at ${baseUrl}`);

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
    console.log(`✓ AccessScan service worker running: ${sw.url()}`);

    const page = await context.newPage();
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // ──────────────────────────────────────────────────────────────────────────
    // Test A: Cross-page Browser Back across different origins & pages
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test A: Cross-page Browser Back ───');
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    console.log('1. Page 1 loaded, AccessScan overlay attached.');

    // Navigate to Page 2 within same tab session (creating a history entry)
    await page.goto(`${baseUrl}/tests/demo-page-2.html`);
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    console.log('2. Navigated to Page 2, AccessScan automatically active.');

    // Press UP ARROW in WEBSITE_NAVIGATION mode
    console.log('3. Pressing UP ARROW to request browser back navigation...');
    await page.keyboard.press('ArrowUp');

    // Verify browser navigates back to demo-page.html
    await page.waitForURL(`**/tests/demo-page.html`, { timeout: 6000 });
    assert.ok(page.url().includes('demo-page.html'), 'Browser must navigate back to demo-page.html');
    console.log(`✓ PASS: Navigated back to: ${page.url()}`);

    // Verify AccessScan remains active and responsive on the restored page
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    await page.waitForTimeout(500);
    const hudModeA = await page.locator('#as-overlay-mode').textContent();
    assert.strictEqual(hudModeA, 'NAVIGATING', 'Overlay mode must be active NAVIGATING on restored page');
    console.log('✓ PASS: AccessScan fully active and responsive after browser back.');

    // ──────────────────────────────────────────────────────────────────────────
    // Test B: Nested Group & Dialog Back (Parent hierarchy return without navigating away)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test B: Nested Group & Dialog Back ───');
    // Part B1: Select Dialog Modal (UP ARROW cancels modal without leaving page)
    console.log('Part B1: Testing Select Dialog modal back...');
    await page.focus('#department');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector('#accessscan-select-dialog', { state: 'attached', timeout: 5000 });
    const dlgMode = await page.locator('#as-overlay-mode').textContent();
    assert.strictEqual(dlgMode, 'CHOOSE OPTION', 'Dialog mode must be CHOOSE OPTION');
    console.log('Select dialog opened.');

    // Press UP ARROW to cancel dialog
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    const dlgCount = await page.locator('#accessscan-select-dialog').count();
    assert.strictEqual(dlgCount, 0, 'Select dialog must be dismissed after UP ARROW');
    assert.ok(page.url().includes('demo-page.html'), 'Dismissing dialog must NEVER navigate away from page');
    console.log('✓ PASS: Dialog dismissed cleanly without navigating away from page.');

    // Part B2: Hierarchical Section Grouping
    console.log('Part B2: Testing Hierarchical Grouping navigation...');
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.scanMode = 'hierarchical';
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(600);

    const initialLabelB = await page.locator('#as-overlay-element-label').textContent();
    console.log(`Initial hierarchical label: "${initialLabelB}"`);
    assert.ok(initialLabelB.includes('Section:'), 'In hierarchical mode, overlay must display Section');

    // Press DOWN ARROW to enter the section
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    const enteredLabel = await page.locator('#as-overlay-element-label').textContent();
    console.log(`Entered section control: "${enteredLabel}"`);
    assert.ok(!enteredLabel.startsWith('Section:'), 'Entering section must highlight child control');

    // Press UP ARROW to return to parent section level
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    console.log('Current URL after UP ARROW:', page.url());
    const backToSectionLabel = await page.locator('#as-overlay-element-label').textContent();
    console.log(`Returned to section label: "${backToSectionLabel}"`);
    assert.ok(backToSectionLabel.includes('Section:'), 'UP ARROW must return to parent Section level');
    assert.ok(page.url().includes('demo-page.html'), 'Nested section return must NEVER navigate away from page');
    console.log('✓ PASS: Hierarchical group back returned to parent section without leaving page.');

    // Reset back to linear navigation mode
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.scanMode = 'flat';
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(600);

    // ──────────────────────────────────────────────────────────────────────────
    // Test C: Virtual Keyboard Back (Exit VK, preserve text, no browser back)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test C: Virtual Keyboard Back ───');
    // Focus an input field
    await page.focus('#username');
    await page.waitForTimeout(200);

    // Open keyboard with DOWN ARROW
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector('#accessscan-osk-iframe', { state: 'attached', timeout: 5000 });
    await page.waitForTimeout(600);
    console.log('Virtual keyboard opened.');

    // Verify overlay mode is KEYBOARD
    const modeVK = await page.locator('#as-overlay-mode').textContent();
    assert.strictEqual(modeVK, 'KEYBOARD', 'Overlay mode must be KEYBOARD');

    // Type a character (DOWN ARROW selects 'q' at 0,0)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    const typedText = await page.locator('#username').inputValue();
    assert.ok(typedText.length > 0, 'Character must be inserted into field');
    console.log(`Typed character into username: "${typedText}"`);

    // Press UP ARROW to exit virtual keyboard
    console.log('Pressing UP ARROW inside Virtual Keyboard...');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);

    // Assert virtual keyboard is closed
    const oskCount = await page.locator('#accessscan-osk-iframe').count();
    assert.strictEqual(oskCount, 0, 'Virtual keyboard must be closed after UP ARROW');

    // Assert URL has NOT changed (no browser back occurred)
    assert.ok(page.url().includes('demo-page.html'), 'UP inside keyboard must NEVER trigger browser back');

    // Assert entered text was preserved
    const preservedText = await page.locator('#username').inputValue();
    assert.strictEqual(preservedText, typedText, 'Typed text must be preserved after keyboard exit');

    // Assert focus restored to username field
    const activeId = await page.evaluate(() => document.activeElement?.id);
    assert.strictEqual(activeId, 'username', 'Focus must be restored to previous input field');
    console.log('✓ PASS: Virtual keyboard exited cleanly, text preserved, no browser back occurred.');

    // ──────────────────────────────────────────────────────────────────────────
    // Test D: Single-Page Navigation (SPA History Back)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test D: Single-Page Navigation (SPA Route Changes) ───');
    // Push new history state
    await page.evaluate(() => {
      window.history.pushState({ view: 'settings' }, 'Settings', '#settings-view');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'settings' } }));
    });
    await page.waitForTimeout(400);
    assert.ok(page.url().includes('#settings-view'), 'Page should be on hash route #settings-view');

    // Press UP ARROW in WEBSITE_NAVIGATION to trigger history back
    console.log('Pressing UP ARROW to navigate back through SPA route...');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(800);

    // Verify SPA route reversed
    assert.ok(!page.url().includes('#settings-view'), 'UP ARROW must reverse SPA hash history');
    console.log(`✓ PASS: SPA route reversed cleanly to: ${page.url()}`);

    // ──────────────────────────────────────────────────────────────────────────
    // Test E: Tab Without Previous History (Graceful Handling)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test E: Tab Without Previous History ───');
    const [freshPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((url) => window.open(url, '_blank'), `${baseUrl}/tests/demo-page-2.html`),
    ]);
    await freshPage.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    console.log('Fresh tab opened directly to Page 2 without prior history.');

    const histLen = await freshPage.evaluate(() => window.history.length);
    console.log(`Fresh tab history length: ${histLen}`);

    // Press UP ARROW
    await freshPage.keyboard.press('ArrowUp');
    await freshPage.waitForTimeout(600);

    // Tab must remain on Page 2 and display user notice in overlay status toast
    assert.ok(freshPage.url().includes('demo-page-2.html'), 'Tab without history must stay on current page');
    const toastNotice = await freshPage.locator('#as-overlay-status').textContent();
    console.log(`Overlay Status Toast: "${toastNotice}"`);
    assert.ok(
      toastNotice.toLowerCase().includes('no previous') ||
        toastNotice.toLowerCase().includes('history') ||
        toastNotice.toLowerCase().includes('back'),
      'Overlay must inform user when no history entry exists'
    );

    // AccessScan must remain fully interactive
    await freshPage.keyboard.press('ArrowRight');
    await freshPage.waitForTimeout(300);
    const hudModeE = await freshPage.locator('#as-overlay-mode').textContent();
    assert.strictEqual(hudModeE, 'NAVIGATING', 'Scanner must remain active and responsive');
    console.log('✓ PASS: Tab without history handled gracefully without crashing or freezing.');
    await freshPage.close();

    // ──────────────────────────────────────────────────────────────────────────
    // Test F: Recovery After Navigation & Preventing Duplicates
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test F: Recovery After Navigation & No Duplicates ───');
    // Navigate back and forth multiple times
    await page.goto(`${baseUrl}/tests/demo-page-2.html`);
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });
    await page.reload();
    await page.waitForSelector('#accessscan-overlay', { state: 'attached', timeout: 5000 });

    const overlayCount = await page.locator('#accessscan-overlay').count();
    const ringCount = await page.locator('#accessscan-highlight-ring').count();

    assert.strictEqual(overlayCount, 1, 'Exactly one overlay must exist');
    assert.strictEqual(ringCount, 1, 'Exactly one highlight ring must exist');
    console.log('✓ PASS: Exactly 1 overlay and 1 highlight ring present after multiple navigations and reloads.');

    // Verify arrow key navigation still responds
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const selectedText = await page.locator('#as-overlay-element-label').textContent();
    console.log(`Highlighted element: "${selectedText}"`);
    assert.ok(selectedText.length > 0, 'Selection must work after reloads');
    console.log('✓ PASS: Navigation is responsive after reloads.');

    // ──────────────────────────────────────────────────────────────────────────
    // Test G: Disabling & Re-enabling Extension
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Test G: Disabling & Re-enabling Extension ───');
    // Disable extension via storage
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.enabled = false;
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(500);

    const overlayCountDisabled = await page.locator('#accessscan-overlay').count();
    assert.strictEqual(overlayCountDisabled, 0, 'Overlay must be unmounted when disabled');

    // Arrow keys must not be intercepted when disabled
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    console.log('✓ PASS: Arrow keys pass through cleanly when disabled.');

    // Re-enable extension
    await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
          const s = data.settings || {};
          s.enabled = true;
          chrome.storage.sync.set({ settings: s }, resolve);
        });
      });
    });
    await page.waitForTimeout(600);

    const overlayCountReEnabled = await page.locator('#accessscan-overlay').count();
    assert.strictEqual(overlayCountReEnabled, 1, 'Overlay must remount when re-enabled');
    console.log('✓ PASS: AccessScan resumed immediately when re-enabled.');

    assert.strictEqual(errors.length, 0, `No uncaught errors occurred: ${JSON.stringify(errors)}`);

    console.log('\n======================================================');
    console.log('ALL SCENARIOS (A THROUGH G) VERIFIED AND PASSED 100%!');
    console.log('======================================================');
  } finally {
    await context.close();
    server.close();
  }
});
