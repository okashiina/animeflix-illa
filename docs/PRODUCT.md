# PRODUCT.md — animeflix

`register: product` (the design serves the content; poster art and video are the stars, the chrome stays out of the way).

## Product purpose
A free, fast, ad-light anime streaming web app. Users browse a catalog (AniList
metadata), open a title, and watch episodes. Playback today is a client-side
**embed-iframe switcher** (see CLAUDE.md / docs/STREAMING-ROADMAP.md); a self-hosted
source pipeline is parked behind that. The current initiative is an **in-repo UI
redesign** ("Midnight Aurora") on top of the existing embed playback.

## Users
Anime watchers, mostly mobile + desktop, evening/leisure use in low light. They came
to watch something specific or to discover what's trending. They scan posters fast,
care about "does it play", and bounce if it feels janky or sketchy.

## Tone
Premium, cinematic, calm-but-vivid. A late-night theater, not a neon arcade. Confident
typography, deep dark canvas, one electric accent used with restraint. Trustworthy and
modern, not "piracy-site cluttered."

## Anti-references (do NOT look like these)
- Generic dark + crimson "free anime" templates (what this fork started as).
- Neon-glow-on-black gaming/otaku skins (that was the rejected "Neon Otaku" option).
- SaaS landing clichés: hero-metric blocks, identical icon+heading+text card grids,
  purple-gradient-on-white.
- Cluttered ad-frame chrome.

## Strategic principles
1. **Content first.** Poster/key art and the player dominate; UI chrome recedes.
2. **One accent, used deliberately.** Violet→fuchsia for primary actions, focus,
   active state, and atmosphere only. Never everywhere.
3. **Fast & stable.** Reserve image space (no CLS), lazy-load below fold, motion is
   transform/opacity only, respects reduced-motion.
4. **Degrade, never die.** Playback falls back across embed providers; the UI must
   handle missing art/score/description gracefully.
5. **Accessible.** 4.5:1 text contrast, visible focus, 44px targets, keyboard-usable.

See [DESIGN.md](DESIGN.md) for the concrete token system.
