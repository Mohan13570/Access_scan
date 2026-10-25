/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, HeartPulse, CheckCircle2, Phone, Calendar, ArrowUpLeft } from 'lucide-react';
import { WebpageSection, InteractiveControl } from '../types';

interface ClinicPortalWebsiteProps {
  sections: WebpageSection[];
  activeSectionId: string | null;
  activeControlId: string | null;
  inSectionSelectionMode: boolean;
  onControlClick: (control: InteractiveControl) => void;
  onSectionClick: (section: WebpageSection) => void;
  onBackToSections?: () => void;
  bookedSuccess: boolean;
  onReset: () => void;
  isAssistiveLayerActive: boolean;
}

export const ClinicPortalWebsite: React.FC<ClinicPortalWebsiteProps> = ({
  sections,
  activeSectionId,
  activeControlId,
  inSectionSelectionMode,
  onControlClick,
  onBackToSections,
  bookedSuccess,
  onReset,
  isAssistiveLayerActive,
}) => {
  return (
    <div className="w-full bg-[#FAFAF8] text-[#1C1917] rounded-lg border-2 border-[#D6D1C4] overflow-hidden shadow-sm">
      {/* Clinic Header */}
      <header className="bg-[#1C1917] text-white p-5 border-b-4 border-[#4338CA] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#4338CA] text-white flex items-center justify-center font-bold text-xl">
            🏥
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#E5E2D8] font-bold">
              Metro Care Regional Medical Center
            </div>
            <h1 className="text-xl font-bold text-white">Patient Intake & Accessibility Clinic Booking</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Clinic Open Today • Triage Unit Available</span>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-[#F4F3EE] p-3 border-b border-[#D6D1C4] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sections
            .find((s) => s.id === 'sec_clinic_nav')
            ?.controls.map((ctrl) => {
              const isCtrlActive = isAssistiveLayerActive && activeControlId === ctrl.id;
              return (
                <button
                  key={ctrl.id}
                  id={ctrl.id}
                  onClick={() => onControlClick(ctrl)}
                  className={`min-h-[46px] px-3.5 py-1.5 rounded text-xs font-bold transition-all border ${
                    isCtrlActive
                      ? 'scan-focus-control bg-[#B45309] text-white'
                      : 'bg-white text-[#1C1917] border-[#D6D1C4] hover:bg-[#EBE8DF]'
                  }`}
                >
                  {ctrl.label}
                </button>
              );
            })}
        </div>

        {isAssistiveLayerActive && !inSectionSelectionMode && onBackToSections && (
          <button
            onClick={onBackToSections}
            className="px-3 py-1.5 bg-[#EBE8DF] hover:bg-[#E5E2D8] text-[#1C1917] text-xs font-bold rounded border border-[#D6D1C4] flex items-center gap-1.5"
          >
            <ArrowUpLeft size={14} className="text-[#B45309]" />
            <span>Back to Sections</span>
          </button>
        )}
      </nav>

      {/* Booked Confirmation */}
      {bookedSuccess && (
        <div className="m-5 bg-emerald-50 border-2 border-[#15803D] p-5 rounded-lg text-emerald-950 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={24} className="text-[#15803D]" />
              <h3 className="font-bold text-lg">Appointment Booked with Switch Accommodations!</h3>
            </div>
            <button
              onClick={onReset}
              className="px-3 py-1 bg-white text-emerald-900 border border-emerald-300 text-xs font-bold rounded"
            >
              Reset Form
            </button>
          </div>
          <p className="text-sm">
            Confirmed for <strong>Occupational Therapy & Assistive Tech</strong>. Exam room setup has been flagged for wheelchair switch accessibility.
          </p>
        </div>
      )}

      {/* Form Body */}
      <main className="p-5 space-y-5">
        {(() => {
          const sec = sections.find((s) => s.id === 'sec_intake_form');
          if (!sec) return null;
          const isSecHighlighted = isAssistiveLayerActive && activeSectionId === sec.id && inSectionSelectionMode;

          return (
            <div
              key={sec.id}
              id={sec.id}
              className={`p-5 rounded-lg border-2 transition-all ${
                isSecHighlighted ? 'scan-focus-section bg-[#EBE8DF]' : 'bg-[#F4F3EE] border-[#D6D1C4]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#D6D1C4] pb-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#1C1917]">{sec.title}</h2>
                  <p className="text-xs text-[#57534E]">{sec.description}</p>
                </div>
                {isSecHighlighted && (
                  <span className="bg-[#4338CA] text-white px-2.5 py-1 rounded text-xs font-bold animate-pulse">
                    Scanning Section • Space to Enter
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {sec.controls.map((ctrl) => {
                  const isCtrlActive = isAssistiveLayerActive && activeControlId === ctrl.id;

                  if (ctrl.type === 'select') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`min-h-[58px] p-3 rounded border cursor-pointer bg-white ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white' : 'border-[#D6D1C4]'
                        }`}
                      >
                        <label className={`block text-xs font-bold uppercase mb-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#57534E]'}`}>
                          {ctrl.label} (Click/Switch to Cycle)
                        </label>
                        <div className="font-bold text-sm sm:text-base">{ctrl.value}</div>
                      </div>
                    );
                  }

                  if (ctrl.type === 'checkbox') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`min-h-[52px] p-3 rounded border flex items-center gap-3 cursor-pointer select-none bg-white ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white' : 'border-[#D6D1C4]'
                        }`}
                      >
                        <div className="w-6 h-6 rounded flex items-center justify-center border-2 border-[#1C1917] bg-white font-bold text-sm text-[#1C1917]">
                          {ctrl.value === 'true' ? '✓' : ''}
                        </div>
                        <span className="font-bold text-xs sm:text-sm">{ctrl.label}</span>
                      </div>
                    );
                  }

                  if (ctrl.type === 'textarea') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`min-h-[84px] p-3 rounded border cursor-pointer bg-white ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white' : 'border-[#D6D1C4]'
                        }`}
                      >
                        <label className={`block text-xs font-bold uppercase mb-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#57534E]'}`}>
                          {ctrl.label}
                        </label>
                        <p className="text-sm">{ctrl.value || 'Tap or switch to type symptoms...'}</p>
                      </div>
                    );
                  }

                  if (ctrl.type === 'button') {
                    return (
                      <button
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`w-full min-h-[52px] px-5 py-3 rounded font-bold text-sm uppercase tracking-wider bg-[#1C1917] hover:bg-black text-white border border-[#1C1917] ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl' : ''
                        }`}
                      >
                        {ctrl.label}
                      </button>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
};
