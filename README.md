<div align="center">

# ♿ AccessScan

### Universal Single-Switch Browser Assistant

**A Chrome Extension that lets people with severe motor impairments navigate any website using just one physical switch.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Playwright](https://img.shields.io/badge/Tests-Playwright-45ba4b?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

> 🏆 Built for the **Hands-off — Accessibility** Hackathon Track  
> 🎯 Goal: Make ANY existing website usable with a single key press

<br/>

![AccessScan Demo](https://via.placeholder.com/800x400/1a1a2e/FF6B35?text=AccessScan+Demo+GIF+%E2%80%94+Replace+with+actual+recording)

</div>

---

## 📖 Table of Contents

- [What is AccessScan?](#-what-is-accessscan)
- [Who is it for?](#-who-is-it-for)
- [Features](#-features)
- [How it works](#-how-it-works)
- [Project Structure](#-project-structure)
- [Installation](#-installation-load-unpacked)
- [Usage Guide](#-usage-guide)
- [On-Screen Keyboard](#️-on-screen-keyboard)
- [Settings](#-settings)
- [Running Tests](#-running-tests)
- [Architecture](#-architecture)
- [Hackathon Context](#-hackathon-context)
- [What's Done vs What's Next](#-whats-done-vs-whats-next)
- [Contributing](#-contributing)

---

## 💡 What is AccessScan?

AccessScan is a **Chrome browser extension** that creates an accessibility layer on top of ANY existing website — without requiring changes to the site's source code.

It works by:
1. **Automatically detecting** all interactive elements on the page (buttons, links, inputs, checkboxes, menus)
2. **Highlighting them one by one** at a configurable speed
3. Letting the user **activate the highlighted element** by pressing a single key or physical switch

This means someone who **cannot use a mouse** and has **limited keyboard ability** can still log into websites, fill forms, click buttons, and navigate menus — using just **one input**.

---

## 👥 Who is it for?

| User Group | How AccessScan Helps |
|---|---|
| People with **severe motor impairments** | Operate websites with a single switch/foot pedal/sip-puff device |
| People with **limited hand mobility** | Reduce the physical actions needed to navigate a page |
| Users of **assistive switch hardware** | Compatible with any device that maps to a keyboard key |
| People who **cannot use a mouse** | Full website navigation using keyboard scanning |

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔄 **Auto-Scanning** | Highlights elements sequentially at 0.4s – 5s intervals (configurable) |
| 🎮 **Single-Switch Control** | Any keyboard key can be the "switch" — default is `Space` |
| ⏸ **Pause / Resume** | `Escape` key pauses and resumes scanning instantly |
| ⬅️➡️ **Manual Navigation** | Arrow keys let you jump forward/backward without waiting |
| ⚡ **Hierarchical Scanning** | Scans page *sections* first → then elements inside — drastically faster on complex pages |
| ⌨️ **On-Screen Keyboard (OSK)** | Automatically opens when a text field is selected |
| 🔤 **5 OSK Layouts** | QWERTY / ABC / Numeric / Email / Symbols |
| 🔢 **2-Level OSK Scanning** | Scan by *row* first, then *key* — reduces switch presses per character |
| 🔊 **Audio Feedback** | Short beep tones on select/pause using Web Audio API |
| ♿ **Screen Reader Ready** | ARIA live regions announce every highlighted element |
| 🔁 **Dynamic Content** | MutationObserver watches for JavaScript-rendered elements |
| 🌐 **Works Everywhere** | No website modifications needed — pure browser overlay |

---

## ⚙️ How it Works

### 1. Flat Scanning (default)
```
[Login Button] → [Username Field] → [Password Field] → [Submit] → [Forgot Password?] → ...
      ↑                                                                                   |
      └───────────────────────────── wraps around ────────────────────────────────────────┘
```
Every interactive element is scanned in DOM order. Press `Space` on the one you want.

### 2. Hierarchical Scanning (faster for complex pages)
```
Step 1 — Scan SECTIONS:
  [ 📌 Navigation ] → [ 📌 Main Form ] → [ 📌 Footer ]
                              ↓ (press Space to enter)
Step 2 — Scan ELEMENTS inside selected section:
  [Username] → [Password] → [Department] → [Submit]
                                                ↓ (press Space to activate)
                     ← (press Backspace to go back to sections)
```

### 3. Text Entry with OSK
When a text field is selected, the On-Screen Keyboard slides up:
```
Space pressed on "Username Field"
        ↓
OSK opens in QWERTY layout
        ↓
Scan rows: [q-w-e-r-t-y...] → [a-s-d-f-g-h...] → [z-x-c-v...]
        ↓ (Space selects a row)
Scan keys inside row: q → w → e → r → t → y
        ↓ (Space selects the key)
Character typed ✓
```

---

## 📁 Project Structure

```
accessscan/
│
├── manifest.json                    # Chrome Extension Manifest V3 config
├── package.json                     # Dev dependencies (Playwright)
├── playwright.config.js             # Test runner configuration
├── README.md                        # This file
│
├── src/
│   ├── background/
│   │   └── service-worker.js        # Settings storage, cross-tab messaging
│   │
│   ├── content/                     # Injected into every webpage
│   │   ├── scanner.js               # Finds interactive DOM elements
│   │   ├── highlighter.js           # Renders floating highlight ring + ARIA
│   │   ├── hierarchy.js             # HierarchyManager (sections → elements)
│   │   ├── input-handler.js         # Key capture + Web Audio API beeps
│   │   ├── main.js                  # Master state machine & orchestrator
│   │   └── content.css              # Page-injected styles (animations etc.)
│   │
│   ├── popup/                       # Extension toolbar popup
│   │   ├── popup.html               # Settings UI layout
│   │   ├── popup.css                # Popup styles (dark theme)
│   │   └── popup.js                 # Form logic, key capture, save/reset
│   │
│   ├── keyboard/                    # On-Screen Keyboard (runs in iframe)
│   │   ├── keyboard.html            # OSK shell
│   │   ├── keyboard.css             # OSK dark UI styles
│   │   └── keyboard.js              # 5 layouts + hierarchical row→key scan
│   │
│   └── icons/                       # Extension icons
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
│
└── tests/
    ├── demo-page.html               # Realistic college portal test page
    └── accessscan.test.js           # Playwright automated test suite
```

---

## 🚀 Installation (Load Unpacked)

> **Prerequisites:** Google Chrome browser

### Step 1 — Download / Clone

```bash
git clone https://github.com/Mohan13570/accessscan.git
cd accessscan
```

### Step 2 — Load into Chrome

1. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```

2. Enable **Developer Mode** toggle in the top-right corner

3. Click **"Load unpacked"**

4. Select the `accessscan/` folder you just cloned

5. The AccessScan card appears ✅

### Step 3 — Pin to toolbar

1. Click the 🧩 puzzle icon in Chrome toolbar
2. Find **AccessScan** and click 📌 to pin it

---

## 🎮 Usage Guide

### Starting the scanner

1. Navigate to any webpage
2. Click the **♿ AccessScan** icon in the toolbar
3. Toggle **Scanner** to **ON**
4. An orange glowing highlight ring starts moving across elements

### Controls

| Key | Action |
|---|---|
| `Space` | ✅ Select / activate highlighted element |
| `Escape` | ⏸ Pause scanning / ▶ Resume scanning |
| `→` Arrow | Skip to next element immediately |
| `←` Arrow | Go back to previous element |
| `Backspace` | 🔼 Go back to section level (hierarchical mode only) |

### Demo — Fill a login form without a mouse

1. Enable AccessScan on the [demo page](tests/demo-page.html)
2. Wait for scanner to reach **"Student ID / Username"** → press `Space`
3. On-Screen Keyboard opens → scan rows → pick characters to type your name
4. Press `Space` on **✓ Done** to close keyboard
5. Scanner resumes → reaches **Password** field → repeat
6. Scanner reaches **Login button** → press `Space`
7. ✅ Form submitted — entire task done with one key!

---

## ⌨️ On-Screen Keyboard

The OSK auto-opens when any text input is selected. It uses **2-level hierarchical scanning**:

```
Level 1 — Row scanning:
  ┌──────────────────────────────────┐
  │  [q w e r t y u i o p]  ← highlighted row
  │   a s d f g h j k l
  │   z x c v b n m ⌫
  │   ?123  _  [   SPACE   ]  .  ✓
  └──────────────────────────────────┘
  Press Space → enters this row

Level 2 — Key scanning inside row:
  q → w → e → r → t → y → ...
  Press Space → types that character
```

### Available Layouts

| Layout | When it opens | Access |
|---|---|---|
| **QWERTY** | Text fields (default) | Automatic |
| **Numeric** | `type="number"` or `type="tel"` | Automatic |
| **Email** | `type="email"` | Automatic |
| **ABC** | Manual | Tap ABC button |
| **Symbols** | Manual | Tap ?123 button |

### OSK Controls

| Button | Action |
|---|---|
| `⌫` | Backspace — delete last character |
| `⎵ Space` | Insert a space |
| `⇧` | Shift — next character uppercase |
| `✕ Clear` | Erase all text in the field |
| `✓ Done` | Close keyboard, return to page scanning |

---

## ⚙️ Settings

Click the extension icon to open settings:

| Setting | Default | Options |
|---|---|---|
| **Scan Mode** | Flat | Flat / Hierarchical |
| **Scan Speed** | 1500ms | 400ms – 5000ms |
| **Switch Key** | Space | Any key (click Change → press key) |
| **Pause Key** | Escape | Escape / F1 / F2 / Pause |
| **Highlight Colour** | Orange `#FF6B35` | Any colour |
| **Border Width** | Medium | Thin / Medium / Thick |
| **Audio Feedback** | On | On / Off |

Settings are saved to `chrome.storage.sync` — they persist across sessions and sync across devices if you're signed into Chrome.

---

## 🧪 Running Tests

### Prerequisites

```bash
npm install
npx playwright install chromium
```

### Run the test suite

```bash
# Run all tests
npm test

# Run with Playwright UI (visual debugging)
npm run test:ui

# Run with visible browser window
npm run test:headed
```

### What the tests cover

| Test Suite | Tests |
|---|---|
| **Core Scanning** | `collectFlatElements`, `collectHierarchicalSections`, `isVisible` |
| **Highlighter** | Overlay ring creation, `clearHighlight`, `getElementLabel` |
| **Hierarchy Manager** | Section loading, `selectSection`, level transitions |
| **Form Interaction** | Text insertion simulation, form submission |
| **Accessibility** | `aria-hidden` on ring, `aria-live` on announce region |

> ⚠️ Tests require `headless: false` because Chrome extensions don't run in headless mode.

### Open the demo page manually

Just open `tests/demo-page.html` in Chrome with the extension loaded. It simulates a college portal with:
- Login form (username, password, department, checkbox)
- Action buttons
- Dashboard cards (role="button")
- Contact form (name, email, phone, textarea)
- FAQ accordion (details/summary elements)

---

## 🏛️ Architecture

### State Machine

```
         Toggle ON
  IDLE ──────────────→ SCANNING
   ↑                    ↓    ↑
   │    Toggle OFF     Escape │ Escape
   └──────────────── PAUSED  ┘
                       ↓
              Text field selected
                       ↓
                   OSK_OPEN
                       ↓
              Done / Close OSK
                       ↓
                   SCANNING (resumes)
```

### Content Script Communication

```
popup.js ──SAVE_SETTINGS──→ service-worker.js ──SETTINGS_UPDATED──→ content scripts
                                    ↑
popup.js ──GET_SETTINGS──────────────┘

keyboard iframe ──postMessage(OSK_CHAR)──→ main.js ──insertChar()──→ input field
keyboard iframe ──postMessage(OSK_DONE)──→ main.js ──closeOSK()──→ resume scanning
```

### Element Selection Priority (for labels)

```
aria-label → aria-labelledby → <label for=""> → wrapping <label> 
→ placeholder → textContent → type description
```

---

## 🏆 Hackathon Context

**Track:** Hands-off — Accessibility  
**Team:** AccessScan  
**Goal:** Improve accessibility of existing websites without modifying their source code

### The 3 Accessibility Problems we address

1. **No single-switch support** — Standard websites are built for mouse/full keyboard users. Someone with a single switch has no way to navigate them.

2. **Unlabelled interactive controls** — Many buttons/inputs lack `aria-label`, making them unidentifiable to assistive technology. Our highlighter reads the DOM deeply to always produce a human-readable name.

3. **Text entry barrier** — Even if navigation is solved, entering text (name, email, password) is impossible without full keyboard access. Our OSK with hierarchical scanning solves this.

### Demonstration Script (for judges)

1. Show target website — no accessible path without mouse ❌
2. Enable AccessScan → orange highlight ring appears ✅  
3. Use hierarchical mode → navigate directly to the form section  
4. Select Username field → OSK opens  
5. Scan rows → pick letters → type name  
6. Select Password, Department, Login button  
7. Full form submitted — **zero mouse usage** ✅
8. Compare time before vs after AccessScan

---

## ✅ What's Done vs 🔲 What's Next

### ✅ Completed (v1.0.0)

- [x] Sequential flat scanning with configurable interval
- [x] Hierarchical section-first scanning
- [x] Single-switch key activation
- [x] Pause / Resume / Manual navigation
- [x] On-Screen Keyboard with 5 layouts
- [x] 2-level OSK row → key hierarchical scanning
- [x] Auto-detect text vs. non-text elements
- [x] Audio beep feedback (Web Audio API)
- [x] ARIA live region announcements (screen reader compatible)
- [x] MutationObserver for dynamic/AJAX content
- [x] Full settings popup (speed, key, colour, mode)
- [x] Key capture for switch key configuration
- [x] Settings sync via `chrome.storage.sync`
- [x] Playwright automated test suite (12 tests)
- [x] Realistic college portal demo page

### 🔲 Planned / In Progress (v1.1.0)

- [ ] **Predictive text** in OSK (reduce keystrokes for common words)
- [ ] **Word suggestion bar** above OSK keyboard
- [ ] **Custom icon** (replace placeholder with wheelchair accessibility icon)
- [ ] **Before/after demo video** recording
- [ ] **Real website accessibility audit** (choose target, document 3 issues)
- [ ] **NVDA screen reader** compatibility testing and fixes
- [ ] **Select element OSK** — scan options in a `<select>` dropdown
- [ ] **Scroll scanning** — scan page up/down as an option
- [ ] **Firefox support** — port to WebExtensions
- [ ] **Switch debouncing** — ignore accidental double-press
- [ ] **Dwell selection** — auto-select after N seconds hovering (no key needed)

### 🔲 Stretch Goals

- [ ] Voice-activated switch (Web Speech API)
- [ ] Eye-tracking integration
- [ ] Cloud sync for custom word lists / layouts

---

## 🤖 Working with AI Assistants (Antigravity / Gemini / Claude)

This repo is structured so that any AI assistant can immediately understand the full project and continue work. Here's the context you can paste:

```
Project: AccessScan — Chrome Extension (Manifest V3)
Purpose: Accessibility tool for single-switch users with motor impairments
Built with: Vanilla JS, HTML, CSS — no external libraries
Key files:
  - src/content/main.js     → Master state machine (IDLE/SCANNING/PAUSED/OSK_OPEN)
  - src/content/scanner.js  → DOM element collection
  - src/keyboard/keyboard.js → On-screen keyboard with 2-level hierarchical scanning
  - src/popup/popup.js      → Settings UI

Current status: v1.0.0 complete. See README "What's Next" section for pending tasks.
Test page: tests/demo-page.html (realistic college portal)
Run tests: npm install && npx playwright install chromium && npm test
```

---

## 📄 License

MIT License — free to use, modify, and build upon.

---

## 🙏 Acknowledgements

- Built for the **Hackathon Accessibility Track** with the goal of making the web more inclusive
- Inspired by real AAC (Augmentative and Alternative Communication) tools
- WCAG 2.1 guidelines used as the accessibility reference standard
- Thanks to all people with disabilities whose feedback shaped this design

---

<div align="center">

**♿ Making the web accessible — one switch press at a time.**

*If you find this useful, please ⭐ star the repo and share it with accessibility communities.*

</div>
