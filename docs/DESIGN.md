# DESIGN.md — "Midnight Aurora"

The design system for animeflix. Premium dark, cinematic, one electric accent.
Tokens live in [frontend/styles/globals.css](../frontend/styles/globals.css) (CSS
variables) and are mapped to Tailwind in
[frontend/tailwind.config.js](../frontend/tailwind.config.js).

## Color (OKLCH, channels-only vars for alpha support)

CSS vars hold **`L C H` channels only**; Tailwind wraps them as
`oklch(var(--token) / <alpha-value>)` so `bg-canvas/60` etc. work. Neutrals are tinted
toward the brand hue (≈286). Never `#000`/`#fff`.

| Token | OKLCH `L C H` | Role |
| --- | --- | --- |
| `canvas` | `0.145 0.012 286` | page background (near-black, faint violet) |
| `canvas-2` | `0.175 0.014 286` | raised section bg |
| `surface` | `0.205 0.015 286` | cards, inputs, chips |
| `surface-2` | `0.255 0.017 286` | hover / elevated surface |
| `line` | `0.34 0.02 286` | borders, dividers |
| `fg` | `0.97 0.006 286` | primary text |
| `muted` | `0.78 0.018 286` | secondary text |
| `faint` | `0.62 0.02 286` | tertiary / labels |
| `accent` | `0.66 0.21 305` | primary accent (fuchsia-violet): CTA, focus, active |
| `accent.soft` | `0.60 0.19 290` | gradient start (violet) |
| `accent.ink` | `0.99 0.01 305` | text/icon on accent fills |

- **Aurora gradient** (`bg-aurora`): `linear-gradient(135deg, accent.soft, accent)`.
  Used on the primary CTA and as atmospheric page glow only.
- **Atmosphere:** fixed radial glows at the top of `body` (low alpha) so the hero sits
  in light without overpowering poster art.
- Tailwind default palette is **kept** (extend, not override) so legacy `gray-*`/`red-*`
  still render until each surface is restyled.

## Typography
- **Display** (`font-display`): **Bricolage Grotesque** — characterful, editorial.
  Hero titles, section headings, wordmark. Tight leading, weights 600–800.
- **Body/UI** (`font-sans`, default): **Manrope** — clean, geometric, great small.
  Weights 400/500/600/700. Loaded via `<link>` in `_document.tsx`, `display=swap`.
- Hierarchy by scale + weight (≥1.25 step). Body line-height 1.5–1.7, measure ≤72ch.
- Avoid Inter / Roboto / system / Space Grotesk (AI-slop tells).

## Radius, elevation, motion
- Radius: chips/inputs `rounded-full` or `rounded-xl`; cards/player `rounded-2xl`.
- Shadows (token): `card` (resting), `lift` (hover), `glow` (accent bloom on CTA).
- Motion: 150–300ms, `cubic-bezier(0.16,1,0.3,1)` (ease-out-expo). `animate-rise` for
  one orchestrated page-load reveal (stagger via inline `animationDelay`). Hover =
  `transform`/`opacity` only (scale + translateY). All wrapped in
  `@media (prefers-reduced-motion: reduce)` kill-switch in globals.

## Component patterns
- **Header:** sticky, translucent + `backdrop-blur` over scrolling content (the *one*
  sanctioned glass use), gains a hairline border once scrolled. Wordmark + search pill.
- **Hero/Banner:** full-bleed key art, layered gradient **scrims to canvas** (bottom +
  left) for legibility, kicker + display title + meta + genres + description + primary
  (`bg-aurora`) and secondary (outline) CTAs. Reveal on load.
- **Card:** 2:3 poster, `rounded-2xl`, hover lift + `ring-accent/40` + center play
  glyph; score chip top-right; title (2-line clamp) + meta below.
- **Section:** display heading with a small accent tick, horizontal scroll-snap row,
  edges fade, `scrollbar-hide`.
- **Chips (genre):** `rounded-full` surface, border `line`, hover border `accent/50`.

## Bans (enforced)
- No gradient-clipped **text** (`background-clip:text`). Accent on text = solid color.
- No glassmorphism as decoration (header-over-content + small legibility chips only).
- No side-stripe (`border-l/r` colored accent) on cards/lists/callouts.
- No hero-metric template, no identical icon+heading card grids.
- No em dashes in UI copy. SVG icons only (Heroicons here), never emoji.
