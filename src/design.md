---
name: Heritage
colors:
  primary: "#1A1C1E"
  secondary: "#62686E"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
status:
  success: "#3F6B4E"   # forest — income, positive deltas
  danger:  "#B8422E"   # clay (= tertiary) — expenses, errors, destructive actions
  warning: "#8F5C1F"   # ochre — duplicate / advisory states
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
- **Secondary (#62686E):** Sophisticated slate for borders, captions, metadata
  (darkened from #6C7278 to pass WCAG AA on the limestone base).
- **Tertiary (#B8422E):** "Boston Clay" — the sole driver for interaction.
- **Neutral (#F7F5F2):** Warm limestone foundation, softer than pure white.

### Status

Status tokens are muted, Heritage-compatible tones — never bright Tailwind
defaults. They live alongside the four base colors and are the only sanctioned
hues for semantic feedback.

- **Success (#3F6B4E):** Forest. Income amounts, positive deltas, "linked" / "active" states.
- **Danger (#B8422E):** Clay (same swatch as tertiary). Expenses, destructive actions, errors.
- **Warning (#8F5C1F):** Ochre. Duplicate detection, expired states, advisories.
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
  `.label-caps` class (or `.field-label` for form labels).

Type roles (globals.css): `.page-title` (24→30px) > `.section-title` (20px) >
body (`text-sm`/`text-base`) > secondary text (`text-xs`, secondary color) >
`.label-caps`. Amounts use `.stat-value` (tabular numbers). Chips use the
`text-2xs` token (11px). No arbitrary `text-[Npx]` values.

## Components

Component classes live in `@layer components`, so Tailwind utilities can
override them without `!important`.

- **Buttons:** `.btn` + one variant. Primary `.btn-primary` (or `.btn-ink`) —
  one main CTA per view. Secondary `.btn-secondary`. Tertiary `.btn-ghost`.
  Destructive `.btn-danger` / `.btn-danger-outline`. Sizes: `.btn-sm`,
  `.btn-icon` (icon-only buttons must have `aria-label`).
- **States:** hover (pointer devices only), active `scale(0.98)`,
  `focus-visible` 2px clay outline, disabled 50% opacity. 150ms ease-in-out.
- **Touch targets:** controls are 44px on touch pointers and compact on fine
  pointers (`--control-h`, `--control-h-sm`, `--control-icon`). Use
  `.tap-target` for custom rows and `.hit-area` for small inline controls.
- **Custom toggles:** `.pressable` + `aria-pressed`; color pickers use `.swatch`.
- **Fields:** `.field` (16px on touch to prevent iOS zoom), `.field-sm` for
  dense tables, `.pill-select` for inline category pickers.
