/**
 * AccessScan v2.0 — Four-Key Controller
 *
 * Maps the four arrow keys to AccessScan actions.
 * Key scheme (page navigation mode):
 *   RIGHT  → next element
 *   LEFT   → previous element
 *   DOWN   → activate / enter group
 *   UP     → back / exit group
 *
 * Key scheme (OSK mode — handled in keyboard.js):
 *   RIGHT  → next key in row
 *   LEFT   → previous key in row
 *   DOWN   → activate highlighted key / move row down
 *   UP     → move row up / exit keyboard
 *
 * One physical keypress = one action (debounced).
 * Arrow keys are intercepted only when AccessScan is ACTIVE.
 * Normal page scroll is preserved when AccessScan is IDLE.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

class FourKeyController {
  /**
   * @param {object} opts
   * @param {() => void} opts.onNext       - RIGHT: next element
   * @param {() => void} opts.onPrev       - LEFT:  previous element
   * @param {() => void} opts.onActivate   - DOWN:  activate / enter
   * @param {() => void} opts.onBack       - UP:    back / cancel
   * @param {() => boolean} opts.isActive  - Returns true when controller should intercept
   * @param {() => boolean} opts.isOSKOpen - Returns true when OSK has focus
   * @param {() => object} opts.getSettings
   */
  constructor({ onNext, onPrev, onActivate, onBack, isActive, isOSKOpen, getSettings }) {
    this.onNext = onNext;
    this.onPrev = onPrev;
    this.onActivate = onActivate;
    this.onBack = onBack;
    this.isActive = isActive;
    this.isOSKOpen = isOSKOpen;
    this.getSettings = getSettings;

    this._audioCtx = null;
    this._lastKeyTime = 0;
    this._DEBOUNCE_MS = 80; // prevent double-fire on key repeat

    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp = this._handleKeyUp.bind(this);
    this._heldKeys = new Set();
  }

  attach() {
    document.addEventListener('keydown', this._boundKeyDown, true);
    document.addEventListener('keyup', this._boundKeyUp, true);
  }

  detach() {
    document.removeEventListener('keydown', this._boundKeyDown, true);
    document.removeEventListener('keyup', this._boundKeyUp, true);
    this._heldKeys.clear();
  }

  _handleKeyUp(event) {
    this._heldKeys.delete(event.key);
  }

  _handleKeyDown(event) {
    // Only intercept arrow keys
    const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
    if (!ARROW_KEYS.includes(event.key)) return;

    // Don't intercept if AccessScan is not active
    if (!this.isActive()) return;

    // Don't intercept if OSK iframe is handling it
    if (this.isOSKOpen()) return;

    // Debounce — prevent rapid repeat from key-hold
    const now = Date.now();
    if (this._heldKeys.has(event.key) && now - this._lastKeyTime < this._DEBOUNCE_MS) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this._lastKeyTime = now;
    this._heldKeys.add(event.key);

    // Prevent page scroll
    event.preventDefault();
    event.stopPropagation();

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
  }

  /**
   * Play short audio cue.
   * @param {'nav'|'select'|'back'} type
   */
  _beep(type) {
    const settings = this.getSettings();
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
        nav:    { freq: 660,  dur: 0.06, vol: 0.08 },
        select: { freq: 1046, dur: 0.10, vol: 0.12 },
        back:   { freq: 440,  dur: 0.08, vol: 0.08 },
      };
      const t = TONES[type] || TONES.nav;
      osc.frequency.setValueAtTime(t.freq, ctx.currentTime);
      gain.gain.setValueAtTime(t.vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t.dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + t.dur + 0.02);
    } catch (_) { /* audio unavailable */ }
  }
}

window.AccessScan.FourKeyController = FourKeyController;
