/**
 * AccessScan v2.0 — Virtual Keyboard
 *
 * True linear two-dimensional navigation:
 *   RIGHT → next key across rows (wraps from last key of row to first key of next row, and end to start)
 *   LEFT  → previous key across rows (wraps across row boundaries, and start to end)
 *   DOWN  → type the highlighted key / activate action
 *   UP    → EXIT virtual keyboard immediately & resume website navigation
 *
 * No Enter or Space required for any operation.
 *
 * postMessage protocol (to parent):
 *   { source:'accessscan-osk', type:'OSK_CHAR',      char }
 *   { source:'accessscan-osk', type:'OSK_BACKSPACE'        }
 *   { source:'accessscan-osk', type:'OSK_CLEAR'            }
 *   { source:'accessscan-osk', type:'OSK_DONE'             }
 *   { source:'accessscan-osk', type:'OSK_CANCEL'           }
 *
 * postMessage protocol (from parent):
 *   { source:'accessscan-main', type:'INIT_VALUE', value, isPassword }
 *   { source:'accessscan-main', type:'OSK_KEY', key }
 */

'use strict';

// ── URL params ────────────────────────────────────────────────────────────────
const params        = new URLSearchParams(window.location.search);
const INITIAL_LAYOUT = params.get('layout')     ?? 'qwerty';
const IS_PASSWORD    = params.get('isPassword') === 'true';
const FIELD_LABEL    = decodeURIComponent(params.get('fieldLabel') ?? 'Text field');

// ── Keyboard layouts ──────────────────────────────────────────────────────────
const LAYOUTS = {
  qwerty: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','BACK'],
    ['SYM','CLEAR','SPACE','DONE','CANCEL'],
  ],
  email: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','BACK'],
    ['@','.com','.','_','-','CLEAR','DONE','CANCEL'],
  ],
  numeric: [
    ['7','8','9'],
    ['4','5','6'],
    ['1','2','3'],
    ['+','0','.'],
    ['CLEAR','BACK','DONE'],
  ],
  symbols: [
    ['!','@','#','$','%','^','&','*','(',')'],
    ['-','_','=','+','[',']','{','}','|','\\'],
    [';',':','"',"'",'<','>',',','.','?','/'],
    ['ABC','CLEAR','SPACE','BACK','DONE'],
  ],
};

const KEY_DISPLAY = {
  SPACE:  '⎵ Space',
  BACK:   '⌫ Back',
  SHIFT:  '⇧ Shift',
  CLEAR:  '✕ Clear',
  DONE:   '✓ Done',
  CANCEL: '✕ Cancel',
  SYM:    '?123',
  ABC:    'ABC',
  '.com': '.com',
};

const KEY_ARIA = {
  SPACE:  'Space',
  BACK:   'Backspace',
  SHIFT:  'Shift',
  CLEAR:  'Clear text',
  DONE:   'Done, close keyboard',
  CANCEL: 'Cancel, close keyboard',
  SYM:    'Switch to symbols',
  ABC:    'Switch to letters',
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentLayout = INITIAL_LAYOUT;
let isShift = false;
let typedText = '';
let activeKeyIndex = 0; // Linear index across all keys in current layout
let isPassword = IS_PASSWORD;
let lastKeyTimestamp = 0;

// ── DOM refs ──────────────────────────────────────────────────────────────────
let keysEl, previewEl, fieldLabelEl, announceEl, titleEl;

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  keysEl      = document.getElementById('osk-keys');
  previewEl   = document.getElementById('osk-preview');
  fieldLabelEl= document.getElementById('osk-field-label');
  announceEl  = document.getElementById('osk-announce');
  titleEl     = document.getElementById('osk-title');

  if (fieldLabelEl) fieldLabelEl.textContent = FIELD_LABEL;

  buildLayout(currentLayout);
  attachLayoutBtns();

  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('message', (e) => {
    if (e.data?.source === 'accessscan-main') {
      if (e.data.type === 'INIT_VALUE') {
        isPassword = e.data.isPassword ?? IS_PASSWORD;
        if (!isPassword) {
          typedText = e.data.value ?? '';
          updatePreview();
        }
      } else if (e.data.type === 'OSK_KEY') {
        dispatchArrowAction(e.data.key);
      }
    }
  });
}

// ── Layout builder ────────────────────────────────────────────────────────────
function buildLayout(layoutName) {
  currentLayout = layoutName;
  keysEl.innerHTML = '';
  const rows = LAYOUTS[layoutName] ?? LAYOUTS.qwerty;

  rows.forEach((row, rIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'osk-row';
    rowEl.dataset.row = rIdx;

    row.forEach((key, cIdx) => {
      const btn = document.createElement('button');
      btn.className = 'osk-key' + getExtraClass(key);
      btn.dataset.row = rIdx;
      btn.dataset.col = cIdx;
      btn.dataset.key = key;
      btn.textContent = displayKey(key);
      btn.setAttribute('aria-label', KEY_ARIA[key] ?? key);
      btn.setAttribute('tabindex', '-1');
      btn.addEventListener('click', () => activateKey(key));
      rowEl.appendChild(btn);
    });

    keysEl.appendChild(rowEl);
  });

  activeKeyIndex = 0;
  updateHighlight();
}

function getExtraClass(key) {
  const MAP = {
    SPACE: ' key-space', BACK: ' key-back', CLEAR: ' key-clear',
    DONE: ' key-done', CANCEL: ' key-cancel', SHIFT: ' key-shift',
    SYM: ' key-special', ABC: ' key-special', '.com': ' key-special',
  };
  return MAP[key] ?? '';
}

function displayKey(key) {
  const label = KEY_DISPLAY[key];
  if (label) return label;
  if (key.length === 1) return isShift ? key.toUpperCase() : key;
  return key;
}

function attachLayoutBtns() {
  document.querySelectorAll('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => buildLayout(btn.dataset.layout));
  });
}

// ── Highlight ─────────────────────────────────────────────────────────────────
function getAllKeys() {
  return Array.from(keysEl.querySelectorAll('.osk-key'));
}

function updateHighlight() {
  const allKeys = getAllKeys();
  if (allKeys.length === 0) return;

  allKeys.forEach((k) => k.classList.remove('active-key'));

  if (activeKeyIndex < 0) activeKeyIndex = 0;
  if (activeKeyIndex >= allKeys.length) activeKeyIndex = allKeys.length - 1;

  const activeBtn = allKeys[activeKeyIndex];
  if (activeBtn) {
    activeBtn.classList.add('active-key');
    activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    announce(getAnnounceText(activeBtn.dataset.key));

    const indicator = document.getElementById('osk-row-indicator');
    if (indicator) {
      const rowNum = parseInt(activeBtn.dataset.row, 10) + 1;
      const totalRows = keysEl.querySelectorAll('.osk-row').length;
      indicator.textContent = `Row ${rowNum}/${totalRows} · Key ${activeKeyIndex + 1}/${allKeys.length}`;
    }
  }
}

function getAnnounceText(key) {
  return KEY_ARIA[key] ?? (key === ' ' ? 'Space' : key);
}

// ── Unified 4-Arrow Navigation ────────────────────────────────────────────────
function dispatchArrowAction(key) {
  const now = Date.now();
  if (now - lastKeyTimestamp < 50) return; // Debounce rapid bursts
  lastKeyTimestamp = now;

  const allKeys = getAllKeys();
  if (allKeys.length === 0) return;

  switch (key) {
    case 'ArrowRight': {
      // Linear next key across all rows, wrapping at the end
      activeKeyIndex = (activeKeyIndex + 1) % allKeys.length;
      updateHighlight();
      break;
    }
    case 'ArrowLeft': {
      // Linear previous key across all rows, wrapping at the start
      activeKeyIndex = (activeKeyIndex - 1 + allKeys.length) % allKeys.length;
      updateHighlight();
      break;
    }
    case 'ArrowDown': {
      // Select the highlighted key
      const activeBtn = allKeys[activeKeyIndex];
      if (activeBtn) {
        activateKey(activeBtn.dataset.key);
      }
      break;
    }
    case 'ArrowUp': {
      // Exit virtual keyboard immediately & restore webpage navigation
      sendToParent('OSK_DONE');
      break;
    }
  }
}

function onKeyDown(event) {
  const { key } = event;
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(key)) return;
  event.preventDefault();
  event.stopPropagation();
  dispatchArrowAction(key);
}

// ── Key activation ────────────────────────────────────────────────────────────
function activateKey(key) {
  const btn = keysEl.querySelector(`.osk-key[data-key="${CSS.escape(key)}"]`);
  if (btn) {
    btn.classList.add('ripple');
    setTimeout(() => btn.classList.remove('ripple'), 250);
  }

  switch (key) {
    case 'SHIFT':
      isShift = !isShift;
      refreshLetterLabels();
      announce(isShift ? 'Shift on' : 'Shift off');
      return;

    case 'BACK':
      if (typedText.length > 0) typedText = typedText.slice(0, -1);
      updatePreview();
      sendToParent('OSK_BACKSPACE');
      announce('Backspace');
      return;

    case 'CLEAR':
      typedText = '';
      updatePreview();
      sendToParent('OSK_CLEAR');
      announce('Cleared');
      return;

    case 'DONE':
      sendToParent('OSK_DONE');
      return;

    case 'CANCEL':
      sendToParent('OSK_CANCEL');
      return;

    case 'SPACE':
      typeChar(' ');
      announce('Space');
      return;

    case 'SYM':
      buildLayout('symbols');
      return;

    case 'ABC':
      buildLayout('qwerty');
      return;

    default: {
      const char = (isShift && key.length === 1) ? key.toUpperCase() : key;
      typeChar(char);
      if (isShift && key.length === 1) {
        isShift = false;
        refreshLetterLabels();
      }
    }
  }
}

function typeChar(char) {
  if (!isPassword) typedText += char;
  updatePreview();
  sendToParent('OSK_CHAR', char);
  announce(char === ' ' ? 'Space' : char);
}

function refreshLetterLabels() {
  keysEl.querySelectorAll('.osk-key').forEach((btn) => {
    const k = btn.dataset.key;
    if (k && k.length === 1 && /[a-z]/i.test(k)) {
      btn.textContent = isShift ? k.toUpperCase() : k.toLowerCase();
    }
  });
}

// ── Preview ───────────────────────────────────────────────────────────────────
function updatePreview() {
  if (!previewEl) return;
  if (isPassword) {
    previewEl.textContent = '•'.repeat(typedText.length) || '(password)';
  } else {
    previewEl.textContent = typedText || '…';
  }
}

// ── Announce ──────────────────────────────────────────────────────────────────
function announce(text) {
  if (!announceEl) return;
  announceEl.textContent = '';
  requestAnimationFrame(() => { announceEl.textContent = text; });
}

// ── postMessage ───────────────────────────────────────────────────────────────
function sendToParent(type, char) {
  window.parent.postMessage({ source: 'accessscan-osk', type, char }, '*');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);