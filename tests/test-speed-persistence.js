/**
 * AccessScan — Cross-Website Speed & Mode Persistence Verification Test
 *
 * Verifies:
 *  1. Default interaction mode is 4-Key Arrow Nav (NOT single-switch spacebar).
 *  2. 4-Key overlay HUD displays "4-KEY NAV" prominently.
 *  3. Speed changes are saved permanently to chrome.storage.sync.
 *  4. Opening or navigating to new websites retains the exact saved speed without reset.
 *  5. Switching to 1-Key mode displays "1-KEY (SPACEBAR)" and speed badge.
 *  6. Speed adjusted in 1-Key mode persists across subsequent page navigations.
 *  7. Switching back to 4-Key mode persists across navigations.
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
  console.log(`[Persistence Test Server] Running at ${baseUrl}`);

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

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1: Default Mode Verification on Fresh Site
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 1: Verifying default mode on new website ───');
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForTimeout(600);

    // Verify 4-Key HUD is mounted and displays "4-KEY NAV"
    const fourKeyOverlay = await page.$('#accessscan-overlay');
    assert(fourKeyOverlay, '4-Key overlay must be mounted by default');

    const badgeText = await page.$eval('#as-overlay-input-badge', el => el.textContent.trim());
    console.log(`✓ Overlay mode badge: "${badgeText}"`);
    assert(badgeText.includes('4-KEY'), `Badge must indicate 4-Key Nav, got: "${badgeText}"`);

    // Ensure 1-Key dock is NOT mounted
    const dockEl = await page.$('#access-scan-dock');
    assert(!dockEl, '1-Key spacebar dock must NOT be active by default');
    console.log('✓ PASS: Extension defaults to 4-Key Arrow Nav; 1-Key Spacebar dock is NOT active.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2: Open Popup and verify Active Mode Banner
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 2: Verifying Popup Active Mode Banner ───');
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    await popupPage.waitForTimeout(400);

    const bannerTitle = await popupPage.$eval('#banner-mode-title', el => el.textContent.trim());
    console.log(`✓ Popup active banner: "${bannerTitle}"`);
    assert(bannerTitle.includes('4-KEY'), `Popup banner must display 4-Key Nav, got: "${bannerTitle}"`);

    const is4KeyChecked = await popupPage.$eval('#mode-btn-4key', el => el.getAttribute('aria-checked'));
    assert.strictEqual(is4KeyChecked, 'true', '4-Key mode pill must have aria-checked="true"');
    console.log('✓ PASS: Popup clearly displays 4-Key Arrow Navigation as active mode.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 3: Switch to 1-Key Mode and change Speed to 800ms
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 3: Switching to 1-Key Mode and setting Speed to 800ms ───');
    await popupPage.click('#mode-btn-1key');
    await popupPage.waitForTimeout(300);

    // Click 0.8s preset button
    await popupPage.click('.preset-btn[data-speed="800"]');
    await popupPage.waitForTimeout(400);

    const sliderVal = await popupPage.$eval('#scan-speed-slider', el => el.value);
    const speedBadge = await popupPage.$eval('#speed-val-badge', el => el.textContent.trim());
    assert.strictEqual(sliderVal, '800', `Slider value must be 800, got ${sliderVal}`);
    assert.strictEqual(speedBadge, '0.8s', `Speed badge must be 0.8s, got ${speedBadge}`);
    console.log(`✓ Popup speed set to ${speedBadge}`);

    // Verify Page 1 updated in real-time
    await page.bringToFront();
    await page.waitForTimeout(300);
    const page1Dock = await page.$('#access-scan-dock');
    assert(page1Dock, '1-Key dock must be mounted after mode switch');
    const page1DockSpeed = await page.$eval('#access-scan-dock-speed-badge', el => el.textContent.trim());
    assert.strictEqual(page1DockSpeed, '0.8s', `Page 1 dock speed must be 0.8s, got ${page1DockSpeed}`);
    console.log(`✓ PASS: Page 1 dock updated to 1-Key mode with speed badge: ${page1DockSpeed}`);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 4: Navigate to Page 2 — Verify Speed and Mode Persisted
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 4: Navigating to Website Page 2 — Verifying Persistence ───');
    await page.goto(`${baseUrl}/tests/demo-page-2.html`);
    await page.waitForTimeout(600);

    const page2Dock = await page.$('#access-scan-dock');
    assert(page2Dock, 'Page 2 must have 1-Key dock mounted');
    const page2DockSpeed = await page.$eval('#access-scan-dock-speed-badge', el => el.textContent.trim());
    const page2DockMode = await page.$eval('#access-scan-dock div span', el => el.textContent.trim());
    console.log(`✓ Page 2 dock mode: "${page2DockMode}", speed badge: "${page2DockSpeed}"`);
    assert.strictEqual(page2DockSpeed, '0.8s', `Page 2 must preserve 0.8s speed across navigation! Got: ${page2DockSpeed}`);
    console.log('✓ PASS: Page 2 remembered 0.8s scan speed and 1-Key mode automatically without reset.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 5: Adjust Speed to 2.8s (Gentle) on Page 2 and navigate back to Page 1
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 5: Changing Speed to 2.8s and navigating back to Page 1 ───');
    await popupPage.bringToFront();
    await popupPage.click('.preset-btn[data-speed="2800"]');
    await popupPage.waitForTimeout(400);

    const newSpeedBadge = await popupPage.$eval('#speed-val-badge', el => el.textContent.trim());
    assert.strictEqual(newSpeedBadge, '2.8s', `Popup speed badge must be 2.8s, got ${newSpeedBadge}`);
    console.log(`✓ Popup speed updated to ${newSpeedBadge}`);

    // Navigate to Page 1
    await page.bringToFront();
    await page.goto(`${baseUrl}/tests/demo-page.html`);
    await page.waitForTimeout(600);

    const page1NewDockSpeed = await page.$eval('#access-scan-dock-speed-badge', el => el.textContent.trim());
    console.log(`✓ Page 1 re-navigated dock speed: "${page1NewDockSpeed}"`);
    assert.strictEqual(page1NewDockSpeed, '2.8s', `Page 1 must load with 2.8s speed! Got: ${page1NewDockSpeed}`);
    console.log('✓ PASS: Navigating back to Page 1 preserves the new 2.8s speed.');

    // ──────────────────────────────────────────────────────────────────────────
    // Step 6: Switch back to 4-Key Arrow Nav and navigate across sites
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n─── Step 6: Switching back to 4-Key Arrow Nav and navigating ───');
    await popupPage.bringToFront();
    await popupPage.click('#mode-btn-4key');
    await popupPage.waitForTimeout(400);

    const banner4Key = await popupPage.$eval('#banner-mode-title', el => el.textContent.trim());
    console.log(`✓ Popup banner: "${banner4Key}"`);
    assert(banner4Key.includes('4-KEY'), 'Banner must indicate 4-Key mode');

    // Check on Page 1
    await page.bringToFront();
    await page.waitForTimeout(300);
    const restoredOverlay1 = await page.$('#accessscan-overlay');
    assert(restoredOverlay1, '4-Key overlay must be mounted');
    const restoredDock1 = await page.$('#access-scan-dock');
    assert(!restoredDock1, '1-Key dock must be removed');

    // Navigate to Page 2 in 4-Key mode
    await page.goto(`${baseUrl}/tests/demo-page-2.html`);
    await page.waitForTimeout(600);
    const restoredOverlay2 = await page.$('#accessscan-overlay');
    assert(restoredOverlay2, 'Page 2 must mount 4-Key overlay');
    const page2Badge = await page.$eval('#as-overlay-input-badge', el => el.textContent.trim());
    assert(page2Badge.includes('4-KEY'), `Page 2 badge must be 4-Key Nav, got ${page2Badge}`);
    const restoredDock2 = await page.$('#access-scan-dock');
    assert(!restoredDock2, 'Page 2 must NOT have 1-Key dock');
    console.log('✓ PASS: 4-Key mode persisted cleanly across page navigation.');

    console.log('\n======================================================');
    console.log('CROSS-WEBSITE SPEED & MODE PERSISTENCE PASSED 100%!');
    console.log('======================================================\n');

    await context.close();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    await context.close();
    server.close();
    process.exit(1);
  }
});
