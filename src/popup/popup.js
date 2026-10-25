/**
 * AccessScan v2.1 — Unified Popup Controller
 *
 * Controls 4-Key Arrow Navigation & 1-Key Single-Switch Scanning,
 * Scan speed adjustments, Speech synthesis (TTS), Audio cues,
 * and Credential review.
 */

'use strict';

// ── DOM Elements ──────────────────────────────────────────────────────────────
const btnMainToggle       = document.getElementById('btn-main-toggle');
const btnToggleText       = document.getElementById('btn-toggle-text');
const toggleState         = document.getElementById('toggle-state');
const statusIndicator     = document.getElementById('status-indicator');
const statusMessage       = document.getElementById('status-message');

// Mode Switcher Elements
const modeBtn4Key         = document.getElementById('mode-btn-4key');
const modeBtn1Key         = document.getElementById('mode-btn-1key');
const keyGuide4Key        = document.getElementById('key-guide-4key');
const keyGuide1Key        = document.getElementById('key-guide-1key');
const singleSwitchSettings= document.getElementById('single-switch-settings');

// 1-Key Controls
const scanSpeedSlider     = document.getElementById('scan-speed-slider');
const speedValBadge       = document.getElementById('speed-val-badge');
const presetBtns          = document.querySelectorAll('.preset-btn');
const speechCheckbox      = document.getElementById('speech-enabled');
const btnTriggerSwitch    = document.getElementById('btn-trigger-switch');
const btnToggleScan       = document.getElementById('btn-toggle-scan');

// Shared / 4-Key Settings
const scanModeSelect      = document.getElementById('scan-mode');
const highlightColorIn    = document.getElementById('highlight-color');
const borderWidthSelect   = document.getElementById('border-width');
const audioCheckbox       = document.getElementById('audio-enabled');
const credCheckbox        = document.getElementById('cred-enabled');

const credListEl          = document.getElementById('cred-list');
const btnSave             = document.getElementById('btn-save');
const btnReset            = document.getElementById('btn-reset');

// ── State ─────────────────────────────────────────────────────────────────────
let currentSettings = {};
let isNavActive = false;

// ── Helper: Get active tab ────────────────────────────────────────────────────
async function getTargetTab() {
  try {
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    let tab = tabs.find((t) => t.id && t.url && isValidWebUrl(t.url));
    if (tab) return tab;

    tabs = await chrome.tabs.query({ active: true }).catch(() => []);
    tab = tabs.find((t) => t.id && t.url && isValidWebUrl(t.url));
    if (tab) return tab;

    tabs = await chrome.tabs.query({}).catch(() => []);
    return tabs.find((t) => t.id && t.url && isValidWebUrl(t.url));
  } catch (_) {
    return null;
  }
}

function isValidWebUrl(url) {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
}

// ── Helper: Send message to tab with dynamic script fallback ──────────────────
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
          'src/content/single-switch.js',
          'src/content/credentials.js',
          'src/content/overlay.js',
          'src/content/main.js',
        ],
      });

      await new Promise((r) => setTimeout(r, 120));
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
    currentSettings = res?.settings ?? getDefaultSettings();
  } catch (_) {
    currentSettings = getDefaultSettings();
  }
}

function getDefaultSettings() {
  return {
    enabled: true,
    inputMode: '4key',
    scanSpeed: 1500,
    speechEnabled: true,
    scanMode: 'flat',
    highlightColor: '#FF6B35',
    highlightBorderWidth: 3,
    audio: { enabled: true },
    credentials: { enabled: true },
  };
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
  const mode = currentSettings.inputMode || '4key';
  updateModeUI(mode);

  const speed = currentSettings.scanSpeed || 1500;
  scanSpeedSlider.value = speed;
  speedValBadge.textContent = `${(speed / 1000).toFixed(1)}s`;
  updatePresetBtns(speed);

  speechCheckbox.checked = currentSettings.speechEnabled !== false;

  scanModeSelect.value    = currentSettings.scanMode ?? 'flat';
  highlightColorIn.value  = currentSettings.highlightColor ?? '#FF6B35';
  borderWidthSelect.value = String(currentSettings.highlightBorderWidth ?? 3);
  audioCheckbox.checked   = currentSettings.audio?.enabled ?? true;
  credCheckbox.checked    = currentSettings.credentials?.enabled ?? true;
}

function updateModeUI(mode) {
  const is1Key = mode === '1key';
  modeBtn1Key.classList.toggle('active', is1Key);
  modeBtn1Key.setAttribute('aria-checked', String(is1Key));

  modeBtn4Key.classList.toggle('active', !is1Key);
  modeBtn4Key.setAttribute('aria-checked', String(!is1Key));

  keyGuide1Key.style.display = is1Key ? 'block' : 'none';
  keyGuide4Key.style.display = is1Key ? 'none' : 'block';

  singleSwitchSettings.style.display = is1Key ? 'block' : 'none';

  updateStatusUI(isNavActive);
}

function updatePresetBtns(speed) {
  presetBtns.forEach((btn) => {
    const btnSpeed = parseInt(btn.getAttribute('data-speed'), 10);
    btn.classList.toggle('active', Math.abs(btnSpeed - speed) < 100);
  });
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
      try {
        host = new URL(tab.url).hostname;
      } catch (_) {}
      updateStatusUI(false, `Ready on ${escapeHtml(host)}`);
      return;
    }

    const is1Key = currentSettings.inputMode === '1key';
    if (is1Key) {
      isNavActive = resp.isScanning && !resp.isPaused;
      updateStatusUI(resp.enabled, resp.isPaused ? 'Paused — press Switch to step' : 'Auto-scanning');
      if (btnToggleScan) {
        btnToggleScan.textContent = resp.isPaused ? '▶ Resume Scan' : '⏸ Pause Scan';
      }
    } else {
      isNavActive = resp.state && resp.state !== 'DISABLED';
      updateStatusUI(isNavActive, isNavActive ? `Active (${resp.state})` : 'Ready — press Start');
    }
  } catch (_) {
    updateStatusUI(false, 'Ready — press Start');
  }
}

function updateStatusUI(active, msg) {
  isNavActive = active;
  const is1Key = currentSettings.inputMode === '1key';

  if (active) {
    btnMainToggle.classList.add('active');
    btnToggleText.textContent = '■ Pause / Stop';
    toggleState.textContent = is1Key ? 'Active (1-Key Single Switch)' : 'Active (4-Arrow Control)';
    statusIndicator.classList.add('active');
    statusMessage.textContent = msg || (is1Key ? 'Single-switch auto-scanning' : 'Navigating with 4-Arrow keys');
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
  // Mode selection: 4-Key vs 1-Key
  modeBtn4Key.addEventListener('click', async () => {
    currentSettings.inputMode = '4key';
    updateModeUI('4key');
    await saveSettings(currentSettings);
    showToast('Switched to 4-Key Arrow Nav');
  });

  modeBtn1Key.addEventListener('click', async () => {
    currentSettings.inputMode = '1key';
    updateModeUI('1key');
    await saveSettings(currentSettings);
    showToast('Switched to 1-Key Single Switch');
  });

  // Speed slider
  scanSpeedSlider.addEventListener('input', async (e) => {
    const speed = parseInt(e.target.value, 10);
    speedValBadge.textContent = `${(speed / 1000).toFixed(1)}s`;
    currentSettings.scanSpeed = speed;
    updatePresetBtns(speed);

    const tab = await getTargetTab();
    if (tab?.id) {
      sendTabMessageWithFallback(tab.id, { type: 'SET_SPEED', interval: speed });
    }
  });

  // Speed presets
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const speed = parseInt(btn.getAttribute('data-speed'), 10);
      scanSpeedSlider.value = speed;
      speedValBadge.textContent = `${(speed / 1000).toFixed(1)}s`;
      currentSettings.scanSpeed = speed;
      updatePresetBtns(speed);

      const tab = await getTargetTab();
      if (tab?.id) {
        sendTabMessageWithFallback(tab.id, { type: 'SET_SPEED', interval: speed });
      }
      showToast(`Speed set to ${(speed / 1000).toFixed(1)}s`);
    });
  });

  // 1-Key Manual Trigger & Pause buttons
  btnTriggerSwitch?.addEventListener('click', async () => {
    const tab = await getTargetTab();
    if (tab?.id) {
      await sendTabMessageWithFallback(tab.id, { type: 'TRIGGER_SWITCH' });
      showToast('⚡ Switch Triggered');
    }
  });

  btnToggleScan?.addEventListener('click', async () => {
    const tab = await getTargetTab();
    if (tab?.id) {
      const resp = await sendTabMessageWithFallback(tab.id, { type: 'TOGGLE_SCAN' });
      const isPaused = resp?.isPaused;
      btnToggleScan.textContent = isPaused ? '▶ Resume Scan' : '⏸ Pause Scan';
      showToast(isPaused ? 'Scan Paused' : 'Scan Resumed');
    }
  });

  // Master Start / Stop toggle
  btnMainToggle.addEventListener('click', async () => {
    const tab = await getTargetTab();
    if (!tab?.id) {
      showToast('⚠️ Open a website (not chrome://)');
      return;
    }

    if (!isNavActive) {
      updateStatusUI(true, 'Starting...');
      currentSettings.enabled = true;
      await saveSettings(currentSettings);
      await sendTabMessageWithFallback(tab.id, { type: 'START_SCANNER' });
      updateStatusUI(true, 'Active on page');
      showToast('▶ Assistant active!');
      setTimeout(() => window.close(), 300);
    } else {
      updateStatusUI(false, 'Stopping...');
      currentSettings.enabled = false;
      await saveSettings(currentSettings);
      await sendTabMessageWithFallback(tab.id, { type: 'STOP_SCANNER' });
      updateStatusUI(false, 'Stopped');
      showToast('■ Assistant stopped');
    }
  });

  // Save Settings button
  btnSave.addEventListener('click', async () => {
    const updated = {
      ...currentSettings,
      scanSpeed: parseInt(scanSpeedSlider.value, 10),
      speechEnabled: speechCheckbox.checked,
      scanMode: scanModeSelect.value,
      highlightColor: highlightColorIn.value,
      highlightBorderWidth: parseInt(borderWidthSelect.value, 10),
      audio: { enabled: audioCheckbox.checked },
      credentials: { enabled: credCheckbox.checked },
    };

    await saveSettings(updated);
    showToast('✓ Settings saved');
  });

  // Reset defaults button
  btnReset.addEventListener('click', async () => {
    const defaultSettings = getDefaultSettings();
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
  return (str || '').replace(
    /[&<>"']/g,
    (m) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[m])
  );
}

document.addEventListener('DOMContentLoaded', init);
