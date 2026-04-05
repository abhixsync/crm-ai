---
title: WrenForge Rebrand Design
date: 2026-04-04
tags:
  - design
  - branding
  - frontend
status: approved
---

# WrenForge Rebrand Design

## Summary

Replace all default brand assets and accent colors to align with the chosen logo mark (#53 — wren-on-anvil, flat, light blue background). Six files change. No database migrations, no logic changes, no functionality impact.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Logo mark | Concept #53 — flat wren on anvil, light blue gradient bg, navy anvil, blue wren |
| Sidebar logo | Icon + "WrenForge" wordmark, horizontal lockup |
| Tagline | "Forge every deal." — login page only, not in sidebar |
| Login page style | Split panel — dark navy left (logo + tagline), white form panel right |
| In-app accent (dark mode) | `#60A5FA` (light blue) replaces `#1DE9A8` (teal) |
| In-app accent (light mode) | `#2563EB` (blue) replaces `#059669` (green) |

---

## Color Palette

| Token | Value | Usage |
|---|---|---|
| Navy | `#1E3A8A` | Anvil fill, login left panel |
| Blue (primary) | `#2563EB` | Wren fill, buttons, light-mode accent |
| Blue (mid) | `#2451B0` | Anvil top face highlight |
| Blue (light) | `#60A5FA` | Dark-mode active nav, dark-mode accent |
| BG tint | `#F0F4FF` → `#E4ECFF` | Logo bg, app background gradient |

---

## Files to Change

### 1. `public/theme/defaults/logo.svg`

New horizontal lockup SVG. Dimensions: `200×48` viewBox (wide, fits sidebar).

- Left: #53 icon at 48×48
- Right: "WrenForge" in system-ui, 700 weight, `#1E3A8A`
- No tagline in this file (sidebar use only)

### 2. `public/theme/defaults/favicon.svg`

#53 mark only at 64×64. Scaled down from 120×120. No wordmark.

### 3. `public/theme/defaults/login-background.svg`

Split panel layout at `1440×900` (scales via CSS).

- **Left half** (`#1E3A8A` → `#0C1445` gradient): centered logo mark + "WrenForge" + "Forge every deal." tagline in white
- **Right half** (`#F8FAFF`): blank white — form is rendered on top by the login page component

> [!note]
> The SVG provides the background only. The actual login form is a React component positioned over the right half via CSS.

### 4. `public/theme/defaults/application-background.svg`

Soft light-blue diagonal gradient. Replaces current neutral background.
- Colors: `#F0F4FF` → `#E8EFFF` → `#F4F7FF`
- Subtle wren watermark (very low opacity, optional)

### 5. `src/components/shells/modern/modern-shell.css`

Update the four `--ms-accent*` tokens in both theme blocks, plus two hardcoded teal `rgba()` values:

**Dark theme** (inside `[data-ui-theme="dark"]`):
```css
--ms-accent:     #60A5FA;   /* was #1DE9A8 */
--ms-accent2:    #3B82F6;   /* was #17C98E */
--ms-accent-dim: #1E3A5F;   /* was #0B2D21 */
--ms-accent-txt: #93C5FD;   /* was #4EDBA8 */
```

**Light theme** (inside `[data-ui-theme="light"]`):
```css
--ms-accent:     #2563EB;   /* was #059669 */
--ms-accent2:    #1D4ED8;   /* was #047857 */
--ms-accent-dim: #DBEAFE;   /* was #C6F0DF */
--ms-accent-txt: #1E40AF;   /* was #065F46 */
```

**Hardcoded teal values** (not using CSS vars — full inventory, search `rgba(29,233,168` and `#1DE9A8`):

Dark theme block — 5 occurrences:
```css
/* .ms-brand-mark glow */
box-shadow: 0 0 16px rgba(37,99,235,.35);       /* was rgba(29,233,168,.35) */

/* .ms-nav-btn.active background */
background: rgba(37,99,235,.12);                 /* was rgba(29,233,168,.12) */

/* .ms-nav-btn.active color */
color: #60A5FA;                                  /* was #1DE9A8 */

/* .ms-nav-btn.active:hover background */
background: rgba(37,99,235,.16);                 /* was rgba(29,233,168,.16) */

/* .ms-bdg-success background */
background: rgba(37,99,235,.12);                 /* was rgba(29,233,168,.12) */
```

Shared (applies both themes) — 2 focus ring occurrences:
```css
/* input/select/textarea focus ring — appears twice */
box-shadow: 0 0 0 2px rgba(37,99,235,.15);      /* was rgba(29,233,168,.15) */
```

Light theme block — 2 occurrences (search `#059669` and `rgba(5,150,105`):
```css
/* light-mode focus border */
border-color: #2563EB;                           /* was #059669 */
/* light-mode focus ring */
box-shadow: 0 0 0 2px rgba(37,99,235,.15);      /* was rgba(5,150,105,.15) */
```

> [!note]
> `--ms-green` (`#22C993` dark / `#059669` light) is a **semantic status color** used for success states and positive deltas. It is intentionally NOT changed — green = success is a universal convention. Only the interactive accent (teal used for navigation, buttons, focus) moves to blue.

### 6. `src/core/theme/system-defaults.ts`

Update `applicationBackgroundUrl` so the new asset is loaded by default:

```ts
applicationBackgroundUrl: "/theme/defaults/application-background.svg",
// was: null  (null caused CSS gradient fallback — new SVG should load instead)
```

> [!note]
> `primaryColor` and `accentColor` tokens in this file are unchanged — they are tint/surface values already aligned with blue. Only `applicationBackgroundUrl` changes.

---

## What Does NOT Change

- All business logic, API routes, database schema
- Dark/light mode toggle behaviour
- Tenant custom theme overrides (they continue to override defaults)
- Status colors: success `#22c55e`, warning `#f59e0b`, error `#ef4444`
- Typography, layout, spacing, component structure
- Any existing tenant-uploaded logos or themes

---

## Scope Boundaries

- **In scope**: Default brand assets + default accent color tokens
- **Out of scope**: Marketing site, email templates, any per-tenant theme data in the DB
- **Out of scope**: Font changes, layout changes, component redesign

---

## Acceptance Criteria

1. Sidebar shows #53 mark + "WrenForge" wordmark, no teal anywhere
2. Browser tab favicon shows the #53 mark
3. Login page is split — dark navy left with tagline, white right with form
4. Active nav items highlight in blue (`#60A5FA`) in dark mode
5. Active nav items highlight in blue (`#2563EB`) in light mode
6. Existing tenant custom logos are unaffected
7. `npm run build` passes with no errors
