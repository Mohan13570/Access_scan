/**
 * AccessScan v2.0 — Popup Controller
 *
 * Reliable multi-tab communication with dynamic on-demand script injection,
 * settings management, and saved credentials review.
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

// ── Helper: find the user's actual active web tab ─────────────────────────────
async function getTargetTab() {
  // Query active tab in the user's last focused normal window
  let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let tab = tabs.find(t => t.id && t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
  if (tab) return tab;

  // Fallback: search all active tabs
  tabs = await chrome.tabs.query({ active: true });
  tab = tabs.find(t => t.id && t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
  if (tab) return tab;

  // Final fallback: any valid web tab
  tabs = await chrome.tabs.query({});
  return tabs.find(t => t.id && t.url && (t.url.startsWith('http://') || t.url.startsWith('https://') || t.url.startsWith('file://')));
}

// ── Helper: send message to tab, injecting scripts dynamically if needed ──────
async function sendTabMessageWithFallback(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, async (response) => {
      if (chrome.runtime.lastError || !response) {
        console.log('[AccessScan Popup] Injecting content scripts on-demand into tab:', tabId);
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

          // Wait 100ms for init and retry
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryResp) => {
              resolve(retryResp || { ok: true });
            });
          }, 120);
        } catch (err) {
          console.error('[AccessScan Popup] Script injection failed:', err);
          resolve({ error: err.message });
        }
      } else {
        resolve(response);
      }
    });
  });
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
  const tab = await getTargetTab();
  if (!tab?.id) {
    updateStatusUI(false, 'Open any webpage to start');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      updateStatusUI(false, `Ready on ${escapeHtml(new URL(tab.url).hostname || 'page')}`);
      return;
    }
    isNavActive = resp.state !== 'IDLE';
    updateStatusUI(isNavActive, isNavActive ? `Active (${resp.state})` : 'Ready — press Start');
  });
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
    const tab = await getTargetTab();
    if (!tab?.id) {
      showToast('⚠️ No webpage found');
      return;
    }

    if (!isNavActive) {
      updateStatusUI(true, 'Starting navigation...');
      await sendTabMessageWithFallback(tab.id, { type: 'START_SCANNER' });
      updateStatusUI(true, 'Active on page');
      showToast('▶ Navigation started!');
      // Close popup after brief moment so focus transfers cleanly to the page
      setTimeout(() => window.close(), 350);
    } else {
      updateStatusUI(false, 'Stopping...');
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
  return (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

document.addEventListener('DOMContentLoaded', init);
