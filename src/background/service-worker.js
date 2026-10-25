/**
 * AccessScan v2.0 — Background Service Worker (Manifest V3)
 *
 * Handles:
 *  - Extension install/update lifecycle
 *  - Persisting settings via chrome.storage.sync
 *  - Relaying commands between popup and active content scripts
 */

'use strict';

const DEFAULT_SETTINGS = {
  enabled: false,
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
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get('settings').then(({ settings }) => {
      sendResponse({ settings: settings ?? DEFAULT_SETTINGS });
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set({ settings: message.settings }).then(() => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_UPDATED',
              settings: message.settings,
            }).catch(() => {});
          }
        });
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'TOGGLE_SCANNER' || message.type === 'START_SCANNER' || message.type === 'STOP_SCANNER') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: message.type })
          .then((resp) => sendResponse(resp))
          .catch((err) => sendResponse({ error: err.message }));
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true;
  }
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
