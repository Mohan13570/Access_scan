/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Sliders,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Keyboard,
  Layers,
  Zap,
  Clock,
  Eye,
  CheckCircle2,
  Download,
  HelpCircle,
  FileText,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AccessScanSettings, ScanningMode, SwitchTriggerType, ReticleStyle } from '../types';

interface ExtensionPopupProps {
  settings: AccessScanSettings;
  onUpdateSettings: (updater: (prev: AccessScanSettings) => AccessScanSettings) => void;
  detectedElementsCount: number;
  sectionsCount: number;
  switchClicksCount: number;
  onOpenAudit: () => void;
  onOpenExport: () => void;
  onTriggerManualKeyboard: () => void;
  onClose?: () => void;
  isFloatingModal?: boolean;
}

export const ExtensionPopup: React.FC<ExtensionPopupProps> = ({
  settings,
  onUpdateSettings,
  detectedElementsCount,
  sectionsCount,
  switchClicksCount,
  onOpenAudit,
  onOpenExport,
  onTriggerManualKeyboard,
  onClose,
  isFloatingModal = false,
}) => {
  return (
    <div
      className={`bg-[#FAFAF8] text-[#1C1917] border-2 border-[#1C1917] rounded-lg shadow-2xl flex flex-col overflow-hidden ${
        isFloatingModal ? 'w-full max-w-md' : 'w-full'
      }`}
      style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
    >
      {/* Extension Header */}
      <div className="bg-[#1C1917] text-white p-4 flex items-center justify-between border-b-2 border-[#B45309]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#B45309] flex items-center justify-center text-white font-bold text-lg shadow-sm">
            ♿
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base leading-tight tracking-wide">AccessScan</h2>
              <span className="text-[10px] bg-[#EBE8DF] text-[#1C1917] px-1.5 py-0.5 rounded font-mono font-bold">
                v1.2.0-MV3
              </span>
            </div>
            <p className="text-xs text-[#E5E2D8]">Universal Single-Switch Browser Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 ${
              settings.isEnabled && !settings.isPaused
                ? 'bg-emerald-600 text-white'
                : settings.isPaused
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-600 text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            {settings.isEnabled ? (settings.isPaused ? 'Paused' : 'Active') : 'Disabled'}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[#E5E2D8] hover:text-white px-2 py-1 text-sm font-bold"
              aria-label="Close extension popup"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Main Master Control Banner */}
        <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-[#1C1917]">Assistive Scanning Engine</h3>
            <p className="text-xs text-[#57534E]">
              {settings.isEnabled ? 'Scanning is active on this page' : 'Turn on to begin single-switch navigation'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  isPaused: !prev.isPaused,
                }))
              }
              disabled={!settings.isEnabled}
              className={`p-2.5 rounded font-bold text-xs border ${
                settings.isPaused
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-[#EBE8DF] text-[#1C1917] border-[#D6D1C4]'
              } hover:bg-[#E5E2D8] disabled:opacity-40 flex items-center gap-1`}
              title="Pause/Resume scanning"
            >
              {settings.isPaused ? <Play size={16} /> : <Pause size={16} />}
              <span>{settings.isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            <button
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  isEnabled: !prev.isEnabled,
                  isPaused: false,
                }))
              }
              className={`px-4 py-2.5 rounded font-bold text-xs uppercase tracking-wider text-white border border-[#1C1917] shadow-sm transition-transform active:scale-95 ${
                settings.isEnabled ? 'bg-[#B45309] hover:bg-[#92400E]' : 'bg-[#1C1917] hover:bg-black'
              }`}
            >
              {settings.isEnabled ? 'Active (ON)' : 'Turn ON'}
            </button>
          </div>
        </div>

        {/* Scanning Strategy (Hierarchical vs Sequential) */}
        <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="font-bold text-xs uppercase tracking-wider text-[#1C1917] flex items-center gap-1.5">
              <Layers size={14} className="text-[#B45309]" />
              Scanning Strategy
            </label>
            <span className="text-[11px] text-[#57534E] font-medium">Reduces switch fatigue</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateSettings((prev) => ({ ...prev, mode: 'hierarchical' }))}
              className={`p-2.5 rounded text-left border transition-all ${
                settings.mode === 'hierarchical'
                  ? 'bg-[#1C1917] text-white border-[#1C1917] shadow'
                  : 'bg-white text-[#1C1917] border-[#D6D1C4] hover:bg-[#EBE8DF]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center gap-1">
                  <Zap size={13} className="text-[#B45309]" />
                  Hierarchical
                </span>
                <span className="text-[10px] bg-[#B45309] text-white px-1.5 py-0.2 rounded font-bold">FAST</span>
              </div>
              <p
                className={`text-[11px] mt-1 leading-snug ${
                  settings.mode === 'hierarchical' ? 'text-zinc-300' : 'text-[#57534E]'
                }`}
              >
                Scan Sections first, then controls inside (6s avg).
              </p>
            </button>

            <button
              onClick={() => onUpdateSettings((prev) => ({ ...prev, mode: 'sequential' }))}
              className={`p-2.5 rounded text-left border transition-all ${
                settings.mode === 'sequential'
                  ? 'bg-[#1C1917] text-white border-[#1C1917] shadow'
                  : 'bg-white text-[#1C1917] border-[#D6D1C4] hover:bg-[#EBE8DF]'
              }`}
            >
              <span className="font-bold text-xs">Sequential</span>
              <p
                className={`text-[11px] mt-1 leading-snug ${
                  settings.mode === 'sequential' ? 'text-zinc-300' : 'text-[#57534E]'
                }`}
              >
                Traditional one-by-one linear scan through elements.
              </p>
            </button>
          </div>
        </div>

        {/* Scan Speed (Interval) */}
        <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="font-bold text-xs uppercase tracking-wider text-[#1C1917] flex items-center gap-1.5">
              <Clock size={14} className="text-[#B45309]" />
              Scanning Speed (Interval)
            </label>
            <span className="font-mono font-bold text-xs text-[#B45309]">
              {(settings.scanIntervalMs / 1000).toFixed(1)}s
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Fast (1.0s)', val: 1000 },
              { label: 'Standard (1.5s)', val: 1500 },
              { label: 'Relaxed (2.5s)', val: 2500 },
            ].map((p) => (
              <button
                key={p.val}
                onClick={() => onUpdateSettings((prev) => ({ ...prev, scanIntervalMs: p.val }))}
                className={`py-1.5 px-2 rounded text-xs font-bold border ${
                  settings.scanIntervalMs === p.val
                    ? 'bg-[#1C1917] text-white border-[#1C1917]'
                    : 'bg-white text-[#1C1917] border-[#D6D1C4] hover:bg-[#EBE8DF]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            type="range"
            min={500}
            max={3500}
            step={100}
            value={settings.scanIntervalMs}
            onChange={(e) =>
              onUpdateSettings((prev) => ({
                ...prev,
                scanIntervalMs: Number(e.target.value),
              }))
            }
            className="w-full accent-[#B45309] cursor-pointer"
            aria-label="Scan interval slider in milliseconds"
          />
          <div className="flex justify-between text-[11px] text-[#57534E]">
            <span>0.5s (Fast)</span>
            <span>1.5s (Default)</span>
            <span>3.5s (Extra Time)</span>
          </div>
        </div>

        {/* Switch Trigger Input */}
        <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-2">
          <label className="font-bold text-xs uppercase tracking-wider text-[#1C1917] flex items-center gap-1.5">
            <span className="text-[#B45309] font-mono text-sm">⌨️</span>
            Switch Trigger Source
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'space', label: 'Spacebar (Switch)', desc: 'Standard foot switch / big button' },
              { id: 'enter', label: 'Enter Key', desc: 'Alternative switch input' },
              { id: 'click', label: 'Click / Tap Anywhere', desc: 'Large hit target anywhere' },
              { id: 'dwell', label: 'Hands-off Dwell (2s)', desc: 'Auto-select on pause' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    trigger: t.id as SwitchTriggerType,
                  }))
                }
                className={`p-2 rounded text-left border text-xs ${
                  settings.trigger === t.id
                    ? 'bg-[#1C1917] text-white border-[#1C1917] font-bold'
                    : 'bg-white text-[#1C1917] border-[#D6D1C4] hover:bg-[#EBE8DF]'
                }`}
              >
                <div className="font-bold">{t.label}</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    settings.trigger === t.id ? 'text-zinc-300' : 'text-[#57534E]'
                  }`}
                >
                  {t.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Auditory Feedback */}
        <div className="bg-[#F4F3EE] p-3.5 rounded border border-[#D6D1C4] space-y-2.5">
          <label className="font-bold text-xs uppercase tracking-wider text-[#1C1917] flex items-center gap-1.5">
            <Volume2 size={14} className="text-[#B45309]" />
            Auditory Assistance (Screen-Reader Cues)
          </label>
          <div className="flex gap-2">
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  audioSpeech: !prev.audioSpeech,
                }))
              }
              className={`flex-1 py-2 px-3 rounded text-xs font-bold border flex items-center justify-center gap-1.5 ${
                settings.audioSpeech
                  ? 'bg-[#1C1917] text-white border-[#1C1917]'
                  : 'bg-white text-[#1C1917] border-[#D6D1C4]'
              }`}
            >
              {settings.audioSpeech ? <Volume2 size={14} /> : <VolumeX size={14} />}
              Speech Readout: {settings.audioSpeech ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  soundChimes: !prev.soundChimes,
                }))
              }
              className={`flex-1 py-2 px-3 rounded text-xs font-bold border flex items-center justify-center gap-1.5 ${
                settings.soundChimes
                  ? 'bg-[#1C1917] text-white border-[#1C1917]'
                  : 'bg-white text-[#1C1917] border-[#D6D1C4]'
              }`}
            >
              <span>🔔</span>
              Chimes: {settings.soundChimes ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Page Diagnostics & Metrics */}
        <div className="bg-[#EBE8DF] p-3 rounded border border-[#D6D1C4] grid grid-cols-3 text-center">
          <div>
            <div className="text-[11px] text-[#57534E] uppercase font-bold">Detected Controls</div>
            <div className="text-lg font-bold text-[#1C1917]">{detectedElementsCount}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#57534E] uppercase font-bold">DOM Sections</div>
            <div className="text-lg font-bold text-[#1C1917]">{sectionsCount}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#57534E] uppercase font-bold">Switch Presses</div>
            <div className="text-lg font-bold text-[#B45309]">{switchClicksCount}</div>
          </div>
        </div>

        {/* Quick Actions (Audit & Extension Package) */}
        <div className="space-y-2 pt-1">
          <button
            onClick={onOpenAudit}
            className="w-full py-2.5 px-3 bg-[#4338CA] hover:bg-[#3730A3] text-white font-bold text-xs rounded border border-[#1C1917] flex items-center justify-center gap-2 shadow-sm"
          >
            <Sparkles size={14} />
            <span>View 3 Identified Accessibility Problems & Fixes</span>
          </button>

          <button
            onClick={onOpenExport}
            className="w-full py-2.5 px-3 bg-[#1C1917] hover:bg-black text-white font-bold text-xs rounded border border-[#1C1917] flex items-center justify-center gap-2 shadow-sm"
          >
            <Download size={14} />
            <span>Download Chrome Extension Package (Manifest V3)</span>
          </button>

          <button
            onClick={onTriggerManualKeyboard}
            className="w-full py-2 px-3 bg-[#F4F3EE] hover:bg-[#EBE8DF] text-[#1C1917] font-semibold text-xs rounded border border-[#D6D1C4] flex items-center justify-center gap-2"
          >
            <Keyboard size={14} className="text-[#B45309]" />
            <span>Open On-Screen Switch Keyboard Test</span>
          </button>
        </div>
      </div>
    </div>
  );
};
