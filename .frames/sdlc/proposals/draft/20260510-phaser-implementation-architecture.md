---
name: "Phaser 4 implementation architecture"
description: "Specifies how Phaser 4 is wired into ROI: scene shape, asset layout, bundler, TS baseline, test framework, bullet entity, device-class detection, atlas tool, plugin landscape, and types maturity."
date_created: 2026-05-10
author: architect
status: draft
reviewers: [engineer, designer, matt]
reviewer_decisions: {}
---

# Proposal: Phaser 4 implementation architecture

## Problem

The library choice is locked: `.frames/sdlc/proposals/accepted/20260510-phaser-4-2d-library.md`
commits ROI to Phaser 4 and names the architectural commitments that
fall out of that choice. Open Question 6 of that proposal explicitly
defers a bundle of scaffolding-adjacent decisions to a follow-up. The
engineer's round-1 review of the same proposal flagged additional
gaps (bullet entity shape, device-class detection mechanism, atlas
tool, plugin landscape, TS types maturity). This is the follow-up
that resolves all of them.

Until this lands, the engineer cannot scaffold without inventing
answers. The shader-pipeline validation prototype (Commitment 5 of
the accepted proposal) cannot be task-ified without knowing what
project structure it lives in. Pattern-emitter design (downstream,
designer-owned) cannot specify bullet behavior without a bullet
entity contract.

This proposal is the next critical-path artifact.

### What this proposal does, and what it explicitly does not

This proposal **does** specify:

- The Phaser scene topology and state-machine shape (where game state,
  run state, and scene-local state each live).
- The full asset directory layout under `assets/` and which paths
  are gitignored.
- The bundler (Vite), and how the atlas build is integrated into it.
- The TypeScript baseline (`strict`, path aliases, target/lib).
- The test framework choice (Vitest + Playwright) and what each is
  responsible for.
- The bullet entity TypeScript contract — fields, payload metadata,
  per-instance behavior union, the `classType` for the Phaser Group.
- The device-class detection mechanism (first-frame benchmark, with
  DPR/memory/UA pre-filter), and how the per-floor density curve
  expresses on top of it.
- The atlas-build tool (`free-tex-packer-core`).
- The Phaser 4 plugin landscape audit and its disposition (no pivot
  trigger; rexUI works under Phaser 4).
- The Phaser 4 + TypeScript types maturity finding and its
  consequence for the TS baseline.

This proposal **does not**:

- Restate the architectural commitments from the accepted proposal.
  Those are linked, not duplicated.
- Specify the shader-pipeline validation prototype itself
  (Commitment 5 of the accepted proposal). That work is named here as
  the next task to spawn once this doc is accepted; its internal
  shape stays in the accepted proposal.
- Commit to a specific PWA setup (manifest, service worker strategy).
  PWA is its own concern; it gets a follow-up proposal once this
  scaffolding is real and we know what the install/offline story
  needs to look like.
- Specify pattern-emitter contracts, run-loop economics, the badge
  system, or per-floor design specifics. Those are designer's
  domain.
- Specify implementation. This is a design document, not code.

## Proposal

The architecture below is organized as ten sections, one per
in-scope item the task overview names. Each section ends with the
specific commitment the engineer plans against.

### 1. Scene / state-machine shape

**Each floor is a separate Phaser `Scene`.** Not a sub-state of a
generic `RunScene` or a switched-on enum. The accepted proposal's
per-floor visual-language shift commitment (Commitment 4 in spirit;
"different rendering philosophies, not just different sprite sets")
is load-bearing here: each floor swaps the active filter pipeline,
the LUT, the post-process stack, and possibly the renderer config.
Phaser's scene swap gives us a clean teardown/setup boundary that
resets renderer state without us managing the reset by hand. A
single shared `RunScene` would force us to manually unwind filter
state on floor transitions; six months in, that path is bug-rich
and invisible.

**The scene topology:**

```
BootScene          One-shot. Bootstrap config, device-class detection,
                   localStorage rehydration. No graphics besides a
                   solid-color screen.
   ↓
PreloadScene       Loads atlases, audio, fonts, shaders, LUTs, font
                   atlases. Owns the splash. Hides the first-frame
                   benchmark (~250ms) under loading time.
   ↓
MenuScene          Title, "start run", settings. Persistent until run
                   start.
   ↓
Floor1Scene  …  Floor5Scene
                   One scene per floor. Each owns its bullet pool,
                   its pattern emitters, its filter stack, its LUT,
                   its post-process passes. Floor transitions =
                   scene swap.
   ↓ (death or victory)
EndScene           Post-run summary in the corporate-jargon register
                   (separation paperwork on death, performance review
                   on victory). Routes back to MenuScene or to a
                   credits scene on game-clear.
```

**The HUD is a parallel scene, not a child of the floor scene.**
`HudScene` runs in parallel with whichever floor scene is active,
launched via `this.scene.launch('HudScene')`. Floor swaps tear down
and re-create the floor scene; `HudScene` keeps running across the
swap, which is exactly what we want — the corporate-jargon HUD
("FY24 Q3 — Q3 PERFORMANCE REVIEW") never visually flickers between
floors. This is also the standard Phaser idiom and matches what
rexUI expects for its HUD components.

**State hierarchy** — three layers, each with a clear owner:

| Layer | Lifetime | Persistence | Owner | Examples |
|---|---|---|---|---|
| **Game state** | across runs | localStorage | `GameState` singleton, hydrated in `BootScene` | unlocks, badges, audio prefs, device-class cache |
| **Run state** | one playthrough | in-memory only | `RunController`, lives on a long-lived non-rendered `RunScene` (started in parallel with the floor scenes) | floor index, remaining capital, deliverables collected, run RNG seed |
| **Scene-local state** | one floor | in-memory only, dies with scene | the floor scene itself | bullet pool, pattern emitter timers, current pattern, scene-local clocks |

The "long-lived non-rendered `RunScene`" pattern (a scene that holds
state but doesn't render) is how we keep run state alive across
floor swaps without coupling it to the active floor scene. It
launches when the run starts, sleeps during scene transitions
(it's not the active rendering scene), and emits run-level events
(`floor-completed`, `deliverable-collected`, `run-ended`) that
the floor scene and HUD subscribe to.

**Transitions:**

- `Boot → Preload` — boot finishes, kicks preload.
- `Preload → Menu` — assets loaded, splash dismissed.
- `Menu → Floor1` — `RunController` initialized, `HudScene` launched,
  `RunScene` (the state holder) launched, `Floor1Scene` started.
- `FloorN → FloorN+1` — `RunController.advance()`, then
  `scene.start('FloorN+1')`. `HudScene` and `RunScene` keep running.
- `FloorN → End` — death or victory. Floor scene stops, `HudScene`
  stops, `RunScene` stops, `EndScene` starts with the run summary.
- `End → Menu` — player dismisses end screen.

**Commitment:** scene topology is `Boot → Preload → Menu →
Floor1..5 → End`, with `HudScene` and `RunScene` as parallel
long-lived scenes during a run. Each floor is a distinct
`Scene` subclass, not a parameterized one. State splits three ways
by lifetime; persistence is localStorage for game state only.

### 2. Asset directory layout

The accepted proposal locks `assets/raw/` → `assets/atlas/` and
makes the atlas dir gitignored. Below is the full layout, with
ownership boundaries and gitignore rules named.

```
assets/
├── raw/             # Source-of-truth AI-generated images, before atlas packing.
│                    # WRITTEN BY: human/AI prompt pipeline. Committed.
├── atlas/           # Built atlases (PNG + JSON). GITIGNORED.
│                    # WRITTEN BY: build script (free-tex-packer-core).
│                    # READ BY: Phaser at load time via this.load.atlas().
├── audio/           # Source audio (.wav / .ogg / .mp3).
│                    # WRITTEN BY: human/AI pipeline. Committed.
├── fonts/           # Bitmap fonts (.fnt + .png) and web fonts (.woff2).
│                    # Includes Phaser bitmap-font format (XML/JSON) for HUD typography.
│                    # WRITTEN BY: human. Committed.
├── shaders/         # GLSL fragment shaders (.frag) and shared snippets (.glsl).
│                    # WRITTEN BY: human/architect. Committed.
├── luts/            # Per-floor color-grading LUT textures (.png, encoded 32x32x32 cube).
│                    # WRITTEN BY: art pipeline / hand-tuned. Committed.
└── data/            # Pattern definitions, dialogue tables, payload-label tables (JSON/JSON5).
                     # WRITTEN BY: designer. Committed.
```

`.gitignore` adds:

```
assets/atlas/
!assets/atlas/.gitkeep
```

Nothing else under `assets/` is gitignored. `assets/raw/` ships with
the repo because it's the source of truth — if we lose the raws, we
can't repack atlases, and the raws are AI-generated under a prompt
pipeline that may not be perfectly reproducible.

**Ownership boundaries, named so they don't blur:**

- **No code reads from `assets/raw/`.** Phaser loads only from
  `assets/atlas/`, `assets/audio/`, `assets/fonts/`, `assets/shaders/`,
  `assets/luts/`, `assets/data/`. A lint-style check (a Vitest
  test that walks the source tree) enforces this — it's the kind
  of contract that quietly rots if we don't pin it.
- **Only the build script writes to `assets/atlas/`.** Engineers do
  not hand-edit atlases. Hand-edits get blown away on the next
  build, which is the correct behavior, but discovering this by
  losing edits is a cost we don't need to pay.
- **`assets/data/` is the designer's space.** The format is JSON5
  (JSON-with-comments-and-trailing-commas) so designer can leave
  hand-notes in pattern files without breaking parse. Tooling
  reads JSON5; runtime reads pre-stripped JSON, generated as part
  of the same `npm run build` pre-step that runs the atlas build.

**Commitment:** layout above, gitignore above, ownership boundaries
above. `assets/raw/` is committed (source of truth); `assets/atlas/`
is gitignored (build output). All other subdirectories are
committed.

### 3. Bundler / build pipeline

**Vite.** Not esbuild-direct, not Rspack, not Parcel. Reasons:

1. **Phaser 4's official Create Game App scaffold uses Vite + TS as
   its first-class TypeScript template** ([Phaser 4 Vite + TypeScript
   setup](https://emanueleferonato.com/2026/04/17/getting-started-with-phaser-4-vite-typescript-setup-using-the-official-create-game-app/)).
   Following the official path lowers the LLM-corpus density tax
   we already chose Phaser 4 to capture.
2. **Vite's plugin lifecycle is the right fit for the atlas build
   integration** (see below).
3. **Native ESM dev server + sub-100ms HMR** matters more for
   gameplay iteration than build-time speed; tweaking a bullet
   pattern and seeing the result without a full rebuild compounds
   over a multi-year solo build.
4. **Esbuild underneath** — Vite uses esbuild for transforms and
   Rollup for production bundling. We get esbuild's speed without
   writing the build orchestration ourselves.

Rspack is interesting (Rust-fast, webpack-compatible plugin API)
but the Phaser 4 corpus is on Vite. Parcel is fine but has been
losing mindshare since 2024; we don't need its zero-config story.

**Atlas build integration — npm pre-step, not Vite plugin (initial).**

Two viable shapes:

- **(A) Pre-build npm script.** `package.json` has
  `"build": "npm run pack:atlas && vite build"` and
  `"dev": "npm run pack:atlas && vite dev"`. Atlas build runs
  before Vite. Cache invalidation via `free-tex-packer-core`'s
  hash check (skip if input hashes unchanged).
- **(B) Vite plugin.** Watches `assets/raw/` during dev, regenerates
  affected atlases on change.

**Decision: start with (A).** Reasons:
- The atlas build does not need to run on the gameplay-iteration
  hot path. Art changes are bursty (a batch of new sprites comes
  in, gets packed, then weeks of code edits with no atlas churn).
- (A) is ~10 lines. (B) is a custom Vite plugin we maintain.
- We can move from (A) to (B) when (A) starts hurting; we cannot
  un-write a maintained plugin without ceremony.

The `pack:atlas` script lives at `tools/pack-atlas.ts`, runs via
`tsx` (Vite-friendly TS execution), and writes to `assets/atlas/`.
It uses `free-tex-packer-core`'s hash-comparison mode to skip
unchanged inputs.

**Build pipeline order:**

```
npm run build
  ├─ pack:atlas            (free-tex-packer-core; raws → atlases)
  ├─ build:data            (json5-to-json strip + validate)
  ├─ build:shaders         (passthrough copy + minify GLSL whitespace; optional)
  ├─ vite build            (TS + asset bundling, prod output to dist/)
  └─ posttest:visual       (Playwright visual-regression suite, gated by env flag)
```

`npm run dev` is `pack:atlas && build:data && vite dev` — atlas
and data builds run once on dev start; HMR handles the rest.

**Commitment:** Vite is the bundler. Atlas + data builds are npm
pre-steps that run before Vite, scripted in `tools/`, executed via
`tsx`. Migration to a Vite plugin is a future option, not a
current commitment.

### 4. TypeScript baseline

**`strict: true`, with the explicit acknowledgement that Phaser 4's
type definitions are still maturing and we may need a small number
of `// @ts-expect-error` annotations during 2026.** See section 10
for the maturity finding.

**`tsconfig.json` (the load-bearing fields):**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["src/*"],
      "@core/*": ["src/core/*"],
      "@scenes/*": ["src/scenes/*"],
      "@bullets/*": ["src/bullets/*"],
      "@hud/*": ["src/hud/*"],
      "@patterns/*": ["src/patterns/*"],
      "@audio/*": ["src/audio/*"]
    }
  }
}
```

**Why these specific extra flags beyond `strict`:**

- `noUncheckedIndexedAccess` — bullet pool indexing happens a lot;
  forcing the engineer to acknowledge the "may be undefined" path
  surfaces real bugs at compile time.
- `exactOptionalPropertyTypes` — the bullet behavior union has
  optional fields (`derivedFrom?: PlayerActionRef`). Without this,
  `undefined` and "missing" are conflated, which silently breaks
  serialization later.
- `verbatimModuleSyntax` + `isolatedModules` — required by Vite's
  esbuild transform. Catching the import-as-type mistakes at
  authoring time is cheap; catching them at build time is annoying.
- `skipLibCheck: true` — Phaser 4's bundled types may have residual
  issues from the JS→TS port. We need to type-check our code, not
  Phaser's. (See section 10.)

**Path aliases over relative imports.** Six months in, the difference
between `import { Bullet } from '@bullets/Bullet'` and
`import { Bullet } from '../../../bullets/Bullet'` is a real
authoring cost. Vite's `vite-tsconfig-paths` plugin (or the native
`resolve.alias` config) makes this work in dev and build.

**`@assets/*` is deliberately not aliased.** Assets load through
Phaser's loader, not through TypeScript imports. Aliasing it would
suggest otherwise and invite the wrong pattern.

**Commitment:** `strict: true` plus the four extra strictness flags
above. Path aliases per the table above. `skipLibCheck: true` to
isolate from Phaser type instabilities. `exactOptionalPropertyTypes`
is non-negotiable because the bullet entity shape leans on optional
fields.

### 5. Test framework

**Vitest for unit + integration. Playwright for visual-regression.**
This was the engineer's stated default in the accepted proposal's
review. Confirmed.

**Vitest scope:**

- Pure-function tests — math (vector ops, AABB intersection),
  pattern generators, RNG (seedable, deterministic), state-machine
  transitions in `RunController`, payload-label table validation.
- Stateful logic with stub renderers — bullet pool allocation/
  recycle invariants, scene transition logic, run-state mutation.
- Property-based tests via `@fast-check/vitest` for things that
  benefit from it (RNG, pattern generators).

**Playwright scope:**

- Visual-regression on a small canon of "known-good" rendered
  scenes — e.g., Floor 1 at tick 600 with a fixed seed, Floor 5
  at tick 1200 with a fixed seed. Captures the WebGL output as a
  PNG and diffs against a golden image with a tolerance threshold
  (~0.5% pixel difference, tunable).
- A reduced set runs on CI per push; the full set runs on
  pre-merge to main.
- Goldens are committed under `tests/visual/golden/` (not gitignored
  because diffs against them are how we catch unintentional visual
  regressions).

**Out of scope for the test framework choice:**

- **Mobile profiling.** Playwright's mobile emulation is too coarse
  for the iPhone 12-class perf budget the accepted proposal
  commits to. Real-device profiling needs WebPageTest + Sauce Labs
  or equivalent; that's a separate task with its own infrastructure
  decisions. Flagged in Open Questions.
- **End-to-end "play through floor 1" tests.** Bullet hell is too
  state-rich for E2E to be productive at this layer; we lean on
  unit + visual-regression instead.

**Test discipline (carried over from the engineer's standing
position, restated for the record):**

- Every function with branching logic gets a unit test.
- Every new tool/endpoint/scene transition gets an integration test.
- "I'll add tests later" is not a phase.

**Commitment:** Vitest + Playwright. Unit + integration on Vitest,
visual-regression on Playwright. Real-device mobile profiling is a
separate concern and gets its own task.

### 6. Bullet entity shape

This is the load-bearing TypeScript contract for the game. The
accepted proposal's Commitment 2 names it as a "downstream
architecture deliverable" — this is that deliverable.

**Open question from the task overview, resolved here:** "Does the
bullet entity shape need to support per-instance state machines
(Floor 5's recursive AI bullets) or is that a separate type that
extends the base bullet?"

**Resolved: one type, with an optional `behavior` discriminated
union.** Floor 5's recursive bullets are a `BulletBehavior` variant,
not a subclass. Reasons:

1. The Phaser Group `classType` wants a single class. A subtype
   tree means either two pools (split by base/recursive, which
   forks the pattern-emitter API) or one pool with `instanceof`
   branches (which is an inheritance smell wearing a costume).
2. The `behavior` field is optional with a default of `{ kind:
   'linear' }`. Linear is zero per-tick logic — we read velocity
   from the physics body and that's the entire behavior. Floors
   1-4 pay nothing for the field's existence.
3. Adding new behavior variants later (Floor 3's "split into a
   margin-call cascade", Floor 4's "homing notification") is a
   pattern-emitter design call, not an architecture call. The
   shape supports it without churn.

**The contract:**

```ts
// src/bullets/types.ts

import type { Sprite } from 'phaser';

/** Run-scoped monotonic ID. Reset at run start. */
export type BulletId = number;

/** Identifies the pattern that emitted this bullet. Consumed by
 *  audio cues, kill-credit attribution, and post-run summary. */
export type PatternId = string & { readonly __brand: 'PatternId' };

/** Identifies the emitter instance (one pattern can have multiple
 *  emitters active simultaneously). */
export type EmitterId = number & { readonly __brand: 'EmitterId' };

/** Floor-1-through-5; named for type-narrowing. */
export type FloorIndex = 1 | 2 | 3 | 4 | 5;

/** Categories drive HUD styling, audio cue selection, and the
 *  corporate-jargon label table lookup. */
export type PayloadCategory =
  | 'deliverable'   // Floor 1-2: "Q3 DELIVERABLE", "ASSEMBLY OUTPUT"
  | 'instrument'    // Floor 3: "MARGIN CALL", "FORECLOSURE NOTICE"
  | 'directive'     // Floor 4: "PERFORMANCE METRIC", "OFFSITE INVITE"
  | 'datum';        // Floor 5: "BEHAVIORAL VECTOR", "INFERENCE ARTIFACT"

/** The corporate-jargon payload — HUD-facing metadata that Designer
 *  owns. Visible in tooltips, death-screen separation paperwork,
 *  and achievement triggers. */
export interface BulletPayload {
  /** The label shown to the player. Pulled from a payload-label
   *  table in assets/data/payload-labels.json5. */
  label: string;
  category: PayloadCategory;
  /** 0..1; styling intensity (color, glyph weight, screen-shake
   *  on near-miss). Designer owns the curve. */
  severity: number;
}

/** Per-instance behavior. Default is {kind: 'linear'} — zero per-tick
 *  cost. Other variants opt into per-tick work. */
export type BulletBehavior =
  | { readonly kind: 'linear' }
  | {
      readonly kind: 'homing';
      readonly turnRateRadPerSec: number;
      readonly maxTurnTicks: number;
      readonly target: TargetRef;
    }
  | {
      readonly kind: 'split';
      readonly afterTicks: number;
      readonly intoSpec: BulletSpawnSpec[]; // resolved at split time
    }
  | {
      // Floor 5: derived from a recorded player action. The bullet's
      // motion samples back from the player's own input history.
      readonly kind: 'recursive';
      readonly sourceAction: PlayerActionRef;
      readonly distortion: RecursiveDistortion;
    };

/** Lightweight reference; resolved against a registry, not a
 *  pointer. Survives serialization. */
export type TargetRef = { readonly kind: 'player' };
export type PlayerActionRef = {
  readonly recordIndex: number;
  readonly recordedAtTick: number;
};
export type RecursiveDistortion = {
  readonly amplitude: number; // 0..1
  readonly phaseOffsetTicks: number;
};

/** The spec for a deferred bullet spawn (used by 'split' behavior). */
export interface BulletSpawnSpec {
  readonly textureKey: string;
  readonly frame: string | number;
  readonly velocity: { readonly x: number; readonly y: number };
  readonly payload: BulletPayload;
  readonly behavior?: BulletBehavior;
  readonly variantKey?: string;
}

/** The Bullet class. Extends Phaser's Arcade Sprite. The Phaser
 *  Group's classType is this class; pool capacity is set via
 *  maxSize per the accepted proposal's Commitment 2. */
export class Bullet extends Phaser.Physics.Arcade.Sprite {
  // identity
  declare id: BulletId;

  // pattern lineage — for audio, kill credit, replay, save state
  declare patternId: PatternId;
  declare emitterId: EmitterId;
  declare spawnTick: number;

  // payload — corporate-jargon HUD-facing
  declare payload: BulletPayload;

  // visual variant (atlas frame chooser within a pattern's allowed
  // variants; designer-controlled)
  declare variantKey: string;

  // per-instance behavior; default linear, zero per-tick cost
  declare behavior: BulletBehavior;

  // motion is read from this.body.velocity; not stored as fields.

  /** Pool entry point. Called by the BulletSpawner, never by `new`. */
  spawn(spec: BulletSpawnSpec, ids: { id: BulletId; patternId: PatternId; emitterId: EmitterId }): void;

  /** Pool return point. Called on death/offscreen, never destroyed. */
  recycle(): void;

  /** Per-tick. Cheap when behavior.kind === 'linear'. */
  tick(deltaMs: number, ctx: BulletTickContext): void;
}

/** Context passed into Bullet.tick — read-only views of the things
 *  bullets need to react to. */
export interface BulletTickContext {
  readonly playerX: number;
  readonly playerY: number;
  readonly tick: number;
  readonly playerActionLog: ReadonlyArray<PlayerAction>; // Floor 5 reads
}

export interface PlayerAction {
  readonly tick: number;
  readonly kind: 'move' | 'shoot' | 'idle';
  readonly x: number;
  readonly y: number;
}
```

**Why this specific shape:**

- **Branded types for `PatternId` and `EmitterId`** — string IDs and
  number IDs are easy to mix up at call sites. Brands are zero-cost
  at runtime and load-bearing in code review.
- **`declare` on class fields** — Phaser's Sprite uses prototype-
  initialized fields; using `declare` avoids re-initializing them
  in the constructor, which matters in the `recycle()` path where
  every cycle through the pool must not allocate.
- **`recycle()` is a method, not a free function** — the pool returns
  bullets via this method, and the method is responsible for
  resetting any fields that don't carry a sane "off" state. If we
  miss a field, the bug is contained in one place to find.
- **`behavior` is a tagged union, not a strategy object with methods**
  — methods on union members serialize poorly, fight inheritance,
  and don't tree-shake cleanly. The `tick()` switch on
  `behavior.kind` is the cost; that switch is also the only place
  per-tick work happens, which is the correct centralization.
- **`BulletTickContext` is read-only** — bullets must not write to
  the player or to other bullets. Any cross-bullet logic lives in
  the pattern emitter, not in `Bullet.tick()`. This is the
  invariant that lets the pool stay simple.

**Pool spawn discipline (carried over from the accepted proposal's
Commitment 2, made concrete here):**

- The Phaser Group's `classType` is `Bullet`.
- `maxSize` is set per-floor at scene start — read from
  `RunController.getDensityCap(floor, deviceClass)` (see section 7).
- `BulletSpawner.spawn(spec)` calls `group.get(...)` (which returns a
  pooled inactive bullet), then `bullet.spawn(spec, ids)`.
- `Bullet.recycle()` calls `this.setActive(false).setVisible(false)`
  and is invoked from offscreen detection or collision-on-death;
  destroy is never called on the hot path.
- The spawner refuses to allocate above `maxSize` and emits a
  `pool-saturation` event. This is the signal the pattern emitter
  uses to throttle. Saturation is a **planning surface** (Floor 5
  density is supposed to push close to the cap), not a bug.

**Commitment:** the contract above. The `behavior` discriminated
union lives on the base `Bullet` class with `linear` as a free
default. `BulletTickContext` is the read-only view bullets get of
the world. `PlayerActionLog` exists at the run level and is what
Floor 5's recursive bullets sample from. Designer owns the
`PayloadCategory` table and the `severity` curve; architect owns
the `BulletBehavior` union (additions are architecture decisions).

### 7. Device-class detection mechanism

The accepted proposal's Open Question 3 names three options. None
are equivalent.

| Option | Reliability | Latency | Privacy | Mobile/iOS |
|---|---|---|---|---|
| GPU renderer-string parse (`WEBGL_debug_renderer_info`) | Good on desktop | Free | Increasingly blocked | Partially blocked on Safari 14+, Firefox blocks by default |
| First-frame benchmark | High | ~250ms one-time | None | Works everywhere |
| DPR + memory + UA hints | Coarse | Free | Mild (UA-CH) | Works; `navigator.deviceMemory` is gated/coarse on iOS |

**Decision: First-frame benchmark, with a DPR/memory/UA hint
pre-filter, cached in localStorage.**

The pre-filter classifies the device into a tentative tier before
the benchmark runs (uses cheap signals: `devicePixelRatio`,
`navigator.deviceMemory` when present, `navigator.hardwareConcurrency`,
the User-Agent Client Hints `Sec-CH-UA-Platform-Version` and
`Sec-CH-UA-Model` when available). The benchmark refines or
confirms.

**The benchmark itself:**

- Runs in `BootScene` (or earlier, before `PreloadScene`). Hides
  under the splash screen, so the user never sees a "benchmarking"
  beat.
- Spawns 2,000 textured sprites at random positions, runs for ~250ms
  (measured frame-time), reads back median/p95 frame time.
- Maps the result to `'capable' | 'mid' | 'weak'` via thresholds
  the engineer tunes once on real devices (iPhone 12 = boundary
  between mid and capable on the low end of capable; iPhone 8 =
  mid; sub-2020 Android with PowerVR = weak).
- Writes the result + the input hints + a timestamp into
  localStorage as `device-profile`.

**Cache lifetime:**

- Re-benchmark when the cached result is older than **30 days**
  (catches OS updates that change GPU drivers, browser version
  bumps that swap the WebGL pipeline).
- Re-benchmark when the app version changes (catches our own
  perf regressions; if we ship a build that's 2x slower, weak
  devices need to be re-classified).
- On benchmark failure (timeout, no WebGL), fall back to the
  pre-filter's classification with a `'fallback'` flag set in
  the profile so the engineer can see this happened.

**The TypeScript contract:**

```ts
// src/core/device.ts

export type DeviceClass = 'capable' | 'mid' | 'weak';

export interface DeviceProfile {
  readonly class: DeviceClass;
  readonly detectedAt: number; // unix ms
  readonly appVersion: string;
  readonly source: 'benchmark' | 'fallback';
  readonly benchmark: {
    readonly spritesPerFrame: number;
    readonly medianFrameMs: number;
    readonly p95FrameMs: number;
  } | null;
  readonly hints: {
    readonly dpr: number;
    readonly memoryGB: number | null;
    readonly cores: number | null;
    readonly platform: string;
  };
}

/** Resolves to a DeviceProfile. Async because benchmark needs frames. */
export async function detectDeviceClass(): Promise<DeviceProfile>;
```

**The per-floor density curve, expressed on top of `DeviceClass`
(Commitment 4 of the accepted proposal):**

```ts
// src/core/density.ts

export type FloorDensityMultiplier = number; // 0.5..1.0

/** Designer owns the actual numerics (deferred per accepted proposal
 *  Open Question 2). The shape is architecture: per-floor, per-class. */
export const FLOOR_DENSITY_DEFAULT: Readonly<
  Record<DeviceClass, Readonly<Record<FloorIndex, FloorDensityMultiplier>>>
> = {
  capable: { 1: 1.00, 2: 1.00, 3: 1.00, 4: 1.00, 5: 1.00 },
  mid:     { 1: 0.75, 2: 0.75, 3: 0.75, 4: 0.75, 5: 0.85 },
  weak:    { 1: 0.50, 2: 0.50, 3: 0.50, 4: 0.50, 5: 0.75 },
};
```

Note the Floor-5 exception (designer's round-1 review of the
accepted proposal): Floor 5's curve floors at **0.75**, not 0.50.
Floors 1-4 may degrade to 0.50; Floor 5 holds at 0.75. The
fidelity-degradation order on Floor 5 is the engineer's
responsibility to implement: framerate first (drop to 30fps locked),
then visual fidelity (cheaper shaders, lower-res LUT, skip
post-process passes), then density as last resort.

**Why I'm picking benchmark over renderer-string parse, given that
parse is "free":**

The privacy-blocking trajectory on `WEBGL_debug_renderer_info` is
clear — it's been deprecated/blocked progressively across browsers
since 2022. Building a load-bearing detection mechanism on a signal
that's degrading is buying tech debt with a known maturation date.
The 250ms benchmark cost hides under the splash; nothing else in
the boot path is faster.

**Commitment:** `detectDeviceClass()` runs in `BootScene` and
produces a `DeviceProfile`. The profile caches in localStorage
with a 30-day re-benchmark window and an app-version invalidation.
The per-floor density multiplier table sits in `src/core/density.ts`
and is consumed by `RunController.getDensityCap(floor)` at scene
start. Designer owns the multiplier values; the table shape and
the Floor-5 floor are architecture.

### 8. Atlas-build tool selection

The accepted proposal's Open Question 1 names three candidates.

| Tool | License | Node API | Output format | Maintained |
|---|---|---|---|---|
| `free-tex-packer-core` | MIT | Yes (Node-native) | TexturePacker JSON (Phaser-compatible) | Yes |
| `texturepacker-cli` | Proprietary; commercial license required | Wraps the GUI tool | TexturePacker JSON | Yes |
| Custom | n/a | n/a | Whatever we write | Whatever we maintain |

**Decision: `free-tex-packer-core`.**

Reasons:

1. **License fit.** ROI may ship commercially; we don't want to
   build the asset pipeline on a tool that requires a per-seat
   license to exercise the full feature set in production.
2. **Node-native, scriptable.** It runs inside our existing
   `tools/pack-atlas.ts` script via `tsx`, no external binary
   spawn, no install dance for new contributors.
3. **Phaser 4 reads its output directly** via `this.load.atlas('key',
   'sheet.png', 'sheet.json')`. No conversion step.
4. **Deterministic given fixed input order** — same raws produce
   the same atlas, which keeps build outputs cache-friendly and
   keeps git-diffs sane if we ever change our minds on the
   gitignore decision.

`texturepacker-cli` would be a fine choice if we already had the
license. We don't, and buying it for a feature parity we already
get from `free-tex-packer-core` doesn't pay back.

Custom is a months-long detour for a problem that's already solved.

**Commitment:** `free-tex-packer-core` as the atlas packer, called
from `tools/pack-atlas.ts`. The packer writes
`assets/atlas/{group}.png` and `assets/atlas/{group}.json` per
configured atlas group.

### 9. Phaser 4 plugin landscape audit

The accepted proposal's Open Question 4 says: "Phaser 4 plugin
landscape — rexUI-equivalent for the HUD." If no port exists by
Q4 2026 and no shim works, that fires the ecosystem-instability
pivot trigger.

**Audit finding (May 2026):** rexUI works under Phaser 4. No pivot.

**The evidence:**

1. The maintainer (Rex Rainbow) publishes documentation explicitly
   titled "Notes of Phaser 4" at
   `https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-overview/`.
   The documentation references both Phaser 3 and Phaser 4 import
   paths, with `phaser4-rex-plugins/templates/ui/ui-plugin.js` as
   the Phaser 4 entry point.
2. The npm package `phaser3-rex-plugins` (v1.80.20 as of late
   February 2026) is actively maintained — most recent publish
   was within the prior 30 days at the time of authoring.
3. rexUI's component set (Sizer, Buttons, Label, Dialog, Slider,
   ScrollablePanel, GridSizer) is what the corporate-jargon HUD
   needs for `BOARD REVIEW`, separation-paperwork death screens,
   the achievements list, and the settings menu.

**The shim, in case the package layout changes:** if the
`phaser4-rex-plugins` package name becomes the canonical one (vs
the `phaser3-rex-plugins` umbrella), the migration is one import
path change per file. Grep-and-replace, not a rewrite. We pin the
version in `package.json` and call rexUI's API surface
unmodified.

**Other plugin-shaped needs scouted:**

- **Particles** — built into Phaser 4 core. No plugin needed.
- **Tween chains / timelines** — built into Phaser 4 core.
- **State machine for entity AI** — we use the bullet `behavior`
  union (section 6) for bullets and a hand-rolled state
  machine for boss AI; no third-party plugin.
- **Bitmap font tooling** — bitmap fonts ship as static assets;
  no plugin needed at runtime.

**Sources for the audit:**
- [rexUI plugins overview (Notes of Phaser 4)](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-overview/)
- [phaser3-rex-plugins on npm](https://www.npmjs.com/package/phaser3-rex-plugins)
- [Plugin list — Notes of Phaser 4](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/plugin-list/)

**Commitment:** rexUI is the HUD plugin (`phaser3-rex-plugins`,
pinned at v1.80.20+, used via the `phaser4-rex-plugins/templates/...`
import paths the Phaser-4-side documentation specifies). Open
Question 4 of the accepted proposal is closed — no pivot trigger
fires.

### 10. Phaser 4 + TypeScript types maturity

The accepted proposal's Open Question 5 says: "Survey notes
Phaser 4 is 'in the middle of porting source from JS to TS.' If
the type definitions have holes during May 2026, that affects how
strict our TS config can be without `// @ts-expect-error` noise."

**Finding:** Phaser 4's types are good enough for `strict: true`
with a small `skipLibCheck` allowance. Specifically:

1. **Phaser ships first-class TypeScript definitions.** Over 84%
   of the codebase is JSDoc-annotated, and the JSDoc is what
   generates the `.d.ts` definitions. The April 2026 stable release
   bundles its types.
2. **The official Vite + TypeScript scaffold uses `strict` mode.**
   The Phaser 4 "Create Game App" template ships with `strict: true`
   in `tsconfig.json`. ([Phaser 4 + Vite + TypeScript setup](https://emanueleferonato.com/2026/04/17/getting-started-with-phaser-4-vite-typescript-setup-using-the-official-create-game-app/))
3. **Residual JS→TS port artifacts are the realistic risk.** Some
   Phaser 4 internal modules may have looser types (any-typed
   plugin registries, some Filter pipeline internals). The
   pragmatic posture: `skipLibCheck: true` to isolate our code
   from Phaser's type-internal residue, plus a small allowance
   for `// @ts-expect-error` annotations on specific Phaser API
   usages where the type is wrong but the runtime is correct.

**Concrete posture for the engineer:**

- Use `strict: true` from day one.
- Use `skipLibCheck: true` from day one.
- Wrap `// @ts-expect-error` annotations with a `// REASON:` line
  and a `// REVISIT: phaser-type-port` tag so we can grep them
  later and remove them as Phaser's types tighten.
- Don't fight the type system on Phaser's internals — wrap the
  questionable API in a small typed facade (e.g.,
  `src/phaser/filters.ts` is a typed wrapper around Phaser 4's
  filter pipeline, with our own narrower types facing the rest of
  the codebase).

**Sources for the maturity finding:**
- [Phaser TypeScript first-class support](https://phaser.io/tutorials/how-to-use-phaser-with-typescript)
- [Phaser 4 + Vite + TypeScript Create Game App](https://emanueleferonato.com/2026/04/17/getting-started-with-phaser-4-vite-typescript-setup-using-the-official-create-game-app/)
- [phaser on npm](https://www.npmjs.com/package/phaser)

**Commitment:** `strict: true` from day one, with
`skipLibCheck: true` and a tagged-comment convention for the small
number of `// @ts-expect-error` cases we may need. Phaser type
churn is a known cost we accept; the engineer revisits annotations
quarterly.

---

### Next task spawned from this proposal

Once accepted, this proposal spawns one task: **the shader-pipeline
validation prototype** (Commitment 5 of the accepted Phaser-4-as-2D-
library proposal). The shape of the prototype — the trio of LUT
swap, per-sprite fragment shader, and dithering/posterization pass —
is already specified in the accepted proposal and is not restated
here. What this proposal makes possible is the project structure
the prototype lives in: it scaffolds inside the Vite project, runs
under Vitest + Playwright, uses the bullet-entity contract from
section 6 for the per-sprite shader test, and reads device class
from `detectDeviceClass()` to size the test load.

The shader prototype task is engineer-owned, has a 3-working-day
time-box, and has explicit success criteria (LUT swap < 16ms, per-
sprite shader on 100 sprites at 60fps on iPhone 12-class). If any
piece of the trio fails, the escalation path is the architect, and
the conversation that opens is the PixiJS pivot — see the accepted
proposal's "What would cause this decision to be revisited" section.

### What this proposal explicitly defers

Three deferrals, named so they don't get lost:

1. **PWA setup (manifest, service worker, offline caching).**
   Defers to a follow-up proposal once the scaffolding is real.
   PWA touches the asset-loading strategy (precache vs. on-demand),
   the audio path (autoplay restrictions on mobile), and the
   install-prompt UX. None of those are knowable until there's a
   playable build to reason about. Owner: architect.
2. **Real-device mobile profiling infrastructure.** Vitest +
   Playwright covers unit + visual-regression. The iPhone 12-class
   perf budget needs real-device profiling — WebPageTest, Sauce
   Labs, BrowserStack, or a dedicated device farm. Defers to a
   follow-up task; doesn't gate scaffolding. Owner: engineer.
3. **Pattern-emitter contract.** The bullet entity is specified
   here. The pattern emitter that produces bullets is designer's
   domain and downstream of this proposal. Defers to a designer-
   authored proposal that takes the bullet entity contract as
   input. Owner: designer.

## References

1. `.frames/sdlc/proposals/accepted/20260510-phaser-4-2d-library.md`
   — the parent commitment this proposal scaffolds against.
2. `.frames/sdlc/research/20260510-2d-library-survey.md` — full
   library candidate survey and decision history.
3. Task #348 — this proposal's authoring task.
4. Task #314, Task #333 — the survey/decision and the parent-
   proposal authoring tasks, for context on how we got here.
5. `README.md` at repo root — design compass; tonal anchors and
   floor structure.
6. [rexUI plugins overview (Notes of Phaser 4)](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-overview/)
   — plugin landscape audit source.
7. [Phaser 4 + Vite + TypeScript Create Game App](https://emanueleferonato.com/2026/04/17/getting-started-with-phaser-4-vite-typescript-setup-using-the-official-create-game-app/)
   — TS-baseline corroboration and bundler choice corroboration.
8. [Phaser TypeScript first-class support](https://phaser.io/tutorials/how-to-use-phaser-with-typescript)
   — TS-types maturity finding source.

## Open Questions

1. **Device-class boundary thresholds.** — owner: engineer.
   - The benchmark thresholds that map sprite-throughput to
     `'capable' | 'mid' | 'weak'` need to be tuned on real hardware.
     The architecture commits to the mechanism and the three-class
     partition; the actual numbers (e.g., "median frame < 8ms with
     2,000 sprites = capable") are an engineering calibration
     against real iPhone 12 / iPhone 8 / 2020-Android-mid-range
     devices.

2. **Audio architecture beyond "use Phaser's audio system".** —
   owner: deferred until designer or engineer surfaces a need.
   - Phaser's Web Audio + HTML5 fallback covers playback. The
     deeper questions — per-floor audio bus design, ducking on
     boss intros, layered ambience tracks — sit at the designer/
     engineer seam and don't gate scaffolding. Flagging here so
     it doesn't drift.

3. **Save state / persistence schema beyond `GameState` in
   localStorage.** — owner: architect (deferred).
   - The current commitment is "game state in localStorage" — but
     the schema (badges, unlocks, run-best stats, settings) needs
     its own pass. localStorage's 5-10MB ceiling is fine for what
     we need, but the schema-versioning story (how do we migrate
     a v1 save to v2?) is non-trivial and deserves its own proposal
     when save data exists. Doesn't gate scaffolding.

4. **Floor 5's `PlayerActionLog` retention strategy.** — owner:
   designer + architect.
   - `BulletBehavior.recursive` reads from the player's recorded
     action log. How long is that log? Is it the whole run? Just
     the current floor? The whole prior run, so Floor 5 is haunted
     by the player you were before? The architecture supports any
     of these (the `PlayerActionLog` is just an append-only ring
     buffer); the design call is downstream and lives with
     designer's pattern-emitter work for Floor 5.

5. **Visual-regression golden image strategy on a multi-month
   build.** — owner: engineer.
   - Goldens go stale as the visual register evolves. The engineer
     needs a clear ritual for re-baselining golden images that
     doesn't degrade into "just run `update-goldens` whenever
     tests fail." Probably looks like a per-PR review of golden
     diffs, with explicit acceptance. Doesn't gate scaffolding;
     names the cost so it doesn't get discovered later.
