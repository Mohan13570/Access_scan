/**
 * AccessScan — Hierarchy Manager
 *
 * Manages hierarchical scanning state:
 *   Level 0 → scanning sections
 *   Level 1 → scanning elements within the selected section
 */

'use strict';

window.AccessScan = window.AccessScan || {};

class HierarchyManager {
  constructor() {
    /** @type {'sections'|'elements'} */
    this.level = 'sections';
    /** @type {Array<{label: string, el: Element|null, children: Element[]}>} */
    this.sections = [];
    /** @type {number} */
    this.sectionIndex = 0;
    /** @type {Element[]} */
    this.currentElements = [];
    /** @type {number} */
    this.elementIndex = 0;
  }

  /**
   * Initialize with fresh section data from the scanner.
   */
  load() {
    this.sections = window.AccessScan.Scanner.collectHierarchicalSections();
    this.sectionIndex = 0;
    this.level = 'sections';
    this.currentElements = [];
    this.elementIndex = 0;
  }

  /**
   * Whether we are currently scanning sections (true) or elements (false).
   */
  get isAtSectionLevel() {
    return this.level === 'sections';
  }

  /**
   * Current section being highlighted.
   * @returns {{label: string, el: Element|null, children: Element[]}|null}
   */
  get currentSection() {
    return this.sections[this.sectionIndex] ?? null;
  }

  /**
   * Current element being highlighted (within selected section).
   * @returns {Element|null}
   */
  get currentElement() {
    return this.currentElements[this.elementIndex] ?? null;
  }

  /**
   * Advance to the next section (wraps around).
   */
  nextSection() {
    if (this.sections.length === 0) return;
    this.sectionIndex = (this.sectionIndex + 1) % this.sections.length;
  }

  /**
   * Advance to the next element within the selected section (wraps around).
   */
  nextElement() {
    if (this.currentElements.length === 0) return;
    this.elementIndex = (this.elementIndex + 1) % this.currentElements.length;
  }

  /**
   * Select the current section — dive into its elements.
   */
  selectSection() {
    const section = this.currentSection;
    if (!section) return;
    this.currentElements = section.children;
    this.elementIndex = 0;
    this.level = 'elements';
  }

  /**
   * Go back up to section level.
   */
  backToSections() {
    this.level = 'sections';
    this.currentElements = [];
    this.elementIndex = 0;
  }

  /**
   * Advance to next item at current level.
   */
  advance() {
    if (this.level === 'sections') {
      this.nextSection();
    } else {
      this.nextElement();
    }
  }
}

window.AccessScan.HierarchyManager = HierarchyManager;
