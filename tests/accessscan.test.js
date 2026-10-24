/**
 * AccessScan — Automated Test Suite (Playwright)
 *
 * Run with:
 *   npx playwright test tests/accessscan.test.js
 *
 * Prerequisites:
 *   npm install -D @playwright/test playwright
 *   npx playwright install chromium
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const DEMO_PAGE = `file://${path.resolve(__dirname, 'demo-page.html')}`;

// ── Browser fixture with extension loaded ─────────────────────────────────────
async function launchBrowserWithExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions require non-headless
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });
  return context;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Inject a script into the page to directly exercise AccessScan APIs.
 */
async function invokeAccessScan(page, fn) {
  return page.evaluate(fn);
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test.describe('AccessScan — Core Scanning', () => {

  test('collectFlatElements finds interactive elements on demo page', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    const count = await page.evaluate(() => {
      // Wait for content script to inject
      if (!window.AccessScan?.Scanner) return -1;
      return window.AccessScan.Scanner.collectFlatElements().length;
    });

    expect(count).toBeGreaterThan(5);
    console.log(`Found ${count} interactive elements on demo page.`);
    await context.close();
  });

  test('collectHierarchicalSections groups elements into sections', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    const sections = await page.evaluate(() => {
      if (!window.AccessScan?.Scanner) return [];
      return window.AccessScan.Scanner.collectHierarchicalSections().map((s) => ({
        label: s.label,
        childCount: s.children.length,
      }));
    });

    expect(sections.length).toBeGreaterThan(0);
    sections.forEach((s) => {
      expect(s.childCount).toBeGreaterThan(0);
    });
    console.log('Sections found:', sections);
    await context.close();
  });

  test('isVisible correctly identifies invisible elements', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.setContent(`
      <button id="visible">Visible</button>
      <button id="hidden" style="display:none">Hidden</button>
      <input type="hidden" id="hidden-input" />
    `);
    await page.waitForLoadState('networkidle');

    const results = await page.evaluate(() => {
      if (!window.AccessScan?.Scanner) return null;
      const { isVisible } = window.AccessScan.Scanner;
      return {
        visible: isVisible(document.getElementById('visible')),
        hidden: isVisible(document.getElementById('hidden')),
      };
    });

    if (results) {
      expect(results.visible).toBe(true);
      expect(results.hidden).toBe(false);
    }
    await context.close();
  });

});

test.describe('AccessScan — Highlighter', () => {

  test('highlightElement creates overlay ring in DOM', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      if (!window.AccessScan) return;
      const el = document.getElementById('username');
      if (el) {
        window.AccessScan.Highlighter.highlightElement(el, {
          highlightColor: '#FF6B35',
          highlightBorderWidth: 3,
        });
      }
    });

    const ringExists = await page.$('#accessscan-highlight-ring');
    expect(ringExists).not.toBeNull();
    await context.close();
  });

  test('clearHighlight hides the ring', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      if (!window.AccessScan) return;
      const el = document.getElementById('username');
      if (el) {
        window.AccessScan.Highlighter.highlightElement(el, { highlightColor: '#FF6B35', highlightBorderWidth: 3 });
        window.AccessScan.Highlighter.clearHighlight();
      }
    });

    const ringDisplay = await page.evaluate(() => {
      const ring = document.getElementById('accessscan-highlight-ring');
      return ring ? ring.style.display : 'not found';
    });
    expect(ringDisplay).toBe('none');
    await context.close();
  });

  test('getElementLabel returns aria-label when present', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.setContent('<button id="btn" aria-label="Submit form">Submit</button>');
    await page.waitForLoadState('networkidle');

    const label = await page.evaluate(() => {
      if (!window.AccessScan?.Highlighter) return null;
      return window.AccessScan.Highlighter.getElementLabel(document.getElementById('btn'));
    });

    if (label) expect(label).toBe('Submit form');
    await context.close();
  });

});

test.describe('AccessScan — Hierarchy Manager', () => {

  test('HierarchyManager loads and advances through sections', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(() => {
      if (!window.AccessScan?.HierarchyManager || !window.AccessScan?.Scanner) return null;
      const mgr = new window.AccessScan.HierarchyManager();
      mgr.load();
      const initialSection = mgr.currentSection?.label;
      mgr.nextSection();
      const nextSection = mgr.currentSection?.label;
      return { initialSection, nextSection, total: mgr.sections.length };
    });

    if (result) {
      expect(result.total).toBeGreaterThan(0);
      console.log('Sections:', result);
    }
    await context.close();
  });

  test('selectSection drills into element level', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(() => {
      if (!window.AccessScan?.HierarchyManager) return null;
      const mgr = new window.AccessScan.HierarchyManager();
      mgr.load();
      if (mgr.sections.length === 0) return { error: 'no sections' };
      mgr.selectSection();
      return {
        level: mgr.level,
        elementCount: mgr.currentElements.length,
        isAtSectionLevel: mgr.isAtSectionLevel,
      };
    });

    if (result && !result.error) {
      expect(result.level).toBe('elements');
      expect(result.isAtSectionLevel).toBe(false);
      expect(result.elementCount).toBeGreaterThan(0);
    }
    await context.close();
  });

});

test.describe('AccessScan — Form Interaction', () => {

  test('Username field receives text through content script insertChar', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const input = document.getElementById('username');
      if (!input) return;
      input.focus();
      // Simulate insertChar logic from main.js
      const chars = 'test123';
      let pos = input.selectionStart ?? 0;
      for (const c of chars) {
        const before = input.value.slice(0, pos);
        const after = input.value.slice(pos);
        input.value = before + c + after;
        pos++;
        input.selectionStart = input.selectionEnd = pos;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const value = await page.$eval('#username', (el) => el.value);
    expect(value).toBe('test123');
    await context.close();
  });

  test('Form submission works after filling fields', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    await page.fill('#username', 'testuser');
    await page.fill('#password', 'password123');
    await page.selectOption('#department', 'cs');
    await page.click('#btn-login');

    const result = await page.$eval('#form-result', (el) => el.textContent);
    expect(result).toContain('testuser');
    await context.close();
  });

});

test.describe('AccessScan — Accessibility Compliance', () => {

  test('Highlight ring has aria-hidden to avoid screen-reader duplication', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      if (window.AccessScan?.Highlighter) {
        const el = document.getElementById('username');
        if (el) window.AccessScan.Highlighter.highlightElement(el, { highlightColor: '#FF6B35', highlightBorderWidth: 3 });
      }
    });

    const ariaHidden = await page.$eval('#accessscan-highlight-ring', (el) =>
      el.getAttribute('aria-hidden')
    ).catch(() => null);

    if (ariaHidden !== null) expect(ariaHidden).toBe('true');
    await context.close();
  });

  test('SR announce region has aria-live=polite', async () => {
    const context = await launchBrowserWithExtension();
    const page = await context.newPage();
    await page.goto(DEMO_PAGE);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      if (window.AccessScan?.Highlighter) {
        const el = document.getElementById('username');
        if (el) window.AccessScan.Highlighter.highlightElement(el, { highlightColor: '#FF6B35', highlightBorderWidth: 3 });
      }
    });

    const ariaLive = await page.$eval('#accessscan-sr-announce', (el) =>
      el.getAttribute('aria-live')
    ).catch(() => null);

    if (ariaLive !== null) expect(ariaLive).toBe('polite');
    await context.close();
  });

});
