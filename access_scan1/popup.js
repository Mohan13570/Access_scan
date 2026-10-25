/**
 * access scan1 — Popup Controller
 */

'use strict';

const statusIndicator = document.getElementById('statusIndicator');
const toggleBtn       = document.getElementById('toggleBtn');
const switchBtn       = document.getElementById('switchBtn');
const speedSelect     = document.getElementById('speedSelect');

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    if (tabs[0]?.id) return tabs[0];
    const fallback = await chrome.tabs.query({ active: true }).catch(() => []);
    return fallback[0] || null;
  } catch (_) {
    return null;
  }
}

async function sendTabMessage(msg) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (_) {
    return null;
  }
}

async function updateStatus() {
  const resp = await sendTabMessage({ action: 'GET_STATUS' });
  if (!resp) {
    statusIndicator.textContent = '● Ready on page';
    statusIndicator.className = 'status-val';
    return;
  }

  if (resp.isPaused) {
    statusIndicator.textContent = '⏸ Paused';
    statusIndicator.className = 'status-val paused';
  } else {
    statusIndicator.textContent = '● Scanning Active';
    statusIndicator.className = 'status-val';
  }
}

toggleBtn?.addEventListener('click', async () => {
  const resp = await sendTabMessage({ action: 'TOGGLE_SCAN' });
  if (resp) {
    if (resp.isPaused) {
      statusIndicator.textContent = '⏸ Paused';
      statusIndicator.className = 'status-val paused';
    } else {
      statusIndicator.textContent = '● Scanning Active';
      statusIndicator.className = 'status-val';
    }
  }
});

switchBtn?.addEventListener('click', async () => {
  await sendTabMessage({ action: 'TRIGGER_SWITCH' });
});

speedSelect?.addEventListener('change', async (e) => {
  const interval = parseInt(e.target.value, 10);
  await sendTabMessage({ action: 'SET_SPEED', interval });
});

document.addEventListener('DOMContentLoaded', updateStatus);
