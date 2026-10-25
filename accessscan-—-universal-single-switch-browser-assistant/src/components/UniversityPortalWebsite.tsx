/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Compass,
  UserCheck,
  GraduationCap,
  Send,
  CheckCircle,
  HelpCircle,
  Building,
  AlertCircle,
  ArrowUpLeft,
} from 'lucide-react';
import { WebpageSection, InteractiveControl } from '../types';

interface UniversityPortalWebsiteProps {
  sections: WebpageSection[];
  activeSectionId: string | null;
  activeControlId: string | null;
  inSectionSelectionMode: boolean;
  onControlClick: (control: InteractiveControl) => void;
  onSectionClick: (section: WebpageSection) => void;
  onBackToSections?: () => void;
  formSubmitted: boolean;
  onResetForm: () => void;
  isAssistiveLayerActive: boolean;
}

export const UniversityPortalWebsite: React.FC<UniversityPortalWebsiteProps> = ({
  sections,
  activeSectionId,
  activeControlId,
  inSectionSelectionMode,
  onControlClick,
  onSectionClick,
  onBackToSections,
  formSubmitted,
  onResetForm,
  isAssistiveLayerActive,
}) => {
  return (
    <div className="w-full bg-[#FAFAF8] text-[#1C1917] rounded-lg border-2 border-[#D6D1C4] overflow-hidden shadow-sm">
      {/* University Portal Header Banner */}
      <header className="bg-[#1C1917] text-white p-4 sm:p-6 border-b-4 border-[#B45309]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-[#B45309] text-white flex items-center justify-center font-serif text-2xl font-bold shadow-inner">
              🏛️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-[#E5E2D8] font-bold">
                  Apex State University
                </span>
                <span className="text-[10px] bg-emerald-600 text-white font-mono px-2 py-0.5 rounded font-bold">
                  Official Student Portal
                </span>
              </div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-white mt-0.5">
                Financial Aid & Need-Based Grant Application (2026–2027)
              </h1>
            </div>
          </div>

          <div className="text-xs text-[#E5E2D8] text-right hidden sm:block">
            <div>Logged in as: <strong className="text-white">Alex Rivera (STU-8821)</strong></div>
            <div className="text-emerald-400 font-semibold">● Secure Student Session</div>
          </div>
        </div>
      </header>

      {/* Breadcrumb Navigation Bar */}
      <nav
        aria-label="Campus Portal Navigation"
        className={`bg-[#F4F3EE] border-b border-[#D6D1C4] p-3 transition-all ${
          isAssistiveLayerActive && activeSectionId === 'sec_nav' && inSectionSelectionMode
            ? 'scan-focus-section bg-[#EBE8DF]'
            : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {sections
              .find((s) => s.id === 'sec_nav')
              ?.controls.map((ctrl) => {
                const isControlActive = isAssistiveLayerActive && activeControlId === ctrl.id;
                const isCurrent = ctrl.role.includes('current');

                return (
                  <button
                    key={ctrl.id}
                    id={ctrl.id}
                    onClick={() => onControlClick(ctrl)}
                    className={`min-h-[48px] px-3.5 py-2 rounded text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                      isCurrent
                        ? 'bg-[#1C1917] text-white border-2 border-[#1C1917]'
                        : 'bg-white text-[#1C1917] border border-[#D6D1C4] hover:bg-[#EBE8DF]'
                    } ${isControlActive ? 'scan-focus-control bg-[#B45309] text-white font-extrabold shadow-lg scale-105' : ''}`}
                  >
                    <span>{ctrl.label}</span>
                  </button>
                );
              })}
          </div>

          {isAssistiveLayerActive && !inSectionSelectionMode && onBackToSections && (
            <button
              onClick={onBackToSections}
              className="px-3 py-1.5 bg-[#EBE8DF] hover:bg-[#E5E2D8] text-[#1C1917] text-xs font-bold rounded border border-[#D6D1C4] flex items-center gap-1.5 shadow-sm"
              title="Return to Hierarchical Section Scanning"
            >
              <ArrowUpLeft size={14} className="text-[#B45309]" />
              <span>Back to Section Tree</span>
            </button>
          )}
        </div>
      </nav>

      {/* Submission Success Notice (When completed via single switch) */}
      {formSubmitted && (
        <div className="m-4 sm:m-6 bg-emerald-50 border-2 border-[#15803D] p-5 rounded-lg text-emerald-950 space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle size={24} className="text-[#15803D]" />
              <h3 className="font-bold text-lg">Application Submitted Successfully via Single-Switch!</h3>
            </div>
            <button
              onClick={onResetForm}
              className="px-3 py-1 bg-white text-emerald-900 border border-emerald-300 text-xs font-bold rounded hover:bg-emerald-100"
            >
              Reset Application for Demo
            </button>
          </div>
          <p className="text-sm">
            Confirmation Reference: <strong className="font-mono">APEX-GRANT-2026-99120</strong>. Your application was 100% completed, signed, and submitted without touching a mouse or conventional keyboard!
          </p>
        </div>
      )}

      {/* Main Portal Body */}
      <main className="p-4 sm:p-6 space-y-6">
        {/* Intro Alert */}
        <div className="bg-[#F4F3EE] border-l-4 border-[#B45309] p-4 rounded-r border border-[#D6D1C4]">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-[#B45309] shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-[#292524] space-y-1">
              <strong className="text-[#1C1917]">Notice for Switch & Assistive Technology Users:</strong>
              <p>
                All fields below are mapped for sequential & hierarchical scanning. Press <strong>Spacebar</strong> to select sections, toggle checkboxes, or open the single-switch on-screen typing keyboard.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Student Verification */}
        {(() => {
          const sec = sections.find((s) => s.id === 'sec_student_info');
          if (!sec) return null;
          const isSecHighlighted = isAssistiveLayerActive && activeSectionId === sec.id && inSectionSelectionMode;

          return (
            <section
              key={sec.id}
              id={sec.id}
              className={`p-5 rounded-lg border-2 transition-all ${
                isSecHighlighted
                  ? 'scan-focus-section bg-[#EBE8DF]'
                  : 'bg-[#F4F3EE] border-[#D6D1C4]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#D6D1C4] pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded bg-[#1C1917] text-white flex items-center justify-center font-bold text-sm">
                    1
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#1C1917]">{sec.title}</h2>
                    <p className="text-xs text-[#57534E]">{sec.description}</p>
                  </div>
                </div>
                {isSecHighlighted && (
                  <span className="bg-[#4338CA] text-white px-2.5 py-1 rounded text-xs font-bold animate-pulse">
                    Scanning Section • Press Space to Enter
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sec.controls.map((ctrl) => {
                  const isCtrlActive = isAssistiveLayerActive && activeControlId === ctrl.id;

                  if (ctrl.type === 'checkbox') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`sm:col-span-2 min-h-[52px] p-3 rounded border flex items-center gap-3 cursor-pointer select-none transition-all ${
                          ctrl.value === 'true' ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-[#D6D1C4]'
                        } ${isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl scale-102' : ''}`}
                      >
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center border-2 font-bold text-sm ${
                            ctrl.value === 'true'
                              ? isCtrlActive
                                ? 'bg-white text-[#B45309] border-white'
                                : 'bg-[#1C1917] text-white border-[#1C1917]'
                              : 'bg-white border-[#1C1917]'
                          }`}
                        >
                          {ctrl.value === 'true' ? '✓' : ''}
                        </div>
                        <span className="font-bold text-xs sm:text-sm">{ctrl.label}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={ctrl.id}
                      id={ctrl.id}
                      onClick={() => onControlClick(ctrl)}
                      className={`min-h-[64px] p-3 rounded border cursor-pointer transition-all bg-white ${
                        isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl scale-102' : 'border-[#D6D1C4]'
                      }`}
                    >
                      <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#57534E]'}`}>
                        {ctrl.label}
                      </label>
                      <div className="flex items-center justify-between">
                        <span className={`font-mono text-sm sm:text-base font-semibold ${isCtrlActive ? 'text-white' : 'text-[#1C1917]'}`}>
                          {ctrl.value || <span className="opacity-50 italic font-sans text-xs">Click or Switch to Type...</span>}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${isCtrlActive ? 'bg-white text-[#B45309]' : 'bg-[#F4F3EE] text-[#57534E]'}`}>
                          Edit ⌨️
                        </span>
                      </div>
                      {ctrl.helpText && (
                        <p className={`text-[10px] mt-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#78716C]'}`}>
                          {ctrl.helpText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Section 2: Need-Based Grant Assessment */}
        {(() => {
          const sec = sections.find((s) => s.id === 'sec_grant_application');
          if (!sec) return null;
          const isSecHighlighted = isAssistiveLayerActive && activeSectionId === sec.id && inSectionSelectionMode;

          return (
            <section
              key={sec.id}
              id={sec.id}
              className={`p-5 rounded-lg border-2 transition-all ${
                isSecHighlighted
                  ? 'scan-focus-section bg-[#EBE8DF]'
                  : 'bg-[#F4F3EE] border-[#D6D1C4]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#D6D1C4] pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded bg-[#1C1917] text-white flex items-center justify-center font-bold text-sm">
                    2
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#1C1917]">{sec.title}</h2>
                    <p className="text-xs text-[#57534E]">{sec.description}</p>
                  </div>
                </div>
                {isSecHighlighted && (
                  <span className="bg-[#4338CA] text-white px-2.5 py-1 rounded text-xs font-bold animate-pulse">
                    Scanning Section • Press Space to Enter
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
                        className={`min-h-[58px] p-3 rounded border cursor-pointer transition-all bg-white ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl scale-102' : 'border-[#D6D1C4]'
                        }`}
                      >
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#57534E]'}`}>
                          {ctrl.label} (Click/Switch to Cycle Options)
                        </label>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm sm:text-base font-bold ${isCtrlActive ? 'text-white' : 'text-[#1C1917]'}`}>
                            {ctrl.value}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${isCtrlActive ? 'bg-white text-[#B45309]' : 'bg-[#EBE8DF] text-[#1C1917]'}`}>
                            Option ▼
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (ctrl.type === 'textarea') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`min-h-[84px] p-3 rounded border cursor-pointer transition-all bg-white ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl scale-102' : 'border-[#D6D1C4]'
                        }`}
                      >
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#57534E]'}`}>
                          {ctrl.label}
                        </label>
                        <p className={`text-sm leading-relaxed ${isCtrlActive ? 'text-white' : 'text-[#1C1917]'}`}>
                          {ctrl.value || <span className="opacity-50 italic text-xs">Click or Switch to Type text...</span>}
                        </p>
                        <div className="flex justify-between items-center mt-2 pt-1 border-t border-dashed border-[#D6D1C4]">
                          <span className={`text-[10px] ${isCtrlActive ? 'text-amber-100' : 'text-[#78716C]'}`}>
                            Single-switch predictive keyboard enabled
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${isCtrlActive ? 'bg-white text-[#B45309]' : 'bg-[#EBE8DF] text-[#1C1917]'}`}>
                            Type Statement ⌨️
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </section>
          );
        })()}

        {/* Section 3: Verification & Submission */}
        {(() => {
          const sec = sections.find((s) => s.id === 'sec_submission');
          if (!sec) return null;
          const isSecHighlighted = isAssistiveLayerActive && activeSectionId === sec.id && inSectionSelectionMode;

          return (
            <section
              key={sec.id}
              id={sec.id}
              className={`p-5 rounded-lg border-2 transition-all ${
                isSecHighlighted
                  ? 'scan-focus-section bg-[#EBE8DF]'
                  : 'bg-[#F4F3EE] border-[#D6D1C4]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#D6D1C4] pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded bg-[#1C1917] text-white flex items-center justify-center font-bold text-sm">
                    3
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#1C1917]">{sec.title}</h2>
                    <p className="text-xs text-[#57534E]">{sec.description}</p>
                  </div>
                </div>
                {isSecHighlighted && (
                  <span className="bg-[#4338CA] text-white px-2.5 py-1 rounded text-xs font-bold animate-pulse">
                    Scanning Section • Press Space to Enter
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {sec.controls.map((ctrl) => {
                  const isCtrlActive = isAssistiveLayerActive && activeControlId === ctrl.id;

                  if (ctrl.type === 'checkbox') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`min-h-[52px] p-3 rounded border flex items-center gap-3 cursor-pointer select-none transition-all ${
                          ctrl.value === 'true' ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-[#D6D1C4]'
                        } ${isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl scale-102' : ''}`}
                      >
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center border-2 font-bold text-sm ${
                            ctrl.value === 'true'
                              ? isCtrlActive
                                ? 'bg-white text-[#B45309] border-white'
                                : 'bg-[#1C1917] text-white border-[#1C1917]'
                              : 'bg-white border-[#1C1917]'
                          }`}
                        >
                          {ctrl.value === 'true' ? '✓' : ''}
                        </div>
                        <span className="font-bold text-xs sm:text-sm">{ctrl.label}</span>
                      </div>
                    );
                  }

                  if (ctrl.type === 'input') {
                    return (
                      <div
                        key={ctrl.id}
                        id={ctrl.id}
                        onClick={() => onControlClick(ctrl)}
                        className={`min-h-[64px] p-3 rounded border cursor-pointer transition-all bg-white ${
                          isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white shadow-xl scale-102' : 'border-[#D6D1C4]'
                        }`}
                      >
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isCtrlActive ? 'text-amber-100' : 'text-[#57534E]'}`}>
                          {ctrl.label}
                        </label>
                        <div className="flex items-center justify-between font-serif italic text-base">
                          <span className={isCtrlActive ? 'text-white font-bold' : 'text-[#1C1917]'}>
                            {ctrl.value || 'Type signature to sign...'}
                          </span>
                          <span className={`text-[11px] font-sans font-bold px-2 py-0.5 rounded ${isCtrlActive ? 'bg-white text-[#B45309]' : 'bg-[#EBE8DF] text-[#1C1917]'}`}>
                            Sign ✍️
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (ctrl.type === 'button') {
                    const isPrimary = ctrl.id.includes('submit');
                    return (
                      <button
                        key={ctrl.id}
                        id={ctrl.id}
                        type="button"
                        onClick={() => onControlClick(ctrl)}
                        className={`w-full min-h-[54px] px-6 py-3 rounded text-sm sm:text-base font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${
                          isPrimary
                            ? 'bg-[#1C1917] hover:bg-black text-white border-[#1C1917] shadow-md'
                            : 'bg-[#F4F3EE] hover:bg-[#EBE8DF] text-[#1C1917] border-[#D6D1C4]'
                        } ${isCtrlActive ? 'scan-focus-control bg-[#B45309] text-white font-extrabold shadow-2xl scale-105' : ''}`}
                      >
                        {isPrimary && <span>🚀</span>}
                        <span>{ctrl.label}</span>
                      </button>
                    );
                  }

                  return null;
                })}
              </div>
            </section>
          );
        })()}
      </main>

      {/* University Portal Footer */}
      <footer className="bg-[#EBE8DF] p-6 border-t border-[#D6D1C4] text-xs text-[#57534E] flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-bold text-[#1C1917]">© 2026 Apex State University Office of the Registrar & Financial Services.</p>
          <p>Equipped with AccessScan single-switch accessibility compliance overlay.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="hover:underline cursor-pointer">Security Policy</span>
          <span className="hover:underline cursor-pointer">Accessibility Statement</span>
          <span className="hover:underline cursor-pointer">Help & Tech Support</span>
        </div>
      </footer>
    </div>
  );
};
