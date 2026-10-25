/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScanningMode = 'sequential' | 'hierarchical';

export type SwitchTriggerType = 'space' | 'enter' | 'any_key' | 'click' | 'dwell';

export type ReticleStyle = 'amber_dual' | 'indigo_dual' | 'high_contrast' | 'pulse';

export interface InteractiveControl {
  id: string;
  sectionId: string;
  type: 'button' | 'input' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'link';
  label: string;
  role: string;
  placeholder?: string;
  value?: string;
  options?: string[];
  helpText?: string;
}

export interface WebpageSection {
  id: string;
  title: string;
  iconName: string;
  description: string;
  controls: InteractiveControl[];
}

export interface AccessibilityIssue {
  id: string;
  code: string;
  wcagCriterion: string;
  level: 'A' | 'AA' | 'AAA';
  title: string;
  impact: 'Critical' | 'Severe' | 'Moderate';
  description: string;
  beforeAccessScan: {
    problem: string;
    stepsToComplete: number;
    timeRequired: string;
    painPoint: string;
  };
  afterAccessScan: {
    solution: string;
    stepsToComplete: number;
    timeRequired: string;
    improvement: string;
  };
}

export interface AccessScanSettings {
  isEnabled: boolean;
  isPaused: boolean;
  mode: ScanningMode;
  scanIntervalMs: number;
  trigger: SwitchTriggerType;
  dwellTimeMs: number;
  audioSpeech: boolean;
  soundChimes: boolean;
  reticleStyle: ReticleStyle;
  highContrast: boolean;
  largeText: boolean;
  activeKeyboard: boolean;
  activeTargetControlId: string | null;
}
