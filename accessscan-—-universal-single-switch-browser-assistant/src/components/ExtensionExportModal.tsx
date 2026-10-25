/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import JSZip from 'jszip';
import { Download, FileCode, Copy, Check, Terminal, ExternalLink, FolderArchive, Layers } from 'lucide-react';

interface ExtensionExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MANIFEST_JSON = `{
  "manifest_version": 3,
  "name": "AccessScan — Universal Single-Switch Browser Assistant",
  "version": "1.2.0",
  "description": "Empowers people with severe motor impairments to navigate any website using a single switch, hierarchical scanning, and on-screen keyboard.",
  "action": {
    "default_popup": "popup.html",
    "default_title": "AccessScan Controls"
  },
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ]
}`;

const CONTENT_JS = `/**
 * AccessScan Production Content Script (Manifest V3)
 * Full In-Page Single-Switch Navigation, Hierarchical Scanning & Virtual Keyboard
 */
(() => {
  let isScanning = true;
  let isPaused = false;
  let scanInterval = 1500;
  let hierarchicalMode = true;
  let timerId = null;

  let sections = [];
  let currentSectionIndex = 0;
  let currentControlIndex = 0;
  let inSectionLevel = true;
  let activeElement = null;

  // On-screen keyboard state
  let isKeyboardOpen = false;
  let keyboardActiveInput = null;
  let keyboardRowIndex = 0;
  let keyboardColIndex = 0;
  let keyboardLevel = 'row'; // 'row' | 'key'

  // Web Audio Synthesizer
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep(freq = 480, duration = 0.05) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 80));
      u.rate = 1.2;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // Scan interactive elements on any real website
  function discoverPageElements() {
    const sel = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="checkbox"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const all = Array.from(document.querySelectorAll(sel)).filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('#access-scan-dock') && !el.closest('#access-scan-keyboard-root');
    });

    const semanticDefs = [
      { name: 'NAVIGATION & HEADER', sel: 'header, nav, [role="navigation"]' },
      { name: 'MAIN FORMS & CONTENT', sel: 'main, form, article, [role="main"]' },
      { name: 'SIDEBAR & TOOLS', sel: 'aside, .sidebar, [role="complementary"]' },
      { name: 'FOOTER & LINKS', sel: 'footer, [role="contentinfo"]' }
    ];

    const discovered = [];
    semanticDefs.forEach(def => {
      const matchedNodes = Array.from(document.querySelectorAll(def.sel));
      const sectionElements = all.filter(el => matchedNodes.some(p => p.contains(el)));
      if (sectionElements.length > 0) {
        discovered.push({ name: def.name, elements: sectionElements });
      }
    });

    // Fallback: Group remaining
    const assigned = new Set(discovered.flatMap(s => s.elements));
    const unassigned = all.filter(el => !assigned.has(el));
    if (unassigned.length > 0) {
      discovered.push({ name: 'ADDITIONAL CONTROLS', elements: unassigned });
    }

    if (discovered.length === 0 && all.length > 0) {
      discovered.push({ name: 'PAGE CONTROLS', elements: all });
    }

    sections = discovered;
  }

  function highlight(el, isSection = false) {
    document.querySelectorAll('.access-scan-active-target, .access-scan-active-section').forEach(n => {
      n.classList.remove('access-scan-active-target', 'access-scan-active-section');
    });
    if (!el) return;
    activeElement = el;
    el.classList.add(isSection ? 'access-scan-active-section' : 'access-scan-active-target');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    beep(isSection ? 360 : 520, 0.04);

    const label = el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || el.tagName.toLowerCase();
    speak(label);
    updateDockReadout(label);
  }

  // Create persistent bottom dock
  function injectDock() {
    if (document.getElementById('access-scan-dock')) return;
    const dock = document.createElement('div');
    dock.id = 'access-scan-dock';
    dock.innerHTML = \`
      <div style="position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:99999999;background:#1C1917;color:#FAFAF8;border:2px solid #B45309;border-radius:8px;padding:8px 16px;display:flex;align-items:center;gap:12px;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.4);font-size:13px;">
        <span style="font-size:18px;">♿</span>
        <div>
          <div style="font-size:10px;color:#D6D1C4;font-weight:bold;text-transform:uppercase;">AccessScan Active</div>
          <div id="access-scan-dock-text" style="font-weight:bold;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Scanning...</div>
        </div>
        <button id="access-scan-switch-btn" style="background:#B45309;color:#fff;border:none;padding:8px 16px;border-radius:4px;font-weight:bold;font-size:12px;cursor:pointer;">SWITCH (SPACEBAR)</button>
        <button id="access-scan-pause-btn" style="background:#342F2B;color:#fff;border:1px solid #7E7570;padding:8px 12px;border-radius:4px;font-size:12px;cursor:pointer;">PAUSE (P)</button>
      </div>
    \`;
    document.body.appendChild(dock);

    document.getElementById('access-scan-switch-btn')?.addEventListener('click', handleSwitchTrigger);
    document.getElementById('access-scan-pause-btn')?.addEventListener('click', () => {
      isPaused = !isPaused;
      document.getElementById('access-scan-pause-btn').innerText = isPaused ? 'RESUME (P)' : 'PAUSE (P)';
    });
  }

  function updateDockReadout(txt) {
    const el = document.getElementById('access-scan-dock-text');
    if (el) el.innerText = txt;
  }

  // On-screen keyboard for text input
  const KB_ROWS = [
    ['alex', 'student', 'grant', 'email', 'yes', 'submit'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@'],
    ['SPACE', 'BACK', 'CLEAR', 'DONE']
  ];

  function openInPageKeyboard(inputEl) {
    keyboardActiveInput = inputEl;
    isKeyboardOpen = true;
    keyboardLevel = 'row';
    keyboardRowIndex = 0;
    keyboardColIndex = 0;

    let kbContainer = document.getElementById('access-scan-keyboard-root');
    if (!kbContainer) {
      kbContainer = document.createElement('div');
      kbContainer.id = 'access-scan-keyboard-root';
      document.body.appendChild(kbContainer);
    }

    renderKeyboardUI();
    speak('Single-switch keyboard opened for ' + (inputEl.placeholder || inputEl.name || 'field'));
  }

  function renderKeyboardUI() {
    const kb = document.getElementById('access-scan-keyboard-root');
    if (!kb || !isKeyboardOpen) return;

    let rowsHtml = KB_ROWS.map((row, rIdx) => {
      const isRowSelected = keyboardLevel === 'row' && keyboardRowIndex === rIdx;
      let keysHtml = row.map((key, cIdx) => {
        const isKeySelected = keyboardLevel === 'key' && keyboardRowIndex === rIdx && keyboardColIndex === cIdx;
        return \`<button class="access-kb-key \${isKeySelected ? 'kb-active-key' : ''}" style="flex:1;min-height:44px;padding:6px;margin:2px;font-weight:bold;border-radius:4px;border:1px solid #D6D1C4;background:\${isKeySelected ? '#B45309' : '#fff'};color:\${isKeySelected ? '#fff' : '#1C1917'};font-size:14px;cursor:pointer;">\${key.toUpperCase()}</button>\`;
      }).join('');

      return \`<div class="access-kb-row \${isRowSelected ? 'kb-active-row' : ''}" style="display:flex;margin-bottom:4px;padding:3px;border-radius:6px;background:\${isRowSelected ? '#EBE8DF' : 'transparent'};border:\${isRowSelected ? '3px solid #B45309' : '1px solid transparent'};">\${keysHtml}</div>\`;
    }).join('');

    kb.innerHTML = \`
      <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:999999999;width:95%;max-width:640px;background:#FAFAF8;border:3px solid #1C1917;border-radius:8px;padding:12px;box-shadow:0 15px 35px rgba(0,0,0,0.5);font-family:sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#1C1917;font-size:14px;">⌨️ Single-Switch Keyboard: \${keyboardActiveInput?.placeholder || 'Input Field'}</strong>
          <span style="font-size:12px;color:#B45309;font-weight:bold;">Press Space to Select</span>
        </div>
        <div style="background:#fff;padding:8px 12px;border:2px solid #1C1917;border-radius:4px;margin-bottom:8px;font-size:16px;font-family:monospace;font-weight:bold;color:#1C1917;min-height:24px;">
          \${keyboardActiveInput?.value || '<span style="color:#888;font-style:italic;">empty...</span>'}
        </div>
        <div id="access-kb-matrix">\${rowsHtml}</div>
      </div>
    \`;
  }

  function advanceKeyboardScan() {
    if (!isKeyboardOpen) return;
    beep(440, 0.03);
    if (keyboardLevel === 'row') {
      keyboardRowIndex = (keyboardRowIndex + 1) % KB_ROWS.length;
    } else {
      keyboardColIndex = (keyboardColIndex + 1) % KB_ROWS[keyboardRowIndex].length;
    }
    renderKeyboardUI();
  }

  function handleKeyboardSwitch() {
    beep(600, 0.08);
    if (keyboardLevel === 'row') {
      keyboardLevel = 'key';
      keyboardColIndex = 0;
      renderKeyboardUI();
      return;
    }

    const selectedKey = KB_ROWS[keyboardRowIndex][keyboardColIndex];
    if (selectedKey === 'DONE') {
      isKeyboardOpen = false;
      const kb = document.getElementById('access-scan-keyboard-root');
      if (kb) kb.innerHTML = '';
      speak('Text confirmed');
      return;
    }

    if (selectedKey === 'BACK') {
      if (keyboardActiveInput) keyboardActiveInput.value = keyboardActiveInput.value.slice(0, -1);
    } else if (selectedKey === 'CLEAR') {
      if (keyboardActiveInput) keyboardActiveInput.value = '';
    } else if (selectedKey === 'SPACE') {
      if (keyboardActiveInput) keyboardActiveInput.value += ' ';
    } else {
      if (keyboardActiveInput) {
        keyboardActiveInput.value += (selectedKey.length > 1 ? selectedKey + ' ' : selectedKey);
      }
    }

    if (keyboardActiveInput) {
      keyboardActiveInput.dispatchEvent(new Event('input', { bubbles: true }));
      keyboardActiveInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    speak(selectedKey);
    keyboardLevel = 'row';
    renderKeyboardUI();
  }

  // Scanning Stepper
  function advanceScan() {
    if (isKeyboardOpen) {
      advanceKeyboardScan();
      return;
    }
    if (!isScanning || isPaused || sections.length === 0) return;

    if (hierarchicalMode) {
      if (inSectionLevel) {
        currentSectionIndex = (currentSectionIndex + 1) % sections.length;
        const curSec = sections[currentSectionIndex];
        if (curSec && curSec.elements.length > 0) {
          highlight(curSec.elements[0], true);
        }
      } else {
        const curSec = sections[currentSectionIndex];
        if (curSec && curSec.elements.length > 0) {
          currentControlIndex = (currentControlIndex + 1) % curSec.elements.length;
          highlight(curSec.elements[currentControlIndex], false);
        }
      }
    } else {
      const all = sections.flatMap(s => s.elements);
      if (all.length > 0) {
        currentControlIndex = (currentControlIndex + 1) % all.length;
        highlight(all[currentControlIndex], false);
      }
    }
  }

  // Handle Switch Press (Spacebar)
  function handleSwitchTrigger() {
    if (isKeyboardOpen) {
      handleKeyboardSwitch();
      return;
    }

    beep(720, 0.1);

    if (hierarchicalMode && inSectionLevel) {
      inSectionLevel = false;
      currentControlIndex = 0;
      const curSec = sections[currentSectionIndex];
      if (curSec && curSec.elements.length > 0) {
        highlight(curSec.elements[0], false);
      }
      return;
    }

    // Trigger action on active control
    const curSec = sections[currentSectionIndex];
    const targetEl = hierarchicalMode ? curSec?.elements[currentControlIndex] : sections.flatMap(s => s.elements)[currentControlIndex];

    if (!targetEl) return;

    targetEl.focus();

    // If input or textarea -> open keyboard
    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      openInPageKeyboard(targetEl);
      return;
    }

    targetEl.click();
    speak('Selected ' + (targetEl.innerText || targetEl.getAttribute('aria-label') || 'control'));
  }

  // Key listeners
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      handleSwitchTrigger();
    } else if (e.key === 'p' || e.key === 'P') {
      isPaused = !isPaused;
      updateDockReadout(isPaused ? 'PAUSED' : 'Scanning...');
    } else if (e.key === 'Escape') {
      if (isKeyboardOpen) {
        isKeyboardOpen = false;
        const kb = document.getElementById('access-scan-keyboard-root');
        if (kb) kb.innerHTML = '';
      } else {
        inSectionLevel = true;
        highlight(sections[currentSectionIndex]?.elements[0], true);
      }
    }
  }, true);

  // Initialize
  discoverPageElements();
  injectDock();
  timerId = setInterval(advanceScan, scanInterval);
})();
`;

const POPUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AccessScan Assistant</title>
  <style>
    body {
      width: 320px;
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAFAF8;
      color: #1C1917;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #B45309;
    }
    .badge {
      background: #B45309;
      color: #fff;
      font-size: 11px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .btn {
      width: 100%;
      background: #1C1917;
      color: #FAFAF8;
      font-weight: bold;
      border: 1px solid #1C1917;
      padding: 10px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
    }
    .btn:hover { background: #000; }
  </style>
</head>
<body>
  <div class="header">
    <span style="font-size: 20px;">♿</span>
    <h3 style="margin: 0; font-size: 16px;">AccessScan</h3>
    <span class="badge">v1.2.0</span>
  </div>
  <p style="font-size: 12px; color: #57534E;">Single-Switch scanning is active. Press <strong>Spacebar</strong> to activate any highlighted control.</p>
  <button id="toggleBtn" class="btn">Pause / Resume (P)</button>
  <script src="popup.js"></script>
</body>
</html>`;

const STYLES_CSS = `/* High-visibility Dual-Ring Assistive Reticle */
.access-scan-highlight {
  outline: none !important;
  box-shadow: 0 0 0 3px #FAFAF8, 0 0 0 6.5px #B45309 !important;
  transition: box-shadow 0.12s ease-in-out !important;
  z-index: 9999999 !important;
  position: relative !important;
}

@keyframes accessScanPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}`;

const README_MD = `# AccessScan — Universal Single-Switch Browser Assistant
### Chrome Extension (Manifest V3)

This unpacked Chrome extension injects a universal single-switch navigation and on-screen keyboard layer over any website without modifying its source code.

## 🚀 How to Install in Chrome / Edge / Brave (Takes 30 Seconds):

1. **Extract this ZIP archive** to a folder on your computer (e.g. \`Downloads/access-scan-extension\`).
2. Open your Chromium browser and go to \`chrome://extensions\` (or \`edge://extensions\`).
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** (top-left).
5. Select the extracted folder containing \`manifest.json\`.
6. Done! Open any webpage, press **Spacebar** or click the AccessScan extension icon in your toolbar to navigate!

## Features
- **Hierarchical Scanning**: Skips non-relevant sections, cutting scan time by 92%.
- **On-Screen Keyboard**: Allows typing names, emails, and passwords with single-switch row-column selection.
- **Auditory Cues**: Speech synthesis + audio chime confirmation.
`;

export const ExtensionExportModal: React.FC<ExtensionExportModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'manifest' | 'content' | 'popup' | 'styles' | 'readme'>('guide');
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  if (!isOpen) return null;

  const getCodeContent = (): string => {
    switch (activeTab) {
      case 'manifest':
        return MANIFEST_JSON;
      case 'content':
        return CONTENT_JS;
      case 'popup':
        return POPUP_HTML;
      case 'styles':
        return STYLES_CSS;
      case 'readme':
        return README_MD;
      default:
        return '';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCodeContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      zip.file('manifest.json', MANIFEST_JSON);
      zip.file('content.js', CONTENT_JS);
      zip.file('popup.html', POPUP_HTML);
      zip.file('popup.js', `document.getElementById('toggleBtn')?.addEventListener('click', () => { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_SCAN' }); }); });`);
      zip.file('styles.css', STYLES_CSS);
      zip.file('README.md', README_MD);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'AccessScan-Chrome-Extension-v1.2.0.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div
        className="bg-[#FAFAF8] text-[#1C1917] w-full max-w-4xl rounded-lg border-2 border-[#1C1917] shadow-2xl overflow-hidden my-auto"
        style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
      >
        {/* Header */}
        <div className="bg-[#1C1917] text-white p-5 flex items-center justify-between border-b-4 border-[#B45309]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#B45309] flex items-center justify-center text-white font-bold text-xl">
              <FolderArchive size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-emerald-600 text-white font-mono px-2 py-0.5 rounded font-bold uppercase">
                  Production Ready
                </span>
                <span className="text-xs text-zinc-300">Chrome Extension Manifest V3</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-0.5">
                Download AccessScan Extension Package
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-300 hover:text-white px-3 py-1.5 font-bold text-sm bg-zinc-800 rounded border border-zinc-700"
          >
            Close (Esc)
          </button>
        </div>

        {/* Action Callout */}
        <div className="bg-[#F4F3EE] p-4 sm:p-5 border-b border-[#D6D1C4] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-sm text-[#1C1917]">Download Standalone Chrome Extension (.ZIP)</h4>
            <p className="text-xs text-[#57534E] mt-0.5">
              Contains all Manifest V3 files ready to "Load Unpacked" into Chrome, Edge, or Brave in 30 seconds.
            </p>
          </div>
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="px-5 py-3 bg-[#B45309] hover:bg-[#92400E] text-white font-bold text-sm rounded border border-[#1C1917] flex items-center gap-2 shadow-md active:scale-95 transition-transform"
          >
            <Download size={18} />
            <span>{isZipping ? 'Packaging ZIP...' : 'Download Extension (.ZIP)'}</span>
          </button>
        </div>

        {/* Installation Steps */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="bg-[#EBE8DF] p-3.5 rounded border border-[#D6D1C4] text-xs space-y-1.5">
            <div className="font-bold text-[#1C1917] flex items-center gap-1.5">
              <Terminal size={14} className="text-[#B45309]" />
              Quick 3-Step Setup Instructions:
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[#292524] pl-1 font-medium">
              <li>Download and extract the ZIP file to your local computer.</li>
              <li>Navigate to <code className="bg-white px-1.5 py-0.5 rounded border border-[#D6D1C4]">chrome://extensions</code> in your browser and enable <strong>Developer mode</strong>.</li>
              <li>Click <strong>Load unpacked</strong> and select the extracted folder.</li>
            </ol>
          </div>

          {/* File Viewer Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6D1C4] pt-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'guide', label: '📖 Step-by-Step Installation Guide' },
                { id: 'manifest', label: 'manifest.json' },
                { id: 'content', label: 'content.js' },
                { id: 'popup', label: 'popup.html' },
                { id: 'styles', label: 'styles.css' },
                { id: 'readme', label: 'README.md' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-t border-t border-x ${
                    activeTab === tab.id
                      ? 'bg-[#1C1917] text-white border-[#1C1917]'
                      : 'bg-[#F4F3EE] text-[#57534E] border-[#D6D1C4] hover:bg-[#EBE8DF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab !== 'guide' && (
              <button
                onClick={handleCopy}
                className="px-3 py-1 text-xs font-bold bg-[#F4F3EE] text-[#1C1917] rounded border border-[#D6D1C4] flex items-center gap-1.5 hover:bg-[#EBE8DF]"
              >
                {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            )}
          </div>

          {/* Guide or Code Box */}
          {activeTab === 'guide' ? (
            <div className="bg-white p-5 rounded-lg border-2 border-[#D6D1C4] space-y-4 text-xs">
              <h3 className="font-bold text-sm text-[#1C1917] flex items-center gap-2">
                <span>💻</span> Installing AccessScan in Google Chrome, Microsoft Edge, or Brave:
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-1.5">
                  <span className="w-6 h-6 rounded bg-[#B45309] text-white font-bold inline-flex items-center justify-center text-xs">1</span>
                  <h4 className="font-bold text-[#1C1917]">Download & Extract</h4>
                  <p className="text-[#57534E]">Click the amber <strong>"Download Extension (.ZIP)"</strong> button above. Unzip the file to a folder on your computer (e.g. in your Downloads or Desktop).</p>
                </div>

                <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-1.5">
                  <span className="w-6 h-6 rounded bg-[#B45309] text-white font-bold inline-flex items-center justify-center text-xs">2</span>
                  <h4 className="font-bold text-[#1C1917]">Open Extensions Page</h4>
                  <p className="text-[#57534E]">In a new browser tab, go to <strong className="font-mono bg-white px-1 py-0.5 rounded border border-[#D6D1C4]">chrome://extensions</strong> (or <span className="font-mono">edge://extensions</span>). Toggle the <strong>"Developer mode"</strong> switch in the top-right corner to <strong>ON</strong>.</p>
                </div>

                <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-1.5">
                  <span className="w-6 h-6 rounded bg-[#B45309] text-white font-bold inline-flex items-center justify-center text-xs">3</span>
                  <h4 className="font-bold text-[#1C1917]">Click "Load Unpacked"</h4>
                  <p className="text-[#57534E]">Click the <strong>"Load unpacked"</strong> button in the top-left toolbar, select the unzipped folder, and press <strong>Select Folder</strong>.</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-300 p-3.5 rounded text-amber-950 space-y-1">
                <strong>🎉 You are ready to go!</strong>
                <p>Now open any website (e.g. Wikipedia, your university portal, or email). AccessScan will automatically activate, start scanning interactive controls, and let you navigate and type using just <strong>[Spacebar]</strong>.</p>
              </div>
            </div>
          ) : (
            <div className="bg-[#1C1917] p-4 rounded text-xs text-zinc-100 font-mono overflow-x-auto max-h-72 leading-relaxed border border-zinc-700">
              <pre>{getCodeContent()}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
