# CHANGES — Audit, Bug Fixes & Design Upgrade

**Project:** StringTune × Three.js — 3D Motion Runtime (`enhance-threejs-extension-branch (10)`)
**Date:** 2026-07-18 · updated 2026-07-19
**Build status:** ✅ `vite build` passes clean — `dist/index.html` 1.10 MB (416 KB gzip), single file.

---

## Phase 4 — SVG systems pass (nav → hero → dividers → data → spine → toasts → cursors → decor)

### Nav & logo
- **Logo morph** — `#nav-mark` is now an inline SVG whose path cycles square → circle →
  triangle (all three authored as 8-segment cubic paths with matching command structure,
  so anime.js tweens `d` directly). Cycles every 4.2s; hover advances immediately.
- **Nav hover glow** — `feGaussianBlur` filter (`#nav-glow`) engages on brand hover.

### Hero
- **Dial ring** — the decorative dial's 24 tick marks now fill clockwise (12 o'clock start)
  with `docProgress`, lit ticks in the theme accent.
- **Scrim brackets** — the four corner brackets are now SVG paths that draw themselves in
  at boot (staggered stroke-dashoffset via anime.js).
- **Heading underline** — a hand-drawn wavy SVG path under "MOTION." draws in right after
  the word lands.

### Section transitions
- **Circuit dividers** — every module boundary carries a per-section circuit-line SVG
  (seeded jogs + connection pads) instead of a plain 1px border.
- **Scroll progress wave** — a sine-wave path rides each divider and draws itself across
  as the section travels into the viewport (stroke-dashoffset, quantised writes).

### Data & registry
- **Module icons** — 18 unique geometric stroke icons (one per registry node), scale/rotate
  on row hover and invert with the acid hover fill.
- **Stat glyphs** — small accent SVGs beside the PXL/PCT/X/Y/VEL/DIR telemetry readouts.
- **Bento ornaments** — corner-bracket SVGs injected on every bento tile, drawing in on
  hover; also wired the previously-dead `--bx/--by` cursor-anchored radial highlight.

### Progress spine
- **SVG nodes** — hexagons for numbered modules, diamonds for `+X` extras (replacing the
  CSS squares); passed nodes show a dim core, active node scales up with a spin.
- **Spine glow** — shared `feGaussianBlur` filter (`#spine-glow`) + stroke pulse on the
  active node.

### Status & boot
- **Toast icons** — tone-matched animated SVGs (checkmark = ok, alert triangle = warn,
  terminal chevron = info/meta) whose strokes draw in as the toast springs in.
- **Hexagon boot spinner** — the preloader's flat progress bar is replaced by a double
  hexagon: outer ring fills with the boot counter (pathLength dashoffset), inner dashed
  ring spins via anime.js until mount.

### Cursor system
- **Section-specific cursors** — scrub cursor (vertical double-arrow) over PROGRESS and
  SEQUENCE, glitch double-crosshair over SPLIT and MASK, list-select cursor over REGISTRY.

### Decorative
- **Honeycomb overlay** — new `.hex-bg` SVG hex-cell pattern, applied to the outro.
- **Footer signal bars** — animated 5-bar transmission meter (staggered climb loop) in the
  footer status strip.

All new SVG work is theme-reactive (currentColor / `--color-acid` / `--acid-rgb`) and
respects `prefers-reduced-motion` (static end states, no draw/pulse animations).

---

## Phase 3 — Engine split: Three.js owns 3D, Anime.js owns UI (4 stages)

Division of labor enforced across the page: everything that moves in 3D space
renders through Three.js; every DOM/UI transition tweens through Anime.js.

### Stage 1 — `#arc-layer` → Three.js GPU particle field
The canvas-2D pixel arc (~25k `fillRect` per frame on the CPU) is gone. The same
`<canvas>` now hosts a Three.js scene with four populations:
- **Arc grid** — a viewport-spanning grid of square points whose intensity is the
  old arc field math (bowl → horizon → dome across `docProgress`, velocity widens
  the band, same accent/core color mix) evaluated per-point in the vertex shader.
- **Starfield** — ~240 twinkling stars behind the arc with depth-weighted cursor parallax.
- **Dust motes** — the drifting data pixels, integrated on the GPU (`fract()` wrap),
  still quantised to the arc's pixel grid; scroll velocity accelerates the stream
  via a CPU-integrated drift uniform.
- **Fireflies** — soft accent orbs on Lissajous wanders that lean toward the cursor.
Preserved contracts: `__setArcAcid` live retint (renders a static frame under
reduced motion), idle half-rate power saver, `no-fx` kill switch, snapshot support
(new `__renderArc()` forces a sync render before `drawImage`), reduced-motion static frame.

### Stage 2 — GL transitions: Three.js 3D wipe for section jumps
New `#gl-wipe` fullscreen shader layer: twelve noise-staggered slats close from
top and bottom with cylindrical shading, drifting grain, an acid-glow leading
edge and a seam flash at full cover. `wipeTransport` (registry PORT buttons,
palette jumps, footer RETURN) now drives it — **anime.js tweens the phase uniform**
(close 380ms → teleport behind full cover → open 480ms). The DOM shutter remains
as the no-WebGL fallback; reduced motion still teleports instantly. Theme-reactive
via `__setWipeAcid`.

### Stage 3 — Anime.js UI systems
- **Text reveals** — plain-text section headings split into masked words that
  cascade up with a 65ms stagger on first sight.
- **Module enter** — `.rv` reveals moved from CSS transitions to anime.js
  (fade + rise + de-blur, honors each element's `--rvd` delay); registry rows
  share the same path. `.rv.in` stays as the snap state for portstack clones
  and reduced motion.
- **Count-up stats** — `[data-countup]` numbers (registry node count, footer
  module count) spin from zero when scrolled into view.
- **Command palette** — opens with an elastic spring (scale + drop), closes with
  a quick fade; CSS `modalIn` keyframe now only serves the hotkeys overlay.
- **Toasts** — spring in from the right, ease out on dismiss via anime.js
  (CSS `toastIn`/`toastOut` keyframes removed; the draining progress bar stays CSS).

### Stage 4 — Animated theme switch
Cycling themes (T / swatches) no longer snaps: anime.js tweens the accent rgb
triplet over 650ms and pushes every frame into the CSS vars (inline `!important`
overrides while tweening, stylesheet control returned on settle), the fx/arc/wipe
shader uniforms and every registered three.js material — page chrome, aurora sky,
arc field and 3D scenes glide to the new color together. Instant under reduced motion.

---

## Phase 2 — Modern animation & transition components (user-selected)

All 9 components below were chosen via the interactive component questionnaire.

### Navigation & transitions
- **Morphing sticky navbar** — the HUD header compresses from 48px → 38px once you scroll past the hero (springy logo-mark rotation, accent-tinted border), and a glowing **scroll-progress hairline** draws along its bottom edge, always showing document position.
- **Animated progress spine** — the right-edge rail is no longer 20 flat ticks: it's a vertical line that **fills downward** as you travel, with a diamond node per module. The active node scales up with an overshoot spring and shows a bordered label chip (`+3D · STRINGGL`); passed nodes stay dimly lit; every node is clickable to jump.

### Hero & typography
- **Kinetic cursor-reactive headline** — "TUNE THE WEB INTO MOTION." is split into per-char spans; each char's **variable-font weight ripples toward the cursor** (quadratic falloff, 190px radius, exponential smoothing, weights quantised to avoid style churn). Scroll velocity still drives the base weight, so the two signals compose. Rects are batch-read before writes to avoid layout thrash. Disabled on touch/reduced-motion.

### Interactive content
- **Bento stats grid** — the diagnostics section's two big panels are now a modern mixed-size bento: a 2×2 FPS hero tile + six data tiles (pixels, progress w/ mini position bar, direction, pointer speed, DPR, session uptime). Tiles **lift on hover** with an accent border glow and a cursor-anchored radial highlight.
- **Expanding registry rows** — registry rows no longer teleport you instantly on click; they **expand inline** (CSS grid-rows animation) revealing meta, hotkey, live dwell time, visited state, and a `PORT →` liquid button that performs the actual wipe-jump. One row open at a time; chevron rotates 180°; `aria-expanded` kept in sync.
- **3D flip spec cards** — the four footer spec tiles flip 180° on hover/focus (preserve-3d with a slight overshoot ease), revealing bonus stats on an accent-tinted back face.

### Micro-interactions & feedback
- **Liquid button morphs** — footer buttons + HUD pills (SOUND, GLYPH, PORT) get a circular accent fill that **sweeps out from the exact cursor entry point**, with elastic press-down scale. Applied via one `bindLiquid()` helper + `--lx/--ly` custom props.
- **Toast notification redesign** — the status console is now real toasts: each message **slides in with a spring**, carries a tone-colored border + draining progress bar, and dismisses itself independently (instead of the whole console vanishing on one shared timer).
- **Elastic ribbon cursor trail** — the ink-blob smear is replaced with a 22-link **spring-chain ribbon** that whips behind the cursor like a ribbon on a stick: tapered quadratic-curve strokes, additive blending, theme-tinted, intensity follows pointer velocity, fades to nothing at rest.

---

## Phase 1 — Bug fixes (weak points found in audit)

### Functional bugs
| # | Bug | Fix |
|---|-----|-----|
| 1 | **Portstack type-to-filter swallowed browser shortcuts** — while the transport overlay was open, its capture-phase keydown called `preventDefault()` on every printable key, eating Ctrl+R (reload), Ctrl+C (copy), ⌘K etc. | Added `if (e.metaKey || e.ctrlKey || e.altKey) return;` guard before the filter branch (`src/main.js`). |
| 2 | **`prefers-reduced-motion` only partially honored** — the hero icosahedron deformation, torus-knot rig, and background shader kept animating for reduced-motion users; only a static first frame was intended. | All three WebGL updaters now early-return on `motion.reduced` (a static frame is still rendered once). `scrollToId`'s fallback now uses `behavior: "auto"` when reduced. |
| 3 | **Snapshot (P key) captured a blank shader layer** — the WebGL canvas is created without `preserveDrawingBuffer`, so its buffer is cleared outside the frame it rendered in; saved PNGs silently lost the background. | Exposed `window.__renderFx()` which forces a synchronous shader render immediately before `drawImage`. |
| 4 | **Synth updater leak** — every sound off→on cycle pushed another updater into the master rAF registry (guarded but never removed, so they accumulated forever). | The updater is now registered **once** at module scope with a `synthOn` guard. |
| 5 | **Wheel-scrubbing could select a filtered-out card** — with a type-to-filter active, slow trackpad deltas bypassed `nextVisible()` and snapped the selection onto a dimmed card; Enter then ported to something invisible. | `scrubTo()` now refuses to land the selection on a node that doesn't match the filter. |
| 6 | **Char-cascade unit mismatch** — `resetChars` parked glyphs at `translateY(112%)` but the anime.js tween animated `y: [112, 0]` (pixels, not percent), so the reset and the animation start didn't agree. | Tween now uses `y: ["112%", "0%"]`. |
| 7 | **Dead tick click handlers** — `.port-tick` has `pointer-events: none` in CSS, so the click listeners attached to every timeline tick could never fire. | Removed the dead listeners (the `#port-track` click handler already computes the same index). |

### Copy / consistency fixes (`index.html`)
- Registry footer said **"15 NODES ONLINE"** → now **18** (matches the rows actually rendered).
- Footer stat said **"16 LIVE"** modules → now **20** (matches the HUD and MODULES array).
- Hotkeys overlay listed **NEXT/PREV MODULE twice** → duplicate replaced with the previously undocumented **GLYPH INTENSITY (Shift+X)**.
- Hotkeys said **"MODULE 10 → 0"** but `0` jumps to IMPULSE which is numbered 09 → relabeled **"IMPULSE (09)"**.
- Snapshot watermark hardcoded `#c8ff2e` → now uses the **active theme accent** from `THEME_REGISTRY`.

### Code cleanup
- Removed unused `spring` import from animejs.
- Fixed nonsense `let x = reverse ? 0 : 0` → `let x = 0`.
- Renamed `dim` local in `layoutCards()` → `dimmed` (it shadowed the `#port-dim` element variable).
- **Purged 7 unused dependencies**: `react`, `react-dom`, `@react-three/fiber`, `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge` + 3 dev deps (`@types/react`, `@types/react-dom`, `@vitejs/plugin-react`) — the app is vanilla JS; none were ever imported. Removed the `react()` plugin from `vite.config.ts`. Installs are much lighter and the manifest no longer lies about the stack.

---

## 2. Standout background & UI design upgrade (Phase 1) ⭐

### New "Deep Signal" shader background (`#fx-layer`)
The old fragment shader (a faint dot-grid over fbm fog) is replaced with a fully new cinematic composition:
- **Aurora curtains** — three fbm-displaced light ribbons in the theme accent that drift and shear as you scroll (`uProg` moves the curtains through the page journey).
- **Twinkling starfield** — hash-based stars with individual twinkle phases.
- **Velocity signal-rain** — vertical streaks that materialize when you scroll fast, in theme color.
- **Pointer aura** — a soft accent glow that follows the cursor, brightening with velocity.
- **Overdrive spectral remix** kept (Konami code), plus a cinematic vignette.
- Layer opacity raised 0.28 → 0.5 so the aurora actually reads; still `mix-blend-mode: screen` so text stays crisp.
- All of it stays **theme-reactive** — switching any of the 6 themes retints the entire sky live.

### Pixel-arc layer upgrades (`#arc-layer`)
- **Drifting data motes** — ~54 glowing pixels (26 on touch), quantised to the arc's pixel grid, floating upward with twinkle; scroll velocity accelerates the drift. Frozen under reduced motion.
- **Idle power-saver** — when the page is idle and scroll has settled, the arc renders at half frame-rate (it was the single heaviest thing in the page: ~25k `fillRect`/frame even when nothing moved).

### UI polish
- **Section depth veil** — content sections now sit on a 38% ink translucency instead of hard transparency, so the aurora bleeds through *around* panels while text areas stay readable — gives the whole page a layered, deep-space feel.
- **Reveal blur** — scroll reveals (`.rv`) now de-blur from 7px as they rise in, a much more cinematic entrance than plain fade+translate.
- **Keyboard focus ring** — `:focus-visible` gets the acid dotted-annotation outline (matches the site's hover language; previously keyboard users had no visible focus).
- **Scrollbar hover** — thumb highlights in the theme accent.

---

## 3. Verification
- `npx vite build` → ✅ clean, no errors/warnings, 58 modules transformed.
- Cross-checked every `$("#id")` / `getElementById` reference in JS against the HTML — all resolve.
- Verified no `data-module` section carries its own `bg-` utility before adding the depth veil (none did — safe).

## Files touched
- `src/main.js` — bug fixes 1–7, new shader, motes, idle throttle, theme-aware snapshot
- `src/index.css` — depth veil, reveal blur, focus ring, scrollbar hover, fx-layer opacity
- `index.html` — copy fixes (node counts, hotkey rows)
- `package.json` / `vite.config.ts` — dependency purge
- `dist/index.html` — rebuilt single-file output

**Try it:** `npm run dev` → scroll fast to see the signal-rain, stop moving for ~14 s to watch the idle power-saver kick in, press `T` to retint the entire sky, `P` to snapshot (now includes the background), Konami code for overdrive.
