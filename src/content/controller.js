/**
 * AccessScan v2.0 — Central Four-Key Controller
 *
 * Dispatches arrow-key events according to explicit application modes:
 *   - DISABLED: No interception; full native browser scrolling/navigation preserved.
 *   - NAVIGATION_MODE: Right/Left move focus, Down activates control, Up backs out/stops.
 *   - VIRTUAL_KEYBOARD_MODE: Right/Left move linearly across keyboard, Down types, Up exits OSK.
 *   - DIALOG_MODE: Right/Left cycle options, Down confirms, Up dismisses.
 *
 * Strict single-event processing (debounced), event.preventDefault/stopPropagation
 * applied ONLY when AccessScan is actively handling the key.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

const ControllerMode = {
  DISABLED: 'DISABLED',
  NAVIGATION_MODE: 'NAVIGATION_MODE',
  VIRTUAL_KEYBOARD_MODE: 'VIRTUAL_KEYBOARD_MODE',
  DIALOG_MODE: 'DIALOG_MODE',
};

class FourKeyController {
  /**
   * @param {object} opts
   * @param {() => void} opts.onNext          - Right arrow action
   * @param {() => void} opts.onPrev          - Left arrow action
   * @param {() => void} opts.onActivate      - Down arrow action
   * @param {() => void} opts.onBack          - Up arrow action
   * @param {() => string} opts.getMode       - Returns current ControllerMode
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

    const mode = this.getMode ? this.getMode() : ControllerMode.DISABLED;
    if (!mode || mode === ControllerMode.DISABLED) {
      return; // Never intercept when disabled
    }

    const now = Date.now();
    if (this._heldKeys.has(event.key) && now - this._lastKeyTime < this._DEBOUNCE_MS) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this._lastKeyTime = now;
    this._heldKeys.add(event.key);

    // Prevent default scrolling and stop propagation for active AccessScan handling
    event.preventDefault();
    event.stopPropagation();

    switch (mode) {
      case ControllerMode.NAVIGATION_MODE:
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

      case ControllerMode.VIRTUAL_KEYBOARD_MODE:
        if (event.key === 'ArrowUp') {
          this._beep('back');
          this.onBack(); // Immediate UP arrow exit from keyboard
        } else {
          this._beep(event.key === 'ArrowDown' ? 'select' : 'nav');
          if (this.onKeyboardKey) {
            this.onKeyboardKey(event.key);
          }
        }
        break;

      case ControllerMode.DIALOG_MODE:
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

window.AccessScan.ControllerMode = ControllerMode;
window.AccessScan.FourKeyController = FourKeyController;