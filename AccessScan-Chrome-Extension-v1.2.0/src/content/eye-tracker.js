/**
 * AccessScan v2.2 — Advanced Eye Gaze & Blink Gesture Vision Engine
 *
 * Implements the exact gesture-to-action specification:
 *  - Normal blink                   -> No action (filtered out)
 *  - One deliberate long blink      -> Select highlighted control
 *  - Two intentional blinks         -> Back or cancel
 *  - Hold eyes closed briefly       -> Pause or open emergency menu
 *  - Look left/right                -> Change highlighted control (Next / Prev)
 *  - Look up/down                   -> Move through menu items (Sections / Rows)
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
      gestureMode: options.gestureMode || 'auto',
      earThreshold: typeof options.earThreshold === 'number' ? options.earThreshold : 0.22,
      normalBlinkMaxMs: 280,        // <280ms = normal blink -> NO ACTION
      deliberateLongBlinkMinMs: 300, // 300ms - 950ms = deliberate long blink -> SELECT
      deliberateLongBlinkMaxMs: 950,
      doubleBlinkWindowMs: options.doubleBlinkWindowMs ?? 550,     // Two blinks within 550ms -> BACK / CANCEL
      holdClosedEmergencyMs: 1200,  // >1200ms held closed -> PAUSE / EMERGENCY MENU
      longBlinkDurationMs: options.longBlinkDurationMs ?? 500,
      minBlinkDurationMs: options.minBlinkDurationMs ?? 70,
      maxBlinkDurationMs: options.maxBlinkDurationMs ?? 600,
      gazeDwellMs: 300,             // Gaze hold duration to trigger step
      gazeCooldownMs: 450,          // Cooldown between gaze steps
      refractoryPeriodMs: 600,      // Cooldown after blink trigger
      audioEnabled: options.audioEnabled !== false,
      showMiniPreview: options.showMiniPreview !== false,
    };

    // State machine tracking
    this.currentEAR = 0.28;
    this.gazeDirection = 'CENTER'; // 'CENTER' | 'LOOK_LEFT' | 'LOOK_RIGHT' | 'LOOK_UP' | 'LOOK_DOWN'
    this.isEyesClosed = false;

    this.eyesClosedStartTime = 0;
    this.lastBlinkOpenTime = 0;
    this.lastBlinkDuration = 0;
    this.pendingSingleBlinkTimer = null;
    this.emergencyTriggered = false;
    this.refractoryUntil = 0;

    // Gaze tracking state
    this.currentGazeCandidate = 'CENTER';
    this.gazeStartTime = 0;
    this.lastGazeTriggerTime = 0;

    // Callbacks
    this.onSelect = null;         // One deliberate long blink -> Select
    this.onBack = null;           // Two intentional blinks -> Back/Cancel
    this.onEmergencyPause = null; // Hold eyes closed briefly -> Pause / Emergency
    this.onLookRight = null;      // Look right -> Next control
    this.onLookLeft = null;       // Look left -> Prev control
    this.onLookDown = null;       // Look down -> Move menu / section down
    this.onLookUp = null;         // Look up -> Move menu / section up
    this.onStatusChange = null;

    // Audio synthesizer
    this.audioCtx = null;

    // Floating HUD elements
    this.hudRoot = null;
    this.hudStatusText = null;
    this.hudEarBadge = null;
    this.hudGazeBadge = null;
    this.hudCanvas = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(options = {}) {
    if (this.isActive) {
      this.updateConfig(options);
      return;
    }

    this.updateConfig(options);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      this.videoEl = document.createElement('video');
      this.videoEl.autoplay = true;
      this.videoEl.playsInline = true;
      this.videoEl.muted = true;
      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();

      this.canvasEl = document.createElement('canvas');
      this.canvasEl.width = 160;
      this.canvasEl.height = 120;

      this.isActive = true;
      this.emergencyTriggered = false;

      if (this.config.showMiniPreview) {
        this.mountHUD();
      }

      this.processLoop();
      console.log(`[AccessScan] Advanced Eye Tracker active. Sensitivity: ${this.config.earThreshold}`);
      this.notifyStatus('Eye Tracker Active — Ready');
    } catch (err) {
      console.warn('[AccessScan] Eye Tracker camera access issue:', err.message);
      this.notifyStatus('Camera access denied or unavailable: ' + err.message);
      this.stop();
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
      const { ear, gaze, pupilPos } = this.calculateFrameVision();
      this.currentEAR = ear;
      this.gazeDirection = gaze;

      const now = Date.now();
      this.evaluateBlinkGestures(ear, now);
      this.evaluateGazeGestures(gaze, now);
      this.renderHUD(ear, gaze, pupilPos);
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

    // Eye Region Region-of-Interest (central 50% horizontally, upper 35% vertically)
    const roiX = Math.floor(w * 0.25);
    const roiY = Math.floor(h * 0.25);
    const roiW = Math.floor(w * 0.50);
    const roiH = Math.floor(h * 0.32);

    const imgData = ctx.getImageData(roiX, roiY, roiW, roiH);
    const data = imgData.data;

    let totalDark = 0;
    let sumX = 0;
    let sumY = 0;
    const rowDarkCounts = new Array(roiH).fill(0);

    for (let y = 0; y < roiH; y++) {
      for (let x = 0; x < roiW; x++) {
        const idx = (y * roiW + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

        // Pupil / dark contour pixel threshold
        if (luma < 85) {
          totalDark++;
          sumX += x;
          sumY += y;
          rowDarkCounts[y]++;
        }
      }
    }

    // 1. EAR Calculation (eyelid vertical aperture)
    const activeRows = rowDarkCounts.filter((c) => c > roiW * 0.08).length;
    const verticalApertureRatio = activeRows / roiH;
    const ear = Math.max(0.10, Math.min(0.38, verticalApertureRatio * 0.65 + 0.08));

    // 2. Gaze Direction Calculation (pupil centroid displacement)
    let gaze = 'CENTER';
    let pupilPos = { x: 0.5, y: 0.5 };

    if (totalDark > 35 && ear >= this.config.earThreshold) {
      const avgPupilX = sumX / totalDark;
      const avgPupilY = sumY / totalDark;
      const normX = avgPupilX / roiW; // 0.0 to 1.0 (0.5 is center)
      const normY = avgPupilY / roiH; // 0.0 to 1.0 (0.5 is center)
      pupilPos = { x: normX, y: normY };

      // Since webcam is mirrored:
      // Looking towards user's right moves pupil to the right (normX < 0.38)
      // Looking towards user's left moves pupil to the left (normX > 0.62)
      if (normX < 0.36) {
        gaze = 'LOOK_RIGHT';
      } else if (normX > 0.64) {
        gaze = 'LOOK_LEFT';
      } else if (normY < 0.33) {
        gaze = 'LOOK_UP';
      } else if (normY > 0.67) {
        gaze = 'LOOK_DOWN';
      }
    }

    return { ear, gaze, pupilPos };
  }

  // ── Gesture State Machine ───────────────────────────────────────────────────

  evaluateBlinkState(ear, now = performance.now()) {
    // If in explicit single-blink test or legacy mode:
    if (this.config.gestureMode === 'single-blink') {
      const isClosed = ear < this.config.earThreshold;
      if (isClosed && !this.isEyesClosed) {
        this.isEyesClosed = true;
        this.eyesClosedStartTime = now;
        return;
      }
      if (!isClosed && this.isEyesClosed) {
        this.isEyesClosed = false;
        const duration = now - this.eyesClosedStartTime;
        if (duration >= (this.config.minBlinkDurationMs || 70) && duration <= (this.config.maxBlinkDurationMs || 600)) {
          if (typeof this.onBlinkTrigger === 'function') this.onBlinkTrigger('single-blink');
          if (typeof this.onSelect === 'function') this.onSelect();
        }
        return;
      }
      return;
    }

    if (this.config.gestureMode === 'double-blink') {
      const isClosed = ear < this.config.earThreshold;
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
          if (typeof this.onBlinkTrigger === 'function') this.onBlinkTrigger('double-blink');
          if (typeof this.onBack === 'function') this.onBack();
          return;
        }
        if (duration >= 60) {
          this.lastBlinkOpenTime = now;
        }
        return;
      }
      return;
    }

    if (this.config.gestureMode === 'long-blink') {
      const isClosed = ear < this.config.earThreshold;
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
          if (typeof this.onBlinkTrigger === 'function') this.onBlinkTrigger('long-blink');
          if (typeof this.onSelect === 'function') this.onSelect();
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

    // Default: evaluate through the full 6-gesture state machine
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
    console.log(`[AccessScan] 🎯 GESTURE: One Deliberate Long Blink (${Math.round(duration)}ms) -> Select`);
    this.playSelectChime();
    this.flashHUDTrigger('#10b981');
    this.notifyStatus('✓ Selected highlighted control');

    if (typeof this.onSelect === 'function') {
      this.onSelect();
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
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
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

  // ── Floating Mini Eye & Gaze HUD ────────────────────────────────────────────

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
            <span style="font-weight:800; color:#38bdf8; letter-spacing:0.4px;">EYE & GAZE</span>
          </div>
          <span id="as-eye-gaze-badge" style="background:#0369a1; color:#fff; font-size:9px; font-weight:bold; padding:1px 5px; border-radius:3px; text-transform:uppercase;">CENTER</span>
        </div>

        <div style="position:relative; width:100%; height:80px; background:#020617; border-radius:6px; overflow:hidden; border:1px solid #1e293b;">
          <canvas id="as-eye-hud-canvas" width="160" height="120" style="width:100%; height:100%; transform:scaleX(-1); object-fit:cover;"></canvas>
          <div id="as-eye-reticle" style="position:absolute; top:20%; left:20%; width:60%; height:55%; border:1.5px dashed #06b6d4; border-radius:4px; pointer-events:none; box-sizing:border-box;"></div>
          <div id="as-eye-pupil-cross" style="position:absolute; top:45%; left:45%; width:10px; height:10px; border:1.5px solid #10b981; border-radius:50%; pointer-events:none; transform:translate(-50%,-50%);"></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span id="as-eye-hud-status" style="color:#94a3b8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;">Ready</span>
          <span id="as-eye-ear-badge" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; padding:1px 4px; border-radius:3px; font-weight:bold; font-family:monospace; font-size:10px;">0.28</span>
        </div>

        <!-- Gesture Cheatsheet in HUD -->
        <div style="border-top:1px solid #1e293b; padding-top:4px; margin-top:2px; font-size:9px; color:#64748b; line-height:1.3;">
          <div>• <b>Long Blink</b>: Select control</div>
          <div>• <b>2 Blinks</b>: Back / Cancel</div>
          <div>• <b>Hold Closed</b>: Emergency/Pause</div>
          <div>• <b>Look L/R/U/D</b>: Move focus</div>
        </div>
      </div>
    `;

    document.body.appendChild(hud);
    this.hudRoot = hud;
    this.hudStatusText = hud.querySelector('#as-eye-hud-status');
    this.hudEarBadge = hud.querySelector('#as-eye-ear-badge');
    this.hudGazeBadge = hud.querySelector('#as-eye-gaze-badge');
    this.hudCanvas = hud.querySelector('#as-eye-hud-canvas');
  }

  unmountHUD() {
    if (typeof document === 'undefined') return;
    if (this.hudRoot) {
      this.hudRoot.remove();
      this.hudRoot = null;
      this.hudStatusText = null;
      this.hudEarBadge = null;
      this.hudGazeBadge = null;
      this.hudCanvas = null;
    }
  }

  renderHUD(ear, gaze, pupilPos) {
    if (!this.hudCanvas || !this.videoEl) return;
    const ctx = this.hudCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoEl, 0, 0, this.hudCanvas.width, this.hudCanvas.height);

    if (this.hudEarBadge) {
      this.hudEarBadge.textContent = ear.toFixed(2);
      const isClosed = ear < this.config.earThreshold;
      this.hudEarBadge.style.color = isClosed ? '#f87171' : '#38bdf8';
      this.hudEarBadge.style.borderColor = isClosed ? '#ef4444' : '#334155';
    }

    if (this.hudGazeBadge) {
      const gazeText = gaze === 'CENTER' ? 'CENTER' : gaze.replace('LOOK_', '');
      this.hudGazeBadge.textContent = gazeText;
      this.hudGazeBadge.style.background = gaze === 'CENTER' ? '#0369a1' : '#d97706';
    }

    const cross = document.getElementById('as-eye-pupil-cross');
    if (cross && pupilPos) {
      // Mirrored horizontal
      cross.style.left = `${Math.round((1 - pupilPos.x) * 100)}%`;
      cross.style.top = `${Math.round(pupilPos.y * 100)}%`;
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
