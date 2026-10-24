/**
 * AccessScan — Background Service Worker (Manifest V3)
 *
 * Handles:
 *  - Extension install/update lifecycle
 *  - Messaging relay between popup and content scripts
 *  - Persisting global settings via chrome.storage.sync
 */

// ── Default settings ──────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  enabled: false,
  scanInterval: 1500,       // ms between highlights
  switchKey: ' ',           // Space bar
  pauseKey: 'Escape',
  scanMode: 'flat',         // 'flat' | 'hierarchical'
  highlightColor: '#FF6B35',
  highlightBorderWidth: 3,
  osk: {
    layout: 'qwerty',       // 'qwerty' | 'abc' | 'numeric' | 'email'
    charGroupScan: true,    // hierarchical char scanning inside OSK
  },
  audio: {
    enabled: true,
    beepOnSelect: true,
  },
};

// ── Install / Update ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    console.log('[AccessScan] Installed with default settings.');
  } else if (reason === 'update') {
    // Merge new default keys without overwriting existing user preferences
    const { settings: existing = {} } = await chrome.storage.sync.get('settings');
    const merged = deepMerge(DEFAULT_SETTINGS, existing);
    await chrome.storage.sync.set({ settings: merged });
    console.log('[AccessScan] Updated & settings merged.');
  }
});

// ── Message relay ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get('settings').then(({ settings }) => {
      sendResponse({ settings: settings ?? DEFAULT_SETTINGS });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set({ settings: message.settings }).then(() => {
      // Broadcast updated settings to all active tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: message.settings,
          }).catch(() => {/* tab may not have content script */});
        });
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'TOGGLE_SCANNER') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_SCANNER' })
          .then((resp) => sendResponse(resp))
          .catch((err) => sendResponse({ error: err.message }));
      }
    });
    return true;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
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
