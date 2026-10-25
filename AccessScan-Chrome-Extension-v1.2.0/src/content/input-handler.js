/**
 * AccessScan — Input Handler
 *
 * Translates a single key press into AccessScan actions.
 * Also provides an audio feedback helper.
 *
 * Supported key actions:
 *  - switchKey   → select / activate currently highlighted element
 *  - pauseKey    → pause / resume scanning
 *  - ArrowRight  → manually advance to next element
 *  - ArrowLeft   → manually go back one element
 *  - Backspace   → go up to section level (hierarchical mode)
 */

'use strict';

window.AccessScan = window.AccessScan || {};

class InputHandler {
  /**
   * @param {object} opts
   * @param {() => void} opts.onSelect      - Called when user selects current element
   * @param {() => void} opts.onNext        - Called to advance scanner
   * @param {() => void} opts.onPrev        - Called to go back one item
   * @param {() => void} opts.onPause       - Called to toggle pause/resume
   * @param {() => void} opts.onBack        - Called to go up a hierarchy level
   * @param {() => object} opts.getSettings - Returns current settings object
   */
  constructor({ onSelect, onNext, onPrev, onPause, onBack, getSettings }) {
    this.onSelect = onSelect;
    this.onNext = onNext;
    this.onPrev = onPrev;
    this.onPause = onPause;
    this.onBack = onBack;
    this.getSettings = getSettings;

    this._audioCtx = null;
    this._boundKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Attach the global keydown listener.
   */
  attach() {
    document.addEventListener('keydown', this._boundKeyDown, true /* capture */);
  }

  /**
   * Detach the global keydown listener.
   */
  detach() {
    document.removeEventListener('keydown', this._boundKeyDown, true);
  }

  /**
   * Optionally call this to signal the OSK is open — we suppress switch key
   * bubbling to the page when the OSK handles it.
   */
  setOSKOpen(open) {
    this._oskOpen = open;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _handleKeyDown(event) {
    const settings = this.getSettings();
    if (!settings) return;

    const key = event.key;

    // Map configured keys
    if (key === settings.switchKey) {
      // If OSK is open, let the OSK handle selection internally
      if (!this._oskOpen) {
        event.preventDefault();
        event.stopPropagation();
        this._beep('select');
        this.onSelect();
      }
      return;
    }

    if (key === settings.pauseKey) {
      event.preventDefault();
      event.stopPropagation();
      this._beep('pause');
      this.onPause();
      return;
    }

    if (key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      this.onNext();
      return;
    }

    if (key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.onPrev();
      return;
    }

    if (key === 'Backspace' && this._oskOpen === false) {
      // Only intercept Backspace when OSK is closed (don't break text editing)
      event.preventDefault();
      event.stopPropagation();
      this.onBack();
      return;
    }
  }

  /**
   * Play a short audio cue using the Web Audio API.
   * @param {'select'|'pause'} type
   */
  _beep(type) {
    const settings = this.getSettings();
    if (!settings?.audio?.enabled) return;

    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this._audioCtx;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'select') {
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      } else {
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      }

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.25);
    } catch (_) {
      // Audio not available — fail silently
    }
  }
}

window.AccessScan.InputHandler = InputHandler;
