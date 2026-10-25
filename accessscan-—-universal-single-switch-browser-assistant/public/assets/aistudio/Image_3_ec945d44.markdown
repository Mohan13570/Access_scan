---
name: Warm Assistive Minimal
colors:
  surface: '#fff8f5'
  surface-dim: '#e2d8d2'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fcf2eb'
  surface-container: '#f6ece6'
  surface-container-high: '#f0e6e0'
  surface-container-highest: '#eae1da'
  on-surface: '#1f1b17'
  on-surface-variant: '#4d4540'
  inverse-surface: '#342f2b'
  inverse-on-surface: '#f9efe8'
  outline: '#7e7570'
  outline-variant: '#d0c4be'
  surface-tint: '#625d5b'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1e1b19'
  on-primary-container: '#888380'
  inverse-primary: '#ccc5c2'
  secondary: '#9b4500'
  on-secondary: '#ffffff'
  secondary-container: '#fd8a42'
  on-secondary-container: '#682c00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#100069'
  on-tertiary-container: '#7771ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9e1dd'
  primary-fixed-dim: '#ccc5c2'
  on-primary-fixed: '#1e1b19'
  on-primary-fixed-variant: '#4a4643'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb68e'
  on-secondary-fixed: '#331200'
  on-secondary-fixed-variant: '#763300'
  tertiary-fixed: '#e3dfff'
  tertiary-fixed-dim: '#c3c0ff'
  on-tertiary-fixed: '#100069'
  on-tertiary-fixed-variant: '#372abf'
  background: '#fff8f5'
  on-background: '#1f1b17'
  surface-variant: '#eae1da'
typography:
  display-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-xl:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-xl-mobile:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: 0em
  headline-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-xl:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0.005em
  body-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0.005em
  label-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.025em
  label-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.03em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

This design system is engineered for assistive clarity, cognitive ease, and radical accessibility without feeling clinical or institutional. It marries warm architectural minimalism with uncompromising assistive functionalism. 

The aesthetic is grounded, serene, and tactile. By trading sterile optical whites and harsh blue-light greys for porcelain, alabaster, and warm limestone surfaces, the interface reduces visual fatigue during extended switch-access, screen-magnification, or high-focus navigation sessions. 

Key attributes:
- **Calm & Dignified**: Replaces patronizing, overt "accessibility mode" tropes with elegant, gallery-grade warmth.
- **Instant Optical Legibility**: Strict WCAG AAA compliance across every visual touchpoint, ensuring readability under low vision, glare, and neurodivergent processing contexts.
- **Tactile Spatial Orientation**: Heavy interactive borders, luminous ambient focus states, and deliberate structural containers provide physical grounding and clear affordances.

## Colors

The palette relies on high tonal separation between warm neutral foundations and crisp ink foregrounds, accented by unambiguous assistive signifiers.

### Surfaces & Backgrounds
- **Canvas Base**: `#FAFAF8` (Porcelain Off-White) — Primary page background; avoids stark optical glare.
- **Surface Level 1**: `#F4F3EE` (Warm Alabaster) — Primary container background and structural panels.
- **Surface Level 2**: `#EBE8DF` (Tuscan Linen) — Nested components, inactive switch tracks, and subdued chips.
- **Surface Level 3**: `#E5E2D8` (Warm Limestone) — Active card hovers, depressed buttons, and subtle structural frames.
- **Border / Divider**: `#D6D1C4` (Warm Mortar) — Soft structural bounding lines.

### Text & Contrast Typography
- **Primary Ink**: `#1C1917` (Deep Obsidian Ink) — Headings, body text, primary actions. Delivers >13:1 contrast against `#FAFAF8`.
- **Secondary Ink**: `#292524` (Charcoal Slate) — Secondary descriptive body, meta annotations, structural subheads. Exceeds 9:1 contrast.
- **Tertiary Ink / Subdued**: `#57534E` (Deep Taupe) — Captions and inactive icons, maintaining minimum 4.5:1 contrast against all light surfaces.

### Functional & Assistive Accents
- **Assistive Focus & Scan Ring**: `#B45309` (Burnished Amber) / `#D97706` — Reserved for keyboard tabs, switch-access indicators, and scanning reticles.
- **Assistive Status / Interactive Electric**: `#4338CA` (Deep Indigo) — High-salience interactive triggers, toggle states, audio-play indicators, and hyperlinked navigation.
- **Affirmative / Success**: `#15803D` (Deep Meadow).
- **Destructive / Alert**: `#B91C1C` (Deep Crimson).

## Typography

The design system exclusively adopts **Atkinson Hyperlegible Next**, created specifically to differentiate commonly confused glyph shapes (e.g., lowercase `l` vs uppercase `I` vs numeral `1`, and `O` vs `0`). 

Rules for layout and rendering:
- **Baseline Vertical Rhythm**: A minimum line height ratio of 1.5x on body sizes ensures line tracking remains comfortable under assistive screen overlays and cognitive tracking aids.
- **Letter Spacing**: Generous letter tracking throughout prevents optical character clumping on display scaling up to 200%.
- **Text Width Boundaries**: Body containers must never exceed 70 characters per line (optimal reading column: 55–65 characters).
- **Prohibition of Pure Light Weights**: No font weights below `400` are permitted anywhere across the interface.

## Layout & Spacing

A 12-column responsive fluid grid governs the system with rigorous minimum touch/switch target allowances:
- **Target Boundaries**: Every interactive element features a physical or hit-box bounding box of at least 48×48 CSS pixels, buffered by `space-sm` (12px) clearance.
- **Desktop (1024px+)**: 12-column grid, `margin` of 48px (`3rem`), `gutter` of 24px (`1.5rem`). Max container width is fixed at 1280px to prevent visual tracking exhaustion.
- **Tablet (640px – 1023px)**: 8-column grid, `margin` of 32px (`2rem`), `gutter` of 20px (`1.25rem`).
- **Mobile (<640px)**: 4-column grid, `margin-mobile` of 20px (`1.25rem`), `gutter-mobile` of 16px (`1rem`). Complex dual-column forms must reflow into a single column.

Generous vertical macro-spacing prevents crowded optical regions, ensuring users utilizing assistive touch, trackballs, or eye-gaze hardware do not encounter unintended adjacent targets.

## Elevation & Depth

Visual hierarchy does not use murky drop shadows, which reduce edge contrast and introduce visual ambiguity for low-vision users. Depth is articulated purely through **Tonal Layering**, **High-Contrast Borders**, and **Dual Focus Enclosures**.

### Tonal Stratification
- **Floor**: Canvas `#FAFAF8`.
- **Level 1 (Cards, Modals, Panels)**: `#F4F3EE` with a crisp `1.5px` border in `#D6D1C4`.
- **Level 2 (In-Card Interactive Wells, Popovers)**: `#EBE8DF` with a crisp `1.5px` border in `#C8C2B3`.

### Focus Elevation & Scan Rings
When an element receives keyboard focus or switch-access scanning:
- It maintains its physical shape without layout shift.
- A **dual-ring border** is projected: an inner `2px` white/porcelain offset buffer (`#FAFAF8`), followed by an outer high-visibility `3.5px` solid border in Burnished Amber (`#B45309`) or Deep Indigo (`#4338CA`).
- Under mouse hover, a subtle ambient outline shift occurs (border shifts from `#D6D1C4` to `#1C1917`), maintaining zero-blur sharpness.

## Shapes

The design system uses soft, geometric structural shapes (Option 1: Soft). Subtle radii (`0.25rem` / `4px` default, `0.5rem` / `8px` for cards, and `0.75rem` / `12px` for prominent modal dialogue frames) preserve geometric integrity.

Crisp, softly radiused corners allow the eye to perceive bounding limits cleanly without the visual ambiguity or clipped interactive zones frequently introduced by pill shapes. Internal focus outlines mirror the parent radius exactly, maintaining equidistant visual channels.

## Components

### Buttons
- **Primary Action**: Solid `#1C1917` surface, `#FAFAF8` text, `4px` border radius, minimum height `52px`, horizontal padding `24px`. On focus, projects the Amber (`#B45309`) assistive double ring.
- **Secondary Action**: `#F4F3EE` surface, `#1C1917` text, `1.5px` border in `#1C1917`. Active press states shift background to `#E5E2D8`.
- **Assistive High-Priority Action**: Solid `#4338CA` (Electric Indigo) surface, `#FFFFFF` text, `52px` minimum height, delivering unambiguous primary intent.

### Focus Indicators & Scanning Reticles
- Every interactable item must have a default `outline: none` replaced by a `box-shadow` or `outline` combo: `0 0 0 2px #FAFAF8, 0 0 0 5.5px #B45309`.
- When linear scanning is activated (switch control), the current container is enveloped in a bold `4px` solid border with an amber pulse indicator.

### Input Fields
- Background: `#FFFFFF` inside a `#F4F3EE` container for maximum interior-to-border definition.
- Height: Minimum `54px`, `1.5px` solid border `#78716C`.
- Text: `#1C1917` (Body-LG). Label positioned persistently above the field (never floating or disappearing placeholder text) in `label-md` `#1C1917`.
- Validation: Accompanied by both a high-contrast icon and a text label (never color alone).

### Cards
- Surface: `#F4F3EE`, bordered with `1.5px` `#D6D1C4`.
- Padding: `space-lg` (32px) on desktop, `space-md` (20px) on mobile.
- Separation: Nested sub-containers utilize `#EBE8DF`.

### Checkboxes & Radios
- Size: Explicitly scaled to `24×24px` with a minimum target tap radius of `48×48px`.
- Inactive: `#FFFFFF` fill with `2px` solid `#1C1917` frame.
- Selected: Solid `#1C1917` fill with a thick, high-contrast checkmark `#FAFAF8`. On switch focus, encircled with `#B45309` focus ring.

### Chips & Filters
- Inactive: Surface `#EBE8DF`, border `1px` `#D6D1C4`, text `#292524`.
- Active / Selected: Surface `#1C1917`, text `#FAFAF8`, paired with a clear `Dismiss` icon token.
- Minimum height: `40px`.

### Accessibility Utility Bar (Specialized Component)
- Docked panel providing persistent access to font scale toggles, high-contrast toggle, screen reader voice navigation shortcuts, and audio cues, surfaced on `#E5E2D8` with `#1C1917` controls.