/**
 * AccessScan v2.0 — On-Page Overlay HUD
 *
 * A compact, movable panel that shows:
 *  - Current mode
 *  - Currently focused element name
 *  - Arrow-key hint legend
 *  - Status messages
 *
 * Operated entirely via CSS + postMessage; never needs mouse.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

const OVERLAY_ID = 'accessscan-overlay';

class OverlayPanel {
  constructor() {
    this._el = null;
    this._nameEl = null;
    this._modeEl = null;
    this._hintEl = null;
    this._statusEl = null;
    this._statusTimer = null;
    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };
  }

  /**
   * Create and attach the overlay to the page.
   */
  mount() {
    if (document.getElementById(OVERLAY_ID)) return;

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'AccessScan navigation panel');
    el.innerHTML = `
      <div id="as-overlay-header">
        <span id="as-overlay-logo">♿ AccessScan</span>
        <span id="as-overlay-mode" aria-label="Current mode">NAVIGATING</span>
      </div>
      <div id="as-overlay-element" aria-label="Currently focused element">
        <span id="as-overlay-element-label">—</span>
      </div>
      <div id="as-overlay-hints" aria-hidden="true">
        <span>◀ Prev</span><span>▶ Next</span><span>▼ Select</span><span>▲ Back</span>
      </div>
      <div id="as-overlay-status" aria-live="assertive"></div>
    `;

    document.body.appendChild(el);

    this._el = el;
    this._nameEl = el.querySelector('#as-overlay-element-label');
    this._modeEl = el.querySelector('#as-overlay-mode');
    this._hintEl = el.querySelector('#as-overlay-hints');
    this._statusEl = el.querySelector('#as-overlay-status');

    // Make draggable via mouse (optional convenience — not required)
    const header = el.querySelector('#as-overlay-header');
    header.style.cursor = 'move';
    header.addEventListener('mousedown', (e) => this._startDrag(e));
  }

  unmount() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    this._el = null;
  }

  setMode(mode) {
    if (this._modeEl) this._modeEl.textContent = mode;
    if (this._el) this._el.dataset.mode = mode.toLowerCase().replace(/\s+/g, '-');
  }

  setElementName(name) {
    if (this._nameEl) this._nameEl.textContent = name || '—';
  }

  setHints(hints) {
    // hints: { up, down, left, right }
    if (!this._hintEl) return;
    this._hintEl.innerHTML = `
      <span>◀ ${hints.left || 'Prev'}</span>
      <span>▶ ${hints.right || 'Next'}</span>
      <span>▼ ${hints.down || 'Select'}</span>
      <span>▲ ${hints.up || 'Back'}</span>
    `;
  }

  flash(msg, durationMs = 2000) {
    if (!this._statusEl) return;
    clearTimeout(this._statusTimer);
    this._statusEl.textContent = msg;
    this._statusTimer = setTimeout(() => {
      if (this._statusEl) this._statusEl.textContent = '';
    }, durationMs);
  }

  // ── Drag ────────────────────────────────────────────────────────────────────
  _startDrag(e) {
    this._dragging = true;
    const rect = this._el.getBoundingClientRect();
    this._dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const onMove = (ev) => {
      if (!this._dragging) return;
      this._el.style.left = (ev.clientX - this._dragOffset.x) + 'px';
      this._el.style.top  = (ev.clientY - this._dragOffset.y) + 'px';
      this._el.style.right = 'auto';
      this._el.style.bottom = 'auto';
    };
    const onUp = () => {
      this._dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}

window.AccessScan.OverlayPanel = OverlayPanel;
