/**
 * AccessScan v2.0 — Popup Controller
 *
 * Controls navigation start/stop, settings management,
 * and saved credential review/deletion.
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
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
      currentSettings = resp?.settings ?? {
        enabled: false,
        scanMode: 'flat',
        highlightColor: '#FF6B35',
        highlightBorderWidth: 3,
        audio: { enabled: true },
        credentials: { enabled: true }
      };
      resolve();
    });
  });
}

function renderSettings() {
  scanModeSelect.value    = currentSettings.scanMode ?? 'flat';
  highlightColorIn.value  = currentSettings.highlightColor ?? '#FF6B35';
  borderWidthSelect.value = String(currentSettings.highlightBorderWidth ?? 3);
  audioCheckbox.checked   = currentSettings.audio?.enabled ?? true;
  credCheckbox.checked    = currentSettings.credentials?.enabled ?? true;
}

async function checkActiveTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    updateStatusUI(false, 'No active web page found.');
    return;
  }

  try {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        updateStatusUI(false, 'Ready — press Start on any supported webpage');
        return;
      }
      isNavActive = resp.state !== 'IDLE';
      updateStatusUI(isNavActive, isNavActive ? `Active — in ${resp.state} mode` : 'Ready — press Start');
    });
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
  chrome.storage.local.get('as_cred_index', (res) => {
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
  });
}

async function deleteCredential(origin) {
  return new Promise((resolve) => {
    chrome.storage.local.get('as_cred_index', (res) => {
      const creds = res['as_cred_index'] || {};
      delete creds[origin];
      chrome.storage.local.set({ as_cred_index: creds }, resolve);
    });
  });
}

// ── Bind Events ───────────────────────────────────────────────────────────────
function bindEvents() {
  btnMainToggle.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (!isNavActive) {
      chrome.tabs.sendMessage(tab.id, { type: 'START_SCANNER' }, () => {
        updateStatusUI(true, 'Navigation active on page');
      });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'STOP_SCANNER' }, () => {
        updateStatusUI(false, 'Navigation stopped');
      });
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

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: updated }, () => {
      currentSettings = updated;
      showToast('✓ Settings saved');
    });
  });

  btnReset.addEventListener('click', async () => {
    const defaultSettings = {
      enabled: false,
      scanMode: 'flat',
      highlightColor: '#FF6B35',
      highlightBorderWidth: 3,
      audio: { enabled: true },
      credentials: { enabled: true }
    };

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: defaultSettings }, () => {
      currentSettings = defaultSettings;
      renderSettings();
      showToast('Defaults restored');
    });
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
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

document.addEventListener('DOMContentLoaded', init);
