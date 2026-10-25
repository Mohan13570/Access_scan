/**
 * AccessScan v2.0 — Main Orchestrator
 *
 * Four-key navigation state machine:
 *
 *   IDLE
 *     ↓ activate
 *   NAVIGATING  ← RIGHT/LEFT move focus, DOWN activates, UP backs out
 *     ↓ DOWN on text input
 *   OSK_OPEN    ← keyboard.js handles arrows internally
 *     ↓ UP or DONE
 *   NAVIGATING
 *     ↓ DOWN on a section (hierarchical)
 *   SECTION_NAV ← inside section, UP exits back to top level
 *     ↓ deactivate
 *   IDLE
 *
 * Key bindings (NAVIGATING):
 *   RIGHT  → next element
 *   LEFT   → previous element
 *   DOWN   → activate element (open OSK / click / enter section)
 *   UP     → back (exit section / stop if at top)
 *
 * Key bindings (OSK_OPEN):
 *   Handled entirely inside keyboard.js iframe via arrow keys.
 *   Parent receives postMessages: OSK_CHAR, OSK_BACKSPACE, OSK_DONE, OSK_CANCEL
 */

'use strict';

window.AccessScan = window.AccessScan || {};

// ── State enum ────────────────────────────────────────────────────────────────
const AS_State = {
  IDLE: 'IDLE',
  NAVIGATING: 'NAVIGATING',
  OSK_OPEN: 'OSK_OPEN',
  SELECT_OPEN: 'SELECT_OPEN',
  CRED_PROMPT: 'CRED_PROMPT',
};

// ── Module-level state ────────────────────────────────────────────────────────
let _state = AS_State.IDLE;
let _settings = null;
let _controller = null;       // FourKeyController
let _overlay = null;          // OverlayPanel
let _credMgr = null;          // CredentialManager
let _hierarchyMgr = null;     // HierarchyManager
let _oskIframe = null;
let _selectDialog = null;

// Flat navigation
let _flatElements = [];
let _flatIndex = 0;

// The input el currently being typed into via OSK
let _activeInputEl = null;

// DOM observer
let _domObserver = null;
let _domDebounce = null;

// Credential save prompt state
let _credPromptOptions = []; // ['save', 'skip']
let _credPromptIndex = 0;
let _credPromptData = null;  // { username, passwordEl }

// Select dialog state
let _selectOptions = [];
let _selectIndex = 0;
let _selectEl = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  _settings = await loadSettings();

  // Instantiate modules
  _overlay = new window.AccessScan.OverlayPanel();
  _credMgr = new window.AccessScan.CredentialManager();

  // Listen for messages from service worker / popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      _settings = msg.settings;
      sendResponse({ ok: true });
    }
    if (msg.type === 'TOGGLE_SCANNER') {
      toggleAccessScan();
      sendResponse({ ok: true });
    }
    if (msg.type === 'START_SCANNER') {
      if (_state === AS_State.IDLE) startNav();
      sendResponse({ ok: true });
    }
    if (msg.type === 'STOP_SCANNER') {
      if (_state !== AS_State.IDLE) stopNav();
      sendResponse({ ok: true });
    }
    if (msg.type === 'GET_STATUS') {
      sendResponse({ state: _state, index: _flatIndex, total: _flatElements.length });
    }
    return true;
  });

  // Listen for OSK iframe messages
  window.addEventListener('message', handleOSKMessage);

  // DOM mutation watcher (debounced)
  _domObserver = new MutationObserver(() => {
    clearTimeout(_domDebounce);
    _domDebounce = setTimeout(onDOMMutated, 400);
  });
  _domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });

  // Check autofill opportunity on load
  setTimeout(checkAutofill, 1200);

  console.log('[AccessScan v2] Ready. State: IDLE');
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
      resolve(resp?.settings ?? getDefaultSettings());
    });
  });
}

function getDefaultSettings() {
  return {
    enabled: false,
    scanMode: 'flat',
    highlightColor: '#FF6B35',
    highlightBorderWidth: 3,
    audio: { enabled: true },
    credentials: { enabled: true },
  };
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

function toggleAccessScan() {
  if (_state === AS_State.IDLE) startNav();
  else stopNav();
}

function startNav() {
  _state = AS_State.NAVIGATING;

  // Mount UI
  _overlay.mount();
  _overlay.setMode('NAVIGATING');
  _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Stop' });

  // Create four-key controller
  _controller = new window.AccessScan.FourKeyController({
    onNext:     handleNext,
    onPrev:     handlePrev,
    onActivate: handleActivate,
    onBack:     handleBack,
    isActive:   () => _state !== AS_State.IDLE,
    isOSKOpen:  () => _state === AS_State.OSK_OPEN,
    getSettings: () => _settings,
  });
  _controller.attach();

  // Load elements
  refreshElements();

  // Set initial highlight
  if (_flatElements.length > 0 || (_hierarchyMgr && _hierarchyMgr.sections.length > 0)) {
    highlightCurrent();
  }

  console.log('[AccessScan v2] Navigation started.');
}

function stopNav() {
  _state = AS_State.IDLE;

  if (_controller) { _controller.detach(); _controller = null; }
  window.AccessScan.Highlighter.clearHighlight();
  closeOSK(false);
  closeSelectDialog();
  _overlay.unmount();

  console.log('[AccessScan v2] Navigation stopped.');
}

// ── Element collection ────────────────────────────────────────────────────────

function refreshElements() {
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical') {
    if (!_hierarchyMgr) {
      _hierarchyMgr = new window.AccessScan.HierarchyManager();
    }
    _hierarchyMgr.load();
    _flatElements = [];
    _flatIndex = 0;
  } else {
    _hierarchyMgr = null;
    _flatElements = window.AccessScan.Scanner.collectFlatElements();
    if (_flatIndex >= _flatElements.length) _flatIndex = 0;
  }
}

function onDOMMutated() {
  if (_state === AS_State.IDLE) return;

  const oldLen = _flatElements.length;
  refreshElements();

  // If the previously focused element is gone, stay at the same index (clamped)
  if (_flatElements.length > 0 && _flatIndex >= _flatElements.length) {
    _flatIndex = Math.max(0, _flatElements.length - 1);
  }

  if (_state === AS_State.NAVIGATING) {
    highlightCurrent();
  }
}

// ── Navigation handlers ───────────────────────────────────────────────────────

function handleNext() {
  if (_state !== AS_State.NAVIGATING) return;
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical' && _hierarchyMgr) {
    _hierarchyMgr.advance();
  } else {
    if (_flatElements.length === 0) return;
    _flatIndex = (_flatIndex + 1) % _flatElements.length;
  }

  highlightCurrent();
}

function handlePrev() {
  if (_state !== AS_State.NAVIGATING) return;
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical' && _hierarchyMgr) {
    if (_hierarchyMgr.isAtSectionLevel) {
      _hierarchyMgr.sectionIndex =
        (_hierarchyMgr.sectionIndex - 1 + _hierarchyMgr.sections.length) %
        Math.max(_hierarchyMgr.sections.length, 1);
    } else {
      _hierarchyMgr.elementIndex =
        (_hierarchyMgr.elementIndex - 1 + _hierarchyMgr.currentElements.length) %
        Math.max(_hierarchyMgr.currentElements.length, 1);
    }
  } else {
    if (_flatElements.length === 0) return;
    _flatIndex = (_flatIndex - 1 + _flatElements.length) % _flatElements.length;
  }

  highlightCurrent();
}

function handleActivate() {
  if (_state !== AS_State.NAVIGATING) return;
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical' && _hierarchyMgr) {
    if (_hierarchyMgr.isAtSectionLevel) {
      // Enter the section
      _hierarchyMgr.selectSection();
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back to sections' });
      highlightCurrent();
      return;
    }
    activateElement(_hierarchyMgr.currentElement);
  } else {
    activateElement(_flatElements[_flatIndex]);
  }
}

function handleBack() {
  // Context-sensitive back action
  switch (_state) {
    case AS_State.OSK_OPEN:
      closeOSK(true);
      break;
    case AS_State.SELECT_OPEN:
      closeSelectDialog();
      break;
    case AS_State.CRED_PROMPT:
      dismissCredPrompt();
      break;
    case AS_State.NAVIGATING: {
      const mode = _settings?.scanMode ?? 'flat';
      if (mode === 'hierarchical' && _hierarchyMgr && !_hierarchyMgr.isAtSectionLevel) {
        _hierarchyMgr.backToSections();
        _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Enter section', up: 'Stop' });
        highlightCurrent();
      } else {
        // At top level — stop AccessScan
        stopNav();
        _overlay.flash('AccessScan stopped. Activate from toolbar to resume.');
      }
      break;
    }
    default:
      break;
  }
}

// ── Highlight ─────────────────────────────────────────────────────────────────

function highlightCurrent() {
  const mode = _settings?.scanMode ?? 'flat';

  if (mode === 'hierarchical' && _hierarchyMgr) {
    if (_hierarchyMgr.isAtSectionLevel) {
      const sec = _hierarchyMgr.currentSection;
      if (sec) {
        window.AccessScan.Highlighter.highlightSection(sec.el, sec.label, _settings);
        _overlay.setElementName(`Section: ${sec.label} (${sec.children.length} controls)`);
        scrollToElement(sec.el);
      }
    } else {
      const el = _hierarchyMgr.currentElement;
      if (el) {
        window.AccessScan.Highlighter.highlightElement(el, _settings);
        _overlay.setElementName(window.AccessScan.Highlighter.getElementLabel(el));
        scrollToElement(el);
      }
    }
  } else {
    const el = _flatElements[_flatIndex];
    if (el) {
      window.AccessScan.Highlighter.highlightElement(el, _settings);
      _overlay.setElementName(window.AccessScan.Highlighter.getElementLabel(el));
      scrollToElement(el);
    } else {
      _overlay.setElementName('—');
    }
  }
}

function scrollToElement(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

// ── Element Activation ────────────────────────────────────────────────────────

function activateElement(el) {
  if (!el) return;

  const tag = el.tagName;
  const type = (el.getAttribute('type') || '').toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();

  // Text/password/email/tel/number/search/url/textarea → open OSK
  const isTextInput =
    (tag === 'INPUT' && ['text','email','tel','number','password','search','url','','null'].includes(type)) ||
    tag === 'TEXTAREA' ||
    role === 'textbox' ||
    role === 'searchbox';

  if (isTextInput) {
    _activeInputEl = el;
    el.focus();
    openOSK(el);
    return;
  }

  // SELECT → open custom accessible select dialog
  if (tag === 'SELECT') {
    _selectEl = el;
    el.focus();
    openSelectDialog(el);
    return;
  }

  // Checkbox / radio → toggle
  if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
    el.focus();
    el.click();
    _overlay.flash(`${window.AccessScan.Highlighter.getElementLabel(el)}: ${el.checked ? 'checked' : 'unchecked'}`);
    return;
  }

  // Button / link / submit / role=button → click
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  el.click();

  // After clicking a submit button, check for credential save opportunity
  if (type === 'submit' || type === 'button' || tag === 'BUTTON') {
    setTimeout(checkCredentialSave, 800);
  }
}

// ── OSK ───────────────────────────────────────────────────────────────────────

function openOSK(inputEl) {
  if (_oskIframe) closeOSK(false);

  _state = AS_State.OSK_OPEN;
  _overlay.setMode('KEYBOARD');
  _overlay.setHints({ left: 'Prev key', right: 'Next key', down: 'Type key', up: 'Close' });

  const inputType = inputEl?.getAttribute('type') || 'text';
  const isPassword = inputType === 'password';
  let layout = 'qwerty';
  if (inputType === 'number' || inputType === 'tel') layout = 'numeric';
  else if (inputType === 'email') layout = 'email';

  const fieldLabel = encodeURIComponent(
    window.AccessScan.Highlighter.getElementLabel(inputEl) || 'Text field'
  );
  const currentValue = isPassword ? '' : (inputEl.value || '');

  _oskIframe = document.createElement('iframe');
  _oskIframe.id = 'accessscan-osk-iframe';
  _oskIframe.src =
    chrome.runtime.getURL('src/keyboard/keyboard.html') +
    `?layout=${layout}&isPassword=${isPassword}&fieldLabel=${fieldLabel}`;
  _oskIframe.setAttribute('aria-label', 'AccessScan virtual keyboard');
  _oskIframe.setAttribute('title', 'AccessScan virtual keyboard');
  _oskIframe.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0;
    width: 100%; height: 300px; border: none;
    z-index: 2147483645; background: transparent;
  `;
  document.body.appendChild(_oskIframe);
  document.body.style.marginBottom = '300px';

  // Send current field value to OSK after it loads
  _oskIframe.addEventListener('load', () => {
    _oskIframe?.contentWindow?.postMessage(
      { source: 'accessscan-main', type: 'INIT_VALUE', value: currentValue, isPassword },
      '*'
    );
  });
}

function closeOSK(resumeNav = true) {
  if (_oskIframe) {
    _oskIframe.remove();
    _oskIframe = null;
  }
  document.body.style.marginBottom = '';

  if (_state === AS_State.OSK_OPEN && resumeNav) {
    _state = AS_State.NAVIGATING;
    _overlay.setMode('NAVIGATING');
    _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
    highlightCurrent();
  }
  _activeInputEl = null;
}

function handleOSKMessage(event) {
  if (event.data?.source !== 'accessscan-osk') return;
  const { type, char } = event.data;
  const input = _activeInputEl;

  switch (type) {
    case 'OSK_CHAR':
      if (input) insertChar(input, char);
      break;
    case 'OSK_BACKSPACE':
      if (input) deleteChar(input);
      break;
    case 'OSK_CLEAR':
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      break;
    case 'OSK_DONE':
      closeOSK(true);
      break;
    case 'OSK_CANCEL':
      closeOSK(true);
      break;
  }
}

// ── Select Dialog ─────────────────────────────────────────────────────────────

function openSelectDialog(selectEl) {
  if (_selectDialog) closeSelectDialog();
  _state = AS_State.SELECT_OPEN;

  _selectOptions = Array.from(selectEl.options).filter((o) => !o.disabled);
  _selectIndex = Math.max(0, selectEl.selectedIndex);

  _overlay.setMode('CHOOSE OPTION');
  _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Confirm', up: 'Cancel' });

  // Rebuild the controller to handle SELECT_OPEN state
  if (_controller) {
    _controller.onNext = () => {
      _selectIndex = (_selectIndex + 1) % _selectOptions.length;
      updateSelectHighlight();
    };
    _controller.onPrev = () => {
      _selectIndex = (_selectIndex - 1 + _selectOptions.length) % _selectOptions.length;
      updateSelectHighlight();
    };
    _controller.onActivate = () => confirmSelectOption();
    _controller.onBack = closeSelectDialog;
  }

  renderSelectDialog(selectEl);
  updateSelectHighlight();
}

function renderSelectDialog(selectEl) {
  const label = window.AccessScan.Highlighter.getElementLabel(selectEl);
  const dlg = document.createElement('div');
  dlg.id = 'accessscan-select-dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', `Choose ${label}`);
  dlg.innerHTML = `
    <div id="as-select-title">${label}</div>
    <div id="as-select-list" role="listbox" aria-label="${label}">
      ${_selectOptions.map((o, i) => `
        <div class="as-select-option" data-index="${i}" role="option" aria-selected="${i === _selectIndex}">
          ${o.text}
        </div>
      `).join('')}
    </div>
    <div id="as-select-hint">▼ Confirm  ▲ Cancel</div>
  `;
  document.body.appendChild(dlg);
  _selectDialog = dlg;
  _overlay.setElementName(label);
}

function updateSelectHighlight() {
  if (!_selectDialog) return;
  const options = _selectDialog.querySelectorAll('.as-select-option');
  options.forEach((opt, i) => {
    const active = i === _selectIndex;
    opt.classList.toggle('active', active);
    opt.setAttribute('aria-selected', String(active));
    if (active) opt.scrollIntoView({ block: 'nearest' });
  });
  const text = _selectOptions[_selectIndex]?.text || '';
  _overlay.setElementName(text);
}

function confirmSelectOption() {
  if (!_selectEl) return;
  const chosen = _selectOptions[_selectIndex];
  if (chosen) {
    _selectEl.value = chosen.value;
    _selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    _overlay.flash(`Selected: ${chosen.text}`);
  }
  closeSelectDialog();
}

function closeSelectDialog() {
  if (_selectDialog) { _selectDialog.remove(); _selectDialog = null; }
  _selectEl = null;
  _selectOptions = [];

  if (_state === AS_State.SELECT_OPEN) {
    _state = AS_State.NAVIGATING;
    _overlay.setMode('NAVIGATING');
    _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });

    // Restore controller callbacks
    if (_controller) {
      _controller.onNext = handleNext;
      _controller.onPrev = handlePrev;
      _controller.onActivate = handleActivate;
      _controller.onBack = handleBack;
    }
    highlightCurrent();
  }
}

// ── Credential Management ─────────────────────────────────────────────────────

async function checkAutofill() {
  if (!_settings?.credentials?.enabled) return;
  const form = _credMgr.detectLoginForm();
  if (!form || !form.usernameEl) return;

  const saved = await _credMgr.getSavedCredential();
  if (!saved) return;

  // Show autofill prompt in overlay
  setTimeout(() => {
    if (_state === AS_State.IDLE) return;
    _overlay.flash(`💾 Saved login available for ${window.location.hostname}. Navigate to username field and press ▼ to autofill.`, 5000);
    // Tag the username element so activation triggers autofill
    form.usernameEl.dataset.asAutofill = 'true';
    form.usernameEl.dataset.asUsername = saved.username;
  }, 500);
}

async function checkCredentialSave() {
  if (!_settings?.credentials?.enabled) return;
  const form = _credMgr.detectLoginForm();
  if (!form || !form.usernameEl || !form.passwordEl) return;

  const username = form.usernameEl.value;
  if (!username) return;

  // Don't re-save if same origin already saved
  const existing = await _credMgr.getSavedCredential();
  if (existing?.username === username) return;

  // Store reference for prompt
  _credPromptData = { username, passwordEl: form.passwordEl };
  showCredPrompt(username);
}

function showCredPrompt(username) {
  _state = AS_State.CRED_PROMPT;
  _credPromptOptions = ['save', 'skip'];
  _credPromptIndex = 0;

  const dlg = document.createElement('div');
  dlg.id = 'accessscan-cred-prompt';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', 'Save login');
  dlg.innerHTML = `
    <div id="as-cred-title">💾 Save login for ${window.location.hostname}?</div>
    <div id="as-cred-user">Username: <strong>${username}</strong></div>
    <div id="as-cred-note">Password will be saved securely by your browser.</div>
    <div id="as-cred-options">
      <div class="as-cred-option active" data-action="save" role="button" aria-pressed="true">✓ Save</div>
      <div class="as-cred-option" data-action="skip" role="button" aria-pressed="false">✕ Not now</div>
    </div>
    <div id="as-cred-hint">◀ ▶ Choose  ▼ Confirm  ▲ Dismiss</div>
  `;
  document.body.appendChild(dlg);

  // Temporarily re-route controller
  if (_controller) {
    _controller.onNext = () => {
      _credPromptIndex = (_credPromptIndex + 1) % _credPromptOptions.length;
      updateCredPromptHighlight();
    };
    _controller.onPrev = () => {
      _credPromptIndex = (_credPromptIndex - 1 + _credPromptOptions.length) % _credPromptOptions.length;
      updateCredPromptHighlight();
    };
    _controller.onActivate = confirmCredPrompt;
    _controller.onBack = dismissCredPrompt;
  }
}

function updateCredPromptHighlight() {
  const opts = document.querySelectorAll('.as-cred-option');
  opts.forEach((o, i) => {
    const active = i === _credPromptIndex;
    o.classList.toggle('active', active);
    o.setAttribute('aria-pressed', String(active));
  });
}

async function confirmCredPrompt() {
  const action = _credPromptOptions[_credPromptIndex];
  dismissCredPrompt();

  if (action === 'save' && _credPromptData) {
    await _credMgr.executeNativeSave(_credPromptData.username, _credPromptData.passwordEl);
    _overlay.flash('✓ Login saved!', 2000);
  }
  _credPromptData = null;
}

function dismissCredPrompt() {
  const dlg = document.getElementById('accessscan-cred-prompt');
  if (dlg) dlg.remove();
  _credPromptData = null;
  _state = AS_State.NAVIGATING;

  // Restore controller
  if (_controller) {
    _controller.onNext = handleNext;
    _controller.onPrev = handlePrev;
    _controller.onActivate = handleActivate;
    _controller.onBack = handleBack;
  }
  _overlay.setMode('NAVIGATING');
  _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
}

// ── Text insertion helpers ────────────────────────────────────────────────────

function insertChar(input, char) {
  const start = input.selectionStart ?? input.value.length;
  const end   = input.selectionEnd   ?? input.value.length;
  input.value = input.value.slice(0, start) + char + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + char.length;
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function deleteChar(input) {
  const start = input.selectionStart ?? input.value.length;
  const end   = input.selectionEnd   ?? input.value.length;
  if (start === end && start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start - 1;
  } else if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
