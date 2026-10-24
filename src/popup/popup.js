/**
 * AccessScan — Popup Controller
 *
 * Loads settings from storage, renders them into the form,
 * and saves back on submit. Also toggles the scanner on the active tab.
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const toggleEnabled   = document.getElementById('toggle-enabled');
const statusText      = document.getElementById('status-text');
const scanMode        = document.getElementById('scan-mode');
const scanInterval    = document.getElementById('scan-interval');
const intervalDisplay = document.getElementById('interval-display');
const switchKeyInput  = document.getElementById('switch-key');
const btnCaptureKey   = document.getElementById('btn-capture-key');
const pauseKey        = document.getElementById('pause-key');
const highlightColor  = document.getElementById('highlight-color');
const borderWidth     = document.getElementById('border-width');
const audioEnabled    = document.getElementById('audio-enabled');
const btnSave         = document.getElementById('btn-save');
const btnReset        = document.getElementById('btn-reset');

// ── State ─────────────────────────────────────────────────────────────────────
let settings = {};
let capturedKey = ' '; // raw key value (e.g. ' ' for Space)
let isCapturing = false;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  settings = await getSettings();
  renderSettings(settings);
  bindEvents();
  createToast();
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
      resolve(resp?.settings ?? {});
    });
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderSettings(s) {
  toggleEnabled.checked = s.enabled ?? false;
  statusText.textContent = s.enabled ? 'On' : 'Off';

  scanMode.value = s.scanMode ?? 'flat';

  const interval = s.scanInterval ?? 1500;
  scanInterval.value = interval;
  intervalDisplay.textContent = interval;

  capturedKey = s.switchKey ?? ' ';
  switchKeyInput.value = capturedKey === ' ' ? 'Space' : capturedKey;

  pauseKey.value = s.pauseKey ?? 'Escape';

  highlightColor.value = s.highlightColor ?? '#FF6B35';
  borderWidth.value = String(s.highlightBorderWidth ?? 3);

  audioEnabled.checked = s.audio?.enabled ?? true;
}

// ── Collect form values ───────────────────────────────────────────────────────
function collectSettings() {
  return {
    ...settings,
    enabled: toggleEnabled.checked,
    scanMode: scanMode.value,
    scanInterval: parseInt(scanInterval.value, 10),
    switchKey: capturedKey,
    pauseKey: pauseKey.value,
    highlightColor: highlightColor.value,
    highlightBorderWidth: parseInt(borderWidth.value, 10),
    audio: {
      ...(settings.audio ?? {}),
      enabled: audioEnabled.checked,
    },
  };
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Live interval display
  scanInterval.addEventListener('input', () => {
    intervalDisplay.textContent = scanInterval.value;
    scanInterval.setAttribute('aria-valuenow', scanInterval.value);
  });

  // Toggle scanner immediately
  toggleEnabled.addEventListener('change', async () => {
    const newSettings = collectSettings();
    settings = newSettings;
    await saveSettings(newSettings);
    statusText.textContent = newSettings.enabled ? 'On' : 'Off';

    // Tell content script to toggle
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SCANNER' }).catch(() => {});
    }
  });

  // Key capture
  btnCaptureKey.addEventListener('click', startKeyCapture);

  // Save
  btnSave.addEventListener('click', async () => {
    const newSettings = collectSettings();
    await saveSettings(newSettings);
    showToast('✓ Settings saved');
  });

  // Reset
  btnReset.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, async (resp) => {
      // Re-trigger install defaults by clearing storage
      await chrome.storage.sync.remove('settings');
      // Reload popup
      window.location.reload();
    });
  });
}

// ── Key Capture ───────────────────────────────────────────────────────────────
function startKeyCapture() {
  isCapturing = true;
  btnCaptureKey.textContent = 'Listening…';
  btnCaptureKey.classList.add('listening');
  switchKeyInput.value = '…';
  switchKeyInput.focus();

  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    capturedKey = e.key;
    switchKeyInput.value = e.key === ' ' ? 'Space' : e.key;
    isCapturing = false;
    btnCaptureKey.textContent = 'Change';
    btnCaptureKey.classList.remove('listening');
    document.removeEventListener('keydown', onKey, true);
  };

  document.addEventListener('keydown', onKey, true);
}

// ── Storage ───────────────────────────────────────────────────────────────────
async function saveSettings(newSettings) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: newSettings }, resolve);
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function createToast() {
  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
