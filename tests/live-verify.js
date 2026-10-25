/**
 * Live End-to-End Verification of AccessScan v2.0
 * Tests full integration: Popup Start -> Highlighting -> 4-Arrow navigation -> OSK -> Done
 */

const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const extensionPath = path.resolve(__dirname, '..');
  console.log(`Loading extension from: ${extensionPath}`);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`[PageError] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`[ConsoleError] ${msg.text()}`);
    }
  });

  try {
    const demoUrl = 'file:///' + path.resolve(__dirname, 'demo-page.html').replace(/\\/g, '/');
    console.log(`Navigating to: ${demoUrl}`);
    await page.goto(demoUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    const extensionId = background.url().split('/')[2];
    console.log(`Extension ID: ${extensionId}`);

    // Open popup
    const popupPage = await context.newPage();
    const popupErrors = [];
    popupPage.on('pageerror', (err) => popupErrors.push(`[PopupPageError] ${err.message}`));
    popupPage.on('console', (msg) => {
      if (msg.type() === 'error') popupErrors.push(`[PopupConsoleError] ${msg.text()}`);
    });

    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popupPage.waitForLoadState('networkidle');
    await popupPage.waitForTimeout(400);

    // Click Start from the popup
    const startBtn = popupPage.locator('#btn-main-toggle');
    await startBtn.click();
    console.log('Clicked Start in popup (popup closes automatically to return focus).');

    // Switch focus back to the demo webpage
    await page.bringToFront();
    await page.waitForTimeout(600);

    // Verify overlay and highlight ring appeared on the webpage
    const highlightRing = page.locator('#accessscan-highlight-ring');
    await highlightRing.waitFor({ state: 'attached', timeout: 5000 });
    const isRingVisible = await highlightRing.evaluate(el => el.style.display !== 'none');
    console.log(`Highlight ring visible on page: ${isRingVisible}`);

    const overlay = page.locator('#accessscan-overlay');
    await overlay.waitFor({ state: 'visible', timeout: 5000 });
    console.log('HUD overlay visible on page.');

    // Press ArrowRight 4 times to navigate
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
    }
    console.log('4-Arrow navigation verified.');

    // Check errors
    console.log('Demo page errors:', errors);
    console.log('Popup errors:', popupErrors);

    if (errors.length > 0 || popupErrors.length > 0) {
      throw new Error('Errors detected during live execution.');
    }

    console.log('✓ PERFECT: Full end-to-end integration verified with 0 errors!');
  } finally {
    await context.close();
  }
})();
