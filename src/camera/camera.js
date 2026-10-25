/**
 * AccessScan — Camera & Permission Setup Controller
 * 
 * This page runs under the extension's origin (chrome-extension://...)
 * so it has reliable camera access regardless of which website is open.
 * 
 * In "Active Eye Scanner" mode, it sends blink events to the service worker
 * which relays them to the active tab's content script.
 */

'use strict';

let stream = null;
let animFrameId = null;
let blinkCount = 0;
let earThreshold = 0.22;
let isEyesClosed = false;
let eyesClosedStartTime = 0;
let baselineAperture = 0.25;
let calibrationFrames = 0;
let isRelayModeActive = false;  // When true, sends blink events to active tab
let refractionUntil = 0;

const videoEl = document.getElementById('webcam-video');
const canvasEl = document.getElementById('overlay-canvas');
const btnRequest = document.getElementById('btn-request-permission');
const btnTest = document.getElementById('btn-test-trigger');
const btnClose = document.getElementById('btn-close-tab');
const btnRelay = document.getElementById('btn-relay-mode');
const banner = document.getElementById('permission-banner');
const statusTitle = document.getElementById('status-title');
const statusSub = document.getElementById('status-sub');
const noCameraMsg = document.getElementById('no-camera-msg');
const metricEar = document.getElementById('metric-ear');
const metricState = document.getElementById('metric-state');
const metricBlinks = document.getElementById('metric-blinks');
const sensitivitySlider = document.getElementById('sensitivity-slider');
const sliderEarVal = document.getElementById('slider-ear-val');
const relayStatus = document.getElementById('relay-status');

// Load settings
if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
  chrome.storage.sync.get('settings', (res) => {
    if (res?.settings?.eyeTracking?.earThreshold) {
      earThreshold = res.settings.eyeTracking.earThreshold;
      if (sensitivitySlider) sensitivitySlider.value = earThreshold;
      if (sliderEarVal) sliderEarVal.textContent = earThreshold.toFixed(2);
    }
  });
}

// Request Camera
async function startWebcam() {
  try {
    statusTitle.textContent = 'Requesting camera access...';
    statusSub.textContent = 'Please click "Allow" in Chrome\'s permission prompt.';

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    videoEl.srcObject = stream;
    await videoEl.play();

    // Permission granted!
    banner.className = 'status-banner granted';
    statusTitle.textContent = 'Camera Permission: Active & Granted ✓';
    statusSub.textContent = 'AccessScan has verified webcam access. Eye tracking is now unlocked!';
    if (btnRequest) btnRequest.style.display = 'none';
    if (noCameraMsg) noCameraMsg.style.display = 'none';
    if (btnRelay) btnRelay.style.display = 'inline-flex';

    // Reset calibration for fresh start
    calibrationFrames = 0;
    baselineAperture = 0.25;

    // Start vision loop
    processCameraVision();
  } catch (err) {
    console.warn('Camera request error:', err);
    banner.className = 'status-banner pending';
    statusTitle.textContent = 'Camera Access Blocked or Denied';
    statusSub.textContent = `Error: ${err.message}. Please check Chrome URL bar camera icon and allow access.`;
  }
}

// Vision loop
function processCameraVision() {
  if (!videoEl || videoEl.readyState < 2) {
    animFrameId = requestAnimationFrame(processCameraVision);
    return;
  }

  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  const w = canvasEl.width;
  const h = canvasEl.height;

  // Draw mirrored video frame to canvas
  ctx.drawImage(videoEl, 0, 0, w, h);

  // Region of interest: central 60% width, upper 40% height (where eyes are)
  const roiX = Math.floor(w * 0.20);
  const roiY = Math.floor(h * 0.18);
  const roiW = Math.floor(w * 0.60);
  const roiH = Math.floor(h * 0.40);

  const imgData = ctx.getImageData(roiX, roiY, roiW, roiH);
  const data = imgData.data;

  let minLuma = 255;
  let maxLuma = 0;
  let sumLuma = 0;
  const totalPixels = roiW * roiH;

  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < minLuma) minLuma = luma;
    if (luma > maxLuma) maxLuma = luma;
    sumLuma += luma;
  }
  const avgLuma = sumLuma / totalPixels;
  // Adaptive dark threshold: adjusts to room lighting
  const darkThresh = Math.min(110, Math.max(30, minLuma + (avgLuma - minLuma) * 0.42));

  let totalDark = 0;
  const rowDarkCounts = new Array(roiH).fill(0);

  for (let y = 0; y < roiH; y++) {
    for (let x = 0; x < roiW; x++) {
      const idx = (y * roiW + x) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (luma < darkThresh) {
        totalDark++;
        rowDarkCounts[y]++;
      }
    }
  }

  const minRowPixels = Math.max(3, Math.floor(roiW * 0.07));
  const activeRows = rowDarkCounts.filter((c) => c > minRowPixels).length;
  const rawRatio = activeRows / roiH;

  // Baseline calibration: warm up over first 90 frames (~1.5s) collecting max open-eye ratio
  calibrationFrames++;
  if (calibrationFrames <= 90) {
    if (rawRatio > baselineAperture) {
      baselineAperture = rawRatio;
    }
  } else if (rawRatio > baselineAperture * 0.75) {
    // After warmup: slowly adapt upward (open eyes only)
    baselineAperture = baselineAperture * 0.97 + rawRatio * 0.03;
  }

  // Compute normalized EAR
  const safeBaseline = Math.max(0.10, baselineAperture);
  const relativeAperture = rawRatio / safeBaseline;
  const ear = Math.max(0.10, Math.min(0.38, relativeAperture * 0.20 + 0.09));

  // Update UI readouts
  if (metricEar) metricEar.textContent = ear.toFixed(3);

  const isClosed = ear < earThreshold;
  const now = Date.now();

  // Blink state machine
  if (isClosed && !isEyesClosed) {
    isEyesClosed = true;
    eyesClosedStartTime = now;
    if (metricState) { metricState.textContent = 'BLINKING'; metricState.className = 'metric-value blink'; }
  } else if (!isClosed && isEyesClosed) {
    isEyesClosed = false;
    const dur = now - eyesClosedStartTime;

    // Accept blinks: 60ms–1200ms
    if (dur >= 60 && dur <= 1200 && now > refractionUntil) {
      refractionUntil = now + 600;
      blinkCount++;
      if (metricBlinks) metricBlinks.textContent = blinkCount;
      if (metricState) { metricState.textContent = 'SELECT! ✓'; metricState.className = 'metric-value success'; }
      playChime();

      // Relay blink to active tab if relay mode is enabled
      if (isRelayModeActive) {
        sendBlinkToActiveTab(dur);
      }

      setTimeout(() => {
        if (!isEyesClosed && metricState) {
          metricState.textContent = 'OPEN';
          metricState.className = 'metric-value';
        }
      }, 500);
    } else {
      if (metricState) {
        metricState.textContent = 'OPEN';
        metricState.className = 'metric-value';
      }
    }
  }

  animFrameId = requestAnimationFrame(processCameraVision);
}

// Send blink event to the active tab via service worker
function sendBlinkToActiveTab(duration) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'RELAY_BLINK',
        duration: duration,
        ear: parseFloat(metricEar?.textContent || '0.20'),
      }).catch(() => {});
    }
  } catch (_) {}
  if (relayStatus) {
    relayStatus.textContent = `✓ Blink relayed (${Math.round(duration)}ms)`;
    setTimeout(() => { if (relayStatus) relayStatus.textContent = '👁️ Eye scanner active — watching for blinks'; }, 1500);
  }
}

// Audio chime
function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

// Sensitivity slider
sensitivitySlider?.addEventListener('input', (e) => {
  earThreshold = parseFloat(e.target.value);
  if (sliderEarVal) sliderEarVal.textContent = earThreshold.toFixed(2);
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get('settings', (res) => {
      const cur = res?.settings || {};
      cur.eyeTracking = { ...(cur.eyeTracking || {}), earThreshold };
      chrome.storage.sync.set({ settings: cur });
      // Also update content script immediately
      chrome.runtime.sendMessage({ action: 'UPDATE_EAR_THRESHOLD', earThreshold }).catch(() => {});
    });
  }
});

// Relay mode toggle button
btnRelay?.addEventListener('click', () => {
  isRelayModeActive = !isRelayModeActive;
  btnRelay.textContent = isRelayModeActive ? '🔴 Stop Eye Scanner Relay' : '👁️ Start Eye Scanner (Relay to Tab)';
  btnRelay.style.background = isRelayModeActive ? '#dc2626' : '#0284c7';
  if (relayStatus) {
    relayStatus.style.display = isRelayModeActive ? 'block' : 'none';
    relayStatus.textContent = isRelayModeActive ? '👁️ Eye scanner active — watching for blinks' : '';
  }
  if (isRelayModeActive) {
    // Notify the active tab that blink relay is starting
    chrome.runtime?.sendMessage({ action: 'EYE_RELAY_STARTED' }).catch(() => {});
  } else {
    chrome.runtime?.sendMessage({ action: 'EYE_RELAY_STOPPED' }).catch(() => {});
  }
});

btnRequest?.addEventListener('click', startWebcam);

btnTest?.addEventListener('click', () => {
  blinkCount++;
  if (metricBlinks) metricBlinks.textContent = blinkCount;
  if (metricState) { metricState.textContent = 'SIMULATED! ✓'; metricState.className = 'metric-value success'; }
  playChime();
  if (isRelayModeActive) sendBlinkToActiveTab(200);
  setTimeout(() => {
    if (metricState) { metricState.textContent = 'OPEN'; metricState.className = 'metric-value'; }
  }, 600);
});

btnClose?.addEventListener('click', () => {
  window.close();
});

// Auto-request if camera permission is already granted
window.addEventListener('DOMContentLoaded', () => {
  if (btnRelay) btnRelay.style.display = 'none';
  if (relayStatus) relayStatus.style.display = 'none';

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'camera' }).then((status) => {
      if (status.state === 'granted') {
        startWebcam();
      }
    }).catch(() => {});
  }
});
