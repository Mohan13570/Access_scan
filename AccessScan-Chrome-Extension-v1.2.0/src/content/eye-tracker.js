/**
 * AccessScan v2.2 — Eye Blink Gesture Vision Engine
 *
 * Blink gestures:
 *  - Single deliberate blink (60ms–1200ms) -> Select highlighted control
 *  - Two quick blinks                      -> Back or cancel
 *  - Hold eyes closed 1.2s+               -> Pause or open emergency menu
 *
 * Eye movement/gaze tracking is intentionally removed.
 */

'use strict';

window.AccessScan = window.AccessScan || {};

class EyeTracker {
  constructor(options = {}) {
    this.isActive = false;
    this.stream = null;
    this.videoEl = null;
    this.canvasEl = null;
    this.animFrameId = null;

    // Configuration
    this.config = {
      gestureMode: options.gestureMode || 'single-blink',  // Default to single-blink (most reliable)
      earThreshold: typeof options.earThreshold === 'number' ? options.earThreshold : 0.22,
      normalBlinkMaxMs: options.normalBlinkMaxMs ?? 200,        // <200ms = normal blink -> NO ACTION
      deliberateLongBlinkMinMs: options.deliberateLongBlinkMinMs ?? 220, // 220ms - 950ms = deliberate long blink -> SELECT
      deliberateLongBlinkMaxMs: 950,
      doubleBlinkWindowMs: options.doubleBlinkWindowMs ?? 550,     // Two blinks within 550ms -> BACK / CANCEL
      holdClosedEmergencyMs: 1200,  // >1200ms held closed -> PAUSE / EMERGENCY MENU
      longBlinkDurationMs: options.longBlinkDurationMs ?? 500,
      minBlinkDurationMs: options.minBlinkDurationMs ?? 60,     // 60ms minimum (lowered from 70)
      maxBlinkDurationMs: options.maxBlinkDurationMs ?? 1200,   // 1200ms maximum (raised from 600)
      gazeDwellMs: 300,             // Gaze hold duration to trigger step
      gazeCooldownMs: 450,          // Cooldown between gaze steps
      refractoryPeriodMs: 600,      // Cooldown after blink trigger
      audioEnabled: options.audioEnabled !== false,
      showMiniPreview: options.showMiniPreview !== false,
    };

    // State machine tracking
    this.currentEAR = 0.28;
    this.baselineAperture = 0.25; // Adaptive baseline for open eyes
    this.isEyesClosed = false;

    this.eyesClosedStartTime = 0;
    this.lastBlinkOpenTime = 0;
    this.lastBlinkDuration = 0;
    this.pendingSingleBlinkTimer = null;
    this.emergencyTriggered = false;
    this.refractoryUntil = 0;

    // Gaze tracking state (for API compatibility)
    this.currentGazeCandidate = 'CENTER';
    this.gazeStartTime = 0;
    this.lastGazeTriggerTime = 0;

    // Callbacks
    this.onSelect = null;         // Single deliberate blink -> Select
    this.onBack = null;           // Two quick blinks -> Back/Cancel
    this.onEmergencyPause = null; // Hold eyes closed -> Pause / Emergency
    this.onLookRight = null;      // Kept for test compatibility
    this.onLookLeft = null;
    this.onLookDown = null;
    this.onLookUp = null;
    this.onStatusChange = null;

    // Audio synthesizer
    this.audioCtx = null;

    // Floating HUD elements
    this.hudRoot = null;
    this.hudStatusText = null;
    this.hudEarBadge = null;
    this.hudStateBadge = null;
    this.hudGazeBadge = null;
    this.hudCanvas = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(options = {}) {
    if (this.isActive && this.stream) {
      this.updateConfig(options);
      return;
    }

    this.updateConfig(options);

    // Reset calibration on fresh start
    this.baselineAperture = 0.25;
    this._calibrationFrames = 0;
    this._debugFrame = 0;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported in this frame or context');
      }

      // 1. Try with user-facing camera constraints with universal fallback
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (e1) {
        console.warn('[AccessScan] Preferred camera constraints failed, trying universal fallback:', e1.name);
        // Universal fallback without constraints (supported on 100% of webcams)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      this.stream = stream;

      // 2. Properly configure hidden video element in DOM
      if (!this.videoEl) {
        this.videoEl = document.createElement('video');
        this.videoEl.id = 'access-scan-hidden-video';
        this.videoEl.setAttribute('playsinline', 'true');
        this.videoEl.setAttribute('muted', 'true');
        this.videoEl.setAttribute('autoplay', 'true');
        this.videoEl.muted = true;
        this.videoEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:160px;height:120px;opacity:0;pointer-events:none;z-index:-1;';
        if (typeof document !== 'undefined' && document.body) {
          document.body.appendChild(this.videoEl);
        }
      }

      this.videoEl.srcObject = this.stream;

      // 3. Wait for video to be ready before playing (prevents AbortError / play() rejects)
      await new Promise((resolve) => {
        const tryPlay = async () => {
          try {
            await this.videoEl.play();
          } catch (_) {}
          resolve();
        };

        if (this.videoEl.readyState >= 1) {
          tryPlay();
          return;
        }
        this.videoEl.onloadedmetadata = tryPlay;
        setTimeout(resolve, 1500); // Safety timeout
      });

      if (!this.canvasEl && typeof document !== 'undefined') {
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.width = 160;
        this.canvasEl.height = 120;
      }

      this.isActive = true;
      this.emergencyTriggered = false;

      if (this.config.showMiniPreview) {
        this.mountHUD();
      }

      this.processLoop();
      console.log(`[AccessScan] Advanced Eye Tracker active. Sensitivity: ${this.config.earThreshold}`);
      this.notifyStatus('Eye Tracker Active — Ready');
    } catch (err) {
      console.warn('[AccessScan] Eye Tracker camera access issue:', err.name, err.message);
      this.showCameraPrompt(err.name || err.message);
    }
  }

  showCameraPrompt(errorType = '') {
    if (typeof document === 'undefined') return;
    this.mountHUD();

    const isDenied = String(errorType).includes('NotAllowed') || String(errorType).includes('Permission');
    const isNotFound = String(errorType).includes('NotFound') || String(errorType).includes('Devices');
    const isReadable = String(errorType).includes('NotReadable') || String(errorType).includes('TrackStart');

    let mainMsg = '📷 Click to Allow Camera';
    let subMsg = 'Click this box to enable stream';

    if (isDenied) {
      mainMsg = '🔒 Camera Blocked / Denied';
      subMsg = 'Click to open Permission Setup';
    } else if (isNotFound) {
      mainMsg = '⚠️ No Webcam Found';
      subMsg = 'Connect a webcam or use 1-Key mode';
    } else if (isReadable) {
      mainMsg = '⚠️ Camera in Use by Another App';
      subMsg = 'Close other camera apps and click here';
    }

    if (this.hudStatusText) {
      this.hudStatusText.textContent = isDenied ? 'Permission needed' : 'Camera inactive';
      this.hudStatusText.style.color = '#fbbf24';
    }

    const canvas = document.getElementById('as-eye-hud-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mainMsg, canvas.width / 2, 45);
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(subMsg, canvas.width / 2, 68);
      }
    }

    const card = document.getElementById('as-eye-hud-card');
    if (card) {
      card.style.borderColor = '#fbbf24';
      card.style.cursor = 'pointer';
      card.title = 'Click to open camera permission manager or grant access';
      card.onclick = () => {
        // 1. Try starting directly from this click user gesture
        this.start().catch(() => {});

        // 2. If permission was denied by the browser, open the dedicated extension setup page
        if (isDenied) {
          try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage({ action: 'OPEN_CAMERA_PAGE' });
            }
          } catch (_) {}
        }
      };
    }
  }

  stop() {
    this.isActive = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    clearTimeout(this.pendingSingleBlinkTimer);

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoEl) {
      this.videoEl.srcObject = null;
      if (this.videoEl.parentNode) {
        this.videoEl.parentNode.removeChild(this.videoEl);
      }
      this.videoEl = null;
    }

    this.unmountHUD();
    console.log('[AccessScan] Advanced Eye Tracker stopped.');
  }

  updateConfig(newOpts = {}) {
    if (!newOpts) return;
    if (typeof newOpts.earThreshold === 'number') this.config.earThreshold = Math.max(0.12, Math.min(0.35, newOpts.earThreshold));
    if (typeof newOpts.audioEnabled === 'boolean') this.config.audioEnabled = newOpts.audioEnabled;
    if (typeof newOpts.showMiniPreview === 'boolean') {
      this.config.showMiniPreview = newOpts.showMiniPreview;
      if (this.config.showMiniPreview && this.isActive && !this.hudRoot) {
        this.mountHUD();
      } else if (!this.config.showMiniPreview && this.hudRoot) {
        this.unmountHUD();
      }
    }
  }

  // ── Frame Processing Loop ───────────────────────────────────────────────────

  processLoop() {
    if (!this.isActive) return;

    if (this.videoEl && this.videoEl.readyState >= 2) {
      const { ear } = this.calculateFrameVision();
      this.currentEAR = ear;

      const now = Date.now();

      // Debug logging every 60 frames (~1 second at 60fps)
      if (!this._debugFrame) this._debugFrame = 0;
      if (++this._debugFrame % 60 === 0) {
        const state = ear < this.config.earThreshold ? '👁 CLOSED' : '👁 OPEN';
        console.log(
          `[AccessScan EAR] ear=${ear.toFixed(3)} baseline=${this.baselineAperture.toFixed(3)} threshold=${this.config.earThreshold} ${state} mode=${this.config.gestureMode}`
        );
      }

      this.evaluateBlinkState(ear, now);
      this.renderHUD(ear);
    } else if (this.videoEl) {
      // Log if video isn't ready yet (first 5 seconds)
      if (!this._videoWaitLog) this._videoWaitLog = 0;
      if (++this._videoWaitLog <= 10) {
        console.log(`[AccessScan] Video readyState=${this.videoEl.readyState} — waiting for camera feed...`);
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.processLoop());
  }

  calculateFrameVision() {
    if (!this.videoEl || !this.canvasEl) {
      return { ear: 0.28, gaze: 'CENTER', pupilPos: { x: 0.5, y: 0.5 } };
    }

    const ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ear: 0.28, gaze: 'CENTER', pupilPos: { x: 0.5, y: 0.5 } };

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    // Draw downscaled frame
    ctx.drawImage(this.videoEl, 0, 0, w, h);

    // Eye Region Region-of-Interest (central 60% horizontally, upper 40% vertically)
    const roiX = Math.floor(w * 0.20);
    const roiY = Math.floor(h * 0.18);
    const roiW = Math.floor(w * 0.60);
    const roiH = Math.floor(h * 0.40);

    const imgData = ctx.getImageData(roiX, roiY, roiW, roiH);
    const data = imgData.data;

    // 1. Adaptive Luminance Profiling (dynamically adjusts to room lighting)
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

    // Adaptive threshold between eye pupil/crease and facial skin
    const darkThresh = Math.min(110, Math.max(25, minLuma + (avgLuma - minLuma) * 0.42));

    // Focus on eye band specifically (rows 22% to 88% of ROI, avoiding eyebrows)
    let eyeDark = 0;
    let eyeTotal = 0;
    const startY = Math.floor(roiH * 0.22);
    const endY = Math.floor(roiH * 0.88);

    for (let y = startY; y < endY; y++) {
      for (let x = 0; x < roiW; x++) {
        const idx = (y * roiW + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        eyeTotal++;
        if (luma < darkThresh) {
          eyeDark++;
        }
      }
    }

    const currentAperture = eyeDark / Math.max(1, eyeTotal);

    // Fast-adapting baseline: immediately responsive from the first few frames
    if (!this.baselineAperture || this.baselineAperture < 0.04) {
      this.baselineAperture = Math.max(0.10, currentAperture);
    } else if (currentAperture > this.baselineAperture) {
      // Rapid upward tracking for open eyes
      this.baselineAperture = this.baselineAperture * 0.82 + currentAperture * 0.18;
    } else {
      // Very slow downward decay so a blink never pulls the baseline down
      this.baselineAperture = this.baselineAperture * 0.995 + currentAperture * 0.005;
    }

    const safeBaseline = Math.max(0.06, this.baselineAperture);
    const relativeAperture = currentAperture / safeBaseline;
    const ear = Math.max(0.10, Math.min(0.38, relativeAperture * 0.22 + 0.08));

    return { ear, gaze: 'CENTER', pupilPos: { x: 0.5, y: 0.5 } };
  }

  // ── Gesture State Machine ───────────────────────────────────────────────────

  evaluateBlinkState(ear, now = performance.now()) {
    // 1. Single-Blink Mode (Default & highly responsive)
    if (this.config.gestureMode === 'single-blink') {
      const isClosed = ear < this.config.earThreshold;
      if (now < this.refractoryUntil) return;

      if (isClosed && !this.isEyesClosed) {
        this.isEyesClosed = true;
        this.eyesClosedStartTime = now;
        this.notifyStatus('Eye closed — Blinking...');
        return;
      }
      if (!isClosed && this.isEyesClosed) {
        this.isEyesClosed = false;
        const duration = now - this.eyesClosedStartTime;
        // Accept any deliberate blink: 60ms–1200ms (widened from 70–650)
        const minMs = this.config.minBlinkDurationMs ?? 60;
        const maxMs = this.config.maxBlinkDurationMs ?? 1200;
        console.log(`[AccessScan] Blink detected: ${Math.round(duration)}ms (range ${minMs}-${maxMs}ms)`);
        if (duration >= minMs && duration <= maxMs) {
          this.triggerSelect(duration);
          this.refractoryUntil = now + (this.config.refractoryPeriodMs || 450);
        } else {
          this.notifyStatus(`Blink ignored: ${Math.round(duration)}ms (too ${duration < minMs ? 'short' : 'long'})`);
        }
        return;
      }
      return;
    }

    // 2. Double-Blink Mode
    if (this.config.gestureMode === 'double-blink') {
      const isClosed = ear < this.config.earThreshold;
      if (now < this.refractoryUntil) return;

      if (isClosed && !this.isEyesClosed) {
        this.isEyesClosed = true;
        this.eyesClosedStartTime = now;
        return;
      }
      if (!isClosed && this.isEyesClosed) {
        this.isEyesClosed = false;
        const duration = now - this.eyesClosedStartTime;
        const timeSince = now - this.lastBlinkOpenTime;
        if (this.lastBlinkOpenTime > 0 && timeSince <= (this.config.doubleBlinkWindowMs || 500) && duration >= 60) {
          this.lastBlinkOpenTime = 0;
          this.triggerSelect(duration);
          this.refractoryUntil = now + (this.config.refractoryPeriodMs || 500);
          return;
        }
        if (duration >= 60) {
          this.lastBlinkOpenTime = now;
          this.notifyStatus('First blink detected. Blink again to select!');
        }
        return;
      }
      return;
    }

    // 3. Long-Blink / Dwell Mode
    if (this.config.gestureMode === 'long-blink') {
      const isClosed = ear < this.config.earThreshold;
      if (now < this.refractoryUntil) return;

      if (isClosed && !this.isEyesClosed) {
        this.isEyesClosed = true;
        this.eyesClosedStartTime = now;
        this.longBlinkFired = false;
        return;
      }
      if (isClosed && this.isEyesClosed) {
        const duration = now - this.eyesClosedStartTime;
        if (duration >= (this.config.longBlinkDurationMs || 500) && !this.longBlinkFired) {
          this.longBlinkFired = true;
          this.triggerSelect(duration);
          this.refractoryUntil = now + (this.config.refractoryPeriodMs || 500);
        }
        return;
      }
      if (!isClosed && this.isEyesClosed) {
        this.isEyesClosed = false;
        this.longBlinkFired = false;
        return;
      }
      return;
    }

    // 4. Default: evaluate through the full 6-gesture state machine
    this.evaluateBlinkGestures(ear, now);
  }

  evaluateBlinkGestures(ear, now) {
    const isClosed = ear < this.config.earThreshold;

    // Refractory cooldown
    if (now < this.refractoryUntil) {
      return;
    }

    // Eyes transition: OPEN -> CLOSED
    if (isClosed && !this.isEyesClosed) {
      this.isEyesClosed = true;
      this.eyesClosedStartTime = now;
      this.emergencyTriggered = false;
      this.playTick();
      return;
    }

    // Eyes remain continuously CLOSED
    if (isClosed && this.isEyesClosed) {
      const closedDuration = now - this.eyesClosedStartTime;

      // Gesture 4: "Hold eyes closed briefly" -> Pause or open emergency menu
      if (closedDuration >= this.config.holdClosedEmergencyMs && !this.emergencyTriggered) {
        this.emergencyTriggered = true;
        this.triggerEmergencyPause();
        this.refractoryUntil = now + this.config.refractoryPeriodMs;
      }
      return;
    }

    // Eyes transition: CLOSED -> OPEN
    if (!isClosed && this.isEyesClosed) {
      this.isEyesClosed = false;
      const duration = now - this.eyesClosedStartTime;

      // Was it already processed as Hold Eyes Closed (emergency)?
      if (this.emergencyTriggered) {
        this.emergencyTriggered = false;
        return;
      }

      // Check if this blink is the second blink of a pair within doubleBlinkWindowMs
      const timeSinceLastBlink = now - this.lastBlinkOpenTime;
      if (this.lastBlinkOpenTime > 0 && timeSinceLastBlink <= this.config.doubleBlinkWindowMs && duration >= 80) {
        // Gesture 3: "Two intentional blinks" -> Back or cancel
        clearTimeout(this.pendingSingleBlinkTimer);
        this.pendingSingleBlinkTimer = null;
        this.lastBlinkOpenTime = 0;
        this.triggerBack();
        this.refractoryUntil = now + this.config.refractoryPeriodMs;
        return;
      }

      // Gesture 1: "Normal blink" (<280ms) -> No action (isolated short blink)
      if (duration < this.config.normalBlinkMaxMs) {
        // Remember timestamp in case a second intentional blink follows rapidly within window,
        // but DO NOT start any selection timer and DO NOT trigger any action.
        this.lastBlinkOpenTime = now;
        this.lastBlinkDuration = duration;
        this.notifyStatus('Normal blink ignored (No action)');
        return;
      }

      // Gesture 2: Deliberate blink closure duration check (~300ms - 950ms) -> Select
      if (duration >= this.config.deliberateLongBlinkMinMs && duration <= this.config.deliberateLongBlinkMaxMs) {
        this.lastBlinkOpenTime = now;
        this.lastBlinkDuration = duration;

        // Wait doubleBlinkWindowMs: if user doesn't blink again, trigger "One deliberate long blink" -> Select!
        clearTimeout(this.pendingSingleBlinkTimer);
        this.notifyStatus('Long blink detected — Confirming Select...');
        this.pendingSingleBlinkTimer = setTimeout(() => {
          this.triggerSelect(duration);
          this.lastBlinkOpenTime = 0;
          this.pendingSingleBlinkTimer = null;
        }, this.config.doubleBlinkWindowMs);
      }
    }
  }

  evaluateGazeGestures(gaze, now) {
    // Gaze gestures are evaluated only when eyes are open and not in cooldown
    if (this.isEyesClosed || now < this.refractoryUntil) {
      this.currentGazeCandidate = 'CENTER';
      return;
    }

    if (gaze === 'CENTER') {
      this.currentGazeCandidate = 'CENTER';
      this.gazeStartTime = 0;
      return;
    }

    if (gaze !== this.currentGazeCandidate) {
      this.currentGazeCandidate = gaze;
      this.gazeStartTime = now;
      return;
    }

    // Dwell check: held gaze direction for >300ms
    if (now - this.gazeStartTime >= this.config.gazeDwellMs) {
      if (now - this.lastGazeTriggerTime >= this.config.gazeCooldownMs) {
        this.lastGazeTriggerTime = now;
        this.triggerGazeAction(gaze);
      }
    }
  }

  // ── Action Triggers ─────────────────────────────────────────────────────────

  // Gesture 2: One deliberate long blink -> Select highlighted control
  triggerSelect(duration) {
    console.log(`[AccessScan] 🎯 GESTURE: Blink Select (${Math.round(duration || 0)}ms)`);
    this.playSelectChime();
    this.flashHUDTrigger('#10b981');
    this.notifyStatus('✓ Blink Recognized: Selected!');

    if (typeof this.onSelect === 'function') {
      this.onSelect();
    }
    if (typeof this.onBlinkTrigger === 'function') {
      this.onBlinkTrigger('single-blink');
    }
  }

  // Gesture 3: Two intentional blinks -> Back or cancel
  triggerBack() {
    console.log('[AccessScan] ⬅️ GESTURE: Two Intentional Blinks -> Back or Cancel');
    this.playBackSound();
    this.flashHUDTrigger('#8b5cf6');
    this.notifyStatus('⬅️ Back / Cancel triggered');

    if (typeof this.onBack === 'function') {
      this.onBack();
    }
    if (typeof this.onBlinkTrigger === 'function') {
      this.onBlinkTrigger('double-blink');
    }
  }

  // Gesture 4: Hold eyes closed briefly -> Pause or open emergency menu
  triggerEmergencyPause() {
    console.log('[AccessScan] 🚨 GESTURE: Hold Eyes Closed Briefly -> Pause / Emergency Menu');
    this.playEmergencySound();
    this.flashHUDTrigger('#ef4444');
    this.notifyStatus('🚨 Emergency Menu / Scanner Paused');

    if (typeof this.onEmergencyPause === 'function') {
      this.onEmergencyPause();
    }
    if (typeof this.onBlinkTrigger === 'function') {
      this.onBlinkTrigger('long-blink');
    }
  }

  // Gesture 5 & 6: Gaze navigation (Look left/right -> Change control; Look up/down -> Move menu items)
  triggerGazeAction(gaze) {
    this.playTick();
    switch (gaze) {
      case 'LOOK_RIGHT':
        console.log('[AccessScan] 👁️ GESTURE: Look Right -> Next control');
        this.notifyStatus('▶ Look Right: Next control');
        if (typeof this.onLookRight === 'function') this.onLookRight();
        break;

      case 'LOOK_LEFT':
        console.log('[AccessScan] 👁️ GESTURE: Look Left -> Previous control');
        this.notifyStatus('◀ Look Left: Previous control');
        if (typeof this.onLookLeft === 'function') this.onLookLeft();
        break;

      case 'LOOK_DOWN':
        console.log('[AccessScan] 👁️ GESTURE: Look Down -> Move down');
        this.notifyStatus('▼ Look Down: Move through items');
        if (typeof this.onLookDown === 'function') this.onLookDown();
        break;

      case 'LOOK_UP':
        console.log('[AccessScan] 👁️ GESTURE: Look Up -> Move up');
        this.notifyStatus('▲ Look Up: Move through items');
        if (typeof this.onLookUp === 'function') this.onLookUp();
        break;
    }
  }

  notifyStatus(msg) {
    if (this.hudStatusText) {
      this.hudStatusText.textContent = msg;
    }
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(msg, this.currentEAR);
    }
  }

  // ── Web Audio Synthesizer ──────────────────────────────────────────────────

  initAudio() {
    try {
      if (!this.audioCtx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    } catch (_) {}
  }

  playTick() {
    if (!this.config.audioEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.03, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.04);
    } catch (_) {}
  }

  playSelectChime() {
    if (!this.config.audioEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch (_) {}
  }

  playBackSound() {
    if (!this.config.audioEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch (_) {}
  }

  playEmergencySound() {
    if (!this.config.audioEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      osc.frequency.setValueAtTime(440, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (_) {}
  }

  // ── Floating Mini Eye Blink HUD ─────────────────────────────────────────────

  mountHUD() {
    if (typeof document === 'undefined' || document.getElementById('access-scan-eye-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'access-scan-eye-hud';
    hud.innerHTML = `
      <div id="as-eye-hud-card" style="
        position: fixed;
        bottom: 74px;
        left: 20px;
        z-index: 2147483646;
        background: #0f172a;
        color: #f1f5f9;
        border: 2px solid #06b6d4;
        border-radius: 12px;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 10px 28px rgba(0,0,0,0.55);
        font-size: 11px;
        width: 190px;
        user-select: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      ">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="font-size:14px;">👁️</span>
            <span style="font-weight:800; color:#38bdf8; letter-spacing:0.4px;">EYE BLINK SCANNER</span>
          </div>
          <span id="as-eye-state-badge" style="background:#059669; color:#fff; font-size:9px; font-weight:bold; padding:1px 5px; border-radius:3px; text-transform:uppercase;">OPEN</span>
        </div>

        <div style="position:relative; width:100%; height:80px; background:#020617; border-radius:6px; overflow:hidden; border:1px solid #1e293b;">
          <canvas id="as-eye-hud-canvas" width="160" height="120" style="width:100%; height:100%; transform:scaleX(-1); object-fit:cover;"></canvas>
          <div id="as-eye-reticle" style="position:absolute; top:18%; left:20%; width:60%; height:55%; border:1.5px dashed #06b6d4; border-radius:4px; pointer-events:none; box-sizing:border-box;"></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span id="as-eye-hud-status" style="color:#94a3b8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;">Ready</span>
          <span id="as-eye-ear-badge" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; padding:1px 4px; border-radius:3px; font-weight:bold; font-family:monospace; font-size:10px;">0.30</span>
        </div>

        <!-- Gesture Cheatsheet in HUD -->
        <div style="border-top:1px solid #1e293b; padding-top:4px; margin-top:2px; font-size:9px; color:#64748b; line-height:1.3;">
          <div>• <b>Blink</b>: Select highlighted item</div>
          <div>• <b>2 Blinks</b>: Back / Cancel</div>
          <div>• <b>Hold Closed</b>: Pause / Emergency</div>
        </div>
      </div>
    `;

    document.body.appendChild(hud);
    this.hudRoot = hud;
    this.hudStatusText = hud.querySelector('#as-eye-hud-status');
    this.hudEarBadge = hud.querySelector('#as-eye-ear-badge');
    this.hudStateBadge = hud.querySelector('#as-eye-state-badge');
    this.hudGazeBadge = null;
    this.hudCanvas = hud.querySelector('#as-eye-hud-canvas');
  }

  unmountHUD() {
    if (typeof document === 'undefined') return;
    if (this.hudRoot) {
      this.hudRoot.remove();
      this.hudRoot = null;
      this.hudStatusText = null;
      this.hudEarBadge = null;
      this.hudStateBadge = null;
      this.hudGazeBadge = null;
      this.hudCanvas = null;
    }
  }

  renderHUD(ear, gaze = 'CENTER', pupilPos = { x: 0.5, y: 0.5 }) {
    if (!this.hudCanvas || !this.videoEl) return;
    const ctx = this.hudCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoEl, 0, 0, this.hudCanvas.width, this.hudCanvas.height);

    const isClosed = ear < this.config.earThreshold;
    if (this.hudEarBadge) {
      this.hudEarBadge.textContent = ear.toFixed(2);
      this.hudEarBadge.style.color = isClosed ? '#f87171' : '#38bdf8';
      this.hudEarBadge.style.borderColor = isClosed ? '#ef4444' : '#334155';
    }

    if (this.hudStateBadge) {
      this.hudStateBadge.textContent = isClosed ? 'BLINK' : 'OPEN';
      this.hudStateBadge.style.background = isClosed ? '#d97706' : '#059669';
    }

    const card = document.getElementById('as-eye-hud-card');
    if (card) {
      if (isClosed) {
        card.style.borderColor = '#f59e0b';
        card.style.boxShadow = '0 0 16px rgba(245, 158, 11, 0.45)';
      } else {
        card.style.borderColor = '#06b6d4';
        card.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
      }
    }
  }

  flashHUDTrigger(color = '#10b981') {
    if (typeof document === 'undefined') return;
    const card = document.getElementById('as-eye-hud-card');
    if (card) {
      card.style.borderColor = color;
      card.style.boxShadow = `0 0 20px ${color}`;
      setTimeout(() => {
        if (card) {
          card.style.borderColor = '#06b6d4';
          card.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
        }
      }, 450);
    }
  }
}

window.AccessScan.EyeTracker = EyeTracker;
