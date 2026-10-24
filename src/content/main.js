/**
 * AccessScan — Main Content Script Orchestrator
 *
 * Wires together Scanner, Highlighter, HierarchyManager, InputHandler,
 * and the On-Screen Keyboard (OSK) injected iframe.
 *
 * State machine:
 *   IDLE → SCANNING → (PAUSED | OSK_OPEN) → SCANNING → IDLE
 */

'use strict';

window.AccessScan = window.AccessScan || {};

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  IDLE: 'IDLE',
  SCANNING: 'SCANNING',
  PAUSED: 'PAUSED',
  OSK_OPEN: 'OSK_OPEN',
};

let _state = State.IDLE;
let _settings = null;
let _scanTimer = null;

// Flat-mode tracking
let _flatElements = [];
let _flatIndex = 0;

// Hierarchy manager (hierarchical mode)
let _hierarchyMgr = null;

// Reverse scanning direction flag
let _reverseDirection = false;

// The element that had focus before OSK opened
let _focusedInputBeforeOSK = null;

// Input handler instance
let _inputHandler = null;

// OSK iframe
let _oskIframe = null;

// MutationObserver for dynamic DOM changes
let _domObserver = null;
let _domObserverDebounce = null;

// ── Boot ──────────────────────────────────────────────────────────────────────

/**
 * Load settings from service worker then start listening for messages.
 */
async function init() {
  _settings = await loadSettings();

  // Listen for settings updates from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SETTINGS_UPDATED') {
      _settings = message.settings;
      if (_state === State.SCANNING) {
        // Restart with new interval
        restartScanTimer();
      }
    }
    if (message.type === 'TOGGLE_SCANNER') {
      toggleScanner();
      return { ok: true };
    }
  });

  // Watch for DOM mutations so we can refresh element lists
  _domObserver = new MutationObserver(() => {
    clearTimeout(_domObserverDebounce);
    _domObserverDebounce = setTimeout(() => {
      if (_state === State.SCANNING) {
        refreshElements();
      }
    }, 500);
  });
  _domObserver.observe(document.body, { childList: true, subtree: true });

  // Listen for messages from the OSK iframe
  window.addEventListener('message', handleOSKMessage);

  console.log('[AccessScan] Content script ready. Settings:', _settings);
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
      resolve(resp?.settings ?? {});
    });
  });
}

// ── Scanner Control ───────────────────────────────────────────────────────────

function toggleScanner() {
  if (_state === State.IDLE) {
    startScanning();
  } else {
    stopScanning();
  }
}

function startScanning() {
  _state = State.SCANNING;

  _inputHandler = new window.AccessScan.InputHandler({
    onSelect: handleSelect,
    onNext: handleNext,
    onPrev: handlePrev,
    onPause: handlePause,
    onBack: handleBack,
    getSettings: () => _settings,
  });
  _inputHandler.attach();

  refreshElements();
  scheduleNextScan();

  showStatusBadge('▶ Scanning');
  console.log('[AccessScan] Scanning started.');
}

function stopScanning() {
  _state = State.IDLE;
  clearScanTimer();
  window.AccessScan.Highlighter.clearHighlight();
  if (_inputHandler) {
    _inputHandler.detach();
    _inputHandler = null;
  }
  closeOSK();
  removeStatusBadge();
  console.log('[AccessScan] Scanning stopped.');
}

function pauseScanning() {
  _state = State.PAUSED;
  clearScanTimer();
  showStatusBadge('⏸ Paused');
}

function resumeScanning() {
  _state = State.SCANNING;
  scheduleNextScan();
  showStatusBadge('▶ Scanning');
}

function handlePause() {
  if (_state === State.SCANNING) pauseScanning();
  else if (_state === State.PAUSED) resumeScanning();
}

// ── Element Refresh ───────────────────────────────────────────────────────────

function refreshElements() {
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical') {
    if (!_hierarchyMgr) {
      _hierarchyMgr = new window.AccessScan.HierarchyManager();
    }
    _hierarchyMgr.load();
  } else {
    _flatElements = window.AccessScan.Scanner.collectFlatElements();
    if (_flatIndex >= _flatElements.length) _flatIndex = 0;
  }
}

// ── Scan Timer ────────────────────────────────────────────────────────────────

function scheduleNextScan() {
  clearScanTimer();
  const interval = _settings?.scanInterval ?? 1500;
  _scanTimer = setTimeout(scanTick, interval);
}

function clearScanTimer() {
  if (_scanTimer !== null) {
    clearTimeout(_scanTimer);
    _scanTimer = null;
  }
}

function restartScanTimer() {
  clearScanTimer();
  if (_state === State.SCANNING) scheduleNextScan();
}

function scanTick() {
  if (_state !== State.SCANNING) return;

  highlightCurrent();
  advance();
  scheduleNextScan();
}

// ── Highlight Current ─────────────────────────────────────────────────────────

function highlightCurrent() {
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical' && _hierarchyMgr) {
    if (_hierarchyMgr.isAtSectionLevel) {
      const section = _hierarchyMgr.currentSection;
      if (section) {
        window.AccessScan.Highlighter.highlightSection(section.el, section.label, _settings);
      }
    } else {
      const el = _hierarchyMgr.currentElement;
      window.AccessScan.Highlighter.highlightElement(el, _settings);
    }
  } else {
    const el = _flatElements[_flatIndex];
    window.AccessScan.Highlighter.highlightElement(el, _settings);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function advance() {
  const mode = _settings?.scanMode ?? 'flat';
  if (mode === 'hierarchical' && _hierarchyMgr) {
    _hierarchyMgr.advance();
  } else {
    if (_flatElements.length === 0) return;
    _flatIndex = (_flatIndex + 1) % _flatElements.length;
  }
}

function handleNext() {
  advance();
  highlightCurrent();
  // Reschedule so user gets full interval from now
  if (_state === State.SCANNING) restartScanTimer();
}

function handlePrev() {
  const mode = _settings?.scanMode ?? 'flat';
  if (mode === 'flat') {
    if (_flatElements.length === 0) return;
    _flatIndex = (_flatIndex - 1 + _flatElements.length) % _flatElements.length;
  } else if (_hierarchyMgr) {
    if (_hierarchyMgr.isAtSectionLevel) {
      _hierarchyMgr.sectionIndex =
        (_hierarchyMgr.sectionIndex - 1 + _hierarchyMgr.sections.length) %
        _hierarchyMgr.sections.length;
    } else {
      _hierarchyMgr.elementIndex =
        (_hierarchyMgr.elementIndex - 1 + _hierarchyMgr.currentElements.length) %
        _hierarchyMgr.currentElements.length;
    }
  }
  highlightCurrent();
  if (_state === State.SCANNING) restartScanTimer();
}

function handleBack() {
  const mode = _settings?.scanMode ?? 'flat';
  if (mode === 'hierarchical' && _hierarchyMgr && !_hierarchyMgr.isAtSectionLevel) {
    _hierarchyMgr.backToSections();
    highlightCurrent();
  }
}

// ── Selection / Activation ────────────────────────────────────────────────────

function handleSelect() {
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical' && _hierarchyMgr) {
    if (_hierarchyMgr.isAtSectionLevel) {
      // Drill into the section
      _hierarchyMgr.selectSection();
      highlightCurrent();
      return;
    }
    // Activate element inside section
    activateElement(_hierarchyMgr.currentElement);
  } else {
    activateElement(_flatElements[_flatIndex]);
  }
}

/**
 * Activate an interactive element.
 * Text inputs → open OSK
 * Buttons, links, etc. → click / focus
 * @param {Element|null} el
 */
function activateElement(el) {
  if (!el) return;

  const tag = el.tagName;
  const type = el.getAttribute('type')?.toLowerCase();
  const role = el.getAttribute('role')?.toLowerCase();

  const isTextInput =
    (tag === 'INPUT' &&
      ['text', 'email', 'tel', 'number', 'password', 'search', 'url', '', null].includes(type)) ||
    tag === 'TEXTAREA' ||
    role === 'textbox';

  if (isTextInput) {
    _focusedInputBeforeOSK = el;
    el.focus();
    openOSK(el);
  } else {
    // Scroll into view and activate
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    if (tag === 'A' || tag === 'BUTTON' || role === 'button' || role === 'link') {
      el.click();
    } else if (tag === 'INPUT') {
      if (type === 'checkbox' || type === 'radio') {
        el.click();
      } else if (type === 'submit' || type === 'reset' || type === 'button') {
        el.click();
      }
    } else if (tag === 'SELECT') {
      // For select elements, open the OSK in "select" mode  
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (tag === 'SUMMARY') {
      el.click();
    } else {
      el.click();
    }
  }
}

// ── On-Screen Keyboard ────────────────────────────────────────────────────────

function openOSK(targetInput) {
  if (_oskIframe) closeOSK();

  _state = State.OSK_OPEN;
  clearScanTimer();
  _inputHandler?.setOSKOpen(true);
  showStatusBadge('⌨ Keyboard');

  // Determine preferred keyboard layout
  const inputType = targetInput?.getAttribute('type') || 'text';
  let layout = 'qwerty';
  if (inputType === 'number' || inputType === 'tel') layout = 'numeric';
  else if (inputType === 'email') layout = 'email';

  _oskIframe = document.createElement('iframe');
  _oskIframe.id = 'accessscan-osk-iframe';
  _oskIframe.src = chrome.runtime.getURL('src/keyboard/keyboard.html') +
    `?layout=${layout}&switchKey=${encodeURIComponent(_settings?.switchKey ?? ' ')}&interval=${_settings?.scanInterval ?? 1500}`;
  _oskIframe.setAttribute('aria-label', 'AccessScan On-Screen Keyboard');
  _oskIframe.setAttribute('title', 'AccessScan On-Screen Keyboard');
  _oskIframe.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 280px;
    border: none;
    z-index: 2147483645;
    background: transparent;
  `;

  document.body.appendChild(_oskIframe);

  // Pad page bottom so content isn't hidden behind OSK
  document.body.style.paddingBottom = '300px';
}

function closeOSK() {
  if (_oskIframe) {
    _oskIframe.remove();
    _oskIframe = null;
  }
  document.body.style.paddingBottom = '';
  _focusedInputBeforeOSK = null;
  _inputHandler?.setOSKOpen(false);

  if (_state === State.OSK_OPEN) {
    _state = State.SCANNING;
    scheduleNextScan();
    showStatusBadge('▶ Scanning');
  }
}

/**
 * Handle postMessage events from the OSK iframe.
 * @param {MessageEvent} event
 */
function handleOSKMessage(event) {
  if (!event.data?.source === 'accessscan-osk') return;
  const { type, char } = event.data;

  if (type === 'OSK_CHAR' && _focusedInputBeforeOSK) {
    insertChar(_focusedInputBeforeOSK, char);
  } else if (type === 'OSK_BACKSPACE' && _focusedInputBeforeOSK) {
    deleteChar(_focusedInputBeforeOSK);
  } else if (type === 'OSK_DONE') {
    closeOSK();
  } else if (type === 'OSK_CLEAR' && _focusedInputBeforeOSK) {
    _focusedInputBeforeOSK.value = '';
    _focusedInputBeforeOSK.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Insert a character into a focused input using native input event simulation.
 * @param {HTMLInputElement|HTMLTextAreaElement} input
 * @param {string} char
 */
function insertChar(input, char) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = before + char + after;
  input.selectionStart = input.selectionEnd = start + char.length;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Delete character before the cursor (Backspace behaviour).
 * @param {HTMLInputElement|HTMLTextAreaElement} input
 */
function deleteChar(input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  if (start === end && start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start - 1;
  } else if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function showStatusBadge(text) {
  let badge = document.getElementById('accessscan-status-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'accessscan-status-badge';
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('aria-label', 'AccessScan status');
    document.body.appendChild(badge);
  }
  badge.textContent = text;
}

function removeStatusBadge() {
  const badge = document.getElementById('accessscan-status-badge');
  if (badge) badge.remove();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
init();
