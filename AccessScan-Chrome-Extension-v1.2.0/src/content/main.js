/**
 * AccessScan v2.0 — Main Navigation Orchestrator & State Machine
 *
 * Full 4-Key Accessibility System with Authoritative Interaction States:
 *   - WEBSITE_NAVIGATION: Right/Left move focus, Down activates, Up requests Browser Back.
 *   - VIRTUAL_KEYBOARD: Right/Left move linearly across keys, Down types, Up exits to page.
 *   - PAGE_GROUP: Section traversal; Down enters group, Up returns to sections list.
 *   - DIALOG: Modal/custom dropdowns; Down activates, Up cancels/closes dialog.
 *   - BROWSER_BACK_PENDING: Transit state; blocks key repetition while navigating back.
 *   - DISABLED: Extension idle; normal browser behavior untouched.
 *
 * Deterministic Back Priority Order for UP ARROW:
 *   1. VIRTUAL_KEYBOARD -> Close OSK, preserve entered text, restore focus to active input.
 *   2. DIALOG -> Dismiss/cancel open extension dialog.
 *   3. PAGE_GROUP -> Return to parent section hierarchy.
 *   4. Submenu / temporary selection -> Return to parent interface.
 *   5. WEBSITE_NAVIGATION -> Request real browser Back via service worker (or fallback).
 *
 * Reliability & Lifecycle Features:
 *   - Auto-activation across supported websites.
 *   - Real browser Back (`chrome.tabs.goBack`) preserving session history across origins.
 *   - bfcache restoration (`pageshow` event handling).
 *   - SPA route change observation (History API + popstate/hashchange).
 *   - React/Vue/Angular controlled input support.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

// Guard against duplicate injection
if (window.__ACCESSSCAN_INITIALIZED__) {
  console.log('[AccessScan v2] Content script already active in this frame.');
} else {
  window.__ACCESSSCAN_INITIALIZED__ = true;

  // ── Authoritative Navigation State Enum ─────────────────────────────────────
  const NavState = window.AccessScan.NavState || {
    WEBSITE_NAVIGATION: 'WEBSITE_NAVIGATION',
    VIRTUAL_KEYBOARD: 'VIRTUAL_KEYBOARD',
    PAGE_GROUP: 'PAGE_GROUP',
    DIALOG: 'DIALOG',
    BROWSER_BACK_PENDING: 'BROWSER_BACK_PENDING',
    DISABLED: 'DISABLED',
  };

  // Backwards-compatible aliases
  const AS_State = {
    IDLE: NavState.DISABLED,
    NAVIGATING: NavState.WEBSITE_NAVIGATION,
    OSK_OPEN: NavState.VIRTUAL_KEYBOARD,
    SELECT_OPEN: NavState.DIALOG,
    CRED_PROMPT: NavState.DIALOG,
  };

  // ── Module-level state ──────────────────────────────────────────────────────
  let _state = NavState.DISABLED;
  let _settings = null;
  let _controller = null;       // FourKeyController
  let _overlay = null;          // OverlayPanel
  let _credMgr = null;          // CredentialManager
  let _hierarchyMgr = null;     // HierarchyManager
  let _singleSwitch = null;     // SingleSwitchScanner (1-Key Mode)
  let _oskIframe = null;
  let _selectDialog = null;

  // Flat navigation
  let _flatElements = [];
  let _flatIndex = 0;

  // Active input element
  let _activeInputEl = null;

  // Observers and navigation tracking
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
    if (window.AccessScan.SingleSwitchScanner) {
      _singleSwitch = new window.AccessScan.SingleSwitchScanner();
    }

    // Message listener for popup & service worker
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'SETTINGS_UPDATED') {
        _settings = msg.settings;
        applyInputMode();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'TOGGLE_SCANNER' || msg.action === 'TOGGLE_SCAN' || msg.type === 'TOGGLE_SCAN') {
        toggleAccessScan();
        sendResponse({
          ok: true,
          isPaused: _settings?.inputMode === '1key' ? _singleSwitch?.isPaused : _state === NavState.DISABLED,
        });
        return false;
      }
      if (msg.type === 'START_SCANNER') {
        if (_settings) _settings.enabled = true;
        applyInputMode();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'STOP_SCANNER') {
        if (_settings) _settings.enabled = false;
        applyInputMode();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'TRIGGER_SWITCH' || msg.action === 'TRIGGER_SWITCH') {
        if (_singleSwitch) {
          _singleSwitch.handleSwitchTrigger();
        }
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'SET_SPEED' || msg.action === 'SET_SPEED') {
        const interval = msg.interval || msg.scanSpeed || 1500;
        _settings = _settings || getDefaultSettings();
        _settings.scanSpeed = interval;
        if (_singleSwitch) _singleSwitch.setSpeed(interval);
        try {
          if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
            chrome.storage.sync.set({ settings: _settings }).catch(() => {});
          }
        } catch (_) {}
        sendResponse({ ok: true, scanSpeed: interval });
        return false;
      }
      if (msg.type === 'START_EYE_TRACKER') {
        if (_singleSwitch) {
          _singleSwitch.updateConfig({ eyeTrackingEnabled: true, ...msg.options });
        }
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'STOP_EYE_TRACKER') {
        if (_singleSwitch) {
          _singleSwitch.updateConfig({ eyeTrackingEnabled: false });
        }
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'SET_BLINK_CONFIG') {
        _settings = _settings || getDefaultSettings();
        _settings.eyeTracking = { ...(_settings.eyeTracking || {}), ...msg.config };
        if (_singleSwitch) {
          _singleSwitch.updateConfig({
            blinkGesture: msg.config?.gestureMode,
            earThreshold: msg.config?.earThreshold,
            showMiniPreview: msg.config?.showMiniPreview,
          });
        }
        try {
          if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
            chrome.storage.sync.set({ settings: _settings }).catch(() => {});
          }
        } catch (_) {}
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'GET_STATUS' || msg.action === 'GET_STATUS') {
        sendResponse({
          ok: true,
          enabled: _settings?.enabled !== false,
          inputMode: _settings?.inputMode || '4key',
          state: _state,
          index: _flatIndex,
          total: _flatElements.length,
          isScanning: _singleSwitch ? _singleSwitch.isScanning : false,
          isPaused: _singleSwitch ? _singleSwitch.isPaused : false,
          scanSpeed: _settings?.scanSpeed || 1500,
          eyeTracking: {
            isActive: _singleSwitch?.eyeTracker ? _singleSwitch.eyeTracker.isActive : false,
            gestureMode: _settings?.eyeTracking?.gestureMode || 'single-blink',
            earThreshold: _settings?.eyeTracking?.earThreshold ?? 0.22,
          },
        });
        return false;
      }
      return false;
    });

    // Storage change listener (syncs across tabs)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && changes.settings?.newValue) {
            const prevMode = _settings?.inputMode;
            const prevEnabled = _settings?.enabled;
            _settings = { ...getDefaultSettings(), ...changes.settings.newValue };
            if (!_settings.enabled) {
              applyInputMode();
            } else if (prevEnabled === false && _settings.enabled) {
              applyInputMode();
            } else if (prevMode !== _settings.inputMode) {
              applyInputMode();
            } else if (_settings.inputMode === '1key' || _settings.inputMode === 'eye') {
              if (_singleSwitch) {
                _singleSwitch.updateConfig({
                  scanSpeed: _settings.scanSpeed,
                  hierarchicalMode: _settings.scanMode === 'hierarchical',
                  audioEnabled: _settings?.audio?.enabled !== false,
                  speechEnabled: _settings?.speechEnabled !== false,
                  eyeTrackingEnabled: _settings.inputMode === 'eye' || _settings?.eyeTracking?.enabled === true,
                  blinkGesture: _settings?.eyeTracking?.gestureMode || 'single-blink',
                  earThreshold: _settings?.eyeTracking?.earThreshold ?? 0.22,
                  showMiniPreview: _settings?.eyeTracking?.showMiniPreview !== false,
                });
              }
            } else {
              refreshElements(true);
              highlightCurrent();
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
      if (_state === NavState.WEBSITE_NAVIGATION && e.target && _flatElements.length > 0) {
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

    // bfcache & page restore listener
    window.addEventListener('pageshow', (event) => {
      if (_state === NavState.BROWSER_BACK_PENDING) {
        _state = NavState.WEBSITE_NAVIGATION;
      }
      if (_settings?.enabled !== false) {
        if (_state === NavState.DISABLED) {
          startNav();
        } else {
          _overlay.mount();
          _overlay.setMode('NAVIGATING');
          refreshElements();
          if (_flatElements.length > 0) {
            highlightCurrent();
          }
        }
      }
    });

    // Page hide listener
    window.addEventListener('pagehide', () => {
      if (_state === NavState.BROWSER_BACK_PENDING) {
        _state = NavState.WEBSITE_NAVIGATION;
      }
    });

    // Automatic activation if user has AccessScan enabled (default: true)
    if (_settings?.enabled !== false) {
      applyInputMode();
    }

    // Check autofill opportunity
    setTimeout(checkAutofill, 1200);

    console.log(`[AccessScan v2] Initialized. Auto-active: ${_settings?.enabled !== false}`);
  }

  async function loadSettings() {
    const defaults = getDefaultSettings();
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const res = await chrome.storage.sync.get('settings');
        if (res?.settings) {
          const s = { ...defaults, ...res.settings };
          if (s.inputMode !== '1key' && s.inputMode !== '4key' && s.inputMode !== 'eye') {
            s.inputMode = '4key';
          }
          if (typeof s.scanSpeed !== 'number' || isNaN(s.scanSpeed)) {
            s.scanSpeed = 1500;
          }
          return s;
        }
      }
    } catch (_) {}
    return defaults;
  }

  function getDefaultSettings() {
    return {
      enabled: true,
      inputMode: '4key', // '4key' (Four Arrow Keys) | '1key' (Single Switch) | 'eye' (Eye Blink Scanner)
      scanSpeed: 1500, // Interval in ms for 1-key/eye auto-scan
      speechEnabled: true, // Voice synthesis readout
      scanMode: 'flat',
      highlightColor: '#FF6B35',
      highlightBorderWidth: 3,
      audio: { enabled: true },
      credentials: { enabled: true },
      eyeTracking: {
        enabled: false,
        gestureMode: 'single-blink', // 'single-blink' | 'double-blink' | 'long-blink'
        earThreshold: 0.22,
        showMiniPreview: true,
      },
    };
  }

  // ── SPA URL Change Handler ──────────────────────────────────────────────────
  function onUrlChanged() {
    if (window.location.href === _lastUrl) return;
    _lastUrl = window.location.href;

    setTimeout(() => {
      if (_state !== NavState.DISABLED) {
        if (_state === NavState.VIRTUAL_KEYBOARD) closeOSK(false);
        if (_state === NavState.DIALOG) closeSelectDialog();
        _state = NavState.WEBSITE_NAVIGATION;
        _flatIndex = 0;
        refreshElements();
        if (_flatElements.length > 0) {
          highlightCurrent();
        }
      }
    }, 200);
  }

  // ── Input Mode Dispatcher (4-Key vs 1-Key vs Eye-Blink) ─────────────────────
  function applyInputMode() {
    const isEnabled = _settings?.enabled !== false;
    const mode = _settings?.inputMode || '4key';

    if (!isEnabled) {
      if (_singleSwitch) _singleSwitch.stop();
      stopNav(false);
      return;
    }

    if (mode === '1key' || mode === 'eye') {
      // Tear down 4-key navigation & overlay
      if (_controller) {
        _controller.detach();
        _controller = null;
      }
      if (_overlay) _overlay.unmount();
      if (window.AccessScan.Highlighter?.clearHighlight) {
        window.AccessScan.Highlighter.clearHighlight();
      }
      _state = NavState.DISABLED;

      // Start auto-scanning (with Spacebar switch and/or Eye-Blink detection)
      if (_singleSwitch) {
        const isEye = mode === 'eye' || _settings?.eyeTracking?.enabled === true;
        _singleSwitch.start({
          scanSpeed: _settings?.scanSpeed || 1500,
          hierarchicalMode: _settings?.scanMode === 'hierarchical',
          audioEnabled: _settings?.audio?.enabled !== false,
          speechEnabled: _settings?.speechEnabled !== false,
          eyeTrackingEnabled: isEye,
          blinkGesture: _settings?.eyeTracking?.gestureMode || 'single-blink',
          earThreshold: _settings?.eyeTracking?.earThreshold ?? 0.22,
          showMiniPreview: _settings?.eyeTracking?.showMiniPreview !== false,
        });
      }
    } else {
      // Tear down 1-key single switch scanning
      if (_singleSwitch) _singleSwitch.stop();

      // Start 4-key navigation
      startNav();
    }
  }

  // ── Start / Stop ────────────────────────────────────────────────────────────
  function toggleAccessScan() {
    if (_settings?.inputMode === '1key') {
      if (_singleSwitch) {
        if (!_singleSwitch.isScanning) {
          applyInputMode();
        } else {
          _singleSwitch.togglePause();
        }
      }
      return;
    }
    if (_state === NavState.DISABLED) startNav();
    else stopNav(true);
  }

  function startNav() {
    if (_settings?.inputMode === '1key') {
      applyInputMode();
      return;
    }
    if (_singleSwitch) _singleSwitch.stop();
    _state = NavState.WEBSITE_NAVIGATION;
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
    _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });

    // Create central four-key controller
    if (!_controller) {
      _controller = new window.AccessScan.FourKeyController({
        onNext: handleNext,
        onPrev: handlePrev,
        onActivate: handleActivate,
        onBack: handleBack,
        getMode: () => _state,
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
    _state = NavState.DISABLED;
    if (_singleSwitch) _singleSwitch.stop();
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
  function refreshElements(preserveState = false) {
    const mode = _settings?.scanMode ?? 'flat';

    if (mode === 'hierarchical') {
      if (!_hierarchyMgr) {
        _hierarchyMgr = new window.AccessScan.HierarchyManager();
      }
      _hierarchyMgr.load(preserveState);
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
    if (_state === NavState.DISABLED || _state === NavState.BROWSER_BACK_PENDING) return;
    refreshElements(true);

    if (_flatElements.length > 0 && _flatIndex >= _flatElements.length) {
      _flatIndex = Math.max(0, _flatElements.length - 1);
    }

    if (_state === NavState.WEBSITE_NAVIGATION) {
      highlightCurrent();
    }
  }

  // ── Navigation handlers ─────────────────────────────────────────────────────
  function handleNext() {
    if (_state !== NavState.WEBSITE_NAVIGATION && _state !== NavState.PAGE_GROUP) return;
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
    if (_state !== NavState.WEBSITE_NAVIGATION && _state !== NavState.PAGE_GROUP) return;
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
    if (_state !== NavState.WEBSITE_NAVIGATION && _state !== NavState.PAGE_GROUP) return;
    const mode = _settings?.scanMode ?? 'flat';

    if (mode === 'hierarchical' && _hierarchyMgr) {
      if (_hierarchyMgr.isAtSectionLevel) {
        _hierarchyMgr.selectSection();
        _state = NavState.PAGE_GROUP;
        _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back to sections' });
        highlightCurrent();
        return;
      }
      activateElement(_hierarchyMgr.currentElement);
    } else {
      activateElement(_flatElements[_flatIndex]);
    }
  }

  // ── Deterministic UP ARROW Handler ──────────────────────────────────────────
  async function handleBack() {
    console.log('[AccessScan v2] handleBack invoked, state =', _state, 'mode =', _settings?.scanMode);
    switch (_state) {
      case NavState.VIRTUAL_KEYBOARD:
        // Priority 1: Close virtual keyboard, preserve text, return to website navigation
        closeOSK(true);
        break;

      case NavState.DIALOG:
        // Priority 2: Handle extension dialog Back or Cancel
        if (_selectDialog) {
          closeSelectDialog();
        } else if (_credPromptData) {
          dismissCredPrompt();
        } else {
          _state = NavState.WEBSITE_NAVIGATION;
          _overlay.setMode('NAVIGATING');
          highlightCurrent();
        }
        break;

      case NavState.PAGE_GROUP:
        // Priority 3: Inside nested group; return to parent group
        if (_hierarchyMgr) {
          _hierarchyMgr.backToSections();
        }
        _state = NavState.WEBSITE_NAVIGATION;
        _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Enter section', up: 'Browser Back' });
        highlightCurrent();
        break;

      case NavState.WEBSITE_NAVIGATION: {
        const mode = _settings?.scanMode ?? 'flat';
        if (mode === 'hierarchical' && _hierarchyMgr && !_hierarchyMgr.isAtSectionLevel) {
          _hierarchyMgr.backToSections();
          _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Enter section', up: 'Browser Back' });
          highlightCurrent();
          return;
        }

        // Priority 5: Top-level website navigation -> Real browser Back navigation!
        await requestBrowserBack();
        break;
      }

      default:
        break;
    }
  }

  // ── Real Browser Back Navigation ────────────────────────────────────────────
  async function requestBrowserBack() {
    if (_state === NavState.BROWSER_BACK_PENDING) return;

    // Check if current tab was opened directly without prior history
    if (window.history && window.history.length <= 1) {
      _state = NavState.WEBSITE_NAVIGATION;
      _overlay.setMode('NAVIGATING');
      _overlay.flash('No previous history entry available.', 3000);
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
      highlightCurrent();
      return;
    }

    _state = NavState.BROWSER_BACK_PENDING;
    _overlay.setMode('BACK');
    _overlay.flash('Navigating back...', 2000);

    try {
      let resp = null;
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        resp = await chrome.runtime.sendMessage({ type: 'NAVIGATE_BACK' }).catch(() => null);
      }

      if (resp && resp.success) {
        // Navigation initiated; destination page will load content script.
        // Safety timeout in case navigation is cancelled or page does not unload:
        setTimeout(() => {
          if (_state === NavState.BROWSER_BACK_PENDING) {
            _state = NavState.WEBSITE_NAVIGATION;
            _overlay.setMode('NAVIGATING');
            _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
            highlightCurrent();
          }
        }, 1500);
        return;
      }

      // If service worker reports no history entry available or failure:
      if (resp && !resp.success) {
        _state = NavState.WEBSITE_NAVIGATION;
        _overlay.setMode('NAVIGATING');
        _overlay.flash('No previous history entry available.', 3000);
        _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
        highlightCurrent();
        return;
      }

      // Fallback only if service worker was unreachable: Use window.history.back()
      if (window.history && window.history.length > 1) {
        window.history.back();
        setTimeout(() => {
          if (_state === NavState.BROWSER_BACK_PENDING) {
            _state = NavState.WEBSITE_NAVIGATION;
            _overlay.setMode('NAVIGATING');
            _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
            highlightCurrent();
          }
        }, 1500);
      } else {
        _state = NavState.WEBSITE_NAVIGATION;
        _overlay.setMode('NAVIGATING');
        _overlay.flash('No previous history entry available.', 3000);
        _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
        highlightCurrent();
      }
    } catch (_) {
      _state = NavState.WEBSITE_NAVIGATION;
      _overlay.setMode('NAVIGATING');
      _overlay.flash('No previous history entry available.', 3000);
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
      highlightCurrent();
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

    _state = NavState.VIRTUAL_KEYBOARD;
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

    if (_state === NavState.VIRTUAL_KEYBOARD && resumeNav) {
      _state = NavState.WEBSITE_NAVIGATION;
      _overlay.setMode('NAVIGATING');
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });

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
    _state = NavState.DIALOG;
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

    if (_state === NavState.DIALOG) {
      _state = NavState.WEBSITE_NAVIGATION;
      _overlay.setMode('NAVIGATING');
      _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
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
    _state = NavState.DIALOG;
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
    _state = NavState.WEBSITE_NAVIGATION;

    if (_controller) {
      _controller.onNext = handleNext;
      _controller.onPrev = handlePrev;
      _controller.onActivate = handleActivate;
      _controller.onBack = handleBack;
    }
    _overlay.setMode('NAVIGATING');
    _overlay.setHints({ left: 'Prev', right: 'Next', down: 'Select', up: 'Back' });
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
