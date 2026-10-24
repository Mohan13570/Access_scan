/**
 * AccessScan — On-Screen Keyboard Controller
 *
 * Features:
 *  - Multiple layouts: QWERTY, ABC, Numeric, Email
 *  - Hierarchical character scanning (row → key)
 *  - Shift / Caps-Lock support
 *  - Predictive text (simple frequency-based)
 *  - postMessage communication with the parent content script
 */

'use strict';

// ── URL Parameter Parsing ─────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const SWITCH_KEY = decodeURIComponent(params.get('switchKey') ?? ' ');
const SCAN_INTERVAL = parseInt(params.get('interval') ?? '1500', 10);
const INITIAL_LAYOUT = params.get('layout') ?? 'qwerty';

// ── Layouts ───────────────────────────────────────────────────────────────────

const LAYOUTS = {
  qwerty: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','BACK'],
    ['SYM','CLEAR','SPACE','@','.','DONE'],
  ],
  abc: [
    ['a','b','c','d','e','f','g'],
    ['h','i','j','k','l','m','n'],
    ['o','p','q','r','s','t','u'],
    ['v','w','x','y','z','BACK','DONE'],
    ['CLEAR','SPACE','.',',','!','?','SHIFT'],
  ],
  numeric: [
    ['7','8','9'],
    ['4','5','6'],
    ['1','2','3'],
    ['CLEAR','0','BACK'],
    ['.','DONE'],
  ],
  email: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','BACK'],
    ['@','SPACE','.','_','-','CLEAR','DONE'],
  ],
  symbols: [
    ['!','@','#','$','%','^','&','*','(',')',],
    ['-','_','=','+','[',']','{','}','|','\\'],
    [';',':','"','\'','<','>',',','.','?','/'],
    ['ABC','CLEAR','SPACE','BACK','DONE'],
  ],
};

const KEY_LABELS = {
  SPACE: '⎵ Space',
  BACK:  '⌫',
  SHIFT: '⇧',
  CLEAR: '✕ Clear',
  DONE:  '✓ Done',
  SYM:   '?123',
  ABC:   'ABC',
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentLayout = INITIAL_LAYOUT;
let isShift = false;
let isCapsLock = false;
let typedText = '';      // Mirror of what's in the input field

// Hierarchical OSK scanning state
// Phase 1: scan rows → Phase 2: scan keys in selected row
let scanPhase = 'rows'; // 'rows' | 'keys'
let rowIndex = 0;
let keyIndex = 0;
let scanTimer = null;
let isPaused = false;

// ── DOM references ────────────────────────────────────────────────────────────
const keysContainer = document.getElementById('osk-keys');
const previewEl = document.getElementById('osk-preview');
const groupIndicator = document.getElementById('osk-group-indicator');
const announceEl = document.getElementById('osk-announce');

// ── Initialization ────────────────────────────────────────────────────────────
function init() {
  buildKeyboard(currentLayout);
  attachLayoutButtons();
  attachControlButtons();
  document.addEventListener('keydown', handleKeyDown, true);

  // Update preview when parent sends current input value
  window.addEventListener('message', (e) => {
    if (e.data?.source === 'accessscan-main' && e.data.type === 'INPUT_VALUE') {
      typedText = e.data.value ?? '';
      updatePreview();
    }
  });

  startScanning();
}

// ── Keyboard Builder ──────────────────────────────────────────────────────────
function buildKeyboard(layout) {
  keysContainer.innerHTML = '';
  const rows = LAYOUTS[layout] ?? LAYOUTS.qwerty;

  rows.forEach((row, rIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'osk-row';
    rowEl.dataset.rowIndex = rIdx;

    row.forEach((key, kIdx) => {
      const btn = document.createElement('button');
      btn.className = getKeyClasses(key);
      btn.dataset.key = key;
      btn.dataset.rowIndex = rIdx;
      btn.dataset.keyIndex = kIdx;
      btn.textContent = getKeyLabel(key);
      btn.setAttribute('aria-label', getAriaLabel(key));
      btn.addEventListener('click', () => activateKey(key));
      rowEl.appendChild(btn);
    });

    keysContainer.appendChild(rowEl);
  });
}

function getKeyClasses(key) {
  const base = 'osk-key';
  const map = {
    SPACE: 'key-space',
    BACK:  'key-back',
    SHIFT: 'key-shift',
    CLEAR: 'key-clear',
    DONE:  'key-done',
    '@':   'key-at',
    '.':   'key-dot',
    SYM:   'key-sym',
    ABC:   'key-sym',
  };
  return `${base}${map[key] ? ` ${map[key]}` : ''}`;
}

function getKeyLabel(key) {
  return KEY_LABELS[key] ?? (isShift || isCapsLock ? key.toUpperCase() : key);
}

function getAriaLabel(key) {
  const MAP = {
    SPACE: 'Space',
    BACK:  'Backspace',
    SHIFT: 'Shift',
    CLEAR: 'Clear all text',
    DONE:  'Done, close keyboard',
    SYM:   'Switch to symbols',
    ABC:   'Switch to letters',
    '@':   'At sign',
    '.':   'Period',
  };
  return MAP[key] ?? key;
}

// ── Layout Switching ──────────────────────────────────────────────────────────
function switchLayout(layout) {
  currentLayout = layout;
  buildKeyboard(layout);

  // Update active state on layout buttons
  document.querySelectorAll('.layout-btn').forEach((btn) => {
    const active = btn.dataset.layout === layout;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  // Reset scanning
  rowIndex = 0;
  keyIndex = 0;
  scanPhase = 'rows';
  restartScanning();
}

function attachLayoutButtons() {
  document.querySelectorAll('.layout-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchLayout(btn.dataset.layout));
  });
}

function attachControlButtons() {
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-done').addEventListener('click', () => sendToParent('OSK_DONE'));
  document.getElementById('btn-close').addEventListener('click', () => sendToParent('OSK_DONE'));
}

// ── Key Activation ────────────────────────────────────────────────────────────
function activateKey(key) {
  rippleEffect(key);

  if (key === 'SHIFT') {
    isShift = !isShift;
    refreshKeyLabels();
    announce(isShift ? 'Shift on' : 'Shift off');
    return;
  }

  if (key === 'BACK') {
    typedText = typedText.slice(0, -1);
    updatePreview();
    sendToParent('OSK_BACKSPACE');
    announce('Backspace');
    return;
  }

  if (key === 'CLEAR') {
    typedText = '';
    updatePreview();
    sendToParent('OSK_CLEAR');
    announce('Clear');
    return;
  }

  if (key === 'DONE') {
    sendToParent('OSK_DONE');
    return;
  }

  if (key === 'SPACE') {
    const char = ' ';
    typedText += char;
    updatePreview();
    sendToParent('OSK_CHAR', char);
    announce('Space');
    return;
  }

  if (key === 'SYM') {
    switchLayout('symbols');
    return;
  }

  if (key === 'ABC') {
    switchLayout('qwerty');
    return;
  }

  // Regular character
  const char = (isShift || isCapsLock) ? key.toUpperCase() : key;
  typedText += char;
  updatePreview();
  sendToParent('OSK_CHAR', char);
  announce(char);

  // Auto-reset shift after one character
  if (isShift && !isCapsLock) {
    isShift = false;
    refreshKeyLabels();
  }
}

function refreshKeyLabels() {
  document.querySelectorAll('.osk-key').forEach((btn) => {
    const key = btn.dataset.key;
    if (key && key.length === 1) {
      btn.textContent = isShift || isCapsLock ? key.toUpperCase() : key;
    }
  });
}

function rippleEffect(key) {
  const btn = document.querySelector(`.osk-key[data-key="${CSS.escape(key)}"]`);
  if (!btn) return;
  btn.classList.add('ripple');
  setTimeout(() => btn.classList.remove('ripple'), 300);
}

// ── Preview ───────────────────────────────────────────────────────────────────
function updatePreview() {
  previewEl.textContent = typedText || '…';
}

// ── Hierarchical Scanning ─────────────────────────────────────────────────────
function startScanning() {
  isPaused = false;
  scanPhase = 'rows';
  rowIndex = 0;
  keyIndex = 0;
  scheduleTick();
}

function restartScanning() {
  clearTimeout(scanTimer);
  startScanning();
}

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('btn-pause');
  btn.textContent = isPaused ? '▶' : '⏸';
  btn.setAttribute('aria-label', isPaused ? 'Resume scanning' : 'Pause scanning');
  if (!isPaused) scheduleTick();
}

function scheduleTick() {
  clearTimeout(scanTimer);
  if (!isPaused) {
    scanTimer = setTimeout(scanTick, SCAN_INTERVAL);
  }
}

function scanTick() {
  if (isPaused) return;
  highlightCurrent();
  advance();
  scheduleTick();
}

function highlightCurrent() {
  // Clear previous highlights
  document.querySelectorAll('.osk-row').forEach((r) => r.classList.remove('group-scanning'));
  document.querySelectorAll('.osk-key').forEach((k) => k.classList.remove('scanning'));

  const rows = keysContainer.querySelectorAll('.osk-row');
  if (rows.length === 0) return;

  if (scanPhase === 'rows') {
    // Highlight entire row
    const rowEl = rows[rowIndex];
    if (rowEl) {
      rowEl.classList.add('group-scanning');
      groupIndicator.textContent = `Row ${rowIndex + 1} of ${rows.length}`;
      const rowKeys = Array.from(rowEl.querySelectorAll('.osk-key'));
      const label = rowKeys.map((k) => getAriaLabel(k.dataset.key)).join(', ');
      announce(`Row ${rowIndex + 1}: ${label}`);
    }
  } else {
    // Highlight individual key
    const rowEl = rows[rowIndex];
    if (!rowEl) return;
    const keys = rowEl.querySelectorAll('.osk-key');
    const keyEl = keys[keyIndex];
    if (keyEl) {
      keyEl.classList.add('scanning');
      groupIndicator.textContent = '';
      announce(getAriaLabel(keyEl.dataset.key));
    }
  }
}

function advance() {
  const rows = keysContainer.querySelectorAll('.osk-row');

  if (scanPhase === 'rows') {
    rowIndex = (rowIndex + 1) % rows.length;
  } else {
    const rowEl = rows[rowIndex];
    if (!rowEl) { scanPhase = 'rows'; return; }
    const keys = rowEl.querySelectorAll('.osk-key');
    keyIndex = (keyIndex + 1) % keys.length;
    if (keyIndex === 0) {
      // Went past last key — back to row scanning
      scanPhase = 'rows';
    }
  }
}

// ── Key Handler ───────────────────────────────────────────────────────────────
function handleKeyDown(event) {
  const key = event.key;

  if (key === SWITCH_KEY || key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    handleSelect();
    return;
  }

  if (key === 'Escape') {
    event.preventDefault();
    togglePause();
    return;
  }

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    event.preventDefault();
    advance();
    highlightCurrent();
    scheduleTick();
    return;
  }

  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    event.preventDefault();
    goBack();
    highlightCurrent();
    scheduleTick();
    return;
  }
}

function handleSelect() {
  const rows = keysContainer.querySelectorAll('.osk-row');

  if (scanPhase === 'rows') {
    // Select this row — dive into keys
    scanPhase = 'keys';
    keyIndex = 0;
    clearTimeout(scanTimer);
    highlightCurrent();
    scheduleTick();
  } else {
    // Activate the currently highlighted key
    const rowEl = rows[rowIndex];
    if (!rowEl) return;
    const keys = rowEl.querySelectorAll('.osk-key');
    const keyEl = keys[keyIndex];
    if (keyEl) {
      const k = keyEl.dataset.key;
      activateKey(k);
      // Go back to row scanning
      scanPhase = 'rows';
      keyIndex = 0;
      clearTimeout(scanTimer);
      highlightCurrent();
      scheduleTick();
    }
  }
}

function goBack() {
  if (scanPhase === 'keys') {
    const rows = keysContainer.querySelectorAll('.osk-row');
    const rowEl = rows[rowIndex];
    const keys = rowEl ? rowEl.querySelectorAll('.osk-key') : [];
    keyIndex = (keyIndex - 1 + keys.length) % Math.max(keys.length, 1);
  } else {
    const rows = keysContainer.querySelectorAll('.osk-row');
    rowIndex = (rowIndex - 1 + rows.length) % Math.max(rows.length, 1);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function sendToParent(type, char) {
  window.parent.postMessage({ source: 'accessscan-osk', type, char }, '*');
}

function announce(text) {
  announceEl.textContent = '';
  requestAnimationFrame(() => { announceEl.textContent = text; });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
