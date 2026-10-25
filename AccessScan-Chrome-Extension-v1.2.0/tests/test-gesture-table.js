/**
 * Test Suite: Exact Gesture-to-Action Specification Verification
 *
 * Verifies all 6 gesture rows from the specification:
 *  1. Normal blink                 -> No action
 *  2. One deliberate long blink     -> Select highlighted control
 *  3. Two intentional blinks        -> Back or cancel
 *  4. Hold eyes closed briefly      -> Pause or open emergency menu
 *  5. Look left/right               -> Change highlighted control
 *  6. Look up/down                  -> Move through menu items
 */

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

console.log('--- TEST SUITE: 6-GESTURE TABLE SPECIFICATION VERIFICATION ---');

// 1. Prepare sandboxed environment for EyeTracker
const eyeTrackerCode = fs.readFileSync(path.resolve(__dirname, '../src/content/eye-tracker.js'), 'utf8');

const ctx = {
  window: {},
  document: {
    getElementById: () => null,
    createElement: () => ({
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(100) }),
        clearRect: () => {},
      }),
    }),
  },
  navigator: { mediaDevices: { getUserMedia: async () => ({}) } },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

vm.createContext(ctx);
vm.runInContext(eyeTrackerCode, ctx);

const EyeTracker = ctx.window.AccessScan.EyeTracker;
assert.ok(EyeTracker, 'EyeTracker class must be exported on window.AccessScan');

let tracker = new EyeTracker({ audioEnabled: false, showMiniPreview: false });

// ── Test 1: Normal blink -> No action ─────────────────────────────────────────
console.log('\n[Gesture 1] Normal Blink (<280ms) -> No action:');
let actionTriggered = false;
tracker.onSelect = () => { actionTriggered = true; };
tracker.onBack = () => { actionTriggered = true; };
tracker.onEmergencyPause = () => { actionTriggered = true; };

let t = 1000;
// Closed at 1000, open at 1150 (duration: 150ms -> normal involuntary blink)
tracker.evaluateBlinkGestures(0.12, t);       // Eye closes
tracker.evaluateBlinkGestures(0.12, t + 100);
tracker.evaluateBlinkGestures(0.28, t + 150); // Eye re-opens

assert.strictEqual(actionTriggered, false, 'Normal blink (<280ms) must NOT trigger any action');
console.log('✓ PASS: Normal blink filtered out with 0 actions triggered.');

// ── Test 2: One deliberate long blink -> Select highlighted control ───────────
console.log('\n[Gesture 2] One deliberate long blink (300ms - 950ms) -> Select:');
let selectCalled = false;
let backCalled = false;
tracker.onSelect = () => { selectCalled = true; };
tracker.onBack = () => { backCalled = true; };

t = 3000;
// Closed at 3000, opens at 3450 (duration: 450ms -> deliberate long blink)
tracker.evaluateBlinkGestures(0.10, t);
tracker.evaluateBlinkGestures(0.10, t + 200);
tracker.evaluateBlinkGestures(0.28, t + 450);

// Should wait doubleBlinkWindowMs (550ms) before confirming select
assert.strictEqual(selectCalled, false, 'Pending confirmation during double blink window');

setTimeout(() => {
  assert.strictEqual(selectCalled, true, 'One deliberate long blink must trigger Select after wait window');
  assert.strictEqual(backCalled, false, 'Must not trigger Back');
  console.log('✓ PASS: Deliberate long blink successfully triggered Select.');

  runTest3();
}, 600);

// ── Test 3: Two intentional blinks -> Back or cancel ──────────────────────────
function runTest3() {
  console.log('\n[Gesture 3] Two intentional blinks -> Back or Cancel:');
  selectCalled = false;
  backCalled = false;

  tracker = new EyeTracker({ audioEnabled: false, showMiniPreview: false });
  tracker.onSelect = () => { selectCalled = true; };
  tracker.onBack = () => { backCalled = true; };

  t = 5000;
  // Blink 1: closed at 5000, open at 5350 (duration: 350ms)
  tracker.evaluateBlinkGestures(0.12, t);
  tracker.evaluateBlinkGestures(0.28, t + 350);

  // Blink 2 within 550ms: closed at 5600, open at 5800
  tracker.evaluateBlinkGestures(0.12, t + 600);
  tracker.evaluateBlinkGestures(0.28, t + 800);

  assert.strictEqual(backCalled, true, 'Two intentional blinks must trigger Back or Cancel immediately');
  assert.strictEqual(selectCalled, false, 'Pending select must be cancelled by the second blink');
  console.log('✓ PASS: Two intentional blinks triggered Back / Cancel.');

  runTest4();
}

// ── Test 4: Hold eyes closed briefly -> Pause or open emergency menu ──────────
function runTest4() {
  console.log('\n[Gesture 4] Hold eyes closed briefly (>1200ms) -> Pause / Emergency Menu:');
  let emergencyCalled = false;
  tracker = new EyeTracker({ audioEnabled: false, showMiniPreview: false });
  tracker.onEmergencyPause = () => { emergencyCalled = true; };

  t = 7000;
  // Eye closes at 7000 and stays closed past 1200ms
  tracker.evaluateBlinkGestures(0.10, t);
  tracker.evaluateBlinkGestures(0.10, t + 600);
  assert.strictEqual(emergencyCalled, false, 'Emergency pause not yet triggered at 600ms');

  tracker.evaluateBlinkGestures(0.10, t + 1250);
  assert.strictEqual(emergencyCalled, true, 'Eyes held closed for >1200ms must trigger Pause / Emergency Menu');
  console.log('✓ PASS: Hold eyes closed briefly triggered Emergency / Pause.');

  runTest5And6();
}

// ── Test 5 & 6: Gaze directional tracking ────────────────────────────────────
function runTest5And6() {
  console.log('\n[Gestures 5 & 6] Look Left/Right & Look Up/Down:');
  let lookLeft = 0;
  let lookRight = 0;
  let lookDown = 0;
  let lookUp = 0;

  tracker = new EyeTracker({ audioEnabled: false, showMiniPreview: false });
  tracker.onLookLeft = () => { lookLeft++; };
  tracker.onLookRight = () => { lookRight++; };
  tracker.onLookDown = () => { lookDown++; };
  tracker.onLookUp = () => { lookUp++; };

  t = 10000;
  // 5a. Look Right: held for >300ms
  tracker.evaluateGazeGestures('LOOK_RIGHT', t);
  tracker.evaluateGazeGestures('LOOK_RIGHT', t + 150);
  assert.strictEqual(lookRight, 0, 'Dwell time not yet met at 150ms');
  tracker.evaluateGazeGestures('LOOK_RIGHT', t + 320);
  assert.strictEqual(lookRight, 1, 'Look Right must fire after 300ms dwell');

  // Cooldown check (450ms cooldown)
  tracker.evaluateGazeGestures('LOOK_RIGHT', t + 400);
  assert.strictEqual(lookRight, 1, 'Must not double-fire during cooldown');

  // 5b. Look Left: at t + 850
  t = 11000;
  tracker.evaluateGazeGestures('LOOK_LEFT', t);
  tracker.evaluateGazeGestures('LOOK_LEFT', t + 350);
  assert.strictEqual(lookLeft, 1, 'Look Left must fire after 300ms dwell');

  // 6a. Look Down: at t + 12000
  t = 12000;
  tracker.evaluateGazeGestures('LOOK_DOWN', t);
  tracker.evaluateGazeGestures('LOOK_DOWN', t + 350);
  assert.strictEqual(lookDown, 1, 'Look Down must fire after 300ms dwell');

  // 6b. Look Up: at t + 13000
  t = 13000;
  tracker.evaluateGazeGestures('LOOK_UP', t);
  tracker.evaluateGazeGestures('LOOK_UP', t + 350);
  assert.strictEqual(lookUp, 1, 'Look Up must fire after 300ms dwell');

  console.log('✓ PASS: Look Left/Right and Look Up/Down directional tracking verified.');

  runSingleSwitchIntegration();
}

// ── Test SingleSwitchScanner Integration with 6 Gestures ─────────────────────
function runSingleSwitchIntegration() {
  console.log('\n[SingleSwitchScanner Integration Test]');
  const singleSwitchCode = fs.readFileSync(path.resolve(__dirname, '../src/content/single-switch.js'), 'utf8');

  const domElements = [];
  const mockDoc = {
    querySelectorAll: (sel) => {
      if (sel.includes('.access-scan-active-target')) return [];
      return [
        {
          tagName: 'BUTTON',
          innerText: 'Search',
          getBoundingClientRect: () => ({ width: 100, height: 40 }),
          isConnected: true,
          classList: { add: () => {}, remove: () => {} },
          scrollIntoView: () => {},
          closest: () => null,
          focus: () => {},
          click: () => { mockDoc.buttonClicked = true; },
        },
        {
          tagName: 'INPUT',
          placeholder: 'Email',
          type: 'text',
          value: '',
          getBoundingClientRect: () => ({ width: 200, height: 40 }),
          isConnected: true,
          classList: { add: () => {}, remove: () => {} },
          scrollIntoView: () => {},
          closest: () => null,
          focus: () => {},
          click: () => {},
          dispatchEvent: () => {},
        },
      ];
    },
    getElementById: () => null,
    createElement: () => ({
      id: '',
      innerHTML: '',
      style: {},
      appendChild: () => {},
      remove: () => {},
      querySelectorAll: () => [],
      addEventListener: () => {},
    }),
    body: { appendChild: () => {} },
    activeElement: null,
  };

  const integrationCtx = {
    window: { AccessScan: { EyeTracker } },
    document: mockDoc,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Event: function (type) { this.type = type; },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
  };

  vm.createContext(integrationCtx);
  vm.runInContext(singleSwitchCode, integrationCtx);

  const Scanner = integrationCtx.window.AccessScan.SingleSwitchScanner;
  assert.ok(Scanner, 'SingleSwitchScanner must be exported');

  const scanner = new Scanner();
  scanner.audioEnabled = false;
  scanner.speechEnabled = false;

  // Verify all 6 helper methods exist on the scanner
  assert.strictEqual(typeof scanner.stepNext, 'function', 'scanner.stepNext must exist');
  assert.strictEqual(typeof scanner.stepPrev, 'function', 'scanner.stepPrev must exist');
  assert.strictEqual(typeof scanner.stepDown, 'function', 'scanner.stepDown must exist');
  assert.strictEqual(typeof scanner.stepUp, 'function', 'scanner.stepUp must exist');
  assert.strictEqual(typeof scanner.handleBack, 'function', 'scanner.handleBack must exist');
  assert.strictEqual(typeof scanner.toggleEmergencyMenu, 'function', 'scanner.toggleEmergencyMenu must exist');

  // Test emergency menu toggle
  assert.strictEqual(scanner.emergencyMenuOpen, false);
  scanner.toggleEmergencyMenu();
  assert.strictEqual(scanner.emergencyMenuOpen, true, 'Emergency menu should open');
  scanner.handleBack(); // 2 blinks should close emergency menu!
  assert.strictEqual(scanner.emergencyMenuOpen, false, 'handleBack (2 blinks) must close emergency menu');

  // Test keyboard open & back
  const mockInput = { tagName: 'INPUT', placeholder: 'Username', value: '' };
  scanner.openInPageKeyboard(mockInput);
  assert.strictEqual(scanner.isKeyboardOpen, true);
  scanner.handleBack(); // 2 blinks should close OSK!
  assert.strictEqual(scanner.isKeyboardOpen, false, 'handleBack (2 blinks) must close virtual keyboard');

  console.log('✓ PASS: SingleSwitchScanner callbacks and gesture responders verified 100%.');
  console.log('\n======================================================');
  console.log('🎉 ALL 6 GESTURE SPECIFICATIONS VERIFIED AND PASSING! 🎉');
  console.log('======================================================');
}
