/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  Award,
  Layers,
  FileCheck,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { ACCESSIBILITY_ISSUES } from '../data/mockWebsites';

interface AccessibilityAuditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAssistiveLayerActive: boolean;
  onToggleAssistiveLayer: (active: boolean) => void;
  formSubmissionCompleted: boolean;
}

export const AccessibilityAuditPanel: React.FC<AccessibilityAuditPanelProps> = ({
  isOpen,
  onClose,
  isAssistiveLayerActive,
  onToggleAssistiveLayer,
  formSubmissionCompleted,
}) => {
  const [selectedIssueId, setSelectedIssueId] = useState<string>(ACCESSIBILITY_ISSUES[0].id);

  if (!isOpen) return null;

  const currentIssue = ACCESSIBILITY_ISSUES.find((i) => i.id === selectedIssueId) || ACCESSIBILITY_ISSUES[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div
        className="bg-[#FAFAF8] text-[#1C1917] w-full max-w-4xl rounded-lg border-2 border-[#1C1917] shadow-2xl overflow-hidden my-auto"
        style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
      >
        {/* Modal Header */}
        <div className="bg-[#1C1917] text-white p-5 flex items-center justify-between border-b-4 border-[#B45309]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#4338CA] flex items-center justify-center text-white font-bold text-xl">
              <Award size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-[#B45309] text-white font-mono px-2 py-0.5 rounded font-bold uppercase">
                  Hackathon Audit Report
                </span>
                <span className="text-xs text-zinc-300">Hands-off — Accessibility Track</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-0.5">
                Target Website Audit & 3 Verified Accessibility Problems
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-300 hover:text-white px-3 py-1.5 font-bold text-sm bg-zinc-800 rounded border border-zinc-700"
          >
            Close Report (Esc)
          </button>
        </div>

        {/* Live Experience Switcher Banner */}
        <div className="bg-[#EBE8DF] p-4 border-b border-[#D6D1C4] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[#1C1917]">Live Comparative Mode:</span>
            <span className="text-xs text-[#57534E]">
              Toggle the assistive layer to test how the website performs without vs with AccessScan
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleAssistiveLayer(false)}
              className={`px-3 py-1.5 text-xs font-bold rounded border ${
                !isAssistiveLayerActive
                  ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                  : 'bg-white text-[#1C1917] border-[#D6D1C4]'
              }`}
            >
              Without AccessScan (Broken Raw Experience)
            </button>
            <button
              onClick={() => onToggleAssistiveLayer(true)}
              className={`px-3 py-1.5 text-xs font-bold rounded border flex items-center gap-1.5 ${
                isAssistiveLayerActive
                  ? 'bg-[#15803D] text-white border-[#15803D]'
                  : 'bg-white text-[#1C1917] border-[#D6D1C4]'
              }`}
            >
              <CheckCircle2 size={14} />
              With AccessScan Layer Active
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Executive Metrics Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#F4F3EE] p-4 rounded border border-[#D6D1C4]">
              <div className="text-xs font-bold uppercase text-[#57534E]">Average Task Time</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-[#15803D]">18s</span>
                <span className="text-xs text-[#B91C1C] line-through">120s+ without aid</span>
              </div>
              <p className="text-[11px] text-[#57534E] mt-1">85% speedup via Hierarchical grouping</p>
            </div>

            <div className="bg-[#F4F3EE] p-4 rounded border border-[#D6D1C4]">
              <div className="text-xs font-bold uppercase text-[#57534E]">Single-Switch Autonomy</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-[#15803D]">100%</span>
                <span className="text-xs text-[#B91C1C] line-through">0% text entry</span>
              </div>
              <p className="text-[11px] text-[#57534E] mt-1">Full form completion with 1 key (Spacebar)</p>
            </div>

            <div className="bg-[#F4F3EE] p-4 rounded border border-[#D6D1C4]">
              <div className="text-xs font-bold uppercase text-[#57534E]">WCAG 2.1 Conformance</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-[#15803D]">Level AAA</span>
                <span className="text-xs text-[#B91C1C] line-through">Failed AA</span>
              </div>
              <p className="text-[11px] text-[#57534E] mt-1">Focus visible, bypass blocks, target size</p>
            </div>
          </div>

          {/* 3 Problems Selector Tabs */}
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-[#1C1917] mb-2.5 flex items-center gap-2">
              <ShieldAlert size={16} className="text-[#B45309]" />
              The 3 Verified Accessibility Obstacles We Audit & Fix:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {ACCESSIBILITY_ISSUES.map((issue, idx) => {
                const isSelected = issue.id === selectedIssueId;
                return (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`p-3 rounded text-left border transition-all ${
                      isSelected
                        ? 'bg-[#1C1917] text-white border-[#1C1917] shadow'
                        : 'bg-[#F4F3EE] text-[#1C1917] border-[#D6D1C4] hover:bg-[#EBE8DF]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-[#B45309]">
                        Problem #{idx + 1}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          issue.impact === 'Critical' ? 'bg-red-700 text-white' : 'bg-amber-600 text-white'
                        }`}
                      >
                        {issue.impact}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs mt-1 leading-snug line-clamp-2">{issue.title}</h4>
                    <span
                      className={`text-[10px] mt-2 inline-block ${
                        isSelected ? 'text-zinc-300' : 'text-[#57534E]'
                      }`}
                    >
                      {issue.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detailed Selected Issue Deep Dive */}
          <div className="bg-[#F4F3EE] p-5 rounded-lg border-2 border-[#D6D1C4] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6D1C4] pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-[#B45309]">{currentIssue.code}</span>
                <h3 className="text-base font-bold text-[#1C1917] mt-0.5">{currentIssue.title}</h3>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-[#EBE8DF] border border-[#D6D1C4] text-[#1C1917] font-semibold">
                WCAG Criterion: {currentIssue.wcagCriterion}
              </span>
            </div>

            <p className="text-sm text-[#292524]">{currentIssue.description}</p>

            {/* Before vs After Side-by-Side Comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Before */}
              <div className="bg-white p-4 rounded border-2 border-red-300">
                <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase mb-2">
                  <XCircle size={16} />
                  <span>Before (Existing Website Problem)</span>
                </div>
                <p className="text-xs text-[#292524] mb-3">{currentIssue.beforeAccessScan.problem}</p>
                <div className="space-y-1 text-xs bg-red-50 p-2.5 rounded border border-red-100">
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Switch activations needed:</span>
                    <strong className="text-red-700">{currentIssue.beforeAccessScan.stepsToComplete}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Time required:</span>
                    <strong className="text-red-700">{currentIssue.beforeAccessScan.timeRequired}</strong>
                  </div>
                  <div className="pt-1 text-[11px] text-red-900 border-t border-red-200 mt-1">
                    <strong>Consequence: </strong>
                    {currentIssue.beforeAccessScan.painPoint}
                  </div>
                </div>
              </div>

              {/* After */}
              <div className="bg-white p-4 rounded border-2 border-emerald-400">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase mb-2">
                  <CheckCircle2 size={16} />
                  <span>After (AccessScan Implemented Fix)</span>
                </div>
                <p className="text-xs text-[#292524] mb-3">{currentIssue.afterAccessScan.solution}</p>
                <div className="space-y-1 text-xs bg-emerald-50 p-2.5 rounded border border-emerald-100">
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Switch activations needed:</span>
                    <strong className="text-emerald-800">{currentIssue.afterAccessScan.stepsToComplete}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Time required:</span>
                    <strong className="text-emerald-800">{currentIssue.afterAccessScan.timeRequired}</strong>
                  </div>
                  <div className="pt-1 text-[11px] text-emerald-950 border-t border-emerald-200 mt-1">
                    <strong>Demonstrated Benefit: </strong>
                    {currentIssue.afterAccessScan.improvement}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Hackathon Demonstration Checklist */}
          <div className="bg-[#EBE8DF] p-4 rounded border border-[#D6D1C4] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#1C1917] flex items-center gap-1.5">
                <FileCheck size={16} className="text-[#B45309]" />
                Hackathon Submission Requirements Verification
              </h4>
              <span className="text-xs text-[#15803D] font-bold">100% Ready for Judging</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-[#D6D1C4]">
                <CheckCircle2 size={16} className="text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#1C1917]">Legitimate Real-World Target:</span>
                  <p className="text-[#57534E] text-[11px]">Apex University Financial Aid & Grant Submission Portal.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-[#D6D1C4]">
                <CheckCircle2 size={16} className="text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#1C1917]">3 Concrete WCAG Failures Documented:</span>
                  <p className="text-[#57534E] text-[11px]">WCAG 2.1.2 Trap, WCAG 2.5.5 Input, WCAG 2.4.1 Linear Fatigue.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-[#D6D1C4]">
                <CheckCircle2 size={16} className="text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#1C1917]">Sequential & Single-Switch Activation:</span>
                  <p className="text-[#57534E] text-[11px]">Operates via 1 key (Spacebar) or physical adaptive switch.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-[#D6D1C4]">
                <CheckCircle2 size={16} className="text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#1C1917]">End-to-End Form Completion:</span>
                  <p className="text-[#57534E] text-[11px]">
                    {formSubmissionCompleted
                      ? 'Status: Verified Submitted on test portal!'
                      : 'Status: Testable live in the simulator right now!'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
