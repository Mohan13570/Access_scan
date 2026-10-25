# access scan1 — Universal Single-Switch Browser Assistant
### Chrome Browser Extension (Manifest V3)

**access scan1** is an assistive Chrome browser extension designed for individuals with severe motor impairments. It enables full, hands-off website navigation, control selection, and text entry using a single switch (e.g. Spacebar or physical switch assist device).

---

## 🚀 Quick Start & Installation

1. Open your Chromium browser (Chrome, Edge, Brave) and navigate to `chrome://extensions`.
2. Turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select this directory:
   ```
   C:\Users\MOHAN G\.gemini\antigravity\scratch\accessscan\access_scan1
   ```
5. Done! Open any webpage, and `access scan1` will automatically activate and begin scanning.

---

## 🎮 How to Operate

| Input / Key | Action |
| :--- | :--- |
| **Spacebar** | **Universal Switch Trigger:** Enters a section, selects a highlighted control, or chooses row/key in virtual keyboard. |
| **P** | **Pause / Resume:** Temporarily halts auto-scanning. |
| **Esc** | **Back / Escape:** Exits the virtual keyboard or returns to top-level section scanning. |
| **Dock Buttons** | Click the floating **SWITCH (SPACE)** or **PAUSE (P)** buttons directly from the on-page dock. |

---

## 🌟 Key Features

1. **Semantic Hierarchical Scanning:**
   Groups web page controls into intuitive landmark sections (*Navigation & Header*, *Main Forms & Content*, *Sidebar & Tools*, *Footer & Links*), cutting traversal time by up to 90%.
2. **Dual-Ring Assistive Reticle:**
   High-contrast amber and white focus rings with smooth pulsing animation, designed for low vision and motor impairment.
3. **In-Page Single-Switch Virtual Keyboard:**
   Automatically activates on editable fields (usernames, search boxes, passwords, textareas). Scans row-by-row, then key-by-key, with quick word suggestions (`alex`, `student`, `submit`, `email`) and password masking.
4. **Auditory & Voice Feedback:**
   Integrated Web Audio API synthesizer chime cues + SpeechSynthesis voice announcements for screen reader compatibility.
5. **Floating Bottom Assistive Dock HUD:**
   A sleek, non-intrusive bottom HUD displaying the active target, switch status, and physical switch trigger button.
