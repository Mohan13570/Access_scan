/**
 * AccessScan v2.0 — Popup Controller
 *
 * Clean tab messaging with dynamic on-demand script injection,
 * pure Promise-based messaging with zero unhandled runtime ports,
 * direct chrome.storage.sync integration, and saved credentials review.
 */

'use strict';

// ── DOM Elements ──────────────────────────────────────────────────────────────
const btnMainToggle    = document.getElementById('btn-main-toggle');
const btnToggleText    = document.getElementById('btn-toggle-text');
const toggleState      = document.getElementById('toggle-state');
const statusIndicator  = document.getElementById('status-indicator');
const statusMessage    = document.getElementById('status-message');

const scanModeSelect   = document.getElementById('scan-mode');
const highlightColorIn = document.getElementById('highlight-color');
const borderWidthSelect= document.getElementById('border-width');
const audioCheckbox    = document.getElementById('audio-enabled');
const credCheckbox     = document.getElementById('cred-enabled');

const credListEl       = document.getElementById('cred-list');
const btnSave          = document.getElementById('btn-save');
const btnReset         = document.getElementById('btn-reset');

// ── State ─────────────────────────────────────────────────────────────────────
let currentSettings = {};
let isNavActive = false;

// ── Helper: get the user's active webpage tab ─────────────────────────────────
async function getTargetTab() {
  try {
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    let tab = tabs.find(t => t.id && t.url && isValidWebUrl(t.url));
    if (tab) return tab;

    tabs = await chrome.tabs.query({ active: true }).catch(() => []);
    tab = tabs.find(t => t.id && t.url && isValidWebUrl(t.url));
    if (tab) return tab;

    tabs = await chrome.tabs.query({}).catch(() => []);
    return tabs.find(t => t.id && t.url && isValidWebUrl(t.url));
  } catch (_) {
    return null;
  }
}

function isValidWebUrl(url) {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
}

// ── Helper: send message to tab, injecting scripts dynamically if needed ──────
async function sendTabMessageWithFallback(tabId, message) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, message);
    return resp || { ok: true };
  } catch (_) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['src/content/content.css'],
      }).catch(() => {});

      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'src/content/scanner.js',
          'src/content/highlighter.js',
          'src/content/hierarchy.js',
          'src/content/controller.js',
          'src/content/credentials.js',
          'src/content/overlay.js',
          'src/content/main.js'
        ],
      });

      await new Promise(r => setTimeout(r, 120));
      const retryResp = await chrome.tabs.sendMessage(tabId, message).catch(() => ({ ok: true }));
      return retryResp || { ok: true };
    } catch (injectErr) {
      return { error: injectErr.message };
    }
  }
}

// ── Initialization ────────────────────────────────────────────────────────────
async function init() {
  createToast();
  await loadSettings();
  renderSettings();
  await checkActiveTabStatus();
  await loadSavedCredentials();
  bindEvents();
}

async function loadSettings() {
  try {
    const res = await chrome.storage.sync.get('settings');
    currentSettings = res?.settings ?? {
      enabled: true,
      scanMode: 'flat',
      highlightColor: '#FF6B35',
      highlightBorderWidth: 3,
      audio: { enabled: true },
      credentials: { enabled: true }
    };
  } catch (_) {
    currentSettings = {
      enabled: true,
      scanMode: 'flat',
      highlightColor: '#FF6B35',
      highlightBorderWidth: 3,
      audio: { enabled: true },
      credentials: { enabled: true }
    };
  }
}

async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set({ settings });
    currentSettings = settings;
    const tabs = await chrome.tabs.query({}).catch(() => []);
    for (const tab of tabs) {
      if (tab.id && isValidWebUrl(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => null);
      }
    }
  } catch (_) {}
}

function renderSettings() {
  scanModeSelect.value    = currentSettings.scanMode ?? 'flat';
  highlightColorIn.value  = currentSettings.highlightColor ?? '#FF6B35';
  borderWidthSelect.value = String(currentSettings.highlightBorderWidth ?? 3);
  audioCheckbox.checked   = currentSettings.audio?.enabled ?? true;
  credCheckbox.checked    = currentSettings.credentials?.enabled ?? true;
}

async function checkActiveTabStatus() {
  const tab = await getTargetTab();
  if (!tab?.id) {
    updateStatusUI(false, 'Open any regular webpage to navigate');
    return;
  }

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }).catch(() => null);
    if (!resp) {
      let host = 'page';
      try { host = new URL(tab.url).hostname; } catch (_) {}
      updateStatusUI(false, `Ready on ${escapeHtml(host)}`);
      return;
    }
    isNavActive = resp.state && resp.state !== 'IDLE';
    updateStatusUI(isNavActive, isNavActive ? `Active (${resp.state})` : 'Ready — press Start');
  } catch (_) {
    updateStatusUI(false, 'Ready — press Start');
  }
}

function updateStatusUI(active, msg) {
  isNavActive = active;
  if (active) {
    btnMainToggle.classList.add('active');
    btnToggleText.textContent = '■ Stop';
    toggleState.textContent = 'Active (4-Arrow Control)';
    statusIndicator.classList.add('active');
    statusMessage.textContent = msg || 'Navigating with 4-Arrow keys';
  } else {
    btnMainToggle.classList.remove('active');
    btnToggleText.textContent = '▶ Start';
    toggleState.textContent = 'Inactive';
    statusIndicator.classList.remove('active');
    statusMessage.textContent = msg || 'Ready — press Start';
  }
}

// ── Saved Credentials Review ──────────────────────────────────────────────────
async function loadSavedCredentials() {
  try {
    const res = await chrome.storage.local.get('as_cred_index');
    const creds = res['as_cred_index'] || {};
    const entries = Object.entries(creds);

    if (entries.length === 0) {
      credListEl.innerHTML = '<p class="muted">No saved logins yet.</p>';
      return;
    }

    credListEl.innerHTML = '';
    entries.forEach(([origin, data]) => {
      const item = document.createElement('div');
      item.className = 'cred-item';
      item.innerHTML = `
        <div class="cred-item-info">
          <span class="cred-origin">${escapeHtml(origin)}</span>
          <span class="cred-user">User: ${escapeHtml(data.username || '')}</span>
        </div>
        <button class="btn-cred-del" data-origin="${escapeHtml(origin)}">Delete</button>
      `;
      credListEl.appendChild(item);
    });

    credListEl.querySelectorAll('.btn-cred-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const orig = e.target.getAttribute('data-origin');
        await deleteCredential(orig);
        await loadSavedCredentials();
        showToast('Credential removed');
      });
    });
  } catch (_) {}
}

async function deleteCredential(origin) {
  try {
    const res = await chrome.storage.local.get('as_cred_index');
    const creds = res['as_cred_index'] || {};
    delete creds[origin];
    await chrome.storage.local.set({ as_cred_index: creds });
  } catch (_) {}
}

// ── Bind Events ───────────────────────────────────────────────────────────────
function bindEvents() {
  btnMainToggle.addEventListener('click', async () => {
    const tab = await getTargetTab();
    if (!tab?.id) {
      showToast('⚠️ Open a website (not chrome://)');
      return;
    }

    if (!isNavActive) {
      updateStatusUI(true, 'Starting navigation...');
      currentSettings.enabled = true;
      await saveSettings(currentSettings);
      await sendTabMessageWithFallback(tab.id, { type: 'START_SCANNER' });
      updateStatusUI(true, 'Active on page');
      showToast('▶ Navigation started!');
      // Close popup smoothly so focus returns cleanly to the web page
      setTimeout(() => window.close(), 300);
    } else {
      updateStatusUI(false, 'Stopping...');
      currentSettings.enabled = false;
      await saveSettings(currentSettings);
      await sendTabMessageWithFallback(tab.id, { type: 'STOP_SCANNER' });
      updateStatusUI(false, 'Stopped');
      showToast('■ Navigation stopped');
    }
  });

  btnSave.addEventListener('click', async () => {
    const updated = {
      ...currentSettings,
      scanMode: scanModeSelect.value,
      highlightColor: highlightColorIn.value,
      highlightBorderWidth: parseInt(borderWidthSelect.value, 10),
      audio: { enabled: audioCheckbox.checked },
      credentials: { enabled: credCheckbox.checked }
    };

    await saveSettings(updated);
    showToast('✓ Settings saved');
  });

  btnReset.addEventListener('click', async () => {
    const defaultSettings = {
      enabled: true,
      scanMode: 'flat',
      highlightColor: '#FF6B35',
      highlightBorderWidth: 3,
      audio: { enabled: true },
      credentials: { enabled: true }
    };

    await saveSettings(defaultSettings);
    renderSettings();
    showToast('Defaults restored');
  });
}

function createToast() {
  if (document.getElementById('toast')) return;
  const t = document.createElement('div');
  t.id = 'toast';
  document.body.appendChild(t);
}

function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

document.addEventListener('DOMContentLoaded', init);