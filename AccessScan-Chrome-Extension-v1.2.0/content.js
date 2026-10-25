/**
 * AccessScan Production Content Script (Manifest V3)
 * Full In-Page Single-Switch Navigation, Hierarchical Scanning & Virtual Keyboard
 */
(() => {
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

  // Web Audio Synthesizer
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
    } catch (e) {}
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 80));
      u.rate = 1.2;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // Scan interactive elements on any real website
  function discoverPageElements() {
    const sel = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="checkbox"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const all = Array.from(document.querySelectorAll(sel)).filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('#access-scan-dock') && !el.closest('#access-scan-keyboard-root');
    });

    const semanticDefs = [
      { name: 'NAVIGATION & HEADER', sel: 'header, nav, [role="navigation"]' },
      { name: 'MAIN FORMS & CONTENT', sel: 'main, form, article, [role="main"]' },
      { name: 'SIDEBAR & TOOLS', sel: 'aside, .sidebar, [role="complementary"]' },
      { name: 'FOOTER & LINKS', sel: 'footer, [role="contentinfo"]' }
    ];

    const discovered = [];
    semanticDefs.forEach(def => {
      const matchedNodes = Array.from(document.querySelectorAll(def.sel));
      const sectionElements = all.filter(el => matchedNodes.some(p => p.contains(el)));
      if (sectionElements.length > 0) {
        discovered.push({ name: def.name, elements: sectionElements });
      }
    });

    // Fallback: Group remaining
    const assigned = new Set(discovered.flatMap(s => s.elements));
    const unassigned = all.filter(el => !assigned.has(el));
    if (unassigned.length > 0) {
      discovered.push({ name: 'ADDITIONAL CONTROLS', elements: unassigned });
    }

    if (discovered.length === 0 && all.length > 0) {
      discovered.push({ name: 'PAGE CONTROLS', elements: all });
    }

    sections = discovered;
  }

  function highlight(el, isSection = false) {
    document.querySelectorAll('.access-scan-active-target, .access-scan-active-section').forEach(n => {
      n.classList.remove('access-scan-active-target', 'access-scan-active-section');
    });
    if (!el) return;
    activeElement = el;
    el.classList.add(isSection ? 'access-scan-active-section' : 'access-scan-active-target');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    beep(isSection ? 360 : 520, 0.04);

    const label = el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || el.tagName.toLowerCase();
    speak(label);
    updateDockReadout(label);
  }

  // Create persistent bottom dock
  function injectDock() {
    if (document.getElementById('access-scan-dock')) return;
    const dock = document.createElement('div');
    dock.id = 'access-scan-dock';
    dock.innerHTML = `
      <div style="position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:99999999;background:#1C1917;color:#FAFAF8;border:2px solid #B45309;border-radius:8px;padding:8px 16px;display:flex;align-items:center;gap:12px;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.4);font-size:13px;">
        <span style="font-size:18px;">♿</span>
        <div>
          <div style="font-size:10px;color:#D6D1C4;font-weight:bold;text-transform:uppercase;">AccessScan Active</div>
          <div id="access-scan-dock-text" style="font-weight:bold;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Scanning...</div>
        </div>
        <button id="access-scan-switch-btn" style="background:#B45309;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-weight:bold;font-size:12px;cursor:pointer;">SWITCH (SPACEBAR)</button>
        <button id="access-scan-pause-btn" style="background:#342F2B;color:#fff;border:1px solid #7E7570;padding:8px 12px;border-radius:4px;font-size:12px;cursor:pointer;">PAUSE (P)</button>
      </div>
    `;
    document.body.appendChild(dock);

    document.getElementById('access-scan-switch-btn')?.addEventListener('click', handleSwitchTrigger);
    document.getElementById('access-scan-pause-btn')?.addEventListener('click', () => {
      isPaused = !isPaused;
      document.getElementById('access-scan-pause-btn').innerText = isPaused ? 'RESUME (P)' : 'PAUSE (P)';
    });
  }

  function updateDockReadout(txt) {
    const el = document.getElementById('access-scan-dock-text');
    if (el) el.innerText = txt;
  }

  // On-screen keyboard for text input
  const KB_ROWS = [
    ['alex', 'student', 'grant', 'email', 'yes', 'submit'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@'],
    ['SPACE', 'BACK', 'CLEAR', 'DONE']
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

    let rowsHtml = KB_ROWS.map((row, rIdx) => {
      const isRowSelected = keyboardLevel === 'row' && keyboardRowIndex === rIdx;
      let keysHtml = row.map((key, cIdx) => {
        const isKeySelected = keyboardLevel === 'key' && keyboardRowIndex === rIdx && keyboardColIndex === cIdx;
        return `<button class="access-kb-key ${isKeySelected ? 'kb-active-key' : ''}" style="flex:1;min-height:44px;padding:6px;margin:2px;font-weight:bold;border-radius:4px;border:1px solid #D6D1C4;background:${isKeySelected ? '#B45309' : '#fff'};color:${isKeySelected ? '#fff' : '#1C1917'};font-size:14px;cursor:pointer;">${key.toUpperCase()}</button>`;
      }).join('');

      return `<div class="access-kb-row ${isRowSelected ? 'kb-active-row' : ''}" style="display:flex;margin-bottom:4px;padding:3px;border-radius:6px;background:${isRowSelected ? '#EBE8DF' : 'transparent'};border:${isRowSelected ? '3px solid #B45309' : '1px solid transparent'};">${keysHtml}</div>`;
    }).join('');

    kb.innerHTML = `
      <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:999999999;width:95%;max-width:640px;background:#FAFAF8;border:3px solid #1C1917;border-radius:8px;padding:12px;box-shadow:0 15px 35px rgba(0,0,0,0.5);font-family:sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#1C1917;font-size:14px;">⌨️ Single-Switch Keyboard: ${keyboardActiveInput?.placeholder || 'Input Field'}</strong>
          <span style="font-size:12px;color:#B45309;font-weight:bold;">Press Space to Select</span>
        </div>
        <div style="background:#fff;padding:8px 12px;border:2px solid #1C1917;border-radius:4px;margin-bottom:8px;font-size:16px;font-family:monospace;font-weight:bold;color:#1C1917;min-height:24px;">
          ${keyboardActiveInput?.value || '<span style="color:#888;font-style:italic;">empty...</span>'}
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
    beep(600, 0.08);
    if (keyboardLevel === 'row') {
      keyboardLevel = 'key';
      keyboardColIndex = 0;
      renderKeyboardUI();
      return;
    }

    const selectedKey = KB_ROWS[keyboardRowIndex][keyboardColIndex];
    if (selectedKey === 'DONE') {
      isKeyboardOpen = false;
      const kb = document.getElementById('access-scan-keyboard-root');
      if (kb) kb.innerHTML = '';
      speak('Text confirmed');
      return;
    }

    if (selectedKey === 'BACK') {
      if (keyboardActiveInput) keyboardActiveInput.value = keyboardActiveInput.value.slice(0, -1);
    } else if (selectedKey === 'CLEAR') {
      if (keyboardActiveInput) keyboardActiveInput.value = '';
    } else if (selectedKey === 'SPACE') {
      if (keyboardActiveInput) keyboardActiveInput.value += ' ';
    } else {
      if (keyboardActiveInput) {
        keyboardActiveInput.value += (selectedKey.length > 1 ? selectedKey + ' ' : selectedKey);
      }
    }

    if (keyboardActiveInput) {
      keyboardActiveInput.dispatchEvent(new Event('input', { bubbles: true }));
      keyboardActiveInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    speak(selectedKey);
    keyboardLevel = 'row';
    renderKeyboardUI();
  }

  // Scanning Stepper
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
      const all = sections.flatMap(s => s.elements);
      if (all.length > 0) {
        currentControlIndex = (currentControlIndex + 1) % all.length;
        highlight(all[currentControlIndex], false);
      }
    }
  }

  // Handle Switch Press (Spacebar)
  function handleSwitchTrigger() {
    if (isKeyboardOpen) {
      handleKeyboardSwitch();
      return;
    }

    beep(720, 0.1);

    if (hierarchicalMode && inSectionLevel) {
      inSectionLevel = false;
      currentControlIndex = 0;
      const curSec = sections[currentSectionIndex];
      if (curSec && curSec.elements.length > 0) {
        highlight(curSec.elements[0], false);
      }
      return;
    }

    // Trigger action on active control
    const curSec = sections[currentSectionIndex];
    const targetEl = hierarchicalMode ? curSec?.elements[currentControlIndex] : sections.flatMap(s => s.elements)[currentControlIndex];

    if (!targetEl) return;

    targetEl.focus();

    // If input or textarea -> open keyboard
    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      openInPageKeyboard(targetEl);
      return;
    }

    targetEl.click();
    speak('Selected ' + (targetEl.innerText || targetEl.getAttribute('aria-label') || 'control'));
  }

  // Key listeners
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      handleSwitchTrigger();
    } else if (e.key === 'p' || e.key === 'P') {
      isPaused = !isPaused;
      updateDockReadout(isPaused ? 'PAUSED' : 'Scanning...');
    } else if (e.key === 'Escape') {
      if (isKeyboardOpen) {
        isKeyboardOpen = false;
        const kb = document.getElementById('access-scan-keyboard-root');
        if (kb) kb.innerHTML = '';
      } else {
        inSectionLevel = true;
        highlight(sections[currentSectionIndex]?.elements[0], true);
      }
    }
  }, true);

  // Initialize
  discoverPageElements();
  injectDock();
  timerId = setInterval(advanceScan, scanInterval);
})();
