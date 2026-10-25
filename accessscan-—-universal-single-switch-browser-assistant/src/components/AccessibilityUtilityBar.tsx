/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Zap,
  Sliders,
  Type,
  SunMoon,
  Keyboard,
  Award,
  Download,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AccessScanSettings } from '../types';

interface AccessibilityUtilityBarProps {
  settings: AccessScanSettings;
  onUpdateSettings: (updater: (prev: AccessScanSettings) => AccessScanSettings) => void;
  activeLabel: string;
  activeRole: string;
  onTriggerSwitch: () => void;
  onOpenPopup: () => void;
  onOpenAudit: () => void;
  onOpenExport: () => void;
  onOpenKeyboard: () => void;
}

export const AccessibilityUtilityBar: React.FC<AccessibilityUtilityBarProps> = ({
  settings,
  onUpdateSettings,
  activeLabel,
  activeRole,
  onTriggerSwitch,
  onOpenPopup,
  onOpenAudit,
  onOpenExport,
  onOpenKeyboard,
}) => {
  return (
    <aside
      aria-label="AccessScan Assistive Utility Bar"
      className="fixed bottom-0 inset-x-0 z-40 bg-[#E5E2D8] border-t-2 border-[#1C1917] shadow-xl px-3 py-2 sm:px-6 sm:py-2.5 flex flex-wrap items-center justify-between gap-2.5"
      style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
    >
      {/* Active Focus Reticle Readout */}
      <div className="flex items-center gap-2.5 min-w-[240px] max-w-md">
        <span className="w-3.5 h-3.5 rounded-full bg-[#B45309] animate-pulse shrink-0" />
        <div className="truncate">
          <div className="text-[10px] uppercase font-bold tracking-wider text-[#57534E]">
            Active Scanning Target:
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#1C1917] truncate flex items-center gap-1.5">
            <span className="bg-[#1C1917] text-white px-1.5 py-0.2 rounded text-[10px] font-mono uppercase">
              {activeRole || 'Page'}
            </span>
            <span className="truncate">{activeLabel || 'Initializing scanner...'}</span>
          </div>
        </div>
      </div>

      {/* Primary Giant Switch Activator (For Touch, Click, or Foot Switch) */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTriggerSwitch}
          className="min-h-[46px] px-5 py-2 bg-[#B45309] hover:bg-[#92400E] active:scale-95 text-white font-bold text-xs sm:text-sm rounded border-2 border-[#1C1917] shadow-md flex items-center gap-2 transition-all"
          title="Press Spacebar or Click this button to select the current element"
        >
          <span className="text-base">🎮</span>
          <span>SELECT (SPACEBAR / CLICK)</span>
        </button>

        {/* Pause / Resume */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({
              ...prev,
              isPaused: !prev.isPaused,
            }))
          }
          className={`min-h-[46px] px-3.5 py-2 rounded text-xs font-bold border border-[#1C1917] flex items-center gap-1.5 ${
            settings.isPaused
              ? 'bg-amber-400 text-black'
              : 'bg-[#F4F3EE] text-[#1C1917] hover:bg-[#EBE8DF]'
          }`}
          title="Pause / Resume scanning (Key: P)"
        >
          {settings.isPaused ? <Play size={15} /> : <Pause size={15} />}
          <span className="hidden sm:inline">{settings.isPaused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>

      {/* Utility Controls & Adjustments */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Speed Adjustment */}
        <div className="flex items-center bg-[#F4F3EE] rounded border border-[#D6D1C4] p-0.5 text-xs font-bold">
          <button
            onClick={() =>
              onUpdateSettings((prev) => ({
                ...prev,
                scanIntervalMs: Math.max(500, prev.scanIntervalMs - 250),
              }))
            }
            className="px-2 py-1 hover:bg-[#EBE8DF] rounded text-[#1C1917]"
            title="Increase Scanning Speed (-0.25s)"
          >
            -
          </button>
          <span className="px-2 py-1 font-mono text-[#B45309]">
            {(settings.scanIntervalMs / 1000).toFixed(1)}s
          </span>
          <button
            onClick={() =>
              onUpdateSettings((prev) => ({
                ...prev,
                scanIntervalMs: Math.min(4000, prev.scanIntervalMs + 250),
              }))
            }
            className="px-2 py-1 hover:bg-[#EBE8DF] rounded text-[#1C1917]"
            title="Decrease Scanning Speed (+0.25s)"
          >
            +
          </button>
        </div>

        {/* Audio Toggle */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({
              ...prev,
              audioSpeech: !prev.audioSpeech,
            }))
          }
          className={`p-2 rounded border border-[#D6D1C4] text-xs font-bold ${
            settings.audioSpeech
              ? 'bg-[#1C1917] text-white border-[#1C1917]'
              : 'bg-[#F4F3EE] text-[#57534E]'
          }`}
          title="Toggle Screen Reader Voice Readout"
        >
          {settings.audioSpeech ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Hierarchical Scanning Mode Quick Toggle */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({
              ...prev,
              mode: prev.mode === 'hierarchical' ? 'sequential' : 'hierarchical',
            }))
          }
          className={`px-3 py-1.5 rounded text-xs font-bold border flex items-center gap-1 ${
            settings.mode === 'hierarchical'
              ? 'bg-[#4338CA] text-white border-[#1C1917]'
              : 'bg-[#F4F3EE] text-[#1C1917] border-[#D6D1C4]'
          }`}
          title="Switch between Hierarchical section scan and linear sequential scan"
        >
          <Zap size={14} className={settings.mode === 'hierarchical' ? 'text-amber-300' : 'text-zinc-600'} />
          <span className="hidden md:inline">
            {settings.mode === 'hierarchical' ? 'Hierarchical' : 'Linear'}
          </span>
        </button>

        {/* Open Switch Keyboard */}
        <button
          onClick={onOpenKeyboard}
          className="p-2 bg-[#F4F3EE] hover:bg-[#EBE8DF] text-[#1C1917] rounded border border-[#D6D1C4] text-xs font-bold"
          title="Open Single-Switch On-Screen Keyboard"
        >
          <Keyboard size={16} className="text-[#B45309]" />
        </button>

        {/* 3 Problems & WCAG Audit */}
        <button
          onClick={onOpenAudit}
          className="px-2.5 py-1.5 bg-[#1C1917] hover:bg-black text-white rounded text-xs font-bold border border-[#1C1917] flex items-center gap-1.5 shadow-sm"
          title="View 3 Accessibility Problems Identified and Fixed"
        >
          <Award size={14} className="text-amber-400" />
          <span className="hidden lg:inline">Audit Report</span>
        </button>

        {/* Extension Popup Launcher */}
        <button
          onClick={onOpenPopup}
          className="px-3 py-1.5 bg-[#B45309] hover:bg-[#92400E] text-white rounded text-xs font-bold border border-[#1C1917] flex items-center gap-1.5 shadow-sm"
          title="Open AccessScan Extension Popup"
        >
          <Sliders size={14} />
          <span>Extension</span>
        </button>

        {/* Chrome Extension Download Modal */}
        <button
          onClick={onOpenExport}
          className="p-2 bg-[#F4F3EE] hover:bg-[#EBE8DF] text-[#1C1917] rounded border border-[#D6D1C4] text-xs font-bold"
          title="Download Chrome Extension Files"
        >
          <Download size={16} />
        </button>
      </div>
    </aside>
  );
};
