/**
 * AccessScan v2.0 — Single-Switch (1-Key) Scanner Module
 *
 * Full In-Page Single-Switch Navigation, Timed Auto-Scanning, Hierarchical
 * Sections, Floating Dock HUD, Web Audio Cues, Voice Synthesizer,
 * and In-Page Virtual Keyboard.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

class SingleSwitchScanner {
  constructor() {
    this.isScanning = false;
    this.isPaused = false;
    this.scanInterval = 1500;
    this.hierarchicalMode = true;
    this.audioEnabled = true;
    this.speechEnabled = true;

    this.timerId = null;
    this.sections = [];
    this.currentSectionIndex = 0;
    this.currentControlIndex = 0;
    this.inSectionLevel = true;
    this.activeElement = null;

    // Virtual keyboard state
    this.isKeyboardOpen = false;
    this.keyboardActiveInput = null;
    this.keyboardRowIndex = 0;
    this.keyboardColIndex = 0;
    this.keyboardLevel = 'row'; // 'row' | 'key'

    this.audioCtx = null;
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._attached = false;

    this.KB_ROWS = [
      ['alex', 'student', 'grant', 'email', 'yes', 'submit'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@'],
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['SPACE', 'BACK', 'CLEAR', 'DONE'],
    ];
  }

  start(opts = {}) {
    if (this.isScanning) {
      this.updateConfig(opts);
      return;
    }

    this.isScanning = true;
    this.isPaused = false;
    this.updateConfig(opts);

    this.discoverPageElements();
    this.injectDock();
    this.attachEvents();

    this.advanceScan();
    this.resetTimer();

    console.log(`[AccessScan] Single-Switch (1-Key) Scanner active (${this.scanInterval}ms).`);
  }

  stop() {
    this.isScanning = false;
    this.isPaused = false;
    this.clearInterval();
    this.detachEvents();
    this.closeKeyboard();
    this.clearHighlights();
    this.removeDock();

    console.log('[AccessScan] Single-Switch (1-Key) Scanner stopped.');
  }

  updateConfig(opts = {}) {
    if (typeof opts.scanSpeed === 'number') this.scanInterval = Math.max(300, opts.scanSpeed);
    if (typeof opts.scanInterval === 'number') this.scanInterval = Math.max(300, opts.scanInterval);
    if (typeof opts.hierarchicalMode === 'boolean') this.hierarchicalMode = opts.hierarchicalMode;
    if (typeof opts.audioEnabled === 'boolean') this.audioEnabled = opts.audioEnabled;
    if (typeof opts.speechEnabled === 'boolean') this.speechEnabled = opts.speechEnabled;

    const speedBadge = document.getElementById('access-scan-dock-speed-badge');
    if (speedBadge) speedBadge.textContent = `${(this.scanInterval / 1000).toFixed(1)}s`;

    if (this.isScanning && !this.isPaused) {
      this.resetTimer();
    }
  }

  setSpeed(ms) {
    this.scanInterval = Math.max(300, ms);
    if (this.isScanning && !this.isPaused) {
      this.resetTimer();
    }
    const speedBadge = document.getElementById('access-scan-dock-speed-badge');
    if (speedBadge) speedBadge.textContent = `${(this.scanInterval / 1000).toFixed(1)}s`;
  }

  resetTimer() {
    this.clearInterval();
    if (this.isScanning && !this.isPaused) {
      this.timerId = setInterval(() => this.advanceScan(), this.scanInterval);
    }
  }

  clearInterval() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  attachEvents() {
    if (this._attached) return;
    window.addEventListener('keydown', this._boundKeyDown, true);
    this._attached = true;
  }

  detachEvents() {
    if (!this._attached) return;
    window.removeEventListener('keydown', this._boundKeyDown, true);
    this._attached = false;
  }

  // ── Web Audio Synthesizer & Speech ──────────────────────────────────────────
  getAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  beep(freq = 480, duration = 0.05) {
    if (!this.audioEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  speak(text) {
    if (!this.speechEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 80));
      u.rate = 1.25;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ── Element Discovery & Semantic Grouping ───────────────────────────────────
  discoverPageElements() {
    const sel =
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="checkbox"], [role="tab"], [tabindex]:not([tabindex="-1"])';

    const all = Array.from(document.querySelectorAll(sel)).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        !el.closest('#access-scan-dock') &&
        !el.closest('#accessscan-overlay') &&
        !el.closest('#access-scan-keyboard-root')
      );
    });

    const semanticDefs = [
      { name: 'NAVIGATION & HEADER', sel: 'header, nav, [role="navigation"]' },
      { name: 'MAIN FORMS & CONTENT', sel: 'main, form, article, [role="main"]' },
      { name: 'SIDEBAR & TOOLS', sel: 'aside, .sidebar, [role="complementary"]' },
      { name: 'FOOTER & LINKS', sel: 'footer, [role="contentinfo"]' },
    ];

    const discovered = [];
    semanticDefs.forEach((def) => {
      const matchedNodes = Array.from(document.querySelectorAll(def.sel));
      const sectionElements = all.filter((el) => matchedNodes.some((p) => p.contains(el)));
      if (sectionElements.length > 0) {
        discovered.push({ name: def.name, elements: sectionElements });
      }
    });

    const assigned = new Set(discovered.flatMap((s) => s.elements));
    const unassigned = all.filter((el) => !assigned.has(el));
    if (unassigned.length > 0) {
      discovered.push({ name: 'ADDITIONAL CONTROLS', elements: unassigned });
    }

    if (discovered.length === 0 && all.length > 0) {
      discovered.push({ name: 'PAGE CONTROLS', elements: all });
    }

    this.sections = discovered;
    if (this.currentSectionIndex >= this.sections.length) this.currentSectionIndex = 0;
  }

  // ── Highlight Management ───────────────────────────────────────────────────
  highlight(el, isSection = false) {
    this.clearHighlights();
    if (!el || !el.isConnected) return;
    this.activeElement = el;

    el.classList.add(isSection ? 'access-scan-active-section' : 'access-scan-active-target');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    this.beep(isSection ? 360 : 540, 0.04);

    const label =
      el.getAttribute('aria-label') ||
      el.innerText?.trim() ||
      el.placeholder ||
      el.name ||
      el.tagName.toLowerCase();

    const curSec = this.sections[this.currentSectionIndex];
    const prefix = isSection ? `Section: ${curSec?.name || 'Group'}` : label;
    this.speak(prefix);
    this.updateDockReadout(prefix);
  }

  clearHighlights() {
    document
      .querySelectorAll('.access-scan-active-target, .access-scan-active-section')
      .forEach((n) => {
        n.classList.remove('access-scan-active-target', 'access-scan-active-section');
      });
  }

  // ── Floating Dock HUD ───────────────────────────────────────────────────────
  injectDock() {
    if (document.getElementById('access-scan-dock')) return;

    const dock = document.createElement('div');
    dock.id = 'access-scan-dock';
    dock.innerHTML = `
      <div style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:2147483645;background:#1c1917;color:#fafaf8;border:2px solid #b45309;border-radius:10px;padding:8px 16px;display:flex;align-items:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,0.5);font-size:13px;user-select:none;">
        <span style="font-size:18px;">♿</span>
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="background:#b45309;color:#ffffff;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;">1-KEY (SPACEBAR)</span>
            <span id="access-scan-dock-speed-badge" style="background:#292524;border:1px solid #78350f;color:#fef3c7;font-size:10px;font-weight:bold;padding:1px 5px;border-radius:4px;">${(this.scanInterval / 1000).toFixed(1)}s</span>
          </div>
          <div id="access-scan-dock-text" style="font-weight:bold;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fef3c7;">Scanning...</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="access-scan-switch-btn" type="button" style="background:#b45309;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">Switch [Space]</button>
          <button id="access-scan-pause-btn" type="button" style="background:#292524;color:#d6d1c4;border:1px solid #57534e;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;">Pause [P]</button>
        </div>
      </div>
    `;
    document.body.appendChild(dock);

    document.getElementById('access-scan-switch-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSwitchTrigger();
    });

    document.getElementById('access-scan-pause-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePause();
    });
  }

  removeDock() {
    const dock = document.getElementById('access-scan-dock');
    if (dock) dock.remove();
  }

  updateDockReadout(text) {
    const el = document.getElementById('access-scan-dock-text');
    if (el) el.textContent = text;
  }

  // ── On-Screen Virtual Keyboard ─────────────────────────────────────────────
  openInPageKeyboard(inputEl) {
    this.keyboardActiveInput = inputEl;
    this.isKeyboardOpen = true;
    this.keyboardLevel = 'row';
    this.keyboardRowIndex = 0;
    this.keyboardColIndex = 0;

    let kbContainer = document.getElementById('access-scan-keyboard-root');
    if (!kbContainer) {
      kbContainer = document.createElement('div');
      kbContainer.id = 'access-scan-keyboard-root';
      document.body.appendChild(kbContainer);
    }

    this.renderKeyboardUI();
    this.speak('Single-switch keyboard opened for ' + (inputEl.placeholder || inputEl.name || 'field'));
  }

  renderKeyboardUI() {
    const kbContainer = document.getElementById('access-scan-keyboard-root');
    if (!kbContainer || !this.isKeyboardOpen) return;

    const rowsHtml = this.KB_ROWS.map((row, rIdx) => {
      const isRowSelected = this.keyboardLevel === 'row' && this.keyboardRowIndex === rIdx;
      const keysHtml = row
        .map((key, cIdx) => {
          const isKeySelected =
            this.keyboardLevel === 'key' && this.keyboardRowIndex === rIdx && this.keyboardColIndex === cIdx;
          return `<button type="button" class="access-kb-key ${isKeySelected ? 'kb-active-key' : ''}" style="flex:1;min-height:38px;padding:4px;margin:2px;font-weight:bold;border-radius:4px;border:1px solid #d6d1c4;background:${isKeySelected ? '#b45309' : '#ffffff'};color:${isKeySelected ? '#ffffff' : '#1c1917'};font-size:13px;cursor:pointer;">${key.toUpperCase()}</button>`;
        })
        .join('');

      return `<div class="access-kb-row ${isRowSelected ? 'kb-active-row' : ''}" style="display:flex;margin-bottom:3px;padding:2px;border-radius:6px;background:${isRowSelected ? '#fef3c7' : 'transparent'};border:${isRowSelected ? '2px solid #b45309' : '1px solid transparent'};">${keysHtml}</div>`;
    }).join('');

    const isPass = this.keyboardActiveInput?.type === 'password';
    const previewVal = isPass
      ? '•'.repeat((this.keyboardActiveInput?.value || '').length) || '<span style="color:#888;">(password)</span>'
      : this.keyboardActiveInput?.value || '<span style="color:#888;font-style:italic;">empty...</span>';

    kbContainer.innerHTML = `
      <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);width:92%;max-width:680px;background:#ffffff;border:2px solid #b45309;box-shadow:0 16px 40px rgba(0,0,0,0.35);border-radius:12px;padding:12px;z-index:2147483646;font-family:system-ui,-apple-system,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e7e5e4;">
          <strong style="color:#1c1917;font-size:13px;">♿ Single-Switch Keyboard: ${this.keyboardActiveInput?.placeholder || 'Input Field'}</strong>
          <span style="font-size:11px;color:#78716c;">Scanning: ${this.keyboardLevel.toUpperCase()}</span>
        </div>
        <div style="background:#f5f5f4;padding:6px 10px;border-radius:6px;margin-bottom:8px;font-family:monospace;font-size:14px;border:1px solid #d6d1c4;min-height:22px;display:flex;align-items:center;">
          ${previewVal}
        </div>
        <div id="access-kb-matrix">${rowsHtml}</div>
      </div>
    `;
  }

  advanceKeyboardScan() {
    if (!this.isKeyboardOpen) return;
    this.beep(440, 0.03);
    if (this.keyboardLevel === 'row') {
      this.keyboardRowIndex = (this.keyboardRowIndex + 1) % this.KB_ROWS.length;
    } else {
      this.keyboardColIndex = (this.keyboardColIndex + 1) % this.KB_ROWS[this.keyboardRowIndex].length;
    }
    this.renderKeyboardUI();
  }

  handleKeyboardSwitch() {
    this.beep(620, 0.07);
    if (this.keyboardLevel === 'row') {
      this.keyboardLevel = 'key';
      this.keyboardColIndex = 0;
      this.renderKeyboardUI();
      return;
    }

    const selectedKey = this.KB_ROWS[this.keyboardRowIndex][this.keyboardColIndex];
    if (selectedKey === 'DONE') {
      this.closeKeyboard();
      this.speak('Text confirmed');
      return;
    }

    if (this.keyboardActiveInput) {
      if (selectedKey === 'BACK') {
        this.setInputValue(this.keyboardActiveInput, this.keyboardActiveInput.value.slice(0, -1));
      } else if (selectedKey === 'CLEAR') {
        this.setInputValue(this.keyboardActiveInput, '');
      } else if (selectedKey === 'SPACE') {
        this.setInputValue(this.keyboardActiveInput, this.keyboardActiveInput.value + ' ');
      } else {
        const textToAdd = selectedKey.length > 1 ? selectedKey + ' ' : selectedKey;
        this.setInputValue(this.keyboardActiveInput, this.keyboardActiveInput.value + textToAdd);
      }
    }

    this.speak(selectedKey);
    this.keyboardLevel = 'row';
    this.renderKeyboardUI();
  }

  setInputValue(el, val) {
    const valueSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
    const proto = Object.getPrototypeOf(el);
    const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (protoSetter && valueSetter !== protoSetter) {
      protoSetter.call(el, val);
    } else if (valueSetter) {
      valueSetter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  closeKeyboard() {
    this.isKeyboardOpen = false;
    const kb = document.getElementById('access-scan-keyboard-root');
    if (kb) kb.innerHTML = '';
  }

  // ── Step Scanning Algorithm ─────────────────────────────────────────────────
  advanceScan() {
    if (this.isKeyboardOpen) {
      this.advanceKeyboardScan();
      return;
    }
    if (!this.isScanning || this.isPaused || this.sections.length === 0) return;

    if (this.hierarchicalMode) {
      if (this.inSectionLevel) {
        this.currentSectionIndex = (this.currentSectionIndex + 1) % this.sections.length;
        const curSec = this.sections[this.currentSectionIndex];
        if (curSec && curSec.elements.length > 0) {
          this.highlight(curSec.elements[0], true);
        }
      } else {
        const curSec = this.sections[this.currentSectionIndex];
        if (curSec && curSec.elements.length > 0) {
          this.currentControlIndex = (this.currentControlIndex + 1) % curSec.elements.length;
          this.highlight(curSec.elements[this.currentControlIndex], false);
        }
      }
    } else {
      const allFlat = this.sections.flatMap((s) => s.elements);
      if (allFlat.length === 0) return;
      this.currentControlIndex = (this.currentControlIndex + 1) % allFlat.length;
      this.highlight(allFlat[this.currentControlIndex], false);
    }
  }

  // ── Switch Activation (Spacebar / Trigger) ──────────────────────────────────
  handleSwitchTrigger() {
    if (this.isKeyboardOpen) {
      this.handleKeyboardSwitch();
      return;
    }

    this.beep(720, 0.08);

    if (this.hierarchicalMode && this.inSectionLevel) {
      this.inSectionLevel = false;
      this.currentControlIndex = 0;
      const curSec = this.sections[this.currentSectionIndex];
      if (curSec && curSec.elements.length > 0) {
        this.highlight(curSec.elements[0], false);
      }
      return;
    }

    const curSec = this.sections[this.currentSectionIndex];
    let targetEl = this.hierarchicalMode
      ? curSec?.elements[this.currentControlIndex]
      : this.sections.flatMap((s) => s.elements)[this.currentControlIndex];

    if (
      document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') &&
      document.activeElement !== document.body
    ) {
      targetEl = document.activeElement;
    }

    if (!targetEl) return;

    targetEl.focus();

    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      this.openInPageKeyboard(targetEl);
      return;
    }

    targetEl.click();
    this.speak('Selected ' + (targetEl.innerText || targetEl.getAttribute('aria-label') || 'control'));
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('access-scan-pause-btn');
    if (btn) btn.textContent = this.isPaused ? 'Resume [P]' : 'Pause [P]';
    this.updateDockReadout(this.isPaused ? 'PAUSED' : 'Scanning...');
    this.beep(this.isPaused ? 300 : 600, 0.08);
  }

  // ── Keydown Event Router ────────────────────────────────────────────────────
  _handleKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      this.handleSwitchTrigger();
    } else if (e.key === 'p' || e.key === 'P') {
      this.togglePause();
    } else if (e.key === 'Escape') {
      if (this.isKeyboardOpen) {
        this.closeKeyboard();
        this.speak('Keyboard closed');
      } else {
        this.inSectionLevel = true;
        this.highlight(this.sections[this.currentSectionIndex]?.elements[0], true);
      }
    } else if (e.key === 'ArrowRight' && this.isKeyboardOpen) {
      e.preventDefault();
      if (this.keyboardLevel === 'row') {
        this.keyboardRowIndex = (this.keyboardRowIndex + 1) % this.KB_ROWS.length;
      } else {
        this.keyboardColIndex = (this.keyboardColIndex + 1) % this.KB_ROWS[this.keyboardRowIndex].length;
      }
      this.renderKeyboardUI();
    } else if (e.key === 'ArrowLeft' && this.isKeyboardOpen) {
      e.preventDefault();
      if (this.keyboardLevel === 'row') {
        this.keyboardRowIndex = (this.keyboardRowIndex - 1 + this.KB_ROWS.length) % this.KB_ROWS.length;
      } else {
        this.keyboardColIndex =
          (this.keyboardColIndex - 1 + this.KB_ROWS[this.keyboardRowIndex].length) %
          this.KB_ROWS[this.keyboardRowIndex].length;
      }
      this.renderKeyboardUI();
    } else if (e.key === 'ArrowUp' && this.isKeyboardOpen) {
      e.preventDefault();
      this.closeKeyboard();
    }
  }
}

window.AccessScan.SingleSwitchScanner = SingleSwitchScanner;
