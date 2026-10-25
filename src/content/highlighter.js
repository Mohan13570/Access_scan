/**
 * AccessScan v2.0 — Highlighter Module
 *
 * Renders a high-contrast focus ring around the currently focused control.
 * Uses position: fixed so it is never misplaced by scroll offsets, transforms,
 * or relative body wrappers on third-party websites.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

const HIGHLIGHT_ID = 'accessscan-highlight-ring';
const LABEL_ID = 'accessscan-element-label';
const ANNOUNCE_ID = 'accessscan-sr-announce';

let _activeElement = null;

function ensureOverlayElements() {
  let ring = document.getElementById(HIGHLIGHT_ID);
  if (!ring) {
    ring = document.createElement('div');
    ring.id = HIGHLIGHT_ID;
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
  }

  let label = document.getElementById(LABEL_ID);
  if (!label) {
    label = document.createElement('div');
    label.id = LABEL_ID;
    label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(label);
  }

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
 * Move the focus ring to surround an element.
 * @param {Element} el
 * @param {object} settings
 */
function highlightElement(el, settings) {
  if (!el || !el.isConnected) {
    clearHighlight();
    return;
  }

  _activeElement = el;

  // Scroll into view so user can see it
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

  const { ring, label, announce } = ensureOverlayElements();
  const rect = el.getBoundingClientRect();
  const padding = 4;
  const borderWidth = Math.max(3, settings?.highlightBorderWidth ?? 3);
  const color = settings?.highlightColor ?? '#FF6B35';

  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const width = Math.max(20, rect.width + padding * 2);
  const height = Math.max(16, rect.height + padding * 2);

  // Position ring with position: fixed
  ring.style.cssText = `
    display: block !important;
    position: fixed !important;
    top: ${top}px !important;
    left: ${left}px !important;
    width: ${width}px !important;
    height: ${height}px !important;
    border: ${borderWidth}px solid ${color} !important;
    outline: 2px solid #000000 !important;
    border-radius: 6px !important;
    box-shadow: 0 0 0 3px rgba(0,0,0,0.6), 0 0 24px ${color} !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    box-sizing: border-box !important;
    transition: all 0.1s ease-out !important;
    animation: accessscan-pulse 1.2s infinite !important;
    visibility: visible !important;
    opacity: 1 !important;
  `;

  // Derive readable name
  const elLabel = getElementLabel(el);

  // Position label above element (or below if near top)
  const labelTop = top > 36 ? (top - 28) : (rect.bottom + padding + 4);
  label.textContent = elLabel;
  label.style.cssText = `
    display: block !important;
    position: fixed !important;
    top: ${Math.max(4, labelTop)}px !important;
    left: ${Math.max(4, left)}px !important;
    background: ${color} !important;
    color: #ffffff !important;
    padding: 3px 10px !important;
    border-radius: 4px !important;
    font: bold 12px/20px system-ui, -apple-system, sans-serif !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    white-space: nowrap !important;
    max-width: 320px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    box-shadow: 0 2px 10px rgba(0,0,0,0.6) !important;
    visibility: visible !important;
    opacity: 1 !important;
  `;

  // Announce for screen readers
  announce.textContent = '';
  requestAnimationFrame(() => {
    announce.textContent = `Focused: ${elLabel}`;
  });
}

/**
 * Reposition highlight when window scrolls or resizes.
 */
function updateActivePosition(settings) {
  if (_activeElement && _activeElement.isConnected) {
    const { ring, label } = ensureOverlayElements();
    const rect = _activeElement.getBoundingClientRect();
    const padding = 4;
    const top = Math.max(0, rect.top - padding);
    const left = Math.max(0, rect.left - padding);
    const width = Math.max(20, rect.width + padding * 2);
    const height = Math.max(16, rect.height + padding * 2);

    ring.style.top = `${top}px`;
    ring.style.left = `${left}px`;
    ring.style.width = `${width}px`;
    ring.style.height = `${height}px`;

    const labelTop = top > 36 ? (top - 28) : (rect.bottom + padding + 4);
    label.style.top = `${Math.max(4, labelTop)}px`;
    label.style.left = `${Math.max(4, left)}px`;
  }
}

// Attach window listeners to smoothly track active position
window.addEventListener('scroll', () => updateActivePosition(), { passive: true });
window.addEventListener('resize', () => updateActivePosition(), { passive: true });

/**
 * Remove the highlight ring and label.
 */
function clearHighlight() {
  _activeElement = null;
  const ring = document.getElementById(HIGHLIGHT_ID);
  const label = document.getElementById(LABEL_ID);
  if (ring) {
    ring.style.display = 'none';
    ring.style.top = '-9999px';
  }
  if (label) {
    label.style.display = 'none';
    label.style.top = '-9999px';
  }
}

/**
 * Highlight a section during hierarchical scanning.
 * @param {Element|null} sectionEl
 * @param {string} sectionLabel
 * @param {object} settings
 */
function highlightSection(sectionEl, sectionLabel, settings) {
  if (!sectionEl || !sectionEl.isConnected) return;
  _activeElement = sectionEl;

  sectionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const { ring, label, announce } = ensureOverlayElements();
  const rect = sectionEl.getBoundingClientRect();
  const padding = 6;
  const color = '#2563EB';

  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const width = Math.max(40, rect.width + padding * 2);
  const height = Math.max(30, rect.height + padding * 2);

  ring.style.cssText = `
    display: block !important;
    position: fixed !important;
    top: ${top}px !important;
    left: ${left}px !important;
    width: ${width}px !important;
    height: ${height}px !important;
    border: 3px dashed ${color} !important;
    outline: 2px solid #000 !important;
    border-radius: 8px !important;
    box-shadow: 0 0 0 3px rgba(0,0,0,0.5), 0 0 24px ${color}88 !important;
    pointer-events: none !important;
    z-index: 2147483646 !important;
    box-sizing: border-box !important;
    transition: all 0.12s ease !important;
    visibility: visible !important;
  `;

  label.textContent = `📌 Section: ${sectionLabel}`;
  label.style.cssText = `
    display: block !important;
    position: fixed !important;
    top: ${Math.max(4, top > 36 ? top - 30 : rect.bottom + 8)}px !important;
    left: ${Math.max(4, left)}px !important;
    background: ${color} !important;
    color: #fff !important;
    padding: 3px 12px !important;
    border-radius: 4px !important;
    font: bold 12px/20px system-ui, sans-serif !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    white-space: nowrap !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
    visibility: visible !important;
  `;

  announce.textContent = '';
  requestAnimationFrame(() => {
    announce.textContent = `Section: ${sectionLabel}`;
  });
}

/**
 * Derive user-friendly label for any element.
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

  const id = el.id;
  if (id) {
    const assocLabel = document.querySelector(`label[for="${id}"]`);
    if (assocLabel) return assocLabel.textContent.trim();
  }
  const wrappingLabel = el.closest('label');
  if (wrappingLabel) return wrappingLabel.textContent.trim();

  if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
  if (el.value && el.tagName !== 'INPUT') return el.value;
  if (el.textContent.trim()) return el.textContent.trim().slice(0, 50);

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
  updateActivePosition,
};
