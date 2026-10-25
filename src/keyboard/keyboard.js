/**
 * AccessScan v2.0 — Virtual Keyboard
 *
 * Spatial four-key grid navigation:
 *   RIGHT → next key in same row
 *   LEFT  → previous key in same row
 *   DOWN  → type the highlighted key (activate)
 *   UP    → move to row above / exit keyboard if on top row
 *
 * No auto-scanning timer. User navigates manually with arrows.
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
 */

'use strict';

// ── URL params ────────────────────────────────────────────────────────────────
const params        = new URLSearchParams(window.location.search);
const INITIAL_LAYOUT = params.get('layout')     ?? 'qwerty';
const IS_PASSWORD    = params.get('isPassword') === 'true';
const FIELD_LABEL    = decodeURIComponent(params.get('fieldLabel') ?? 'Text field');

// ── Keyboard layouts ──────────────────────────────────────────────────────────
// Each inner array = one row. Special keys are ALL_CAPS strings.
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
let rowIdx = 0;
let colIdx = 0;
let isPassword = IS_PASSWORD;

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
  updateHighlight();

  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('message', (e) => {
    if (e.data?.source === 'accessscan-main' && e.data.type === 'INIT_VALUE') {
      isPassword = e.data.isPassword ?? IS_PASSWORD;
      if (!isPassword) {
        typedText = e.data.value ?? '';
        updatePreview();
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
      btn.setAttribute('aria-label', KEY_ARIA[key] ?? (key.length === 1 ? key : key));
      btn.setAttribute('tabindex', '-1'); // arrow-key only navigation
      btn.addEventListener('click', () => activateKey(key)); // mouse fallback
      rowEl.appendChild(btn);
    });

    keysEl.appendChild(rowEl);
  });

  // Reset cursor to first key
  rowIdx = 0;
  colIdx = 0;
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
function updateHighlight() {
  document.querySelectorAll('.osk-key').forEach((k) => k.classList.remove('active-key'));

  const rows = getRows();
  if (!rows[rowIdx]) return;
  const keys = getKeys(rows[rowIdx]);
  const safeCol = Math.min(colIdx, keys.length - 1);
  colIdx = safeCol;

  if (keys[colIdx]) {
    keys[colIdx].classList.add('active-key');
    keys[colIdx].scrollIntoView({ block: 'nearest' });
    announce(getAnnounceText(keys[colIdx].dataset.key));
  }

  // Update row indicator
  const indicator = document.getElementById('osk-row-indicator');
  if (indicator) {
    indicator.textContent = `Row ${rowIdx + 1} / ${rows.length}`;
  }
}

function getAnnounceText(key) {
  return KEY_ARIA[key] ?? (key === ' ' ? 'Space' : key);
}

// ── Key navigation ────────────────────────────────────────────────────────────
function onKeyDown(event) {
  const { key } = event;
  if (!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(key)) return;
  event.preventDefault();
  event.stopPropagation();

  const rows = getRows();

  switch (key) {
    case 'ArrowRight': {
      const keys = getKeys(rows[rowIdx]);
      colIdx = (colIdx + 1) % keys.length;
      updateHighlight();
      break;
    }
    case 'ArrowLeft': {
      const keys = getKeys(rows[rowIdx]);
      colIdx = (colIdx - 1 + keys.length) % keys.length;
      updateHighlight();
      break;
    }
    case 'ArrowDown': {
      // Activate the highlighted key
      const keys = getKeys(rows[rowIdx]);
      const keyEl = keys[Math.min(colIdx, keys.length - 1)];
      if (keyEl) activateKey(keyEl.dataset.key);
      break;
    }
    case 'ArrowUp': {
      if (rowIdx > 0) {
        rowIdx--;
        updateHighlight();
      } else {
        // On the topmost row — exit keyboard
        sendToParent('OSK_CANCEL');
      }
      break;
    }
  }
}

// Helper to move DOWN to next row (used after some key activations)
function moveRowDown() {
  const rows = getRows();
  if (rowIdx < rows.length - 1) {
    rowIdx++;
    updateHighlight();
  }
}

function getRows() {
  return Array.from(keysEl.querySelectorAll('.osk-row'));
}

function getKeys(rowEl) {
  return rowEl ? Array.from(rowEl.querySelectorAll('.osk-key')) : [];
}

// ── Key activation ────────────────────────────────────────────────────────────
function activateKey(key) {
  // Ripple
  const btn = keysEl.querySelector(`.osk-key[data-key="${CSS.escape(key)}"]`);
  if (btn) { btn.classList.add('ripple'); setTimeout(() => btn.classList.remove('ripple'), 250); }

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
      // Regular character (including .com)
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
