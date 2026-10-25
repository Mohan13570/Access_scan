/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Delete, CornerDownLeft, Space, RotateCcw, Check, Sparkles, Hash, Type } from 'lucide-react';
import { playScanStepChime, playSelectChime, speakText } from '../utils/audioFeedback';

interface OnScreenKeyboardProps {
  initialValue: string;
  fieldLabel: string;
  isOpen: boolean;
  scanIntervalMs: number;
  audioSpeech: boolean;
  soundChimes: boolean;
  onCommit: (newValue: string) => void;
  onClose: () => void;
  onSwitchTriggered?: () => void;
}

type KeyboardMode = 'alpha' | 'numeric' | 'email';
type ScanLevel = 'row' | 'key';

const WORD_DICTIONARY: Record<string, string[]> = {
  '': ['Alex', 'Rivera', 'student', 'grant', 'aid', 'yes', 'confirm', 'apex.edu'],
  'a': ['Alex', 'aid', 'apply', 'assistance', 'academic', 'about'],
  'al': ['Alex', 'all', 'already', 'allow'],
  'r': ['Rivera', 'resident', 'records', 'report'],
  's': ['student', 'scholarship', 'science', 'submit', 'spring'],
  'st': ['student', 'state', 'statement', 'study'],
  'f': ['financial', 'fall', 'first', 'fees', 'forms'],
  'fin': ['financial', 'finalize', 'finance'],
  'g': ['grant', 'grade', 'graduate', 'general'],
  'c': ['computer', 'campus', 'college', 'courses'],
  'com': ['computer', 'complete', 'community'],
  'h': ['hardship', 'help', 'health', 'housing'],
  'u': ['university', 'undergraduate', 'update'],
};

export const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({
  initialValue,
  fieldLabel,
  isOpen,
  scanIntervalMs,
  audioSpeech,
  soundChimes,
  onCommit,
  onClose,
}) => {
  const [typedText, setTypedText] = useState(initialValue);
  const [mode, setMode] = useState<KeyboardMode>('alpha');
  const [scanLevel, setScanLevel] = useState<ScanLevel>('row');
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [hierarchicalScan, setHierarchicalScan] = useState(true);

  // Sync initial value when opened
  useEffect(() => {
    if (isOpen) {
      setTypedText(initialValue);
      setScanLevel('row');
      setSelectedRowIndex(0);
      setSelectedKeyIndex(0);
      if (audioSpeech) {
        speakText(`Keyboard open for ${fieldLabel}. Current text: ${initialValue || 'empty'}`);
      }
    }
  }, [isOpen, initialValue, fieldLabel, audioSpeech]);

  // Compute word suggestions
  const suggestions = React.useMemo(() => {
    const lastWord = typedText.split(/\s+/).pop()?.toLowerCase() || '';
    if (WORD_DICTIONARY[lastWord]) {
      return WORD_DICTIONARY[lastWord].slice(0, 5);
    }
    // Search dictionary keys that start with lastWord
    const matches: string[] = [];
    Object.keys(WORD_DICTIONARY).forEach((k) => {
      if (k.startsWith(lastWord) && k !== '') {
        matches.push(...WORD_DICTIONARY[k]);
      }
    });
    return Array.from(new Set(matches)).slice(0, 5);
  }, [typedText]);

  // Rows configuration
  const rows = React.useMemo(() => {
    if (mode === 'alpha') {
      return [
        // Row 0: Suggestions (if available)
        suggestions.length > 0
          ? suggestions.map((word) => ({ label: word, val: word + ' ', type: 'suggestion' }))
          : [{ label: 'Alex', val: 'Alex ', type: 'suggestion' }, { label: 'Rivera', val: 'Rivera ', type: 'suggestion' }],
        // Row 1: Q-P
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((k) => ({ label: k, val: k.toLowerCase(), type: 'char' })),
        // Row 2: A-L
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((k) => ({ label: k, val: k.toLowerCase(), type: 'char' })),
        // Row 3: Z-M + punctuation
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '@'].map((k) => ({ label: k, val: k.toLowerCase(), type: 'char' })),
        // Row 4: Functional controls
        [
          { label: 'SPACE', val: ' ', type: 'space' },
          { label: 'BACKSPACE', val: 'BACKSPACE', type: 'backspace' },
          { label: '123 / NUM', val: 'TOGGLE_NUM', type: 'mode' },
          { label: 'EMAIL KEYS', val: 'TOGGLE_EMAIL', type: 'mode' },
          { label: 'CLEAR', val: 'CLEAR', type: 'clear' },
          { label: 'DONE / ENTER', val: 'DONE', type: 'done' },
        ],
      ];
    } else if (mode === 'numeric') {
      return [
        ['1', '2', '3'].map((k) => ({ label: k, val: k, type: 'char' })),
        ['4', '5', '6'].map((k) => ({ label: k, val: k, type: 'char' })),
        ['7', '8', '9'].map((k) => ({ label: k, val: k, type: 'char' })),
        [
          { label: '0', val: '0', type: 'char' },
          { label: '.', val: '.', type: 'char' },
          { label: '-', val: '-', type: 'char' },
          { label: '$', val: '$', type: 'char' },
        ],
        [
          { label: 'BACKSPACE', val: 'BACKSPACE', type: 'backspace' },
          { label: 'ABC / LETTERS', val: 'TOGGLE_ALPHA', type: 'mode' },
          { label: 'CLEAR', val: 'CLEAR', type: 'clear' },
          { label: 'DONE', val: 'DONE', type: 'done' },
        ],
      ];
    } else {
      // Email mode
      return [
        ['@apex.edu', '@gmail.com', '@outlook.com', '.edu', '.com', '.org'].map((k) => ({ label: k, val: k, type: 'char' })),
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((k) => ({ label: k, val: k, type: 'char' })),
        ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'].map((k) => ({ label: k, val: k, type: 'char' })),
        ['u', 'v', 'w', 'x', 'y', 'z', '_', '.', '-'].map((k) => ({ label: k, val: k, type: 'char' })),
        [
          { label: 'BACKSPACE', val: 'BACKSPACE', type: 'backspace' },
          { label: 'ABC / LETTERS', val: 'TOGGLE_ALPHA', type: 'mode' },
          { label: 'CLEAR', val: 'CLEAR', type: 'clear' },
          { label: 'DONE', val: 'DONE', type: 'done' },
        ],
      ];
    }
  }, [mode, suggestions]);

  // Keep indices in bounds
  const safeRowIndex = Math.min(selectedRowIndex, rows.length - 1);
  const currentRow = rows[safeRowIndex] || [];
  const safeKeyIndex = Math.min(selectedKeyIndex, currentRow.length - 1);

  // Scanning loop
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      if (hierarchicalScan) {
        if (scanLevel === 'row') {
          setSelectedRowIndex((prev) => {
            const next = (prev + 1) % rows.length;
            if (soundChimes) playScanStepChime();
            return next;
          });
        } else {
          // Key scanning inside row
          setSelectedKeyIndex((prev) => {
            const maxLen = rows[safeRowIndex]?.length || 1;
            const next = (prev + 1) % maxLen;
            if (soundChimes) playScanStepChime();
            const currentItem = rows[safeRowIndex]?.[next];
            if (audioSpeech && currentItem) {
              speakText(currentItem.label);
            }
            return next;
          });
        }
      } else {
        // Flat sequential scan
        setSelectedKeyIndex((prev) => {
          const maxLen = rows[safeRowIndex]?.length || 1;
          if (prev + 1 < maxLen) {
            if (soundChimes) playScanStepChime();
            return prev + 1;
          } else {
            setSelectedRowIndex((r) => (r + 1) % rows.length);
            if (soundChimes) playScanStepChime();
            return 0;
          }
        });
      }
    }, scanIntervalMs);

    return () => clearInterval(timer);
  }, [isOpen, hierarchicalScan, scanLevel, rows, safeRowIndex, scanIntervalMs, soundChimes, audioSpeech]);

  // Execute key action
  const handleKeySelect = useCallback(
    (actionVal: string, label: string) => {
      if (soundChimes) playSelectChime();

      if (actionVal === 'DONE') {
        if (audioSpeech) speakText(`Text confirmed: ${typedText}`);
        onCommit(typedText);
        onClose();
        return;
      }

      if (actionVal === 'CLEAR') {
        setTypedText('');
        if (audioSpeech) speakText('Field cleared');
        if (hierarchicalScan) {
          setScanLevel('row');
        }
        return;
      }

      if (actionVal === 'BACKSPACE') {
        setTypedText((prev) => prev.slice(0, -1));
        if (audioSpeech) speakText('Backspace');
        return;
      }

      if (actionVal === 'TOGGLE_NUM') {
        setMode('numeric');
        setSelectedRowIndex(0);
        setSelectedKeyIndex(0);
        setScanLevel('row');
        if (audioSpeech) speakText('Switched to numbers keypad');
        return;
      }

      if (actionVal === 'TOGGLE_ALPHA') {
        setMode('alpha');
        setSelectedRowIndex(0);
        setSelectedKeyIndex(0);
        setScanLevel('row');
        if (audioSpeech) speakText('Switched to letters keyboard');
        return;
      }

      if (actionVal === 'TOGGLE_EMAIL') {
        setMode('email');
        setSelectedRowIndex(0);
        setSelectedKeyIndex(0);
        setScanLevel('row');
        if (audioSpeech) speakText('Switched to email shortcuts');
        return;
      }

      // Appending character or suggestion
      setTypedText((prev) => prev + actionVal);
      if (audioSpeech) speakText(label);

      // Return to row scanning after word selection or character
      if (hierarchicalScan && (actionVal.length > 1 || actionVal === ' ')) {
        setScanLevel('row');
        setSelectedRowIndex(0);
        setSelectedKeyIndex(0);
      }
    },
    [typedText, hierarchicalScan, soundChimes, audioSpeech, onCommit, onClose]
  );

  // Switch press handler
  const triggerSwitch = useCallback(() => {
    if (hierarchicalScan) {
      if (scanLevel === 'row') {
        // Step into selected row
        setScanLevel('key');
        setSelectedKeyIndex(0);
        if (soundChimes) playSelectChime();
        const firstItem = rows[safeRowIndex]?.[0];
        if (audioSpeech && firstItem) {
          speakText(`Selected row. First: ${firstItem.label}`);
        }
      } else {
        // Key is selected!
        const selected = rows[safeRowIndex]?.[safeKeyIndex];
        if (selected) {
          handleKeySelect(selected.val, selected.label);
        }
      }
    } else {
      const selected = rows[safeRowIndex]?.[safeKeyIndex];
      if (selected) {
        handleKeySelect(selected.val, selected.label);
      }
    }
  }, [hierarchicalScan, scanLevel, rows, safeRowIndex, safeKeyIndex, soundChimes, audioSpeech, handleKeySelect]);

  // Global switch listener (Spacebar, Enter) while keyboard is active
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space or Enter triggers switch
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        triggerSwitch();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Backspace' && e.ctrlKey) {
        // Step back out to row level
        e.preventDefault();
        setScanLevel('row');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, triggerSwitch, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5 bg-[#FAFAF8]/95 backdrop-blur-md border-t-2 border-[#1C1917] shadow-2xl">
      <div className="max-w-4xl mx-auto flex flex-col gap-3">
        {/* Top Header & Field Preview */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F4F3EE] p-3 rounded border border-[#D6D1C4]">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded bg-[#B45309] text-white font-bold text-sm">
              ⌨️
            </span>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-[#57534E]">
                Single-Switch Typing • Editing Field:
              </p>
              <h4 className="text-base font-bold text-[#1C1917]">{fieldLabel}</h4>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (scanLevel === 'key') {
                  setScanLevel('row');
                } else {
                  triggerSwitch();
                }
              }}
              className="px-4 py-2 bg-[#B45309] text-white font-bold text-xs uppercase tracking-wider rounded border border-[#1C1917] hover:bg-[#92400E] active:scale-95 transition-transform flex items-center gap-2"
            >
              <span>{scanLevel === 'row' ? 'Select Row (Space)' : 'Select Key (Space)'}</span>
            </button>

            {scanLevel === 'key' && (
              <button
                onClick={() => setScanLevel('row')}
                className="px-3 py-2 bg-[#EBE8DF] text-[#1C1917] text-xs font-semibold rounded border border-[#D6D1C4] hover:bg-[#E5E2D8]"
                title="Return to Row Scanning"
              >
                Back to Rows
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-2 bg-[#E5E2D8] text-[#1C1917] text-xs font-bold rounded border border-[#D6D1C4] hover:bg-[#D6D1C4]"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Live Input Preview Box */}
        <div className="relative flex items-center bg-white px-4 py-3 rounded border-2 border-[#1C1917]">
          <span className="text-xs font-bold text-[#57534E] mr-3 select-none">Value:</span>
          <span className="font-mono text-lg text-[#1C1917] font-semibold flex-1 tracking-wide break-all">
            {typedText || <span className="text-[#A8A29E] italic font-sans font-normal text-sm">Empty... press Space when highlighted</span>}
          </span>
          <span className="animate-pulse w-2.5 h-6 bg-[#B45309] inline-block ml-1" />
        </div>

        {/* Scanning Instructions & Mode Switcher */}
        <div className="flex items-center justify-between text-xs text-[#57534E] px-1">
          <div className="flex items-center gap-4">
            <span>
              Status: <strong className="text-[#1C1917]">{scanLevel === 'row' ? `Scanning Row ${safeRowIndex + 1} of ${rows.length}` : `Scanning Key in Row ${safeRowIndex + 1}`}</strong>
            </span>
            <span className="hidden sm:inline">
              Switch Key: <strong className="text-[#B45309]">SPACEBAR</strong> or On-Screen Click
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('alpha')}
              className={`px-2.5 py-1 rounded text-xs font-bold border ${mode === 'alpha' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-[#F4F3EE] text-[#1C1917] border-[#D6D1C4]'}`}
            >
              ABC
            </button>
            <button
              onClick={() => setMode('numeric')}
              className={`px-2.5 py-1 rounded text-xs font-bold border ${mode === 'numeric' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-[#F4F3EE] text-[#1C1917] border-[#D6D1C4]'}`}
            >
              123
            </button>
            <button
              onClick={() => setMode('email')}
              className={`px-2.5 py-1 rounded text-xs font-bold border ${mode === 'email' ? 'bg-[#1C1917] text-white border-[#1C1917]' : 'bg-[#F4F3EE] text-[#1C1917] border-[#D6D1C4]'}`}
            >
              @ Email
            </button>
          </div>
        </div>

        {/* Keyboard Matrix */}
        <div className="flex flex-col gap-2 bg-[#F4F3EE] p-2.5 sm:p-3 rounded border border-[#D6D1C4]">
          {rows.map((rowItems, rIdx) => {
            const isRowHighlighted = hierarchicalScan && scanLevel === 'row' && safeRowIndex === rIdx;
            const isRowActive = hierarchicalScan && scanLevel === 'key' && safeRowIndex === rIdx;

            return (
              <div
                key={rIdx}
                className={`flex gap-1.5 sm:gap-2 p-1 rounded transition-all ${
                  isRowHighlighted
                    ? 'ring-4 ring-[#B45309] bg-[#EBE8DF] shadow-md'
                    : isRowActive
                    ? 'bg-[#E5E2D8] border border-[#1C1917]/30'
                    : 'bg-transparent'
                }`}
              >
                {rowItems.map((item, kIdx) => {
                  const isKeyHighlighted =
                    (hierarchicalScan && scanLevel === 'key' && safeRowIndex === rIdx && safeKeyIndex === kIdx) ||
                    (!hierarchicalScan && safeRowIndex === rIdx && safeKeyIndex === kIdx);

                  const isSpecial = item.type !== 'char';

                  return (
                    <button
                      key={kIdx}
                      type="button"
                      onClick={() => handleKeySelect(item.val, item.label)}
                      className={`min-h-[48px] px-2.5 sm:px-3 py-2 rounded font-bold transition-all flex items-center justify-center text-center select-none ${
                        item.type === 'suggestion'
                          ? 'flex-1 bg-amber-50 text-[#78350F] border border-amber-200 text-xs sm:text-sm'
                          : isSpecial
                          ? 'flex-1 bg-[#EBE8DF] text-[#1C1917] border border-[#D6D1C4] text-xs'
                          : 'flex-1 bg-white text-[#1C1917] border border-[#D6D1C4] text-sm sm:text-base font-mono'
                      } ${
                        isKeyHighlighted
                          ? 'scan-focus-control bg-[#B45309] text-white font-extrabold shadow-lg scale-105 z-20'
                          : 'hover:border-[#1C1917]'
                      }`}
                    >
                      {item.type === 'backspace' ? (
                        <span className="flex items-center gap-1">
                          <Delete size={14} /> Back
                        </span>
                      ) : item.type === 'done' ? (
                        <span className="flex items-center gap-1 font-bold text-[#15803D]">
                          <Check size={14} /> Commit
                        </span>
                      ) : item.type === 'suggestion' ? (
                        <span className="flex items-center gap-1">
                          <Sparkles size={12} className="text-[#B45309]" /> {item.label}
                        </span>
                      ) : (
                        item.label
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
