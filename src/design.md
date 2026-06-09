---
name: Heritage
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
status:
  success: "#3F6B4E"   # forest — income, positive deltas
  danger:  "#B8422E"   # clay (= tertiary) — expenses, errors, destructive actions
  warning: "#A86E2A"   # ochre — duplicate / advisory states
  info:    "#3A4F66"   # ink-blue — transfers, neutral notices
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 0.75rem
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
---

## Overview

Architectural Minimalism meets Journalistic Gravitas. The UI evokes a
premium matte finish — a high-end broadsheet or contemporary gallery.

## Colors

The palette is rooted in high-contrast neutrals and a single accent color.

- **Primary (#1A1C1E):** Deep ink for headlines and core text.
- **Secondary (#6C7278):** Sophisticated slate for borders, captions, metadata.
- **Tertiary (#B8422E):** "Boston Clay" — the sole driver for interaction.
- **Neutral (#F7F5F2):** Warm limestone foundation, softer than pure white.

### Status

Status tokens are muted, Heritage-compatible tones — never bright Tailwind
defaults. They live alongside the four base colors and are the only sanctioned
hues for semantic feedback.

- **Success (#3F6B4E):** Forest. Income amounts, positive deltas, "linked" / "active" states.
- **Danger (#B8422E):** Clay (same swatch as tertiary). Expenses, destructive actions, errors.
- **Warning (#A86E2A):** Ochre. Duplicate detection, expired states, advisories.
- **Info (#3A4F66):** Ink-blue. Transfers, neutral / informational notices.

When a token needs a tinted background (chip, badge, soft surface), use the
matching CSS var with low alpha (`8%` for backgrounds, `18%` for borders).

## Radii

Only two corner sizes exist. Pills (`rounded-full`) are a shape, not a token,
and remain available for circular badges/dots.

- **sm: 4px** — inline controls, badges, table cells.
- **md: 8px** — cards, modals, inputs, buttons.

## Typography

- **h1** — Public Sans, 3rem (48px). Page titles only.
- **body-md** — Public Sans, 1rem (16px). Default body copy.
- **label-caps** — Space Grotesk, 0.75rem (12px). Uppercase, letter-spacing
  0.14em. Section eyebrows, table headers, metadata labels. Use the
  `.font-label` utility.
