# STRINGFLY — whole-site flythrough world

## Your locked decisions

| Decision | Your choice |
|---|---|
| Placement | Whole-site background — one persistent GL world, camera rides one long spline mapped to total document scroll (hero = 0%, footer = 100%) |
| World content | Module stations — all 21 registry modules get a 3D station with floating label; active station lights acid |
| Old GL layers | Replace both — aurora shader + pixel-arc removed; stars/dust rebuilt inside the world; one fullscreen GL context |
| Section skin | More transparent — section veil 38% → 20% ink, text panels get frosted-glass treatment |
| +F section | Becomes PATH MAP — orbiting outside view of the whole spline, traveled part in acid, pulsing YOU-ARE-HERE marker |
| Hero icosahedron | Becomes ORIGIN station 00 — moves into the world (fresnel shader, shell points, rings carry over); `#gl-hero` canvas removed |
| Flight feel | Sweeping curves — broad banked S-curves, gentle elevation, ±8° banking into turns |
| Module jumps | Hyperspeed dash — camera flies the path at speed (~0.9s, FOV 42→58→42) instead of the shutter wipe; portstack keeps its card transition |

## Build order

### 1. World core (new `12. STRINGFLY WORLD` in main.js)
- Fixed fullscreen canvas `#fly-world` at z -10 (replaces `#arc-layer`'s slot).
- Spline: one control point per MODULES entry, alternating lateral offsets (±10–16u) + elevation (±4u), ~14u spacing → ~280u path. `CatmullRomCurve3`, tension 0.5.
- Camera: smoothed `docProgress` samples position; look-ahead +0.045; roll from local curvature, clamped ±8°; FOV breathes slightly with velocity; pointer banks the view (spx/spy) like every other scene.
- Stations per module: wire cluster (hex prisms for numbered modules, diamonds for +X extras — same language as the spine nodes), acid ground-ring, floating label sprite (canvas texture, JetBrains Mono, "01 · REVEAL"). States: upcoming = line2 gray, active = acid + pulse (synced to `currentModuleIdx`), passed = acid-dim.
- ORIGIN station 00 = the hero icosahedron migrated in: fresnel core + points + occluder + shell + both rings, breathing/vertex-noise updater intact. `heroScene()` IIFE and `#gl-hero` div deleted; hero parallax keeps content drift, drops the canvas scale.
- Ambient inside the world: starfield (240/110 pts), drifting dust motes that accelerate with velocity, ~14 fireflies. FogExp2 hides the far path (natural culling + depth).
- Theme: every acid material/uniform registered in `themedMaterials` / `themedAcidUniforms`.
- Reduced motion: single static frame at current progress, re-rendered on theme change + scroll settle. Touch: lower DPR cap (1.25), half station detail, half particles. Idle: half-rate render like the arc had.

### 2. Remove old layers + rewire consumers
- Delete: `shaderLayer()` (aurora), `arcField()` (pixel arc), `glWipe()` (slat shutter — the dash replaces it), `#fx-layer`, `#arc-layer` HTML, their CSS.
- `wipeTransport()` → routes to the new dash when the world is on; keeps the existing DOM shutter as the no-WebGL / world-off fallback.
- Snapshot (P): composites `#fly-world` via `__renderFly()` instead of arc+fx.
- `S` hotkey now toggles the world (`body.no-fx` hides `#fly-world`); hotkeys overlay label "SHADER LAYER" → "WORLD LAYER"; overdrive CSS retargeted.
- Boot lines + hero spec lines gain "CAMERA SPLINE" entries.

### 3. Transparency pass (index.css)
- `body > section[data-module]` background: ink 38% → 20%.
- Text-bearing panels (`.bento`, stage frames `#webgl-stage`-style containers, prose panels): solid `--color-panel` → ~65% translucent + `backdrop-blur-md`, so the world reads through everywhere while text stays crisp.

### 4. Hyperspeed dash
- `flyDash(targetId)`: tween a progress override current→target (0.9s `inOut(3)`); FOV kicks 42→58→42; dust/streaks brighten during the dash; DOM teleports (Lenis immediate) at the midpoint behind a brief section dim; control returns to scroll at arrival + arrival toast.
- Consumers: command palette, registry PORT buttons, footer RETURN TO ORIGIN, numeric hotkeys when jumping >1 module (adjacent j/k keep smooth scroll — short scroll already flies the path). Fallbacks: reduced-motion/world-off → DOM shutter or instant.

### 5. PATH MAP (+F section rework)
- MODULES entry renamed: `FLYTHROUGH` → `PATHMAP`, meta "Route overview / you are here".
- HTML: new headline/copy; stage + readouts (PATH % / SEGMENT / SPEED) stay.
- JS: `flythroughScene()` replaced by an outside orbit view of the same curve: full path in line2, traveled range drawn acid (`setDrawRange` by docProgress), station dots, pulsing YOU-ARE-HERE marker, slow orbit driven by section progress + time drift.

### 6. Verify
- `npx vite build` green after each step.
- Manual checklist: scroll hero→footer (stations light in order, spine/HUD agree), theme cycle retints world, palette dash lands correctly, PATH MAP marker matches scroll, S toggles world, reduced-motion static frame, snapshot includes world, mobile DPR/detail caps.

**Not touched:** torus-knot `+3D` section (own mini scene + bloom), `+G` grid, ink trail, reticle, portstack transition, marquees, all other modules.
