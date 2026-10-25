/**
 * AccessScan v2.0 — Central Four-Key Navigation Controller
 *
 * Dispatches arrow-key events through an authoritative state machine:
 *   - WEBSITE_NAVIGATION: Standard webpage element traversal and universal Down activation.
 *   - VIRTUAL_KEYBOARD: Linear key navigation, character insertion, Up exits to webpage.
 *   - PAGE_GROUP: Section-level scanning; Down enters section, Up returns to parent.
 *   - DIALOG: Trapped inside active modal/dialog; Up cancels/dismisses.
 *   - BROWSER_BACK_PENDING: Navigation transit state; blocks duplicate keypresses.
 *   - DISABLED: Zero interception; full native browser scrolling/navigation preserved.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

const NavState = {
  WEBSITE_NAVIGATION: 'WEBSITE_NAVIGATION',
  VIRTUAL_KEYBOARD: 'VIRTUAL_KEYBOARD',
  PAGE_GROUP: 'PAGE_GROUP',
  DIALOG: 'DIALOG',
  BROWSER_BACK_PENDING: 'BROWSER_BACK_PENDING',
  DISABLED: 'DISABLED',
};

class FourKeyController {
  /**
   * @param {object} opts
   * @param {() => void} opts.onNext          - Right arrow action
   * @param {() => void} opts.onPrev          - Left arrow action
   * @param {() => void} opts.onActivate      - Down arrow action
   * @param {() => void} opts.onBack          - Up arrow action
   * @param {() => string} opts.getMode       - Returns current NavState
   * @param {(key: string) => void} opts.onKeyboardKey - Forwards arrow keys to virtual keyboard
   * @param {() => object} opts.getSettings   - Extension settings
   */
  constructor({ onNext, onPrev, onActivate, onBack, getMode, onKeyboardKey, getSettings }) {
    this.onNext = onNext;
    this.onPrev = onPrev;
    this.onActivate = onActivate;
    this.onBack = onBack;
    this.getMode = getMode;
    this.onKeyboardKey = onKeyboardKey;
    this.getSettings = getSettings;

    this._audioCtx = null;
    this._lastKeyTime = 0;
    this._DEBOUNCE_MS = 65;
    this._heldKeys = new Set();

    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp = this._handleKeyUp.bind(this);
    this._attached = false;
  }

  attach() {
    if (this._attached) return;
    document.addEventListener('keydown', this._boundKeyDown, true);
    document.addEventListener('keyup', this._boundKeyUp, true);
    this._attached = true;
  }

  detach() {
    if (!this._attached) return;
    document.removeEventListener('keydown', this._boundKeyDown, true);
    document.removeEventListener('keyup', this._boundKeyUp, true);
    this._heldKeys.clear();
    this._attached = false;
  }

  _handleKeyUp(event) {
    this._heldKeys.delete(event.key);
  }

  _handleKeyDown(event) {
    const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
    if (!ARROW_KEYS.includes(event.key)) return;

    const mode = this.getMode ? this.getMode() : NavState.DISABLED;
    console.log('[AccessScan v2] Keydown:', event.key, 'Mode:', mode);
    if (!mode || mode === NavState.DISABLED) {
      return; // Never intercept when disabled
    }

    // Always prevent default page scroll for arrow keys when active
    event.preventDefault();
    event.stopPropagation();

    // If browser back is already pending, discard key to prevent repeated requests
    if (mode === NavState.BROWSER_BACK_PENDING) {
      return;
    }

    const now = Date.now();
    if (this._heldKeys.has(event.key) && now - this._lastKeyTime < this._DEBOUNCE_MS) {
      return;
    }

    this._lastKeyTime = now;
    this._heldKeys.add(event.key);

    switch (mode) {
      case NavState.WEBSITE_NAVIGATION:
      case NavState.PAGE_GROUP:
      case NavState.DIALOG:
        switch (event.key) {
          case 'ArrowRight':
            this._beep('nav');
            this.onNext();
            break;
          case 'ArrowLeft':
            this._beep('nav');
            this.onPrev();
            break;
          case 'ArrowDown':
            this._beep('select');
            this.onActivate();
            break;
          case 'ArrowUp':
            this._beep('back');
            this.onBack();
            break;
        }
        break;

      case NavState.VIRTUAL_KEYBOARD:
        if (event.key === 'ArrowUp') {
          this._beep('back');
          this.onBack(); // Immediate UP arrow exit from keyboard back to webpage
        } else {
          this._beep(event.key === 'ArrowDown' ? 'select' : 'nav');
          if (this.onKeyboardKey) {
            this.onKeyboardKey(event.key);
          }
        }
        break;
    }
  }

  _beep(type) {
    const settings = this.getSettings ? this.getSettings() : null;
    if (!settings?.audio?.enabled) return;
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this._audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const TONES = {
        nav:    { freq: 660,  dur: 0.05, vol: 0.07 },
        select: { freq: 1046, dur: 0.09, vol: 0.10 },
        back:   { freq: 440,  dur: 0.07, vol: 0.07 },
      };
      const t = TONES[type] || TONES.nav;
      osc.frequency.setValueAtTime(t.freq, ctx.currentTime);
      gain.gain.setValueAtTime(t.vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t.dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + t.dur + 0.02);
    } catch (_) {}
  }
}

window.AccessScan.NavState = NavState;
window.AccessScan.ControllerMode = NavState; // Backwards compatibility
window.AccessScan.FourKeyController = FourKeyController;
