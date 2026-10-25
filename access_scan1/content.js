/**
 * access scan1 — Universal Single-Switch & Multi-Input Assistant
 *
 * Full in-page switch scanning, hierarchical navigation, voice synthesis,
 * floating dock HUD, and on-screen keyboard for motor-impaired accessibility.
 */

(() => {
  if (window.__ACCESSSCAN1_LOADED__) return;
  window.__ACCESSSCAN1_LOADED__ = true;

  let isScanning = true;
  let isPaused = false;
  let scanInterval = 1500;
  let hierarchicalMode = true;
  let timerId = null;

  let sections = [];
  let currentSectionIndex = 0;
  let currentControlIndex = 0;
  let inSectionLevel = true;
  let activeElement = null;

  // On-screen keyboard state
  let isKeyboardOpen = false;
  let keyboardActiveInput = null;
  let keyboardRowIndex = 0;
  let keyboardColIndex = 0;
  let keyboardLevel = 'row'; // 'row' | 'key'

  // ── Web Audio Synthesizer ───────────────────────────────────────────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep(freq = 480, duration = 0.05) {
    try {
      const ctx = getAudioCtx();
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

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 80));
      u.rate = 1.25;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ── Page Elements Discovery ─────────────────────────────────────────────────
  function discoverPageElements() {
    const sel = [
      'button:not([disabled])',
      'a[href]',
      'input:not([type="hidden"]):not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="tab"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const all = Array.from(document.querySelectorAll(sel)).filter((el) => {
      if (el.closest('#access-scan-dock') || el.closest('#access-scan-keyboard-root')) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0'
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

    sections = discovered;
  }

  // ── Reticle Highlighting ────────────────────────────────────────────────────
  function highlight(el, isSection = false) {
    document
      .querySelectorAll('.access-scan-active-target, .access-scan-active-section')
      .forEach((n) => {
        n.classList.remove('access-scan-active-target', 'access-scan-active-section');
      });

    if (!el || !el.isConnected) return;
    activeElement = el;

    el.classList.add(isSection ? 'access-scan-active-section' : 'access-scan-active-target');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    beep(isSection ? 360 : 540, 0.04);

    const label =
      el.getAttribute('aria-label') ||
      el.innerText?.trim() ||
      el.placeholder ||
      el.name ||
      el.tagName.toLowerCase();

    const prefix = isSection ? `Section: ${sections[currentSectionIndex]?.name}` : label;
    speak(prefix);
    updateDockReadout(prefix);
  }

  // ── Floating Dock HUD ───────────────────────────────────────────────────────
  function injectDock() {
    if (document.getElementById('access-scan-dock')) return;

    const dock = document.createElement('div');
    dock.id = 'access-scan-dock';
    dock.innerHTML = `
      <div style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:2147483645;background:#1c1917;color:#fafaf8;border:2px solid #b45309;border-radius:10px;padding:8px 16px;display:flex;align-items:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,0.5);font-size:13px;user-select:none;">
        <span style="font-size:18px;">♿</span>
        <div>
          <div style="font-size:10px;color:#d6d1c4;font-weight:bold;letter-spacing:0.5px;">ACCESS SCAN 1</div>
          <div id="access-scan-dock-text" style="font-weight:bold;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fef3c7;">Scanning...</div>
        </div>
        <button id="access-scan-switch-btn" type="button" style="background:#b45309;color:#fff;border:none;padding:7px 14px;border-radius:5px;font-weight:bold;font-size:12px;cursor:pointer;transition:background 0.1s;">SWITCH (SPACE)</button>
        <button id="access-scan-pause-btn" type="button" style="background:#342f2b;color:#e7e5e4;border:1px solid #78716c;padding:7px 12px;border-radius:5px;font-size:12px;cursor:pointer;">PAUSE (P)</button>
      </div>
    `;
    document.body.appendChild(dock);

    document.getElementById('access-scan-switch-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSwitchTrigger();
    });

    document.getElementById('access-scan-pause-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePause();
    });
  }

  function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('access-scan-pause-btn');
    if (btn) btn.innerText = isPaused ? 'RESUME (P)' : 'PAUSE (P)';
    updateDockReadout(isPaused ? 'PAUSED' : 'Scanning...');
    beep(isPaused ? 320 : 640, 0.06);
  }

  function updateDockReadout(txt) {
    const el = document.getElementById('access-scan-dock-text');
    if (el) el.innerText = txt || 'Scanning...';
  }

  // ── On-Screen Virtual Keyboard ──────────────────────────────────────────────
  const KB_ROWS = [
    ['alex', 'student', 'grant', 'email', 'yes', 'submit'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['SPACE', 'BACK', 'CLEAR', 'DONE'],
  ];

  function openInPageKeyboard(inputEl) {
    keyboardActiveInput = inputEl;
    isKeyboardOpen = true;
    keyboardLevel = 'row';
    keyboardRowIndex = 0;
    keyboardColIndex = 0;

    let kbContainer = document.getElementById('access-scan-keyboard-root');
    if (!kbContainer) {
      kbContainer = document.createElement('div');
      kbContainer.id = 'access-scan-keyboard-root';
      document.body.appendChild(kbContainer);
    }

    renderKeyboardUI();
    speak('Single-switch keyboard opened for ' + (inputEl.placeholder || inputEl.name || 'field'));
  }

  function renderKeyboardUI() {
    const kb = document.getElementById('access-scan-keyboard-root');
    if (!kb || !isKeyboardOpen) return;

    const rowsHtml = KB_ROWS.map((row, rIdx) => {
      const isRowSelected = keyboardLevel === 'row' && keyboardRowIndex === rIdx;
      const keysHtml = row
        .map((key, cIdx) => {
          const isKeySelected =
            keyboardLevel === 'key' && keyboardRowIndex === rIdx && keyboardColIndex === cIdx;
          return `<button type="button" class="access-kb-key ${isKeySelected ? 'kb-active-key' : ''}" style="flex:1;min-height:40px;padding:4px;margin:2px;font-weight:bold;border-radius:4px;border:1px solid #d6d1c4;background:${isKeySelected ? '#b45309' : '#ffffff'};color:${isKeySelected ? '#ffffff' : '#1c1917'};font-size:13px;cursor:pointer;">${key.toUpperCase()}</button>`;
        })
        .join('');

      return `<div class="access-kb-row ${isRowSelected ? 'kb-active-row' : ''}" style="display:flex;margin-bottom:3px;padding:2px;border-radius:6px;background:${isRowSelected ? '#fef3c7' : 'transparent'};border:${isRowSelected ? '2px solid #b45309' : '1px solid transparent'};">${keysHtml}</div>`;
    }).join('');

    const isPass = keyboardActiveInput?.type === 'password';
    const previewVal = isPass
      ? '•'.repeat((keyboardActiveInput?.value || '').length) || '<span style="color:#888;">(password)</span>'
      : keyboardActiveInput?.value || '<span style="color:#888;font-style:italic;">empty...</span>';

    kb.innerHTML = `
      <div style="position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:2147483646;width:95%;max-width:640px;background:#fafaf8;border:3px solid #1c1917;border-radius:10px;padding:12px;box-shadow:0 15px 40px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="color:#1c1917;font-size:13px;">⌨️ access scan1 Keyboard: ${keyboardActiveInput?.placeholder || 'Input Field'}</strong>
          <span style="font-size:11px;color:#b45309;font-weight:bold;">Press Space to Select</span>
        </div>
        <div style="background:#ffffff;padding:6px 12px;border:2px solid #1c1917;border-radius:4px;margin-bottom:6px;font-size:15px;font-family:monospace;font-weight:bold;color:#1c1917;min-height:22px;">
          ${previewVal}
        </div>
        <div id="access-kb-matrix">${rowsHtml}</div>
      </div>
    `;
  }

  function advanceKeyboardScan() {
    if (!isKeyboardOpen) return;
    beep(440, 0.03);
    if (keyboardLevel === 'row') {
      keyboardRowIndex = (keyboardRowIndex + 1) % KB_ROWS.length;
    } else {
      keyboardColIndex = (keyboardColIndex + 1) % KB_ROWS[keyboardRowIndex].length;
    }
    renderKeyboardUI();
  }

  function handleKeyboardSwitch() {
    beep(620, 0.07);
    if (keyboardLevel === 'row') {
      keyboardLevel = 'key';
      keyboardColIndex = 0;
      renderKeyboardUI();
      return;
    }

    const selectedKey = KB_ROWS[keyboardRowIndex][keyboardColIndex];
    if (selectedKey === 'DONE') {
      closeKeyboard();
      speak('Text confirmed');
      return;
    }

    if (keyboardActiveInput) {
      if (selectedKey === 'BACK') {
        setInputValue(keyboardActiveInput, keyboardActiveInput.value.slice(0, -1));
      } else if (selectedKey === 'CLEAR') {
        setInputValue(keyboardActiveInput, '');
      } else if (selectedKey === 'SPACE') {
        setInputValue(keyboardActiveInput, keyboardActiveInput.value + ' ');
      } else {
        const textToAdd = selectedKey.length > 1 ? selectedKey + ' ' : selectedKey;
        setInputValue(keyboardActiveInput, keyboardActiveInput.value + textToAdd);
      }
    }

    speak(selectedKey);
    keyboardLevel = 'row';
    renderKeyboardUI();
  }

  function setInputValue(el, val) {
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

  function closeKeyboard() {
    isKeyboardOpen = false;
    const kb = document.getElementById('access-scan-keyboard-root');
    if (kb) kb.innerHTML = '';
  }

  // ── Scanning Stepper ────────────────────────────────────────────────────────
  function advanceScan() {
    if (isKeyboardOpen) {
      advanceKeyboardScan();
      return;
    }
    if (!isScanning || isPaused || sections.length === 0) return;

    if (hierarchicalMode) {
      if (inSectionLevel) {
        currentSectionIndex = (currentSectionIndex + 1) % sections.length;
        const curSec = sections[currentSectionIndex];
        if (curSec && curSec.elements.length > 0) {
          highlight(curSec.elements[0], true);
        }
      } else {
        const curSec = sections[currentSectionIndex];
        if (curSec && curSec.elements.length > 0) {
          currentControlIndex = (currentControlIndex + 1) % curSec.elements.length;
          highlight(curSec.elements[currentControlIndex], false);
        }
      }
    } else {
      const all = sections.flatMap((s) => s.elements);
      if (all.length > 0) {
        currentControlIndex = (currentControlIndex + 1) % all.length;
        highlight(all[currentControlIndex], false);
      }
    }
  }

  // ── Switch Trigger (Spacebar) ───────────────────────────────────────────────
  function handleSwitchTrigger() {
    if (isKeyboardOpen) {
      handleKeyboardSwitch();
      return;
    }

    beep(720, 0.08);

    if (hierarchicalMode && inSectionLevel) {
      inSectionLevel = false;
      currentControlIndex = 0;
      const curSec = sections[currentSectionIndex];
      if (curSec && curSec.elements.length > 0) {
        highlight(curSec.elements[0], false);
      }
      return;
    }

    // Activate the highlighted control
    const curSec = sections[currentSectionIndex];
    let targetEl = hierarchicalMode
      ? curSec?.elements[currentControlIndex]
      : sections.flatMap((s) => s.elements)[currentControlIndex];

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
      openInPageKeyboard(targetEl);
      return;
    }

    targetEl.click();
    speak('Selected ' + (targetEl.innerText || targetEl.getAttribute('aria-label') || 'control'));
  }

  // ── Keyboard Event Listener ─────────────────────────────────────────────────
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        handleSwitchTrigger();
      } else if (e.key === 'p' || e.key === 'P') {
        togglePause();
      } else if (e.key === 'Escape') {
        if (isKeyboardOpen) {
          closeKeyboard();
          speak('Keyboard closed');
        } else {
          inSectionLevel = true;
          highlight(sections[currentSectionIndex]?.elements[0], true);
        }
      } else if (e.key === 'ArrowRight' && isKeyboardOpen) {
        e.preventDefault();
        if (keyboardLevel === 'row') {
          keyboardRowIndex = (keyboardRowIndex + 1) % KB_ROWS.length;
        } else {
          keyboardColIndex = (keyboardColIndex + 1) % KB_ROWS[keyboardRowIndex].length;
        }
        renderKeyboardUI();
      } else if (e.key === 'ArrowLeft' && isKeyboardOpen) {
        e.preventDefault();
        if (keyboardLevel === 'row') {
          keyboardRowIndex = (keyboardRowIndex - 1 + KB_ROWS.length) % KB_ROWS.length;
        } else {
          keyboardColIndex = (keyboardColIndex - 1 + KB_ROWS[keyboardRowIndex].length) % KB_ROWS[keyboardRowIndex].length;
        }
        renderKeyboardUI();
      } else if (e.key === 'ArrowUp' && isKeyboardOpen) {
        e.preventDefault();
        closeKeyboard();
      }
    },
    true
  );

  // ── Chrome Extension Messaging Listener ─────────────────────────────────────
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'TOGGLE_SCAN' || msg.type === 'TOGGLE_SCAN') {
        togglePause();
        sendResponse({ ok: true, isPaused });
        return false;
      }
      if (msg.action === 'SET_SPEED') {
        scanInterval = msg.interval || 1500;
        clearInterval(timerId);
        timerId = setInterval(advanceScan, scanInterval);
        sendResponse({ ok: true, scanInterval });
        return false;
      }
      if (msg.action === 'TRIGGER_SWITCH') {
        handleSwitchTrigger();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.action === 'GET_STATUS') {
        sendResponse({
          ok: true,
          isScanning,
          isPaused,
          isKeyboardOpen,
          sectionCount: sections.length,
        });
        return false;
      }
      return false;
    });
  }

  // ── Start ───────────────────────────────────────────────────────────────────
  discoverPageElements();
  injectDock();
  advanceScan();
  timerId = setInterval(advanceScan, scanInterval);

  console.log('[access scan1] Active: Single-Switch Assistant ready.');
})();
