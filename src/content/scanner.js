/**
 * AccessScan — Scanner Module
 *
 * Collects and manages the list of interactive elements on the page.
 * Supports flat scanning and hierarchical section-based scanning.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

/**
 * CSS selectors for interactive elements we consider scannable.
 */
const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[tabindex]:not([tabindex="-1"])',
  'label[for]',
  'summary',
  'details > summary',
].join(', ');

/**
 * Landmark / section selectors used for hierarchical scanning.
 */
const SECTION_SELECTORS = [
  'header',
  'nav',
  'main',
  'aside',
  'footer',
  'form',
  'section',
  '[role="navigation"]',
  '[role="main"]',
  '[role="complementary"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="form"]',
  '[role="search"]',
  '[role="region"][aria-label]',
];

/**
 * Returns true if the element is visible (not hidden via CSS or zero size).
 * @param {Element} el
 */
function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Returns true if el is inside the AccessScan UI overlay (OSK, etc.)
 * so we don't scan our own controls.
 * @param {Element} el
 */
function isAccessScanUI(el) {
  return el.closest('#accessscan-root') !== null;
}

/**
 * Collect all visible, interactive elements in document order.
 * @returns {Element[]}
 */
function collectFlatElements() {
  const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS));
  return all.filter((el) => isVisible(el) && !isAccessScanUI(el));
}

/**
 * Build a hierarchical tree: sections → elements inside.
 * @returns {Array<{label: string, el: Element|null, children: Element[]}>}
 */
function collectHierarchicalSections() {
  const sections = [];
  const usedElements = new Set();

  for (const selector of SECTION_SELECTORS) {
    const sectionEls = Array.from(document.querySelectorAll(selector)).filter(
      (s) => isVisible(s) && !isAccessScanUI(s)
    );

    for (const section of sectionEls) {
      const children = Array.from(section.querySelectorAll(INTERACTIVE_SELECTORS)).filter(
        (el) => isVisible(el) && !isAccessScanUI(el) && !usedElements.has(el)
      );
      if (children.length === 0) continue;

      // Derive a human-readable label for the section
      const label =
        section.getAttribute('aria-label') ||
        section.getAttribute('aria-labelledby') && (() => {
          const ref = document.getElementById(section.getAttribute('aria-labelledby'));
          return ref ? ref.textContent.trim() : null;
        })() ||
        section.tagName.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

      children.forEach((el) => usedElements.add(el));
      sections.push({ label, el: section, children });
    }
  }

  // Collect orphan elements (not inside any recognised section)
  const orphans = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS)).filter(
    (el) => isVisible(el) && !isAccessScanUI(el) && !usedElements.has(el)
  );

  if (orphans.length > 0) {
    sections.push({ label: 'Page Controls', el: null, children: orphans });
  }

  return sections;
}

window.AccessScan.Scanner = {
  collectFlatElements,
  collectHierarchicalSections,
  isVisible,
};
