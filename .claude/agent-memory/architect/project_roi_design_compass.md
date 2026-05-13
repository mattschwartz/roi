---
name: ROI design compass
description: What Return on Investment is at the design level — genre, thesis, structure, tone — so any architectural call can be checked against it.
type: project
---

**Return on Investment** is a 2D bullet hell game. Concept stage as of
May 2026 — repo established 2026-05-07, no build yet.

**Why:** Every architectural decision should answer to the design
compass in `README.md`. The design is unusually load-bearing here
(thesis-first project, not feature-first), so picking the wrong
abstraction is more expensive than usual.

**How to apply:**

- The thesis is *AI is the final boss of capitalism*. Five floors,
  each a historical stage of capitalism, escalating in abstraction:
  Mercantile → Industrial → Financial → Platform → AI. Bullets get
  more abstract / recursive across floors.
- Genre: bullet hell, single-player, web. Survival *is* the victory —
  the player endures, doesn't fight in any classical sense.
- Tonal anchors: Cruelty Squad, Disco Elysium, NORCO, Paranoia. The
  whole game speaks fluent corporate-finance jargon deadpan; the HUD
  vocabulary is *part of the work*, not chrome on top of it. ("HP" =
  *remaining capital*; bosses are agenda items; achievements are
  `RIGHTSIZED` / `LIQUIDATED`.)
- This pushes architectural decisions toward: (1) high sprite-density
  rendering (late floors), (2) custom shader / post-process
  flexibility (visual register is "deliberately ugly"), (3) precise
  typographic control (HUD copy is the work), (4) TypeScript.
- The 2D library survey lives at
  `.frames/sdlc/research/20260510-2d-library-survey.md`. Decision
  confirmed by Matt 2026-05-10: **Phaser 4** (not Phaser 3). Not yet
  a binding proposal — task spec'd as follow-up.
- The original recommendation was PixiJS v8. The flip happened
  after Matt asked to understand Phaser better. Lesson for me: I
  underweighted the solo-dev morale tax of multi-week scaffolding
  and the productivity value of AI-context density on the more
  popular framework. **Calibrate harder for solo-dev contexts in
  future surveys.**
- Resolved facts (2026-05-10):
  - Solo dev (Matt). No team.
  - Web + mobile via PWA (no Capacitor/Cordova/Tauri).
  - ~10k simultaneous bullets as working ceiling, possibly higher.
  - AI-generated assets.
  - Single-player, no netcode.
- Architectural commitments that fall out of those facts and need
  to be honored when planning the engine layer (under Phaser):
  - Texture atlas packing as a build step — mandatory; AI assets
    arrive as individual images and would otherwise blow draw-call
    budgets. Phaser reads TexturePacker JSON natively.
  - Use Phaser Groups with `maxSize` for bullet pooling. No
    allocations on hot path, no `destroy()`/recreate cycles.
  - WebGL (not WebGPU) is the perf budget that matters — iOS Safari
    runs the WebGL path. Profile on mid-range iPhone before
    trusting desktop numbers.
  - Adaptive bullet density — scale max-bullet count by detected
    device class.
  - **Validate shader/post-process pipeline early.** Phaser 4's
    filter system is new stable (April 2026); before committing
    visual-register decisions that lean heavily on shader work,
    prototype one shader-heavy effect to confirm the path is
    smooth. If that prototype fights the framework, escalate.
- PixiJS remains the documented pivot if Phaser hits a wall on
  shader work or sprite throughput six months in. Survey doesn't
  expire.
