---
title: 2D Game Library Survey for Return on Investment
date: 2026-05-10
author: architect
status: research — decision confirmed (Phaser 4); proposal to be written next
task: 314
---

# 2D Game Library Survey

## Purpose & status

This document surveys the 2D game library landscape in the JS/TS
ecosystem and offers a recommendation for **Return on Investment** at
the moment of writing (May 2026). It is **research, not a binding
decision**. A separate proposal can convert the recommendation here
into a committed choice once the open questions at the bottom are
resolved.

If you are reading this six months from now and the project has
already picked something else, that is fine — keep this document for
the rationale, mark it superseded, and write the proposal that records
why.

---

## Project requirements driving the choice

These are derived from `README.md` (the design compass) and the
shipping form-factor implied by the repo (TypeScript, browser game).
Whenever a requirement here changes, the recommendation below should
be re-evaluated.

1. **Bullet hell at scale.** The genre defines the bottleneck:
   hundreds-to-thousands of moving sprites on screen, with the count
   escalating across the five floors. Floor 5 (AI) is "the bullets
   are *you*" — recursive/data-derived bullets — which suggests bullet
   density is part of the dramaturgy, not just a technical detail.
   *A WebGL (or WebGPU) renderer is mandatory. A 2D Canvas-only
   renderer will cap us before we reach the late floors.*

2. **Custom visual register.** The tonal anchors (Cruelty Squad,
   NORCO) imply a deliberately ugly, deliberately stylized look —
   shaders, post-process effects, color-grading, screen-space
   distortion. This is not a library that "looks pretty out of the
   box"; it is a library that gives us shader-level control to *make
   it look wrong on purpose*. **Custom shader / filter support is a
   headline requirement, not a nice-to-have.**

3. **Typography is a feature.** The HUD, menus, achievements,
   bullets-as-deliverables — the entire UI speaks fluent
   corporate-finance jargon. Text rendering quality and typographic
   control matter much more here than in a typical bullet hell. The
   library should support custom fonts cleanly and render text crisply
   at multiple sizes.

4. **TypeScript-first or excellent types.** Implicit from the repo
   setup (no source code yet, but the broader environment uses TS).
   Bullet hell math (vectors, pools, pattern generators) gets long;
   types pay back fast.

5. **Single-player, no netcode.** README is explicit. Multiplayer
   primitives are not a selection criterion.

6. **Web-first delivery.** No native/desktop/mobile target stated.
   Reasonable bundle size for web matters; it is not life-or-death.
   Status: assumed; **confirm with Matt** (open question).

7. **Permissive license.** Game may be commercial. MIT / BSD / Apache
   2.0 are all fine. GPL-family is out.

8. **Sustainable across a multi-year build.** This is a concept-stage
   project. Whatever we pick, we will live with for years. Bus factor
   and maintenance cadence matter.

---

## Candidates

The list comes from the task overview, plus **LittleJS** (which kept
appearing in current benchmarks and has a credible bullet-hell-shaped
performance profile, so I added it).

### 1. Phaser 4

- **Status (May 2026):** Phaser 4 stable, released April 2026.
  Migration guides published. Phaser 3 still supported but is the
  legacy line.
- **Rendering model:** Brand-new WebGL renderer with a node-based
  pipeline. Canvas fallback. Claims sub-frame batching of millions of
  sprites in single draw calls (vendor benchmark; treat as upper
  bound).
- **TypeScript:** First-class definitions. Phaser 4 is in the middle
  of porting source from JS to TS — mixed today, fully-TS expected.
  Either way, types are bundled and high-quality.
- **Built-ins:** Scene system, input, audio (Web Audio + HTML5
  fallback), asset loader, tilemaps (Tiled/CSV), particles, two
  physics engines (Arcade and Matter.js), camera system, UI plugins.
  Most batteries you can name.
- **Ecosystem:** The largest in 2D web gamedev. Hundreds of itch.io
  games tagged bullet-hell are Phaser. *Vampire Survivors*' original
  HTML5 prototype was Phaser. Stack Overflow + Discourse coverage is
  thick.
- **Bundle:** Phaser 3 minified ~345 KB. Phaser 4 modular (smaller
  builds possible via tree-shaking; reportedly will land
  significantly smaller than 3 once tree-shaking is real).
- **License:** MIT.
- **Docs / learning curve:** Excellent docs, hundreds of examples, a
  thriving tutorial economy. Phaser 4 migration adds some surface to
  learn but the public API is largely familiar.
- **Bullet-hell take:** Default choice. Arcade physics handles
  velocity-vector collision adequately; you would skip Matter.js for
  bullet-on-player collision. The new renderer handles sprite density
  well. The cost is fighting Phaser's idioms when our visual register
  pushes outside what the framework expects.

### 2. PixiJS v8

- **Status (May 2026):** v8 stable since March 2024, current minor
  v8.16 (January 2026). Active development.
- **Rendering model:** WebGL + WebGPU + experimental Canvas fallback.
  WebGPU backend is the fastest 2D path on the modern web today.
  Pure renderer — no game-loop, no scene-update logic beyond the
  display tree.
- **TypeScript:** Source is TS. Types ship with the package. No
  `@types/pixi.js` needed.
- **Built-ins:** Scene graph, sprite/text/graphics/mesh primitives,
  filter system (custom shaders are first-class), tilemap renderer,
  asset loader. **Not built in:** physics, input handling beyond raw
  pointer events, ECS, scene/state management, audio. You bring
  these.
- **Ecosystem:** Large. Used in advertising, education, web games,
  data-viz. Bullet-hell precedent on itch.io exists but is smaller
  than Phaser's. Filter/shader extensions ecosystem is robust
  (`pixi-filters`).
- **Bundle:** ~200 KB. Tree-shakes well; dynamic imports for
  renderer code mean WebGPU + WebGL are loaded only when used.
- **License:** MIT.
- **Docs / learning curve:** Good API reference. Fewer
  start-to-finish game tutorials than Phaser because PixiJS is not a
  game engine — most tutorials are rendering-focused.
- **Bullet-hell take:** Strongest perf ceiling. Strongest shader
  story. Costs ~2–4 weeks of scaffolding (entity manager, input
  layer, asset pipeline, audio) before first playable. The bet is
  that the abstraction floor is the right floor for a bullet-hell
  hot-path engine.

### 3. Excalibur.js

- **Status (May 2026):** Active. Recent releases. Smaller team than
  Phaser, but maintained.
- **Rendering model:** WebGL with automatic Canvas fallback when WebGL
  performance is poor.
- **TypeScript:** TS-native (engine source is TS; this is one of its
  founding identity points).
- **Built-ins:** ECS world, scene system, input, audio, tilemap, basic
  physics (collisions, rigid bodies), camera, post-process effects,
  particle systems.
- **Ecosystem:** Smaller community than Phaser/PixiJS. Active
  maintainers. Less third-party content.
- **Bundle:** ~300 KB.
- **License:** BSD-2-Clause (commercial-OK).
- **Docs / learning curve:** Solid official docs, smaller
  tutorial/recipe corpus than Phaser. ECS architecture is a learning
  investment if the team has not used it before.
- **Bullet-hell take:** Reasonable middle path. ECS is a good fit for
  thousands-of-bullets entity management. Performance is mid-pack
  (not as fast as PixiJS, not as feature-rich as Phaser). The bet is
  that TS-first + ECS makes the codebase easier to maintain over
  multiple years.

### 4. Kaplay (formerly Kaboom)

- **Status (May 2026):** Kaboom was abandoned by Replit in 2023; the
  community fork **Kaplay** is now the active line. Backward-compat
  shim (`kaboom()` aliases `kaplay()`).
- **Rendering model:** WebGL.
- **TypeScript:** Types ship; documentation lean toward JS examples.
- **Built-ins:** Components, scenes, input, audio, sprites, tilemaps,
  basic physics, particle effects.
- **Ecosystem:** Active fork community, but the tooling and
  third-party plugin ecosystem is small. Used heavily in jam games
  and learning contexts.
- **Bundle:** small (low hundreds of KB).
- **License:** MIT.
- **Docs / learning curve:** Friendly, beginner-oriented. Optimized
  for "make a game in an afternoon."
- **Bullet-hell take:** **Disqualified for this project.** The
  Shirajuki benchmark puts Kaboom/Kaplay at ~3 FPS rendering 10,000
  sprites — three orders of magnitude below where we need to be on
  late floors. The library's performance ceiling is below our
  bullet-density floor. (It is a fine choice for the kinds of games
  it's tuned for; this is not one of those games.)

### 5. melonJS

- **Status (May 2026):** Maintained by a small team at AltByte
  (Singapore). Active commits and releases.
- **Rendering model:** WebGL with Canvas fallback.
- **TypeScript:** Supported. Types ship.
- **Built-ins:** Physics, tilemaps, 3D mesh rendering(!), custom
  shaders, spatial audio, particles, UI. Self-described
  "lightweight" and dependency-free.
- **Ecosystem:** Smaller than Phaser/PixiJS. Long history (10+
  years). Niche but committed.
- **Bundle:** Under 100 KB gzipped (smallest of the
  batteries-included tier).
- **License:** MIT.
- **Docs / learning curve:** Workmanlike docs. Less
  example-density than Phaser.
- **Bullet-hell take:** Plausible but unlikely to win. Bus factor on
  the small Singapore team is the main concern for a multi-year
  commitment. The per-feature offering is competitive; the
  per-community offering is not.

### 6. Babylon.js (2D mode)

- **Status (May 2026):** Actively maintained by Microsoft and
  contributors. Primarily 3D.
- **Rendering model:** WebGL/WebGPU 3D engine with sprite manager for
  2D. Sprites must be created via a manager.
- **TypeScript:** TS-native. Excellent types.
- **Built-ins:** Vast — but all 3D-shaped. **No 2D physics API.**
  2D collisions must be home-rolled or use a third-party 2D physics
  library.
- **Ecosystem:** Large for 3D. Small for 2D-specific use.
- **Bundle:** Heavy. The 3D engine ships with the 2D path.
- **License:** Apache 2.0.
- **Docs / learning curve:** Extensive, but 3D-shaped. Reading
  Babylon docs to make a 2D game is fighting current.
- **Bullet-hell take:** **Disqualified.** Right tool for 3D, wrong
  tool for high-density 2D sprite rendering. The Babylon community
  itself routinely points 2D-game developers at Phaser and PixiJS.

### 7. Plain Canvas / WebGL

- **Status:** Always available; the platform itself.
- **Rendering model:** Whatever you write.
- **TypeScript:** Whatever you write.
- **Built-ins:** Nothing. Everything is your problem.
- **Ecosystem:** N/A.
- **Bundle:** As small as you make it.
- **License:** N/A.
- **Docs / learning curve:** Steep — but the docs are MDN, which is
  excellent.
- **Bullet-hell take:** **Disqualified for this project.** Writing
  the engine is a multi-month detour from writing the game. We do
  not have a reason to absorb that cost when PixiJS exists.

### 8. LittleJS (added; not on the original list)

- **Status:** Active, single-maintainer (Frank Force). MIT.
- **Rendering model:** WebGL. Claims to render 100,000+ sprites at
  60fps; tuned for jam games.
- **TypeScript:** Supported. Smaller community for TS examples.
- **Built-ins:** Sprite rendering, tilemaps, physics, particles,
  Shadertoy-compatible shader pipeline, ZzFX sound, input, medals.
- **Ecosystem:** Small. Built around `js13k` and similar
  size-limited contests.
- **Bundle:** Tiny — js13k branch builds to a 7 KB zip. Full engine
  is small.
- **License:** MIT.
- **Bullet-hell take:** Genuinely interesting for sprite throughput
  and shader story. **Disqualified for a multi-year commercial
  project on bus factor.** A single-maintainer engine becomes a
  liability over a multi-year build; if that maintainer steps away,
  we own a fork. Worth noting because the perf profile is unusually
  good for the bullet-hell shape.

---

## At-a-glance comparison

| Library      | Rendering        | TS     | Physics built-in   | Audio | Bundle    | License | Community | Verdict for ROI    |
|--------------|------------------|--------|--------------------|-------|-----------|---------|-----------|--------------------|
| Phaser 4     | WebGL (new)      | A      | Arcade + Matter    | Yes   | ~MID      | MIT     | Largest   | Strong contender   |
| PixiJS v8    | WebGL + WebGPU   | A+     | None (BYO)         | Plugin| ~200 KB   | MIT     | Large     | **Recommended**    |
| Excalibur    | WebGL + Canvas   | A+     | Built-in (light)   | Yes   | ~300 KB   | BSD-2   | Mid       | Strong contender   |
| Kaplay       | WebGL            | B      | Light              | Yes   | small     | MIT     | Mid       | Disqualified (perf)|
| melonJS      | WebGL + Canvas   | B+     | Yes                | Yes   | <100 KB   | MIT     | Small     | Possible           |
| Babylon.js   | WebGL/WebGPU(3D) | A+     | 3D only            | Yes   | Heavy     | Apache  | Large(3D) | Disqualified (fit) |
| Canvas/WebGL | Self             | Self   | Self               | Self  | tiny      | n/a     | N/A       | Disqualified (cost)|
| LittleJS     | WebGL            | B      | Yes                | ZzFX  | tiny      | MIT     | Small     | Disqualified (bus) |

(Bundle sizes are approximate; see Sources below for measurements.
"Verdict for ROI" is project-specific, not a general judgment of the
library.)

---

## Recommendation

**PixiJS v8, with a thin custom layer on top.**

The case:

1. **Performance ceiling is the highest of the real candidates.**
   PixiJS v8's WebGPU backend is the fastest 2D sprite renderer in
   the JS ecosystem today. Floor 5's bullet density is the place this
   choice pays off.

2. **Custom shader / filter support is first-class.** The visual
   register the README describes (deliberately ugly, era-shifting
   bullet visuals, recursive AI-coded bullets) leans on
   shader/post-process work. PixiJS treats filters as a primary
   primitive. Phaser 4 has filters too in its new renderer; PixiJS's
   are more direct to author.

3. **Bullet hell does not need a physics engine.** Velocity vectors +
   AABB collision are the entire physics story. Phaser's Matter.js
   integration and Excalibur's collision system are solving a problem
   we don't have. Skipping the physics layer means PixiJS's "no
   built-in physics" isn't a cost.

4. **TypeScript-native source.** Lowest type-cliff among the
   candidates.

5. **Smallest bundle of the strong contenders** (~200 KB vs Phaser
   ~mid-hundreds, Excalibur ~300 KB).

6. **The thin custom layer is small and well-shaped.** What we'd
   build on top of PixiJS — entity manager, input adapter, asset
   pipeline wrapper, audio shim, scene/state machine, bullet pool —
   is maybe 2-4 weeks of scaffolding and is *exactly the seam where
   we want our own decisions*. Most of these touch the corporate-
   jargon HUD vocabulary directly; we don't want them inheriting
   Phaser's Scene class semantics.

The cost of this choice (and what we have to be honest about):

- **Slower to first playable** than starting in Phaser. ~2-4 weeks
  before there's a screen with a player and bullets on it. Phaser
  would be a few days.
- **More code in our repo** that is "engine-shaped" rather than
  "game-shaped." We carry that maintenance forever.
- **Smaller bullet-hell precedent corpus** to learn from than
  Phaser's. We'd be less able to pattern-match other shipped games.

### Counter-recommendation (if speed-to-MVP matters more)

**Phaser 4.** It is the safe choice. The bet here is that
batteries-included gets us to a playable prototype faster than any
other path. The cost is fighting the framework when the visual
register and HUD vocabulary push against its assumptions, which they
will.

If team size is one or two people on a tight timeline, **switch to
this.**

### What would change the recommendation

The recommendation flips if any of these turn out to be true:

- **Team size / timeline is tight.** → Phaser 4 (less scaffolding).
- **The team strongly values ECS as a codebase-shaping primitive.**
  → Excalibur becomes interesting; it's TS-first and ECS-native.
- **Mobile-native (Capacitor/Cordova) is in scope and matters more
  than perf headroom.** → Phaser 4 has the most mature mobile story.
- **Shader/post-process is downgraded to "stylized but not fancy."**
  → Phaser 4; the PixiJS argument loses its strongest pillar.
- **The team does not want to maintain a custom thin layer.**
  → Phaser 4 or Excalibur.

---

## Open questions before this becomes a binding decision

The task came with three open questions. Two are answered by the
README; the third needs Matt.

### Answered by README

1. **What kind of 2D game?** Bullet hell. Single-player. Five floors,
   density escalates with floor.
2. **Multiplayer / netcode?** No. Single-player by design.

### Needs Matt

3. **Target platforms.** Web-only is assumed throughout this
   document. If desktop-via-Tauri/Electron or mobile-via-Capacitor is
   in scope, that doesn't change the candidate ranking much — all
   strong candidates ship to those — but it does affect bundle
   priorities and asset pipeline.

### New, surfaced by this survey

4. **Peak simultaneous bullet count target per floor.** The
   recommendation here assumes late floors push into the
   thousands-of-active-bullets range (the bullet-hell genre's
   tradition; *Touhou* and *Crimzon Clover* peak at ~2000-5000). If
   ROI's design intends only ~200 simultaneous bullets, every
   candidate handles it and the perf argument for PixiJS softens
   considerably.
5. **Visual fidelity ceiling.** Is shader-driven post-process a
   *headline* feature of the look (Cruelty-Squad-coded screen
   distortion, color grading, deliberate ugliness on purpose), or
   stylized-but-static (Slay-the-Spire-coded clean illustration)? The
   recommendation assumes the former.
6. **Team shape and timeline.** Solo? Two-person? Bigger? Concept-
   stage repo gives no signal, and this changes the
   speed-vs-architectural-fit tradeoff.
7. **Asset pipeline expectations.** Hand-drawn sprite sheets, pixel
   art, procedural, vector? PixiJS handles all of these but the
   tooling sweet spot differs (Phaser's atlas loader is more
   batteries-included; PixiJS works with Aseprite/TexturePacker
   atlases via plugins).

---

## Sources

- [Phaser — npm](https://www.npmjs.com/package/phaser)
- [Phaser 4 release/migration notes (April 2026)](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know)
- [Phaser GitHub repo](https://github.com/phaserjs/phaser)
- [PixiJS v8 launch announcement](https://pixijs.com/blog/pixi-v8-launches)
- [PixiJS v8.16 update](https://pixijs.com/blog/8.16.0)
- [PixiJS v8 migration guide](https://pixijs.com/8.x/guides/migrations/v8)
- [Excalibur GitHub repo](https://github.com/excaliburjs/Excalibur)
- [Excalibur ECS docs](https://excaliburjs.com/docs/entity-component-system/)
- [Excalibur performance docs](https://excaliburjs.com/docs/performance/)
- [Kaplay roadmap and Kaboom relation](https://github.com/kaplayjs/kaplay/wiki/The-relation-of-kaplay-with-Kaboom)
- [melonJS site](https://melonjs.org/)
- [melonJS GitHub repo](https://github.com/melonjs/melonJS)
- [Babylon.js — 2D suitability discussion](https://forum.babylonjs.com/t/is-it-possible-to-optimize-babylonjs-to-use-as-2d-game-engine-like-pixi-and-phaser/42031)
- [LittleJS GitHub repo](https://github.com/KilledByAPixel/LittleJS)
- [Shirajuki js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)
- [themoonrat WebGL benchmark](https://github.com/themoonrat/webgl-benchmark)
- [Web Game Engines Comparison (2026)](https://app.cinevva.com/guides/web-game-engines-comparison.html)
- [Phaser bullet-hell games on itch.io](https://itch.io/games/made-with-phaser/tag-bullet-hell)
- [PixiJS bullet-hell games on itch.io](https://itch.io/games/made-with-pixijs/tag-bullet-hell)

---

## Resolution of open questions (2026-05-10, Matt)

Matt confirmed direction and answered the open questions below. The
recommendation (PixiJS v8 with a thin custom layer) stands.

| Question                              | Resolution                                                                 |
|---------------------------------------|----------------------------------------------------------------------------|
| Library direction                     | **PixiJS v8** — confirmed.                                                 |
| Target platforms                      | Web *and* mobile via PWA ("progressives"). No Capacitor/Cordova/Tauri.     |
| Peak simultaneous bullet count        | ~10k as a working ceiling; potentially higher. Treat 10k as load-bearing.  |
| Multiplayer / netcode                 | None. Single-player.                                                       |
| Visual fidelity ceiling               | Not explicitly addressed; assume shader/post-process is in scope until contradicted. |
| Team shape                            | **Solo (Matt).**                                                            |
| Asset pipeline                        | **AI-generated assets.** Format and atlas strategy TBD.                    |

### What these answers change architecturally

The library choice does not change. Several **downstream commitments**
do, and they are now load-bearing for the next planning round:

1. **Mobile via PWA — not Capacitor — means iOS Safari is on the hot
   path.** WebGPU in Safari is still partial as of May 2026; the WebGL
   fallback is what most iOS players will actually run on. PixiJS v8's
   automatic WebGL fallback handles this transparently, but the
   *performance budget* must be sized against WebGL-on-mobile, not
   WebGPU-on-desktop. Practical implication: profile with WebGL
   forced on, on a mid-range iPhone, before trusting any sprite-count
   number we read in a desktop benchmark.

2. **10k+ bullets on mobile is the real engineering target.** This is
   strictly tighter than 10k on desktop. The rendering ceiling will
   be set by mobile GPU + thermal throttling, not by PixiJS. Three
   architectural commitments fall out of this:
   - **Object pooling for bullets is mandatory.** No `new Bullet()`
     in the hot path. Allocate up-front, recycle.
   - **Adaptive bullet density.** A device-class detector that scales
     simultaneous bullet count down on weaker hardware. The game-feel
     implication (does the AI floor *feel* like the AI floor on
     mobile if bullet count is halved?) is a design question, not an
     architecture one — surface to designer.
   - **Texture atlas packing is non-optional.** 10k draw calls would
     melt anything; we need batching, which means atlases.

3. **Solo + AI-generated assets needs an automated atlas-build step
   in CI from day one.** AI tools generate individual images; we
   batch them into atlases at build time. This is unglamorous but
   structurally important — without it, the perf argument for PixiJS
   collapses on mobile. Reasonable tools for the build step:
   `free-tex-packer-core`, `texturepacker-cli`, or a custom packer.
   This is engineer scope but should be set up before serious art
   integration begins, not after.

4. **AI-asset consistency is a product-side risk, not an architecture
   one.** Flagging here only because it interacts: if the visual
   register requires shader-driven post-process to *unify* AI assets
   that don't quite agree with each other (color grading, dithering,
   chromatic aberration), then the shader work isn't optional flair —
   it's the seam that makes a coherent visual identity from
   non-coherent source material. That further reinforces PixiJS over
   Phaser.

5. **Solo dev + PixiJS over Phaser is a real trade.** I want to name
   it cleanly so the choice is made with eyes open: this picks
   architectural fit over speed-to-first-playable. Expect ~2–4 weeks
   of scaffolding work (entity/scene/input/audio/asset/pool layers)
   before the first bullet flies. If the calendar pressure changes
   and that delay starts to hurt, the Phaser 4 fallback is still
   viable — the survey doesn't expire.

### Recommended next step

Open a follow-up task to write a proposal that converts this research
into a binding decision (originally `use PixiJS v8`; see the *Decision*
section below for the actual call). The proposal is the right artifact
for that — this survey is research and shouldn't carry decision
weight on its own.

---

## Decision (2026-05-10, Matt)

**Phaser** — confirmed by Matt after a follow-up exchange about the
real texture of solo-dev life with each option.

### Why the call flipped from the survey's recommendation

The original recommendation pointed at PixiJS v8 because the
performance ceiling and shader/post-process story aligned best with
the design compass. That argument is still correct in the abstract.
What it underweighted:

1. **Solo dev means morale matters as much as architecture.** A
   playable bullet-dodging prototype in days versus weeks is the
   difference between "this project is alive" and "this project is
   still scaffolding." For a solo project, that gap compounds.
2. **AI-assisted coding is denser on Phaser.** Phaser has a deeper
   training corpus (tutorials, StackOverflow, community code) than
   PixiJS. When the dev is one person plus an LLM, the LLM's
   familiarity with the framework is a material productivity input,
   not an aesthetic preference.
3. **Phaser ships the bullet pool primitive built-in** (`physics.add.group({
   maxSize: 2000 })`) — the single most important architectural
   commitment for this game type is one line of config in Phaser, not
   a custom subsystem.
4. **The "fighting Phaser idioms" cost was overstated.** Phaser's
   Scene → GameObject hierarchy maps fine to ROI's structure; naming
   a wrapper class `FiscalQuarter` doesn't fight the framework, it
   uses it.
5. **The shader-as-seam-of-coherence argument for PixiJS is real but
   smaller than presented.** Phaser 4's filter system handles custom
   shaders; the friction is "read the Phaser pipeline docs" rather
   than "this is impossible."

The PixiJS argument has not disappeared. If, six months in, the
visual register's shader work is hitting walls in Phaser's filter
system, or if the bullet count target proves to need more headroom
than Phaser delivers on iPhone WebGL, this survey doesn't expire and
PixiJS is still a valid pivot. We don't expect that pivot, but we
shouldn't pretend it's impossible.

### Architectural commitments under Phaser

Most of the commitments from the original analysis carry over. Some
get easier; one new question opens up.

1. **Texture atlas packing — unchanged.** Build-step requirement.
   Phaser's `this.load.atlas('sheet', 'sheet.png', 'sheet.json')`
   reads TexturePacker JSON natively, so the integration side is
   easier than it would have been on PixiJS, but the build step
   itself is the same problem.
2. **Bullet pooling — handled by Phaser Groups, but we still need to
   *think* about it.** Group pooling is one line; using it correctly
   (no allocations on hot path, recycling rather than destroying)
   takes a small amount of discipline but no scaffolding code.
3. **Adaptive bullet density — unchanged.** Same need: detect device
   class, cap simultaneous bullet count accordingly. Phaser makes the
   gating easier (one variable controls the spawn rate at the
   pattern-emitter layer).
4. **Mobile WebGL is still the perf budget that matters.** Phaser
   doesn't help here; iOS Safari WebGL is the constraint either way.
   Profile early, profile on real devices, don't trust desktop
   numbers.
5. **Shader / post-process work — needs early validation.** Phaser 4's
   filter system is new (April 2026 stable). Before committing
   visual-register decisions that depend on heavy shader work,
   prototype one shader-heavy effect (e.g., scanline + chromatic
   aberration + color grading) inside Phaser to confirm the path is
   smooth. If that prototype fights the framework, escalate.
6. **The 2–4 week scaffolding cost — gone.** This is the win.

### Phaser 3 vs 4 — resolved

**Phaser 4** — confirmed by Matt 2026-05-10.

| | Phaser 3 | Phaser 4 |
|--|---------|---------|
| Released | 2018 | April 2026 |
| Maturity | Rock solid | New stable |
| AI/community corpus | Huge | Sparse-ish, growing |
| Renderer | Mature, older | New, modular, more shader-friendly |
| Long-term horizon | Becomes legacy in 18–24 months | Future-proof |
| Phaser 3 → 4 migration | n/a | API "mostly familiar"; renderer rewritten |

Reasoning: starting a multi-year project on the about-to-be-legacy
version is a worse bet than starting on the about-to-be-mature one.
The new renderer is also the part that helps most with perf and
shader needs. Corpus gap will close over the build's lifetime.
