/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UNIVERSITY_PORTAL_SECTIONS,
  HEALTHCARE_PORTAL_SECTIONS,
  ACCESSIBILITY_ISSUES,
} from './data/mockWebsites';
import {
  AccessScanSettings,
  WebpageSection,
  InteractiveControl,
  ScanningMode,
  SwitchTriggerType,
} from './types';
import { UniversityPortalWebsite } from './components/UniversityPortalWebsite';
import { ClinicPortalWebsite } from './components/ClinicPortalWebsite';
import { CustomWebSandbox } from './components/CustomWebSandbox';
import { OnScreenKeyboard } from './components/OnScreenKeyboard';
import { ExtensionPopup } from './components/ExtensionPopup';
import { AccessibilityAuditPanel } from './components/AccessibilityAuditPanel';
import { ExtensionExportModal } from './components/ExtensionExportModal';
import { AccessibilityUtilityBar } from './components/AccessibilityUtilityBar';
import {
  playScanStepChime,
  playSelectChime,
  playSectionEnterChime,
  speakText,
} from './utils/audioFeedback';
import {
  Award,
  Download,
  Sliders,
  Layers,
  Sparkles,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
} from 'lucide-react';

export default function App() {
  // Master Settings
  const [settings, setSettings] = useState<AccessScanSettings>({
    isEnabled: true,
    isPaused: false,
    mode: 'hierarchical',
    scanIntervalMs: 1500,
    trigger: 'space',
    dwellTimeMs: 2000,
    audioSpeech: true,
    soundChimes: true,
    reticleStyle: 'amber_dual',
    highContrast: false,
    largeText: false,
    activeKeyboard: false,
    activeTargetControlId: null,
  });

  // Website and Sections state
  const [activeSiteKey, setActiveSiteKey] = useState<'university' | 'clinic' | 'sandbox'>('university');
  const [universitySections, setUniversitySections] = useState<WebpageSection[]>(UNIVERSITY_PORTAL_SECTIONS);
  const [clinicSections, setClinicSections] = useState<WebpageSection[]>(HEALTHCARE_PORTAL_SECTIONS);
  const [sandboxSections, setSandboxSections] = useState<WebpageSection[]>(UNIVERSITY_PORTAL_SECTIONS);

  // Active scanning navigation state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentControlIndex, setCurrentControlIndex] = useState(0);
  const [inSectionSelectionMode, setInSectionSelectionMode] = useState(true);
  const [switchPressCount, setSwitchPressCount] = useState(0);

  // Task Completion state
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [clinicBooked, setClinicBooked] = useState(false);

  // Modals & Panels
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // On-screen Keyboard state
  const [keyboardState, setKeyboardState] = useState<{
    isOpen: boolean;
    targetControlId: string | null;
    targetSectionId: string | null;
    initialValue: string;
    label: string;
  }>({
    isOpen: false,
    targetControlId: null,
    targetSectionId: null,
    initialValue: '',
    label: '',
  });

  // Active sections based on selected site
  const currentSections =
    activeSiteKey === 'university'
      ? universitySections
      : activeSiteKey === 'clinic'
      ? clinicSections
      : sandboxSections;

  const currentSection = currentSections[currentSectionIndex] || currentSections[0];
  const currentControl =
    !inSectionSelectionMode && currentSection?.controls
      ? currentSection.controls[currentControlIndex] || currentSection.controls[0]
      : null;

  // Active label & role for utility bar readout
  const activeLabel = inSectionSelectionMode
    ? currentSection?.title || 'Loading section...'
    : currentControl?.label || 'Loading control...';

  const activeRole = inSectionSelectionMode ? 'Section' : currentControl?.role || 'Control';

  // Flat sequential scan total count helper
  const allControls = React.useMemo(() => {
    return currentSections.flatMap((s) => s.controls);
  }, [currentSections]);

  // Handle value update on a control
  const handleUpdateControlValue = useCallback(
    (controlId: string, newValue: string) => {
      const updater = (prevSections: WebpageSection[]) =>
        prevSections.map((sec) => ({
          ...sec,
          controls: sec.controls.map((ctrl) => (ctrl.id === controlId ? { ...ctrl, value: newValue } : ctrl)),
        }));

      if (activeSiteKey === 'university') {
        setUniversitySections(updater);
      } else if (activeSiteKey === 'clinic') {
        setClinicSections(updater);
      } else {
        setSandboxSections(updater);
      }
    },
    [activeSiteKey]
  );

  // Execute interactive action when a control is selected
  const executeControlAction = useCallback(
    (ctrl: InteractiveControl) => {
      if (settings.soundChimes) playSelectChime();

      // Text input or textarea -> Open single-switch keyboard
      if (ctrl.type === 'input' || ctrl.type === 'textarea') {
        setKeyboardState({
          isOpen: true,
          targetControlId: ctrl.id,
          targetSectionId: ctrl.sectionId,
          initialValue: ctrl.value || '',
          label: ctrl.label,
        });
        return;
      }

      // Checkbox -> Toggle value
      if (ctrl.type === 'checkbox') {
        const nextVal = ctrl.value === 'true' ? 'false' : 'true';
        handleUpdateControlValue(ctrl.id, nextVal);
        if (settings.audioSpeech) {
          speakText(`${ctrl.label}: ${nextVal === 'true' ? 'Checked' : 'Unchecked'}`);
        }
        return;
      }

      // Select -> Cycle to next option
      if (ctrl.type === 'select' && ctrl.options && ctrl.options.length > 0) {
        const curIdx = ctrl.options.indexOf(ctrl.value || '');
        const nextIdx = (curIdx + 1) % ctrl.options.length;
        const nextVal = ctrl.options[nextIdx];
        handleUpdateControlValue(ctrl.id, nextVal);
        if (settings.audioSpeech) {
          speakText(`Selected option: ${nextVal}`);
        }
        return;
      }

      // Submit Button or Action
      if (ctrl.type === 'button') {
        if (ctrl.id === 'btn_submit_grant') {
          setFormSubmitted(true);
          if (settings.audioSpeech) {
            speakText('Congratulations! Application submitted successfully via single-switch navigation.');
          }
        } else if (ctrl.id === 'btn_book_appointment') {
          setClinicBooked(true);
          if (settings.audioSpeech) {
            speakText('Appointment booked successfully with accessibility accommodations.');
          }
        } else {
          if (settings.audioSpeech) {
            speakText(`Activated: ${ctrl.label}`);
          }
        }
      }
    },
    [settings.soundChimes, settings.audioSpeech, handleUpdateControlValue]
  );

  // Primary Single-Switch Trigger Handler (Spacebar, Enter, Click)
  const handleSwitchTrigger = useCallback(() => {
    setSwitchPressCount((c) => c + 1);

    // If keyboard is open, keyboard handles its own switch events
    if (keyboardState.isOpen) return;

    if (!settings.isEnabled || settings.isPaused) return;

    if (settings.mode === 'hierarchical') {
      if (inSectionSelectionMode) {
        // Step INTO the selected section
        setInSectionSelectionMode(false);
        setCurrentControlIndex(0);
        if (settings.soundChimes) playSectionEnterChime();
        const firstCtrl = currentSection?.controls[0];
        if (settings.audioSpeech) {
          speakText(`Entered section: ${currentSection.title}. First control: ${firstCtrl?.label || 'none'}`);
        }
      } else {
        // Activate currently selected control inside section
        if (currentControl) {
          executeControlAction(currentControl);
        }
      }
    } else {
      // Sequential flat mode
      const activeFlatCtrl = allControls[currentControlIndex];
      if (activeFlatCtrl) {
        executeControlAction(activeFlatCtrl);
      }
    }
  }, [
    keyboardState.isOpen,
    settings.isEnabled,
    settings.isPaused,
    settings.mode,
    inSectionSelectionMode,
    currentSection,
    currentControl,
    allControls,
    currentControlIndex,
    settings.soundChimes,
    settings.audioSpeech,
    executeControlAction,
  ]);

  // Global Key Listener for Switch Hardware (Spacebar, Enter, P to Pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if keyboard modal is open and handling keys
      if (keyboardState.isOpen) return;

      if (e.code === 'Space') {
        // Prevent default spacebar scrolling on pages!
        e.preventDefault();
        e.stopPropagation();
        handleSwitchTrigger();
      } else if (e.key === 'Enter' && settings.trigger === 'enter') {
        e.preventDefault();
        e.stopPropagation();
        handleSwitchTrigger();
      } else if (e.key === 'p' || e.key === 'P') {
        // P toggles Pause/Resume
        e.preventDefault();
        setSettings((prev) => ({ ...prev, isPaused: !prev.isPaused }));
      } else if (e.key === 'Escape') {
        // Back out to section level in hierarchical mode
        e.preventDefault();
        setInSectionSelectionMode(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [keyboardState.isOpen, settings.trigger, handleSwitchTrigger]);

  // Main Scanning Loop
  useEffect(() => {
    if (!settings.isEnabled || settings.isPaused || keyboardState.isOpen) {
      return;
    }

    const timer = setInterval(() => {
      if (settings.mode === 'hierarchical') {
        if (inSectionSelectionMode) {
          // Scan Sections
          setCurrentSectionIndex((prev) => {
            const next = (prev + 1) % Math.max(1, currentSections.length);
            if (settings.soundChimes) playScanStepChime();
            const nextSec = currentSections[next];
            if (settings.audioSpeech && nextSec) {
              speakText(`Section: ${nextSec.title}`);
            }
            return next;
          });
        } else {
          // Scan Controls inside section
          const controlsCount = currentSection?.controls.length || 1;
          setCurrentControlIndex((prev) => {
            const next = (prev + 1) % controlsCount;
            if (settings.soundChimes) playScanStepChime();
            const nextCtrl = currentSection?.controls[next];
            if (settings.audioSpeech && nextCtrl) {
              speakText(`${nextCtrl.label}, ${nextCtrl.role}`);
            }
            return next;
          });
        }
      } else {
        // Flat sequential scan
        const total = allControls.length || 1;
        setCurrentControlIndex((prev) => {
          const next = (prev + 1) % total;
          if (settings.soundChimes) playScanStepChime();
          const nextCtrl = allControls[next];
          if (settings.audioSpeech && nextCtrl) {
            speakText(`${nextCtrl.label}, ${nextCtrl.role}`);
          }
          return next;
        });
      }
    }, settings.scanIntervalMs);

    return () => clearInterval(timer);
  }, [
    settings.isEnabled,
    settings.isPaused,
    settings.mode,
    settings.scanIntervalMs,
    settings.soundChimes,
    settings.audioSpeech,
    keyboardState.isOpen,
    inSectionSelectionMode,
    currentSections,
    currentSection,
    allControls,
  ]);

  // Return to section scanning level
  const handleBackToSections = () => {
    setInSectionSelectionMode(true);
    setCurrentControlIndex(0);
    if (settings.soundChimes) playSelectChime();
    if (settings.audioSpeech) speakText('Returned to section scanning.');
  };

  return (
    <div
      className={`min-h-screen pb-28 text-[#1C1917] bg-[#FAFAF8] ${
        settings.highContrast ? 'contrast-125' : ''
      }`}
      style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
    >
      {/* Top Universal App Navigation & Extension Status Bar */}
      <header className="sticky top-0 z-30 bg-[#1C1917] text-white border-b-2 border-[#B45309] shadow-md px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#B45309] text-white flex items-center justify-center font-bold text-xl shadow">
              ♿
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-wide">AccessScan</span>
                <span className="text-[11px] bg-[#EBE8DF] text-[#1C1917] px-2 py-0.5 rounded font-mono font-bold">
                  Hands-off — Accessibility
                </span>
                <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider hidden sm:inline">
                  WCAG AAA Layer Active
                </span>
              </div>
              <p className="text-xs text-[#E5E2D8]">
                Universal Single-Switch Browser Assistant & On-Screen Typing Keyboard
              </p>
            </div>
          </div>

          {/* Testbed Website Switcher */}
          <div className="flex items-center gap-1.5 bg-[#292524] p-1 rounded border border-zinc-700">
            <span className="text-xs text-zinc-400 font-bold px-2 hidden md:inline">Testbed:</span>
            <button
              onClick={() => {
                setActiveSiteKey('university');
                setCurrentSectionIndex(0);
                setCurrentControlIndex(0);
                setInSectionSelectionMode(true);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeSiteKey === 'university'
                  ? 'bg-[#B45309] text-white shadow'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              🎓 Apex University Portal
            </button>
            <button
              onClick={() => {
                setActiveSiteKey('clinic');
                setCurrentSectionIndex(0);
                setCurrentControlIndex(0);
                setInSectionSelectionMode(true);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeSiteKey === 'clinic'
                  ? 'bg-[#B45309] text-white shadow'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              🏥 Metro Care Clinic
            </button>
            <button
              onClick={() => {
                setActiveSiteKey('sandbox');
                setCurrentSectionIndex(0);
                setCurrentControlIndex(0);
                setInSectionSelectionMode(true);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeSiteKey === 'sandbox'
                  ? 'bg-[#B45309] text-white shadow'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              🌐 Any URL Sandbox
            </button>
          </div>

          {/* Top Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAuditOpen(true)}
              className="px-3 py-1.5 bg-[#4338CA] hover:bg-[#3730A3] text-white text-xs font-bold rounded border border-indigo-400 flex items-center gap-1.5 shadow"
              title="View the 3 Accessibility Problems identified on the University portal"
            >
              <Award size={15} className="text-amber-300" />
              <span>3 Problems Audit</span>
            </button>

            <button
              onClick={() => setIsExportOpen(true)}
              className="px-3 py-1.5 bg-[#1C1917] hover:bg-black text-white text-xs font-bold rounded border border-zinc-600 flex items-center gap-1.5 shadow"
              title="Download Chrome Extension Manifest V3 files as ZIP"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Chrome Extension ZIP</span>
            </button>

            <button
              onClick={() => setIsPopupOpen(!isPopupOpen)}
              className="px-3.5 py-1.5 bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-bold rounded border border-[#1C1917] flex items-center gap-1.5 shadow"
            >
              <Sliders size={15} />
              <span>{isPopupOpen ? 'Hide Controls' : 'Extension Controls'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main App Workspace */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Hackathon Callout Banner */}
        <div className="bg-[#F4F3EE] border-2 border-[#D6D1C4] p-4 rounded-lg flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-[#B45309] text-white px-2 py-0.5 rounded font-bold uppercase">
                Zero-Install Live Evaluation Ready
              </span>
              <h2 className="text-base font-bold text-[#1C1917]">
                Demonstrating Universal Single-Switch Navigation on Real-World Web Portals
              </h2>
            </div>
            <p className="text-xs text-[#57534E]">
              Press <strong>[Spacebar]</strong> on your laptop keyboard or click the giant Amber button in the dock below. No physical mouse, multiple keys, or pre-installations required.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[11px] uppercase font-bold text-[#57534E]">Active Mode:</span>
              <div className="text-xs font-bold text-[#4338CA] flex items-center gap-1">
                <Zap size={13} className="text-[#B45309]" />
                {settings.mode === 'hierarchical'
                  ? inSectionSelectionMode
                    ? 'Hierarchical (Scanning Sections)'
                    : 'Hierarchical (Inside Section)'
                  : 'Sequential (Linear Control Scan)'}
              </div>
            </div>

            <button
              onClick={() => setIsAuditOpen(true)}
              className="px-4 py-2 bg-white text-[#1C1917] hover:bg-[#EBE8DF] border border-[#D6D1C4] rounded font-bold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles size={14} className="text-[#B45309]" />
              <span>Before & After WCAG Audit</span>
            </button>
          </div>
        </div>

        {/* Content Layout: Website + Floating Popup Drawer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Website Simulation (8 or 12 columns) */}
          <div className={`${isPopupOpen ? 'lg:col-span-8' : 'lg:col-span-12'} transition-all duration-300`}>
            {activeSiteKey === 'sandbox' && (
              <div className="mb-6">
                <CustomWebSandbox
                  onLoadCustomControls={(customSecs) => {
                    setSandboxSections(customSecs);
                    setCurrentSectionIndex(0);
                    setCurrentControlIndex(0);
                    setInSectionSelectionMode(true);
                  }}
                  isAssistiveLayerActive={settings.isEnabled}
                />
              </div>
            )}

            {activeSiteKey === 'university' && (
              <UniversityPortalWebsite
                sections={universitySections}
                activeSectionId={currentSection?.id || null}
                activeControlId={currentControl?.id || null}
                inSectionSelectionMode={inSectionSelectionMode}
                onControlClick={executeControlAction}
                onSectionClick={(sec) => {
                  const idx = universitySections.findIndex((s) => s.id === sec.id);
                  if (idx !== -1) {
                    setCurrentSectionIndex(idx);
                    setInSectionSelectionMode(false);
                    setCurrentControlIndex(0);
                  }
                }}
                onBackToSections={handleBackToSections}
                formSubmitted={formSubmitted}
                onResetForm={() => setFormSubmitted(false)}
                isAssistiveLayerActive={settings.isEnabled}
              />
            )}

            {activeSiteKey === 'clinic' && (
              <ClinicPortalWebsite
                sections={clinicSections}
                activeSectionId={currentSection?.id || null}
                activeControlId={currentControl?.id || null}
                inSectionSelectionMode={inSectionSelectionMode}
                onControlClick={executeControlAction}
                onSectionClick={(sec) => {
                  const idx = clinicSections.findIndex((s) => s.id === sec.id);
                  if (idx !== -1) {
                    setCurrentSectionIndex(idx);
                    setInSectionSelectionMode(false);
                    setCurrentControlIndex(0);
                  }
                }}
                onBackToSections={handleBackToSections}
                bookedSuccess={clinicBooked}
                onReset={() => setClinicBooked(false)}
                isAssistiveLayerActive={settings.isEnabled}
              />
            )}

            {activeSiteKey === 'sandbox' && (
              <UniversityPortalWebsite
                sections={sandboxSections}
                activeSectionId={currentSection?.id || null}
                activeControlId={currentControl?.id || null}
                inSectionSelectionMode={inSectionSelectionMode}
                onControlClick={executeControlAction}
                onSectionClick={(sec) => {
                  const idx = sandboxSections.findIndex((s) => s.id === sec.id);
                  if (idx !== -1) {
                    setCurrentSectionIndex(idx);
                    setInSectionSelectionMode(false);
                    setCurrentControlIndex(0);
                  }
                }}
                onBackToSections={handleBackToSections}
                formSubmitted={formSubmitted}
                onResetForm={() => setFormSubmitted(false)}
                isAssistiveLayerActive={settings.isEnabled}
              />
            )}
          </div>

          {/* Embedded Chrome Extension Popup Sidebar */}
          {isPopupOpen && (
            <aside className="lg:col-span-4 sticky top-20 z-20">
              <ExtensionPopup
                settings={settings}
                onUpdateSettings={setSettings}
                detectedElementsCount={allControls.length}
                sectionsCount={currentSections.length}
                switchClicksCount={switchPressCount}
                onOpenAudit={() => setIsAuditOpen(true)}
                onOpenExport={() => setIsExportOpen(true)}
                onTriggerManualKeyboard={() =>
                  setKeyboardState({
                    isOpen: true,
                    targetControlId: 'field_student_id',
                    targetSectionId: 'sec_student_info',
                    initialValue: 'STU-8821',
                    label: 'Student ID Number (Manual Test)',
                  })
                }
                onClose={() => setIsPopupOpen(false)}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Docked Accessibility Utility Bar (Persistent bottom dock) */}
      <AccessibilityUtilityBar
        settings={settings}
        onUpdateSettings={setSettings}
        activeLabel={activeLabel}
        activeRole={activeRole}
        onTriggerSwitch={handleSwitchTrigger}
        onOpenPopup={() => setIsPopupOpen((o) => !o)}
        onOpenAudit={() => setIsAuditOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenKeyboard={() =>
          setKeyboardState({
            isOpen: true,
            targetControlId: 'field_full_name',
            targetSectionId: 'sec_student_info',
            initialValue: 'Alex Rivera',
            label: 'Student Full Name',
          })
        }
      />

      {/* Single-Switch On-Screen Keyboard Modal */}
      <OnScreenKeyboard
        isOpen={keyboardState.isOpen}
        initialValue={keyboardState.initialValue}
        fieldLabel={keyboardState.label}
        scanIntervalMs={settings.scanIntervalMs}
        audioSpeech={settings.audioSpeech}
        soundChimes={settings.soundChimes}
        onCommit={(newValue) => {
          if (keyboardState.targetControlId) {
            handleUpdateControlValue(keyboardState.targetControlId, newValue);
          }
          setKeyboardState((prev) => ({ ...prev, isOpen: false }));
        }}
        onClose={() => setKeyboardState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Accessibility Audit & 3 Problems Report Modal */}
      <AccessibilityAuditPanel
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        isAssistiveLayerActive={settings.isEnabled}
        onToggleAssistiveLayer={(active) => setSettings((s) => ({ ...s, isEnabled: active }))}
        formSubmissionCompleted={formSubmitted}
      />

      {/* Extension Manifest V3 ZIP Exporter Modal */}
      <ExtensionExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}
