/**
 * AccessScan — Highlighter Module
 *
 * Renders a floating highlight ring around the currently-scanned element.
 * Uses a positioned <div> overlay so the original DOM is unchanged.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

const HIGHLIGHT_ID = 'accessscan-highlight-ring';
const LABEL_ID = 'accessscan-element-label';
const ANNOUNCE_ID = 'accessscan-sr-announce';

/**
 * Create the highlight overlay elements once, then reuse them.
 */
function ensureOverlayElements() {
  // Highlight ring
  let ring = document.getElementById(HIGHLIGHT_ID);
  if (!ring) {
    ring = document.createElement('div');
    ring.id = HIGHLIGHT_ID;
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
  }

  // Element label bubble
  let label = document.getElementById(LABEL_ID);
  if (!label) {
    label = document.createElement('div');
    label.id = LABEL_ID;
    label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(label);
  }

  // Live region for screen reader announcements
  let announce = document.getElementById(ANNOUNCE_ID);
  if (!announce) {
    announce = document.createElement('div');
    announce.id = ANNOUNCE_ID;
    announce.setAttribute('aria-live', 'polite');
    announce.setAttribute('aria-atomic', 'true');
    announce.className = 'sr-only';
    document.body.appendChild(announce);
  }

  return { ring, label, announce };
}

/**
 * Move the highlight ring to surround a given element.
 * @param {Element} el - The element to highlight
 * @param {object} settings - Current AccessScan settings
 */
function highlightElement(el, settings) {
  if (!el) {
    clearHighlight();
    return;
  }

  const { ring, label, announce } = ensureOverlayElements();
  const rect = el.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const padding = 4;
  const borderWidth = settings?.highlightBorderWidth ?? 3;
  const color = settings?.highlightColor ?? '#FF6B35';

  // Position the ring around the element
  ring.style.cssText = `
    position: absolute;
    top: ${rect.top + scrollY - padding}px;
    left: ${rect.left + scrollX - padding}px;
    width: ${rect.width + padding * 2}px;
    height: ${rect.height + padding * 2}px;
    border: ${borderWidth}px solid ${color};
    border-radius: 4px;
    box-shadow: 0 0 0 2px rgba(0,0,0,0.3), 0 0 12px ${color}88;
    pointer-events: none;
    z-index: 2147483646;
    box-sizing: border-box;
    transition: all 0.12s ease;
    animation: accessscan-pulse 1.2s infinite;
  `;

  // Derive a human-readable label for the element
  const elLabel = getElementLabel(el);

  // Position label bubble above element (or below if not enough space)
  const labelTop = rect.top + scrollY - padding - 28;
  label.textContent = elLabel;
  label.style.cssText = `
    position: absolute;
    top: ${labelTop > scrollY + 4 ? labelTop : rect.bottom + scrollY + padding + 4}px;
    left: ${Math.max(rect.left + scrollX - padding, scrollX + 4)}px;
    background: ${color};
    color: #fff;
    padding: 2px 8px;
    border-radius: 3px;
    font: bold 12px/20px system-ui, sans-serif;
    pointer-events: none;
    z-index: 2147483647;
    white-space: nowrap;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  `;

  // Screen reader announcement
  announce.textContent = '';
  requestAnimationFrame(() => {
    announce.textContent = `Scanning: ${elLabel}`;
  });
}

/**
 * Remove the highlight ring and label.
 */
function clearHighlight() {
  const ring = document.getElementById(HIGHLIGHT_ID);
  const label = document.getElementById(LABEL_ID);
  if (ring) ring.style.cssText = 'display:none';
  if (label) label.style.cssText = 'display:none';
}

/**
 * Highlight a section during hierarchical scanning.
 * @param {Element|null} sectionEl
 * @param {string} sectionLabel
 * @param {object} settings
 */
function highlightSection(sectionEl, sectionLabel, settings) {
  if (!sectionEl) return;
  const { ring, label, announce } = ensureOverlayElements();
  const rect = sectionEl.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const padding = 6;
  const color = '#2563EB'; // Blue for section highlights

  ring.style.cssText = `
    position: absolute;
    top: ${rect.top + scrollY - padding}px;
    left: ${rect.left + scrollX - padding}px;
    width: ${rect.width + padding * 2}px;
    height: ${rect.height + padding * 2}px;
    border: 3px dashed ${color};
    border-radius: 8px;
    box-shadow: 0 0 0 2px rgba(0,0,0,0.2), 0 0 20px ${color}66;
    pointer-events: none;
    z-index: 2147483646;
    box-sizing: border-box;
    transition: all 0.15s ease;
  `;

  label.textContent = `📌 ${sectionLabel}`;
  label.style.cssText = `
    position: absolute;
    top: ${rect.top + scrollY - padding - 30}px;
    left: ${Math.max(rect.left + scrollX, scrollX + 4)}px;
    background: ${color};
    color: #fff;
    padding: 3px 10px;
    border-radius: 4px;
    font: bold 13px/22px system-ui, sans-serif;
    pointer-events: none;
    z-index: 2147483647;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  `;

  announce.textContent = '';
  requestAnimationFrame(() => {
    announce.textContent = `Section: ${sectionLabel}`;
  });
}

/**
 * Derive a user-friendly label for an element.
 * Priority: aria-label > aria-labelledby > placeholder > value > text content > tag description
 * @param {Element} el
 * @returns {string}
 */
function getElementLabel(el) {
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = document.getElementById(labelledBy);
    if (ref) return ref.textContent.trim();
  }

  // <label> associated via for= or wrapping
  const id = el.id;
  if (id) {
    const assocLabel = document.querySelector(`label[for="${id}"]`);
    if (assocLabel) return assocLabel.textContent.trim();
  }
  const wrappingLabel = el.closest('label');
  if (wrappingLabel) return wrappingLabel.textContent.trim();

  if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
  if (el.value && el.tagName !== 'INPUT') return el.value;
  if (el.textContent.trim()) return el.textContent.trim().slice(0, 60);

  // Fall back to element type description
  const TYPE_LABELS = {
    INPUT: `Input (${el.type || 'text'})`,
    BUTTON: 'Button',
    A: 'Link',
    SELECT: 'Dropdown',
    TEXTAREA: 'Text area',
    SUMMARY: 'Expandable section',
  };
  return TYPE_LABELS[el.tagName] || el.tagName.toLowerCase();
}

window.AccessScan.Highlighter = {
  highlightElement,
  highlightSection,
  clearHighlight,
  getElementLabel,
};
