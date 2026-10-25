/**
 * AccessScan v2.0 — Unobtrusive Floating Accessibility Indicator
 *
 * Compact, non-intrusive HUD replacing the oversized top-left panel:
 *  - Floats unobtrusively (bottom-right by default) so it never covers headers,
 *    form fields, or navigation bars.
 *  - Collapsible: Mini pill by default (only 28px height), expandable on demand.
 *  - Retains all essential status: mode badge, active element preview, and flash toasts.
 *  - 4-arrow key navigation functions identically in both collapsed and expanded states.
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
    this._toggleBtn = null;
    this._statusTimer = null;
    this._isExpanded = false;
    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };
  }

  mount() {
    if (document.getElementById(OVERLAY_ID)) return;

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.className = 'as-compact';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'AccessScan accessibility indicator');
    el.innerHTML = `
      <div id="as-overlay-bar">
        <div id="as-overlay-left">
          <span id="as-overlay-logo" title="AccessScan 4-Key Assistant">♿</span>
          <span id="as-overlay-mode" aria-label="Current mode">NAVIGATING</span>
          <span id="as-overlay-element-label" aria-label="Active element" title="Current focused control">—</span>
        </div>
        <button id="as-overlay-toggle" type="button" aria-expanded="false" aria-label="Toggle details">▾</button>
      </div>
      <div id="as-overlay-body" aria-hidden="true">
        <div id="as-overlay-hints">
          <span class="as-hint-chip">◀ Prev</span>
          <span class="as-hint-chip">▶ Next</span>
          <span class="as-hint-chip">▼ Select</span>
          <span class="as-hint-chip">▲ Exit</span>
        </div>
      </div>
      <div id="as-overlay-status" aria-live="assertive"></div>
    `;

    document.body.appendChild(el);

    this._el = el;
    this._nameEl = el.querySelector('#as-overlay-element-label');
    this._modeEl = el.querySelector('#as-overlay-mode');
    this._hintEl = el.querySelector('#as-overlay-hints');
    this._statusEl = el.querySelector('#as-overlay-status');
    this._toggleBtn = el.querySelector('#as-overlay-toggle');

    // Toggle expand/collapse
    this._toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExpand();
    });

    // Bar drag support
    const bar = el.querySelector('#as-overlay-bar');
    bar.addEventListener('mousedown', (e) => {
      if (e.target === this._toggleBtn) return;
      this._startDrag(e);
    });
  }

  unmount() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    this._el = null;
  }

  toggleExpand(forceState) {
    if (!this._el) return;
    this._isExpanded = typeof forceState === 'boolean' ? forceState : !this._isExpanded;
    this._el.classList.toggle('as-expanded', this._isExpanded);
    this._el.classList.toggle('as-compact', !this._isExpanded);
    if (this._toggleBtn) {
      this._toggleBtn.textContent = this._isExpanded ? '▴' : '▾';
      this._toggleBtn.setAttribute('aria-expanded', String(this._isExpanded));
    }
    const body = this._el.querySelector('#as-overlay-body');
    if (body) {
      body.setAttribute('aria-hidden', String(!this._isExpanded));
    }
  }

  setMode(mode) {
    if (this._modeEl) this._modeEl.textContent = mode;
    if (this._el) this._el.dataset.mode = mode.toLowerCase().replace(/\s+/g, '-');
  }

  setElementName(name) {
    if (this._nameEl) {
      const cleanName = name || '—';
      this._nameEl.textContent = cleanName;
      this._nameEl.title = cleanName;
    }
  }

  setHints(hints) {
    if (!this._hintEl) return;
    this._hintEl.innerHTML = `
      <span class="as-hint-chip">◀ ${hints.left || 'Prev'}</span>
      <span class="as-hint-chip">▶ ${hints.right || 'Next'}</span>
      <span class="as-hint-chip">▼ ${hints.down || 'Select'}</span>
      <span class="as-hint-chip">▲ ${hints.up || 'Exit'}</span>
    `;
  }

  flash(msg, durationMs = 2500) {
    if (!this._statusEl) return;
    clearTimeout(this._statusTimer);
    this._statusEl.textContent = msg;
    this._statusEl.classList.add('visible');
    this._statusTimer = setTimeout(() => {
      if (this._statusEl) {
        this._statusEl.textContent = '';
        this._statusEl.classList.remove('visible');
      }
    }, durationMs);
  }

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