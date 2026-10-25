/**
 * AccessScan v2.0 — Background Service Worker (Manifest V3)
 *
 * Handles:
 *  - Extension install/update lifecycle
 *  - Persisting settings via chrome.storage.sync
 *  - Relaying commands with automatic on-demand content script injection fallback
 */

'use strict';

const DEFAULT_SETTINGS = {
  enabled: true, // Automatically active across supported websites
  inputMode: '4key', // '4key' (Four Arrow Keys) | '1key' (Single Switch)
  scanSpeed: 1500, // Interval in ms for 1-key single switch auto-scan
  speechEnabled: true, // Voice synthesis readout
  scanMode: 'flat', // 'flat' | 'hierarchical'
  highlightColor: '#FF6B35',
  highlightBorderWidth: 3,
  audio: {
    enabled: true,
  },
  credentials: {
    enabled: true,
  },
};

// ── Install / Update ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    console.log('[AccessScan v2] Installed with default settings.');
  } else if (reason === 'update') {
    const { settings: existing = {} } = await chrome.storage.sync.get('settings');
    const merged = deepMerge(DEFAULT_SETTINGS, existing);
    await chrome.storage.sync.set({ settings: merged });
    console.log('[AccessScan v2] Updated settings merged.');
  }
});

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NAVIGATE_BACK') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No sender tab identifier' });
      return false;
    }

    if (typeof chrome.tabs.goBack === 'function') {
      chrome.tabs.goBack(tabId)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err?.message || 'No previous history entry' });
        });
      return true;
    } else {
      sendResponse({ success: false, error: 'chrome.tabs.goBack not supported' });
      return false;
    }
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get('settings').then(({ settings }) => {
      sendResponse({ settings: settings ?? DEFAULT_SETTINGS });
    }).catch(() => {
      sendResponse({ settings: DEFAULT_SETTINGS });
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set({ settings: message.settings }).then(() => {
      chrome.tabs.query({}).then((tabs) => {
        tabs.forEach((tab) => {
          if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_UPDATED',
              settings: message.settings,
            }).catch(() => {});
          }
        });
      }).catch(() => {});
      sendResponse({ ok: true });
    }).catch((e) => {
      sendResponse({ error: e.message });
    });
    return true;
  }

  if (
    message.type === 'TOGGLE_SCANNER' ||
    message.type === 'START_SCANNER' ||
    message.type === 'STOP_SCANNER' ||
    message.action === 'TOGGLE_SCAN' ||
    message.type === 'TOGGLE_SCAN' ||
    message.action === 'TRIGGER_SWITCH' ||
    message.type === 'TRIGGER_SWITCH' ||
    message.action === 'SET_SPEED' ||
    message.type === 'SET_SPEED' ||
    message.action === 'GET_STATUS' ||
    message.type === 'GET_STATUS'
  ) {
    (async () => {
      try {
        let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
        let tab = tabs.find(t => t.id && t.url && (t.url.startsWith('http://') || t.url.startsWith('https://') || t.url.startsWith('file://')));
        if (!tab) {
          tabs = await chrome.tabs.query({ active: true }).catch(() => []);
          tab = tabs.find(t => t.id && t.url && (t.url.startsWith('http://') || t.url.startsWith('https://') || t.url.startsWith('file://')));
        }

        if (tab?.id) {
          try {
            const resp = await chrome.tabs.sendMessage(tab.id, message);
            sendResponse(resp || { ok: true });
          } catch (_) {
            // Dynamic injection fallback
            try {
              await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/content/content.css'] }).catch(() => {});
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  'src/content/scanner.js',
                  'src/content/highlighter.js',
                  'src/content/hierarchy.js',
                  'src/content/controller.js',
                  'src/content/single-switch.js',
                  'src/content/credentials.js',
                  'src/content/overlay.js',
                  'src/content/main.js'
                ]
              });
              await new Promise(r => setTimeout(r, 120));
              const retryResp = await chrome.tabs.sendMessage(tab.id, message).catch(() => ({ ok: true }));
              sendResponse(retryResp || { ok: true });
            } catch (e) {
              sendResponse({ error: e.message });
            }
          }
        } else {
          sendResponse({ error: 'No active web tab found' });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
  return false;
});

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      typeof overrides[key] === 'object' &&
      overrides[key] !== null &&
      !Array.isArray(overrides[key]) &&
      key in result
    ) {
      result[key] = deepMerge(result[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}
