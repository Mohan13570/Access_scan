/**
 * AccessScan v2.0 — Main Orchestrator
 *
 * Four-key navigation state machine:
 *   IDLE
 *     ↓ (auto-init if enabled OR Start clicked)
 *   NAVIGATING  ← RIGHT/LEFT move focus, DOWN activates, UP backs out/stops
 *     ↓ DOWN on text/password input
 *   OSK_OPEN    ← Linear 4-key typing, UP exits immediately to webpage
 *     ↓ UP or DONE
 *   NAVIGATING  ← Active input restored; RIGHT moves to next field
 *
 * Fully supports:
 *  - Automatic activation across supported websites
 *  - SPA URL change detection without full reload
 *  - Unobtrusive floating accessibility badge
 *  - Central keyboard event controller with explicit modes
 *  - Framework-safe input insertion (React/Vue/Angular)
 */

'use strict';

window.AccessScan = window.AccessScan || {};

// Guard against duplicate injection
if (window.__ACCESSSCAN_INITIALIZED__) {
  console.log('[AccessScan v2] Content script already active in this frame.');
} else {
  window.__ACCESSSCAN_INITIALIZED__ = true;

  // ── State enum ──────────────────────────────────────────────────────────────
  const AS_State = {
    IDLE: 'IDLE',
    NAVIGATING: 'NAVIGATING',
    OSK_OPEN: 'OSK_OPEN',
    SELECT_OPEN: 'SELECT_OPEN',
    CRED_PROMPT: 'CRED_PROMPT',
  };

  // ── Module-level state ──────────────────────────────────────────────────────
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
  let _lastUrl = window.location.href;

  // Credential save prompt state
  let _credPromptOptions = [];
  let _credPromptIndex = 0;
  let _credPromptData = null;

  // Select dialog state
  let _selectOptions = [];
  let _selectIndex = 0;
  let _selectEl = null;

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  async function init() {
    _settings = await loadSettings();

    // Instantiate modules
    _overlay = new window.AccessScan.OverlayPanel();
    _credMgr = new window.AccessScan.CredentialManager();

    // Message listener for popup & service worker
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'SETTINGS_UPDATED') {
        _settings = msg.settings;
        if (_settings?.enabled && _state === AS_State.IDLE) {
          startNav();
        } else if (!_settings?.enabled && _state !== AS_State.IDLE) {
          stopNav(false);
        }
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'TOGGLE_SCANNER') {
        toggleAccessScan();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'START_SCANNER') {
        if (_state === AS_State.IDLE) startNav();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'STOP_SCANNER') {
        if (_state !== AS_State.IDLE) stopNav(true);
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'GET_STATUS') {
        sendResponse({ state: _state, index: _flatIndex, total: _flatElements.length });
        return false;
      }
      return false;
    });

    // Storage change listener (syncs state across tabs)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && changes.settings?.newValue) {
            _settings = changes.settings.newValue;
            if (_settings.enabled && _state === AS_State.IDLE) {
              startNav();
            } else if (!_settings.enabled && _state !== AS_State.IDLE) {
              stopNav(false);
            }
          }
        });
      }
    } catch (_) {}

    // Listen for OSK iframe messages
    window.addEventListener('message', handleOSKMessage);

    // DOM mutation watcher (debounced)
    _domObserver = new MutationObserver(() => {
      clearTimeout(_domDebounce);
      _domDebounce = setTimeout(onDOMMutated, 300);
    });
    _domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });

    // Focus synchronization
    document.addEventListener('focusin', (e) => {
      if (_state === AS_State.NAVIGATING && e.target && _flatElements.length > 0) {
        const idx = _flatElements.indexOf(e.target);
        if (idx !== -1) {
          _flatIndex = idx;
          highlightCurrent();
        }
      }
    }, true);

    // SPA URL change watchers
    window.addEventListener('popstate', onUrlChanged);
    window.addEventListener('hashchange', onUrlChanged);

    const origPushState = history.pushState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      onUrlChanged();
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      onUrlChanged();
    };

    // Automatic activation if user has AccessScan enabled (default: true)
    if (_settings?.enabled !== false) {
      startNav();
    }

    // Check autofill opportunity
    setTimeout(checkAutofill, 1200);

    console.log(`[AccessScan v2] Initialized. Auto-active: ${_settings?.enabled !== false}`);
  }

  async function loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const res = await chrome.storage.sync.get('settings');
        return res?.settings ?? getDefaultSettings();
      }
    } catch (_) {}
    return getDefaultSettings();
  }

  function getDefaultSettings() {
    return {
      enabled: true, // Enabled by default for automatic operation across websites
      scanMode: 'flat',
      highlightColor: '#FF6B35',
      highlightBorderWidth: 3,
      audio: { enabled: true },
      credentials: { enabled: true },
    };
  }

  // ── SPA URL Change Handler ──────────────────────────────────────────────────
  function onUrlChanged() {
    if (window.location.href === _lastUrl) return;
    _lastUrl = window.location.href;

    setTimeout(() => {
      if (_state !== AS_State.IDLE) {
        if (_state === AS_State.OSK_OPEN) closeOSK(false);
        if (_state === AS_State.SELECT_OPEN) closeSelectDialog();
        _flatIndex = 0;
        refreshElements();
        if (_flatElements.length > 0) {
          highlightCurrent();
        }
      }
    }, 200);
  }

  // ── Start / Stop ────────────────────────────────────────────────────────────
  function toggleAccessScan() {
    if (_state === AS_State.IDLE) startNav();
    else stopNav(true);
  }

  function startNav() {
    _state = AS_State.NAVIGATING;
    _settings = _settings || getDefaultSettings();
    _settings.enabled = true;

    // Persist enabled preference across websites
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set({ settings: _settings }).catch(() => {});
      }
    } catch (_) {}

    // Mount unobtrusive HUD badge
    _overlay.mount();
    _overlay.setMode('NAVIGATING');
    _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Stop' });

    // Create central four-key controller
    if (!_controller) {
      _controller = new window.AccessScan.FourKeyController({
        onNext: handleNext,
        onPrev: handlePrev,
        onActivate: handleActivate,
        onBack: handleBack,
        getMode: () => {
          switch (_state) {
            case AS_State.NAVIGATING:
              return window.AccessScan.ControllerMode.NAVIGATION_MODE;
            case AS_State.OSK_OPEN:
              return window.AccessScan.ControllerMode.VIRTUAL_KEYBOARD_MODE;
            case AS_State.SELECT_OPEN:
            case AS_State.CRED_PROMPT:
              return window.AccessScan.ControllerMode.DIALOG_MODE;
            default:
              return window.AccessScan.ControllerMode.DISABLED;
          }
        },
        onKeyboardKey: forwardKeyToOSK,
        getSettings: () => _settings,
      });
    }
    _controller.attach();

    // Discover interactive elements
    refreshElements();

    if (_flatElements.length > 0 || (_hierarchyMgr && _hierarchyMgr.sections.length > 0)) {
      highlightCurrent();
    }

    console.log('[AccessScan v2] Navigation active.');
  }

  function stopNav(persistDisabled = true) {
    _state = AS_State.IDLE;
    if (persistDisabled && _settings) {
      _settings.enabled = false;
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
          chrome.storage.sync.set({ settings: _settings }).catch(() => {});
        }
      } catch (_) {}
    }

    if (_controller) {
      _controller.detach();
      _controller = null;
    }

    window.AccessScan.Highlighter.clearHighlight();
    closeOSK(false);
    closeSelectDialog();
    _overlay.unmount();

    console.log('[AccessScan v2] Navigation stopped.');
  }

  // ── Element collection ──────────────────────────────────────────────────────
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
      if (_flatIndex >= _flatElements.length) {
        _flatIndex = Math.max(0, _flatElements.length - 1);
      }
    }
  }

  function onDOMMutated() {
    if (_state === AS_State.IDLE) return;
    refreshElements();

    if (_flatElements.length > 0 && _flatIndex >= _flatElements.length) {
      _flatIndex = Math.max(0, _flatElements.length - 1);
    }

    if (_state === AS_State.NAVIGATING) {
      highlightCurrent();
    }
  }

  // ── Navigation handlers ─────────────────────────────────────────────────────
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
          stopNav(false);
          _overlay.flash('AccessScan paused on page.');
        }
        break;
      }
      default:
        break;
    }
  }

  // ── Highlight ───────────────────────────────────────────────────────────────
  function highlightCurrent() {
    const mode = _settings?.scanMode ?? 'flat';

    if (mode === 'hierarchical' && _hierarchyMgr) {
      if (_hierarchyMgr.isAtSectionLevel) {
        const sec = _hierarchyMgr.currentSection;
        if (sec) {
          window.AccessScan.Highlighter.highlightSection(sec.el, sec.label, _settings);
          _overlay.setElementName(`Section: ${sec.label} (${sec.children.length} controls)`);
        }
      } else {
        const el = _hierarchyMgr.currentElement;
        if (el) {
          window.AccessScan.Highlighter.highlightElement(el, _settings);
          _overlay.setElementName(window.AccessScan.Highlighter.getElementLabel(el));
        }
      }
    } else {
      const el = _flatElements[_flatIndex];
      if (el) {
        window.AccessScan.Highlighter.highlightElement(el, _settings);
        _overlay.setElementName(window.AccessScan.Highlighter.getElementLabel(el));
      } else {
        _overlay.setElementName('—');
      }
    }
  }

  // ── Element Activation ──────────────────────────────────────────────────────
  function activateElement(el) {
    if (!el) return;

    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();

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

    if (tag === 'SELECT') {
      _selectEl = el;
      el.focus();
      openSelectDialog(el);
      return;
    }

    if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
      el.focus();
      el.click();
      _overlay.flash(`${window.AccessScan.Highlighter.getElementLabel(el)}: ${el.checked ? 'checked' : 'unchecked'}`);
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.focus();
    el.click();

    if (type === 'submit' || type === 'button' || tag === 'BUTTON') {
      setTimeout(checkCredentialSave, 800);
    }
  }

  // ── Virtual Keyboard (OSK) ──────────────────────────────────────────────────
  function openOSK(inputEl) {
    if (_oskIframe) closeOSK(false);

    _state = AS_State.OSK_OPEN;
    _overlay.setMode('KEYBOARD');
    _overlay.setHints({ left: 'Prev key', right: 'Next key', down: 'Type key', up: 'Exit to page' });

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
      position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
      width: 100% !important; height: 300px !important; border: none !important;
      z-index: 2147483645 !important; background: transparent !important;
    `;
    document.body.appendChild(_oskIframe);
    document.body.style.marginBottom = '300px';

    _oskIframe.addEventListener('load', () => {
      _oskIframe?.contentWindow?.postMessage(
        { source: 'accessscan-main', type: 'INIT_VALUE', value: currentValue, isPassword },
        '*'
      );
    });
  }

  function forwardKeyToOSK(key) {
    if (_oskIframe && _oskIframe.contentWindow) {
      _oskIframe.contentWindow.postMessage(
        { source: 'accessscan-main', type: 'OSK_KEY', key },
        '*'
      );
    }
  }

  function closeOSK(resumeNav = true) {
    const previousInput = _activeInputEl;
    if (_oskIframe) {
      _oskIframe.remove();
      _oskIframe = null;
    }
    document.body.style.marginBottom = '';

    if (_state === AS_State.OSK_OPEN && resumeNav) {
      _state = AS_State.NAVIGATING;
      _overlay.setMode('NAVIGATING');
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Stop' });

      // Restore highlight and position to the previous input field
      if (previousInput && _flatElements.length > 0) {
        const idx = _flatElements.indexOf(previousInput);
        if (idx !== -1) {
          _flatIndex = idx;
        }
      }
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
          setNativeValue(input, '');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
      case 'OSK_DONE':
      case 'OSK_CANCEL':
        closeOSK(true);
        break;
    }
  }

  // ── Select Dialog ───────────────────────────────────────────────────────────
  function openSelectDialog(selectEl) {
    if (_selectDialog) closeSelectDialog();
    _state = AS_State.SELECT_OPEN;
    _selectEl = selectEl;
    _overlay.setMode('CHOOSE OPTION');
    _overlay.setHints({ left: 'Prev option', right: 'Next option', down: 'Confirm', up: 'Cancel' });

    const options = Array.from(selectEl.options);
    _selectOptions = options;
    _selectIndex = Math.max(0, selectEl.selectedIndex);

    const dlg = document.createElement('div');
    dlg.id = 'accessscan-select-dialog';
    dlg.setAttribute('role', 'listbox');
    dlg.setAttribute('aria-label', window.AccessScan.Highlighter.getElementLabel(selectEl));

    const title = document.createElement('div');
    title.id = 'as-select-title';
    title.textContent = `Select: ${window.AccessScan.Highlighter.getElementLabel(selectEl)}`;
    dlg.appendChild(title);

    const list = document.createElement('div');
    list.id = 'as-select-list';
    options.forEach((opt, idx) => {
      const item = document.createElement('div');
      item.className = 'as-select-item' + (idx === _selectIndex ? ' active' : '');
      item.textContent = opt.text;
      item.dataset.index = idx;
      list.appendChild(item);
    });
    dlg.appendChild(list);

    const hint = document.createElement('div');
    hint.id = 'as-select-hint';
    hint.textContent = '◀ ▶ Choose  ▼ Select  ▲ Cancel';
    dlg.appendChild(hint);

    document.body.appendChild(dlg);
    _selectDialog = dlg;

    if (_controller) {
      _controller.onNext = () => {
        _selectIndex = (_selectIndex + 1) % _selectOptions.length;
        updateSelectHighlight();
      };
      _controller.onPrev = () => {
        _selectIndex = (_selectIndex - 1 + _selectOptions.length) % _selectOptions.length;
        updateSelectHighlight();
      };
      _controller.onActivate = () => {
        selectEl.selectedIndex = _selectIndex;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        closeSelectDialog();
      };
      _controller.onBack = () => closeSelectDialog();
    }
  }

  function updateSelectHighlight() {
    if (!_selectDialog) return;
    const items = _selectDialog.querySelectorAll('.as-select-item');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === _selectIndex);
      if (idx === _selectIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function closeSelectDialog() {
    if (_selectDialog) {
      _selectDialog.remove();
      _selectDialog = null;
    }
    _selectOptions = [];
    _selectEl = null;

    if (_state === AS_State.SELECT_OPEN) {
      _state = AS_State.NAVIGATING;
      _overlay.setMode('NAVIGATING');
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Stop' });
      highlightCurrent();
    }

    if (_controller) {
      _controller.onNext = handleNext;
      _controller.onPrev = handlePrev;
      _controller.onActivate = handleActivate;
      _controller.onBack = handleBack;
    }
  }

  // ── Autofill & Credential Helpers ───────────────────────────────────────────
  async function checkAutofill() {
    if (!_settings?.credentials?.enabled || !_credMgr) return;
    try {
      const form = document.querySelector('form');
      if (!form) return;
      const cred = await _credMgr.getSavedCredential();
      if (cred) {
        _overlay.flash(`Autofilled credentials for ${cred.username}`, 3000);
      }
    } catch (_) {}
  }

  function checkCredentialSave() {
    if (!_settings?.credentials?.enabled) return;
    const userEl = document.querySelector('input[type="text"], input[type="email"], input[name*="user" i]');
    const passEl = document.querySelector('input[type="password"]');
    if (!userEl || !passEl) return;
    const username = userEl.value.trim();
    if (!username || !passEl.value) return;

    _credPromptData = { username, passwordEl: passEl };
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

    if (_controller) {
      _controller.onNext = handleNext;
      _controller.onPrev = handlePrev;
      _controller.onActivate = handleActivate;
      _controller.onBack = handleBack;
    }
    _overlay.setMode('NAVIGATING');
    _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Stop' });
  }

  // ── Framework-safe Input Helpers ────────────────────────────────────────────
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function insertChar(input, char) {
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    const newVal = input.value.slice(0, start) + char + input.value.slice(end);
    setNativeValue(input, newVal);
    input.selectionStart = input.selectionEnd = start + char.length;
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function deleteChar(input) {
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    let newVal = input.value;
    let newPos = start;
    if (start === end && start > 0) {
      newVal = input.value.slice(0, start - 1) + input.value.slice(end);
      newPos = start - 1;
    } else if (start !== end) {
      newVal = input.value.slice(0, start) + input.value.slice(end);
      newPos = start;
    }
    setNativeValue(input, newVal);
    input.selectionStart = input.selectionEnd = newPos;
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  init();
}