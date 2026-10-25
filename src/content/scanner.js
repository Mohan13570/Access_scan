/**
 * AccessScan v2.0 — Scanner Module
 *
 * Discovers and filters interactive elements on any webpage.
 * Avoids off-screen skip links, nested duplicates, hidden elements, and AccessScan overlays.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

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
  '[role="searchbox"]',
  '[tabindex]:not([tabindex="-1"])',
  'summary',
  'details > summary',
].join(', ');

const SECTION_SELECTORS = [
  'header',
  'nav',
  'main',
  'aside',
  'footer',
  'form',
  'section',
  'dialog[open]',
  '[role="dialog"]',
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
 * Check if element is genuinely visible and rendered in the page layout.
 * @param {Element} el
 */
function isVisible(el) {
  if (!el || !el.isConnected) return false;

  // Filter out screen-reader-only and skip links placed off-screen
  const className = (typeof el.className === 'string') ? el.className.toLowerCase() : '';
  if (
    className.includes('skip-content') ||
    className.includes('skip-link') ||
    className.includes('screen-reader-text') ||
    className.includes('sr-only') ||
    className.includes('visually-hidden')
  ) {
    return false;
  }

  // Check hidden attributes or aria-hidden
  if (el.hasAttribute('hidden') || el.closest('[hidden]')) {
    return false;
  }
  if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  // Filter out zero-size elements
  if (rect.width <= 0 || rect.height <= 0) return false;

  // Filter out elements positioned off-screen (e.g. left: -9999px or top: -720px)
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  const absTop = rect.top + scrollY;
  const absLeft = rect.left + scrollX;
  if (absTop < 0 || absLeft < -50) {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  // Check CSS clip / clip-path hiding
  if (style.clip && style.clip !== 'auto' && style.clip.includes('rect(1px')) {
    return false;
  }

  // Check if inside a closed <details> (except summary)
  const details = el.closest('details');
  if (details && !details.open && el.tagName !== 'SUMMARY') {
    return false;
  }

  return true;
}

/**
 * Returns true if element belongs to AccessScan's own UI.
 * @param {Element} el
 */
function isAccessScanUI(el) {
  if (!el) return false;
  return Boolean(
    el.closest('#accessscan-overlay') ||
    el.closest('#accessscan-select-dialog') ||
    el.closest('#accessscan-cred-prompt') ||
    el.closest('#accessscan-osk-iframe') ||
    el.id === 'accessscan-highlight-ring' ||
    el.id === 'accessscan-element-label' ||
    el.id === 'accessscan-sr-announce'
  );
}

/**
 * Filter out nested duplicate interactive controls (e.g. an element inside a button or link).
 * @param {Element[]} elements
 */
function deduplicateNested(elements) {
  const set = new Set(elements);
  return elements.filter((el) => {
    let parent = el.parentElement;
    while (parent) {
      if (set.has(parent)) {
        if (parent.tagName === 'BUTTON' || parent.tagName === 'A' || parent.getAttribute('role') === 'button') {
          return false;
        }
      }
      parent = parent.parentElement;
    }
    return true;
  });
}

/**
 * Collect all visible, interactive elements on the page in natural order.
 * If an open modal dialog exists, prioritize elements inside it.
 * @returns {Element[]}
 */
function collectFlatElements() {
  const activeDialog = document.querySelector('dialog[open], [role="dialog"]:not([aria-hidden="true"])');
  const scope = (activeDialog && isVisible(activeDialog)) ? activeDialog : document;

  const all = Array.from(scope.querySelectorAll(INTERACTIVE_SELECTORS));
  const visible = all.filter((el) => isVisible(el) && !isAccessScanUI(el));
  return deduplicateNested(visible);
}

/**
 * Build a hierarchical tree of landmarks/sections containing interactive elements.
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

      const deduped = deduplicateNested(children);
      if (deduped.length === 0) continue;

      let label =
        section.getAttribute('aria-label') ||
        (section.getAttribute('aria-labelledby') && (() => {
          const ref = document.getElementById(section.getAttribute('aria-labelledby'));
          return ref ? ref.textContent.trim() : null;
        })()) ||
        section.getAttribute('title') ||
        section.tagName.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

      deduped.forEach((el) => usedElements.add(el));
      sections.push({ label, el: section, children: deduped });
    }
  }

  const orphans = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS)).filter(
    (el) => isVisible(el) && !isAccessScanUI(el) && !usedElements.has(el)
  );
  const dedupedOrphans = deduplicateNested(orphans);

  if (dedupedOrphans.length > 0) {
    sections.push({ label: 'General Controls', el: null, children: dedupedOrphans });
  }

  return sections;
}

window.AccessScan.Scanner = {
  collectFlatElements,
  collectHierarchicalSections,
  isVisible,
  isAccessScanUI,
  deduplicateNested,
};
