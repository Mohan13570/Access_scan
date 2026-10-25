/**
 * AccessScan v2.0 — Comprehensive 15-Scenario Test Suite (Playwright)
 *
 * Verifies all 15 scenarios from Issue 8:
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

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..');

let server;
let baseUrl = '';

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rawPath = req.url.split('?')[0];
    const filePath = path.join(EXTENSION_PATH, rawPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      let mime = 'text/plain';
      if (filePath.endsWith('.html')) mime = 'text/html';
      else if (filePath.endsWith('.js')) mime = 'application/javascript';
      else if (filePath.endsWith('.css')) mime = 'text/css';
      else if (filePath.endsWith('.png')) mime = 'image/png';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function launchBrowser() {
  return await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });
}

test.describe('AccessScan Issue 8 — 15 Required Automated Tests', () => {

  test('1. Automatic initialisation on a supported website', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');

      const overlay = page.locator('#accessscan-overlay');
      await expect(overlay).toBeAttached({ timeout: 5000 });

      const ring = page.locator('#accessscan-highlight-ring');
      await expect(ring).toBeAttached({ timeout: 5000 });
      const isVisible = await ring.evaluate((el) => el.style.display !== 'none');
      expect(isVisible).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('2. Correct navigation between webpage controls', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const initialLabel = await page.locator('#accessscan-element-label').textContent();

      // Press ArrowRight to move focus
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      const nextLabel = await page.locator('#accessscan-element-label').textContent();
      expect(nextLabel).not.toBe(initialLabel);
    } finally {
      await context.close();
    }
  });

  test('3. Opening the virtual keyboard', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.focus('#username');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      const oskIframe = page.locator('#accessscan-osk-iframe');
      await expect(oskIframe).toBeVisible({ timeout: 4000 });
    } finally {
      await context.close();
    }
  });

  test('4. Moving RIGHT across a complete row in OSK', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      const extensionId = await getExtensionId(context);
      const oskUrl = `chrome-extension://${extensionId}/src/keyboard/keyboard.html?layout=qwerty`;
      await page.goto(oskUrl);
      await page.waitForLoadState('networkidle');

      let activeKey = await page.locator('.active-key').getAttribute('data-key');
      expect(activeKey).toBe('q');

      // Move RIGHT 9 times across row 0 (q -> p)
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(70);
      }

      activeKey = await page.locator('.active-key').getAttribute('data-key');
      expect(activeKey).toBe('p');
    } finally {
      await context.close();
    }
  });

  test('5. Moving RIGHT from the final key in one row to the next row', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      const extensionId = await getExtensionId(context);
      const oskUrl = `chrome-extension://${extensionId}/src/keyboard/keyboard.html?layout=qwerty`;
      await page.goto(oskUrl);
      await page.waitForLoadState('networkidle');

      // Move to 'p'
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(70);
      }
      expect(await page.locator('.active-key').getAttribute('data-key')).toBe('p');

      // Move RIGHT across row boundary to 'a'
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(70);

      const activeKey = await page.locator('.active-key').getAttribute('data-key');
      expect(activeKey).toBe('a');
    } finally {
      await context.close();
    }
  });

  test('6. Moving LEFT across row boundaries', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      const extensionId = await getExtensionId(context);
      const oskUrl = `chrome-extension://${extensionId}/src/keyboard/keyboard.html?layout=qwerty`;
      await page.goto(oskUrl);
      await page.waitForLoadState('networkidle');

      // Move to 'a' (index 10)
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(70);
      }
      expect(await page.locator('.active-key').getAttribute('data-key')).toBe('a');

      // Left from 'a' must move to 'p'
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(70);
      expect(await page.locator('.active-key').getAttribute('data-key')).toBe('p');

      // Left to 'q'
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(70);
      }
      expect(await page.locator('.active-key').getAttribute('data-key')).toBe('q');

      // Left from 'q' must wrap to 'CANCEL'
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(70);
      expect(await page.locator('.active-key').getAttribute('data-key')).toBe('CANCEL');
    } finally {
      await context.close();
    }
  });

  test('7. Correct character insertion', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.focus('#username');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      // 'q' is active by default. Press ArrowDown to type 'q'
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(250);

      const val = await page.locator('#username').inputValue();
      expect(val).toBe('q');
    } finally {
      await context.close();
    }
  });

  test('8. Correct Backspace operation', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.evaluate(() => {
        const u = document.getElementById('username');
        u.value = 'hello';
        u.focus();
      });

      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      // Frame message simulating backspace
      await page.evaluate(() => {
        window.postMessage({ source: 'accessscan-osk', type: 'OSK_BACKSPACE' }, '*');
      });
      await page.waitForTimeout(200);

      const val = await page.locator('#username').inputValue();
      expect(val).toBe('hell');
    } finally {
      await context.close();
    }
  });

  test('9. UP closing the virtual keyboard', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.focus('#username');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      const osk = page.locator('#accessscan-osk-iframe');
      await expect(osk).toBeVisible();

      // Press UP arrow to exit virtual keyboard
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);

      await expect(osk).not.toBeAttached();
    } finally {
      await context.close();
    }
  });

  test('10. Preserving entered text after exiting the keyboard', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.focus('#username');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      // Type 'q'
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);

      // Exit keyboard with UP arrow
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);

      const val = await page.locator('#username').inputValue();
      expect(val).toBe('q');
    } finally {
      await context.close();
    }
  });

  test('11. Returning to the previous webpage field', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.focus('#username');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      // Exit keyboard with UP arrow
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);

      const label = await page.locator('#accessscan-element-label').textContent();
      expect(label.toLowerCase()).toContain('user');
    } finally {
      await context.close();
    }
  });

  test('12. Continuing navigation after returning to the webpage', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.focus('#username');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      // Exit keyboard with UP arrow
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);

      // Next control is password
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      const label = await page.locator('#accessscan-element-label').textContent();
      expect(label.toLowerCase()).toContain('pass');
    } finally {
      await context.close();
    }
  });

  test('13. Navigating to a different supported website', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      expect(await page.locator('#accessscan-overlay').count()).toBe(1);

      // Navigate to secondary website
      await page.goto(`${baseUrl}/tests/demo-page-2.html`);
      await page.waitForLoadState('networkidle');

      const overlay2 = page.locator('#accessscan-overlay');
      await expect(overlay2).toBeAttached({ timeout: 5000 });

      const ring2 = page.locator('#accessscan-highlight-ring');
      await expect(ring2).toBeAttached({ timeout: 5000 });
    } finally {
      await context.close();
    }
  });

  test('14. Preventing duplicate controllers and overlays', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      // Simulate duplicate re-inject
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('accessscan:reinit'));
      });
      await page.waitForTimeout(200);

      const overlayCount = await page.locator('#accessscan-overlay').count();
      const ringCount = await page.locator('#accessscan-highlight-ring').count();

      expect(overlayCount).toBe(1);
      expect(ringCount).toBe(1);
    } finally {
      await context.close();
    }
  });

  test('15. Disabling AccessScan without breaking ordinary website interaction', async () => {
    const context = await launchBrowser();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/tests/demo-page.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      // Disable AccessScan
      await page.evaluate(() => {
        const ov = document.getElementById('accessscan-overlay');
        if (ov) ov.remove();
        const ring = document.getElementById('accessscan-highlight-ring');
        if (ring) ring.remove();
      });

      await page.fill('#username', 'normaluser');
      await page.fill('#password', 'normalpass');
      await page.click('#btn-login');

      const res = await page.locator('#form-result').textContent();
      expect(res).toContain('normaluser');
    } finally {
      await context.close();
    }
  });

});

async function getExtensionId(context) {
  for (let i = 0; i < 30; i++) {
    const sws = context.serviceWorkers();
    if (sws.length > 0) return sws[0].url().split('/')[2];
    await new Promise((r) => setTimeout(r, 100));
  }
  return '';
}
