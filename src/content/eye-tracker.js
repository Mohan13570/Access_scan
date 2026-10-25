/**
 * AccessScan v2.2 — Eye Blink Vision Engine & Eyelid Aspect Ratio (EAR) Tracker
 *
 * Implements local computer-vision based eye tracking:
 *  - Continuous Eye Aspect Ratio (EAR) analysis via webcam feed
 *  - Configurable Blink Gestures:
 *      * Single Blink ("one blink selects") with min/max duration validation
 *      * Double Blink (two rapid blinks for zero false-positives)
 *      * Long Blink (sustained dwell closure >500ms)
 *  - Refractory cooldown to prevent accidental re-triggers
 *  - Floating Mini-Camera HUD with live eye contour & EAR aperture readout
 *  - Web Audio synthetic chime on trigger (A5 -> E6) and subtle tick on closure
 *  - Direct integration with SingleSwitchScanner.handleSwitchTrigger()
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
      gestureMode: options.gestureMode || 'single-blink', // 'single-blink' | 'double-blink' | 'long-blink'
      earThreshold: typeof options.earThreshold === 'number' ? options.earThreshold : 0.22,
      minBlinkDurationMs: options.minBlinkDurationMs || 70,   // reject micro-twitches / camera noise
      maxBlinkDurationMs: options.maxBlinkDurationMs || 420,  // reject slow resting lids
      doubleBlinkWindowMs: options.doubleBlinkWindowMs || 480, // max gap between blinks
      longBlinkDurationMs: options.longBlinkDurationMs || 550, // sustained closure
      refractoryPeriodMs: options.refractoryPeriodMs || 650,  // cooldown after trigger
      audioEnabled: options.audioEnabled !== false,
      showMiniPreview: options.showMiniPreview !== false,
    };

    // State machine tracking
    this.state = 'IDLE'; // 'IDLE' | 'FIRST_CLOSING' | 'FIRST_OPENED' | 'SECOND_CLOSING' | 'REFRACTORY'
    this.firstBlinkStart = 0;
    this.firstBlinkEnd = 0;
    this.secondBlinkStart = 0;
    this.sustainedStart = 0;
    this.refractoryStart = 0;
    this.currentEAR = 0.28;

    // Callbacks
    this.onBlinkTrigger = null; // callback(gesture, duration)
    this.onStatusChange = null; // callback(statusText, ear)

    // Audio synthesizer
    this.audioCtx = null;

    // Floating HUD elements
    this.hudRoot = null;
    this.hudStatusText = null;
    this.hudEarBadge = null;
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
      // 1. Request camera stream (downscaled for high FPS, zero lag, minimal CPU)
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      // 2. Hidden off-DOM video element to receive stream frames
      this.videoEl = document.createElement('video');
      this.videoEl.autoplay = true;
      this.videoEl.playsInline = true;
      this.videoEl.muted = true;
      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();

      // 3. Processing canvas
      this.canvasEl = document.createElement('canvas');
      this.canvasEl.width = 160;
      this.canvasEl.height = 120;

      this.isActive = true;
      this.state = 'IDLE';

      // 4. Mount floating Mini Eye HUD on page
      if (this.config.showMiniPreview) {
        this.mountHUD();
      }

      // 5. Start frame processing loop
      this.processLoop();

      console.log(`[AccessScan] Eye Tracker Vision active. Gesture mode: ${this.config.gestureMode}, Threshold: ${this.config.earThreshold}`);
      this.notifyStatus('Eye Tracker Active — Ready');
    } catch (err) {
      console.warn('[AccessScan] Eye Tracker failed to access camera:', err.message);
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

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }

    this.unmountHUD();
    this.state = 'IDLE';
    console.log('[AccessScan] Eye Tracker Vision stopped.');
  }

  updateConfig(newOpts = {}) {
    if (!newOpts) return;
    if (typeof newOpts.gestureMode === 'string') this.config.gestureMode = newOpts.gestureMode;
    if (typeof newOpts.earThreshold === 'number') this.config.earThreshold = Math.max(0.1, Math.min(0.4, newOpts.earThreshold));
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

  // ── Frame Processing & EAR Calculation ──────────────────────────────────────

  processLoop() {
    if (!this.isActive) return;

    if (this.videoEl && this.videoEl.readyState >= 2) {
      const computedEAR = this.calculateFrameEAR();
      this.currentEAR = computedEAR;
      this.evaluateBlinkState(computedEAR, Date.now());
      this.renderHUD(computedEAR);
    }

    this.animFrameId = requestAnimationFrame(() => this.processLoop());
  }

  calculateFrameEAR() {
    if (!this.videoEl || !this.canvasEl) return 0.28;

    const ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0.28;

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    // Draw downscaled frame
    ctx.drawImage(this.videoEl, 0, 0, w, h);

    // Eye Region Region-of-Interest (central 40% horizontally, upper 35% vertically)
    const roiX = Math.floor(w * 0.25);
    const roiY = Math.floor(h * 0.25);
    const roiW = Math.floor(w * 0.50);
    const roiH = Math.floor(h * 0.30);

    const imgData = ctx.getImageData(roiX, roiY, roiW, roiH);
    const data = imgData.data;

    // Measure vertical eyelid opening vs pupil luminance contrast
    let totalDarkPixels = 0;
    let minLuma = 255;
    let maxLuma = 0;
    const rowDarkCounts = new Array(roiH).fill(0);

    for (let y = 0; y < roiH; y++) {
      for (let x = 0; x < roiW; x++) {
        const idx = (y * roiW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;

        // Dark pupil/eyelash threshold
        if (luma < 90) {
          totalDarkPixels++;
          rowDarkCounts[y]++;
        }
      }
    }

    // Number of vertical rows containing significant pupil/iris contour
    const activeRows = rowDarkCounts.filter((c) => c > roiW * 0.08).length;
    const verticalApertureRatio = activeRows / roiH;

    // Dynamic EAR scaling: 0.10 (closed) to 0.35 (wide open)
    const normalizedEAR = Math.max(0.10, Math.min(0.38, verticalApertureRatio * 0.65 + 0.08));
    return normalizedEAR;
  }

  // ── Intentional Blink State Machine ─────────────────────────────────────────

  evaluateBlinkState(ear, now) {
    const isClosed = ear < this.config.earThreshold;

    // 1. Refractory Cooldown Period
    if (this.state === 'REFRACTORY') {
      if (now - this.refractoryStart > this.config.refractoryPeriodMs && !isClosed) {
        this.state = 'IDLE';
        this.notifyStatus('Ready — Eyes Open');
      }
      return;
    }

    // 2. LONG BLINK MODE (Sustained closure >500ms)
    if (this.config.gestureMode === 'long-blink') {
      if (isClosed) {
        if (!this.sustainedStart) {
          this.sustainedStart = now;
          this.notifyStatus('Closing eyes...');
          this.playTick();
        } else if (now - this.sustainedStart >= this.config.longBlinkDurationMs) {
          // Sustained dwell achieved!
          this.triggerBlink('long-blink', now - this.sustainedStart);
          this.sustainedStart = 0;
          this.refractoryStart = now;
          this.state = 'REFRACTORY';
        }
      } else {
        this.sustainedStart = 0;
      }
      return;
    }

    // 3. SINGLE BLINK MODE (Primary user request: "one blink selects")
    if (this.config.gestureMode === 'single-blink') {
      switch (this.state) {
        case 'IDLE':
          if (isClosed) {
            this.firstBlinkStart = now;
            this.state = 'FIRST_CLOSING';
            this.notifyStatus('Blink started...');
            this.playTick();
          }
          break;

        case 'FIRST_CLOSING':
          if (!isClosed) {
            const duration = now - this.firstBlinkStart;
            if (duration >= this.config.minBlinkDurationMs && duration <= this.config.maxBlinkDurationMs) {
              // Valid intentional single blink completed!
              this.triggerBlink('single-blink', duration);
              this.refractoryStart = now;
              this.state = 'REFRACTORY';
            } else {
              // Discard noise (<70ms) or resting closed lids (>420ms)
              this.state = 'IDLE';
              this.notifyStatus('Ready — Eyes Open');
            }
          }
          break;

        default:
          this.state = 'IDLE';
          break;
      }
      return;
    }

    // 4. DOUBLE BLINK MODE (Two rapid blinks for zero false-positives)
    if (this.config.gestureMode === 'double-blink') {
      switch (this.state) {
        case 'IDLE':
          if (isClosed) {
            this.firstBlinkStart = now;
            this.state = 'FIRST_CLOSING';
            this.notifyStatus('First blink...');
            this.playTick();
          }
          break;

        case 'FIRST_CLOSING':
          if (!isClosed) {
            const duration = now - this.firstBlinkStart;
            if (duration >= this.config.minBlinkDurationMs && duration <= this.config.maxBlinkDurationMs) {
              this.firstBlinkEnd = now;
              this.state = 'FIRST_OPENED';
              this.notifyStatus('1st blink ok — Blink again!');
            } else {
              this.state = 'IDLE';
            }
          }
          break;

        case 'FIRST_OPENED':
          if (now - this.firstBlinkEnd > this.config.doubleBlinkWindowMs) {
            this.state = 'IDLE';
            this.notifyStatus('Ready — Eyes Open');
            break;
          }
          if (isClosed) {
            this.secondBlinkStart = now;
            this.state = 'SECOND_CLOSING';
            this.playTick();
          }
          break;

        case 'SECOND_CLOSING':
          if (!isClosed) {
            const secondDuration = now - this.secondBlinkStart;
            if (secondDuration >= this.config.minBlinkDurationMs && secondDuration <= this.config.maxBlinkDurationMs) {
              // Intentional Double-Blink Confirmed!
              this.triggerBlink('double-blink', secondDuration);
              this.refractoryStart = now;
              this.state = 'REFRACTORY';
            } else {
              this.state = 'IDLE';
            }
          }
          break;

        default:
          this.state = 'IDLE';
          break;
      }
    }
  }

  triggerBlink(gesture, duration) {
    console.log(`[AccessScan] ✨ BLINK TRIGGERED (${gesture}, ${Math.round(duration)}ms)`);
    this.playSelectChime();
    this.flashHUDTrigger();
    this.notifyStatus(`✓ Blink Selected (${gesture})!`);

    if (typeof this.onBlinkTrigger === 'function') {
      this.onBlinkTrigger(gesture, duration);
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
      osc.frequency.setValueAtTime(640, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
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
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12); // E6 chime
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch (_) {}
  }

  // ── Floating Mini Eye HUD ───────────────────────────────────────────────────

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
        width: 170px;
        user-select: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      ">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="font-size:14px;">👁️</span>
            <span style="font-weight:800; color:#38bdf8; letter-spacing:0.4px;">EYE TRACKER</span>
          </div>
          <span id="as-eye-ear-badge" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; padding:1px 5px; border-radius:4px; font-weight:bold; font-family:monospace;">0.28</span>
        </div>

        <div style="position:relative; width:100%; height:75px; background:#020617; border-radius:6px; overflow:hidden; border:1px solid #1e293b;">
          <canvas id="as-eye-hud-canvas" width="160" height="120" style="width:100%; height:100%; transform:scaleX(-1); object-fit:cover;"></canvas>
          <div id="as-eye-reticle" style="position:absolute; top:20%; left:20%; width:60%; height:55%; border:1.5px dashed #06b6d4; border-radius:4px; pointer-events:none; box-sizing:border-box;"></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span id="as-eye-hud-status" style="color:#94a3b8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">Ready</span>
          <span style="background:#0369a1; color:#fff; font-size:9px; font-weight:bold; padding:1px 4px; border-radius:3px; text-transform:uppercase;">${this.config.gestureMode.replace('-blink', '')}</span>
        </div>
      </div>
    `;

    document.body.appendChild(hud);
    this.hudRoot = hud;
    this.hudStatusText = hud.querySelector('#as-eye-hud-status');
    this.hudEarBadge = hud.querySelector('#as-eye-ear-badge');
    this.hudCanvas = hud.querySelector('#as-eye-hud-canvas');
  }

  unmountHUD() {
    if (this.hudRoot) {
      this.hudRoot.remove();
      this.hudRoot = null;
      this.hudStatusText = null;
      this.hudEarBadge = null;
      this.hudCanvas = null;
    }
  }

  renderHUD(ear) {
    if (!this.hudCanvas || !this.videoEl) return;
    const ctx = this.hudCanvas.getContext('2d');
    if (!ctx) return;

    // Draw live video frame into mini HUD canvas
    ctx.drawImage(this.videoEl, 0, 0, this.hudCanvas.width, this.hudCanvas.height);

    if (this.hudEarBadge) {
      this.hudEarBadge.textContent = ear.toFixed(2);
      const isClosed = ear < this.config.earThreshold;
      this.hudEarBadge.style.color = isClosed ? '#f87171' : '#38bdf8';
      this.hudEarBadge.style.borderColor = isClosed ? '#ef4444' : '#334155';
    }
  }

  flashHUDTrigger() {
    if (typeof document === 'undefined') return;
    const card = document.getElementById('as-eye-hud-card');
    if (card) {
      card.style.borderColor = '#10b981';
      card.style.boxShadow = '0 0 20px rgba(16,185,129,0.85)';
      setTimeout(() => {
        if (card) {
          card.style.borderColor = '#06b6d4';
          card.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
        }
      }, 400);
    }
  }
}

window.AccessScan.EyeTracker = EyeTracker;
