---
name: "Phaser 4 implementation architecture"
description: "Specifies how Phaser 4 is wired into ROI: scene shape, asset layout, bundler, TS baseline, test framework, bullet entity, device-class detection, atlas tool, plugin landscape, and types maturity."
date_created: 2026-05-10
author: architect
status: planned
date_accepted: 2026-05-10
reviewers: [engineer, designer, matt]
reviewer_decisions:
  engineer: Aligned
  designer: Aligned
  matt: Aligned
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
- The TypeScript baseline (`strict`, path aliases, target/lib) and
  the ESLint baseline (typescript-eslint strict-type-checked).
- The test framework choice (Vitest two-tier + Playwright), the
  Vitest WebGL stub strategy, and the determinism harness for
  visual-regression.
- The bullet entity TypeScript contract — fields, payload metadata,
  per-instance behavior union, the `classType` for the Phaser Group,
  Arcade physics commitment, split resolution semantics, and the
  `PlayerActionLogReader` interface.
- The device-class detection mechanism (first-frame benchmark in
  BootScene with procedurally-generated texture, DPR/memory/UA
  pre-filter, cache fast-path), and how the per-floor density floor
  expresses on top of it.
- The atlas-build tool (`free-tex-packer-core`).
- The Phaser 4 plugin landscape audit and its disposition (no pivot
  trigger; rexUI works under Phaser 4).
- The Phaser 4 + TypeScript types maturity finding and its
  consequence for the TS baseline.
- The `src/` source layout with ownership boundaries.
- The package manager and Node version commitments.

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
EndScene           Post-run summary in the corporate-jargon register.
                   Single Scene class with two deliberately distinct
                   content paths — death = cruel-deadpan ("YOUR FY24
                   PERFORMANCE DID NOT MEET EXPECTATIONS"), victory =
                   institutional-deadpan ("CONGRATS ON YOUR Q4 EXIT —
                   PLEASE COMPLETE THE OFFBOARDING SURVEY"). Routes
                   back to MenuScene or to a credits scene on
                   game-clear. Architecture is shared; content is not.
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
(`floor-completed`, `deliverable-collected`, `near-miss`,
`run-ended`) that the floor scene and HUD subscribe to.

**"Non-rendered" is a discipline, not a Phaser flag.** `RunScene`
enforces it by what it doesn't do — no `add.*` graphics calls, no
camera setup beyond `cameras.main.setVisible(false)` as a belt-and-
suspenders. A future contributor who calls `runScene.add.sprite(...)`
will silently start rendering into the run-state scene, which is the
wrong gradient. A Vitest contract test asserts that `RunScene`'s
display list stays empty across the run lifecycle.

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

**Audio transitions across floor swaps are an unmentioned seam
deliberately deferred.** Floor-to-floor scene swap is the only moment
the system gets to set up the next floor's audio bed before the
player arrives in it. The architecture must *permit* a fade-out-on-
old-floor / fade-in-on-new-floor pattern; the actual audio-bus
design is designer's domain and lives in the audio-architecture
follow-up named in Open Question 2. Naming the seam here so the
follow-up doesn't have to argue for the affordance.

**Pattern-emitter timers, pattern-progression state, and
floor-specific dialogue state are scene-local.** This is implicit
in the state-hierarchy table above; making it explicit so the
designer's pattern-emitter proposal inherits the commitment without
re-litigating it.

**Commitment:** scene topology is `Boot → Preload → Menu →
Floor1..5 → End`, with `HudScene` and `RunScene` as parallel
long-lived scenes during a run. Each floor is a distinct
`Scene` subclass, not a parameterized one. `EndScene` is a single
class with two distinct content paths (death, victory). `RunScene`
is non-rendered by discipline, asserted by a contract test. State
splits three ways by lifetime; persistence is localStorage for
game state only. Floor-to-floor audio transition seam is reserved
for the audio-architecture follow-up.

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
  of the same `bun run build` pre-step that runs the atlas build.
- **Schemas for `assets/data/*.json5` files are designer-owned and
  out of scope for this proposal.** The schemas for
  `payload-labels.json5`, `payload-categories.json5`, and (later)
  `pattern-definitions.json5` are authored as part of designer's
  pattern-emitter and labels-table proposals. The `build:data`
  step (section 3) validates against whatever schemas exist; until
  designer publishes them, the validator runs in pass-through mode.
  The architecture commits to the *location* (under `assets/data/`)
  and the *format* (JSON5 source, JSON runtime), not the *shape*
  of any specific data file.

**Commitment:** layout above, gitignore above, ownership boundaries
above. `assets/raw/` is committed (source of truth); `assets/atlas/`
is gitignored (build output). All other subdirectories are
committed. Per-file schemas under `assets/data/` are designer-owned
and defer to designer's downstream proposals.

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

**Atlas build integration — package-manager pre-step, not Vite plugin (initial).**

Two viable shapes:

- **(A) Pre-build script.** `package.json` has
  `"build": "bun run pack:atlas && bun --bun vite build"` and
  `"dev": "bun run pack:atlas && bun --bun vite dev"`. Atlas build
  runs before Vite. Cache invalidation via `free-tex-packer-core`'s
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

**Trip-wire for migration to (B):** when art-iteration restarts
(`vite dev` killed and re-launched specifically to re-pack atlases)
exceed three per week for two consecutive weeks, the plugin earns
its complexity. Engineer owns watching for this signal. Naming the
trip-wire here so the friction doesn't normalize quietly.

The `pack:atlas` script lives at `tools/pack-atlas.ts`, runs via
Bun (`bun tools/pack-atlas.ts`; native TS execution, no `tsx`),
and writes to `assets/atlas/`. It uses `free-tex-packer-core`'s
hash-comparison mode to skip unchanged inputs. **Cache scope
verification is an engineer task at scaffold time** — confirm the
cache lives on-disk and survives a process restart. If it's
in-memory only, the engineer wraps it with a small on-disk cache
layer; the worst-case cold-start cost should not be the steady-state
cost. **Bun compatibility for `free-tex-packer-core` is also
verified at scaffold time** (section 12, risks); fall back to running
this single tool under Node if it trips on Bun.

**Build pipeline order — `build` produces artifacts, `verify` runs
tests, `ci` runs both.**

```
bun run build
  ├─ pack:atlas            (free-tex-packer-core; raws → atlases)
  ├─ build:data            (json5-to-json strip + validate)
  ├─ build:shaders         (passthrough copy + minify GLSL whitespace; optional)
  └─ bun --bun vite build  (TS + asset bundling, prod output to dist/)

bun run verify
  ├─ bun --bun vitest run  (unit + integration; jsdom or @vitest/browser per test)
  └─ playwright test       (visual-regression suite)

bun run ci  =  bun run build && bun run verify
```

Visual-regression is verification, not build — splitting it out of
`build` keeps the dependency graph honest and avoids running the
build twice in CI.

`bun run dev` is `pack:atlas && build:data && bun --bun vite dev` —
atlas and data builds run once on dev start; HMR handles the rest.

**`build:data` is a tool we have to write.** It strips JSON5 to
JSON and runs each file through whatever schema designer publishes
in `assets/data/schemas/`. Until schemas exist (designer-owned;
section 2), `build:data` runs in pass-through-with-strip mode. The
validator implementation lives at `tools/build-data.ts`, runs under
Bun (native TS), and uses Zod for schemas (designer authors
`*.schema.ts` files alongside `*.json5` files when ready). Engineer
owns the tool; designer owns the schemas.

**Commitment:** Vite is the bundler (run under Bun via
`bun --bun vite`). Atlas + data builds are pre-steps that run
before Vite, scripted in `tools/`, executed natively by Bun (no
`tsx`). `build` produces artifacts; `verify` runs tests; `ci` runs
both. Migration to an atlas Vite plugin is a future option with a
named trip-wire, not a current commitment. `build:data` validator
is engineer-built, schema-validated when designer publishes the
schemas.

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
  serialization later. **Boundary cost acknowledged:** Phaser 4's
  config objects often accept optional fields where `undefined` is
  a valid "use the default" signal, which `exactOptionalPropertyTypes`
  rejects. The convention is to write thin `Partial<...>` /
  `Omit<...>` adapters at the Phaser boundary (under `src/phaser/`)
  rather than relax the flag globally. First config object that
  errors is not scaffold breakage, it's the flag working as
  intended.
- `verbatimModuleSyntax` + `isolatedModules` — required by Vite's
  esbuild transform. Catching the import-as-type mistakes at
  authoring time is cheap; catching them at build time is annoying.
- `skipLibCheck: true` — Phaser 4's bundled types may have residual
  issues from the JS→TS port. We need to type-check our code, not
  Phaser's. (See section 10.)

**Path aliases over relative imports.** Six months in, the difference
between `import { Bullet } from '@bullets/Bullet'` and
`import { Bullet } from '../../../bullets/Bullet'` is a real
authoring cost. **Use `vite-tsconfig-paths`, not `resolve.alias`.**
The plugin reads aliases from `tsconfig.json`, making tsconfig the
single source of truth. With `resolve.alias` the alias list lives in
two places and they will diverge eventually.

**`@assets/*` is deliberately not aliased.** Assets load through
Phaser's loader, not through TypeScript imports. Aliasing it would
suggest otherwise and invite the wrong pattern.

**ESLint baseline: `@typescript-eslint/strict-type-checked` plus
project-specific overrides.** Lint catches the gotchas type-checking
doesn't (`no-floating-promises`, `prefer-readonly`,
`no-non-null-assertion`, `import/order`, `no-misused-promises`).
For a multi-year solo build the lint discipline is as important as
the type discipline. Configuration lives at `eslint.config.ts` (flat
config, ESLint 9+). Lint runs as part of `bun run verify` (section
3) and as a pre-commit hook. Specific overrides we expect to need:
`@typescript-eslint/no-explicit-any: error` (force facade types
around Phaser), `import/no-cycle: error` (the bullet/spawner/
pattern-emitter triangle is cycle-prone). Engineer owns the rule
set; architect owns the override list.

**Commitment:** `strict: true` plus the four extra strictness flags
above. Path aliases via `vite-tsconfig-paths`, with `tsconfig.json`
as single source of truth. `skipLibCheck: true` to isolate from
Phaser type instabilities. `exactOptionalPropertyTypes` is
non-negotiable because the bullet entity shape leans on optional
fields; thin adapter facades at the Phaser boundary absorb the cost.
ESLint runs `@typescript-eslint/strict-type-checked` plus the
named overrides, gated in `verify` and pre-commit.

### 5. Test framework

**Vitest for unit + integration. Playwright for visual-regression.**
This was the engineer's stated default in the accepted proposal's
review. Confirmed.

**Vitest scope, two-tier:**

- **Tier 1 — pure logic on jsdom.** Math (vector ops, AABB
  intersection), pattern generators, RNG (seedable, deterministic),
  state-machine transitions in `RunController`, payload-label table
  validation. Fast, headless, runs on every save.
- **Tier 2 — renderer-touching tests on `@vitest/browser` with
  Playwright as the runner.** Real WebGL via a real browser, slower
  but tests the actual Phaser surface. Used for: bullet pool
  allocation/recycle invariants (the pool needs a real Group), scene
  transition logic (`scene.start()` requires a real scene manager),
  any test where the assertion is "Phaser did the thing I asked it
  to." Configured via `vitest.config.ts` with a `browser` config
  block; tests opt in via a filename suffix (`*.browser.test.ts`).
- **Property-based tests via `@fast-check/vitest`** for RNG,
  pattern generators, and pool-saturation behavior. Pure-tier only;
  property tests on the renderer-touching tier would explode.

The two-tier split avoids growing a synthetic WebGL mock layer that
quietly diverges from real Phaser behavior. jsdom for what it
covers; real browser for what it doesn't.

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

**Determinism harness — required, not implied.** "Fixed seed" is
one input. A flaky-from-week-one visual-regression suite is the
default outcome unless every source of non-determinism is controlled.
The harness `tests/visual/harness.ts` injects, before the Phaser
game boots:

| Source | Control |
|---|---|
| Seedable game RNG | Already committed; wired into `RunController` |
| `Math.random()` | Globally overridden to draw from the seedable RNG; covers any internal Phaser use |
| `Date.now()` | Replaced with a fake clock advanced explicitly by the harness |
| `performance.now()` | Same fake clock |
| `requestAnimationFrame` | Replaced with a deterministic stepper that the harness drives |
| `devicePixelRatio` | Pinned to `1.0` for visual-regression runs |
| Phaser scene `update` cadence | Driven by the deterministic stepper, not by browser rAF |
| Audio | Muted entirely during visual-regression runs |

The harness exposes one method to the test: `await
runner.advanceToTick(N)` — synchronously walks the game forward N
ticks, then resolves. Tests then take a screenshot. The same harness
is what the shader-pipeline validation prototype uses for its
"per-sprite shader on 100 sprites at 60fps" measurement, modulo
the pinned-DPR commitment.

**Out of scope for the test framework choice:**

- **Mobile profiling.** Playwright's mobile emulation is too coarse
  for the iPhone 12-class perf budget the accepted proposal
  commits to. Real-device profiling needs WebPageTest + Sauce Labs
  or equivalent; that's a separate task with its own infrastructure
  decisions. **Trip-wire for spawning that task: when the
  shader-pipeline validation prototype's per-sprite shader test
  is being measured against the iPhone 12-class budget, real-device
  profiling is the only honest measurement.** That is the moment
  the task spawns. Until then, deferred. Flagged in Open Questions.
- **End-to-end "play through floor 1" tests.** Bullet hell is too
  state-rich for E2E to be productive at this layer; we lean on
  unit + visual-regression instead.

**Test discipline (carried over from the engineer's standing
position, restated for the record):**

- Every function with branching logic gets a unit test.
- Every new tool/endpoint/scene transition gets an integration test.
- "I'll add tests later" is not a phase.

**Commitment:** Vitest two-tier (jsdom for pure logic,
`@vitest/browser` for renderer-touching tests) + Playwright for
visual-regression. The determinism harness above is in scope and
required for the visual-regression suite to be non-flaky from
week one. Real-device mobile profiling spawns its own task at the
named trip-wire (shader prototype iPhone-12 measurement).

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

**Variant-addition request flow:** designer surfaces a need
("Floor 3 needs a homing margin-call notice"); architect proposes
the addition as a one-section follow-up proposal that shows the
new variant and how the bullet `tick()` switch handles it; engineer
implements. Adding a `BulletBehavior` variant is an architecture
decision because it's a new per-tick branch in the hot path and a
new shape in the contract. Adding a `PayloadCategory` value or a
`label` string is **not** an architecture decision — that's
content, see 6.5 below.

**What this contract is not for:** area-denial / lingering hazards
("a foreclosure zone you can't enter for 5 seconds", "a performance-
review aura that drains capital while you're inside it") are
*hazards*, not bullets. They have different lifetime semantics
(spatial occupancy over time, not point-collision), different
collision shape (region, not body), and different visual treatment
(persistent overlay, not sprite). When Floor 3 or 4 patterns
demand them, the answer is a separate `Hazard` entity proposal
(designer-surfaced, architect-shaped), not a `BulletBehavior`
variant. Naming this here so the bullet contract isn't stretched
to absorb a structurally different thing.

**Physics: Arcade, not Matter.** Bullets extend
`Phaser.Physics.Arcade.Sprite`. Arcade is AABB, lightweight, and
the right shape for bullet hell — constant-velocity motion is free
(no per-tick force application), inter-bullet collisions are not
modeled (correct — bullets pass through each other), and the body
sizing is one number per bullet. Matter (full rigid body) is wrong
for this game: the physics cost would be wasted on motion that is
already deterministic, and rigid-body inter-bullet collisions would
both look wrong and tank density. Matter is out of scope for the
bullet path. (If a Floor 3 hazard ever wants rigid-body behavior —
unlikely — that is a `Hazard` entity decision, not a bullet
decision.)

**The contract:**

```ts
// src/bullets/types.ts

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

/** PayloadCategory is content, not architecture. The closed set
 *  lives in `assets/data/payload-categories.json5` (designer-owned).
 *  HUD styling and audio cue selection switch on the string with a
 *  fallback for unknown categories; adding "REORGANIZATION OUTPUT"
 *  or "DUE DILIGENCE NOTICE" does not require an architecture
 *  proposal. Same shape as PatternId/EmitterId — a branded string
 *  whose values are content-defined. */
export type PayloadCategory = string & { readonly __brand: 'PayloadCategory' };

/** The corporate-jargon payload — HUD-facing metadata that Designer
 *  owns. Visible in tooltips, death-screen separation paperwork,
 *  and achievement triggers. */
export interface BulletPayload {
  /** The label shown to the player. Pulled from
   *  assets/data/payload-labels.json5. */
  readonly label: string;
  /** Category key, looked up in assets/data/payload-categories.json5
   *  for HUD styling and audio cue mapping. The category is NOT a
   *  function of FloorIndex — Floor 5 may emit a 'directive' bullet
   *  labeled "LEGACY KPI" as a tonal callback. */
  readonly category: PayloadCategory;
  /** 0..1; styling intensity (color, glyph weight, near-miss
   *  styling threshold). Designer owns the curve. NOTE: severity
   *  drives the *visual* treatment of near-miss; the *event* is
   *  emitted by `RunController` (see "near-miss as event" below). */
  readonly severity: number;
}

/** Per-instance behavior. Default is {kind: 'linear'} — zero per-tick
 *  cost. Other variants opt into per-tick work. Adding a variant is
 *  an architecture decision (new branch in the tick hot path). */
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
      readonly intoSpec: ReadonlyArray<BulletSpawnSpec>;
      /** What to do when the spawner can't fulfill all splits at
       *  saturation. 'best-effort' spawns what fits, drops the rest,
       *  emits a `pool-saturation` event with the dropped count.
       *  'all-or-nothing' spawns all or none (used when partial
       *  fulfilment would break the visual semantics of the cascade). */
      readonly onSaturation: 'best-effort' | 'all-or-nothing';
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

/** The spec for a deferred bullet spawn (used by 'split' behavior
 *  and by all pattern-emitter spawn calls). */
export interface BulletSpawnSpec {
  readonly textureKey: string;
  readonly frame: string | number;
  readonly velocity: { readonly x: number; readonly y: number };
  readonly payload: BulletPayload;
  readonly behavior?: BulletBehavior;
  readonly variantKey?: string;
}

/** Read-only handle over the player's recorded action log. Bullets
 *  in the recursive variant call `getActionAtTick(t)` to sample
 *  back; non-recursive variants never touch this. The interface
 *  hides the underlying ring buffer (or array, or whatever the
 *  retention strategy of the day is) so changing retention does
 *  not ripple through every bullet. */
export interface PlayerActionLogReader {
  readonly length: number;
  /** Returns the action at the given run-relative tick, or null if
   *  the tick is outside retained range. */
  getActionAtTick(tick: number): PlayerAction | null;
  /** Returns the most recent N actions (for distortion windows). */
  getRecent(count: number): ReadonlyArray<PlayerAction>;
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
  /** Reader interface, not the raw array. Floor 5's recursive
   *  bullets call `playerActionLog.getActionAtTick(...)`; non-
   *  recursive variants never touch it. */
  readonly playerActionLog: PlayerActionLogReader;
}

export interface PlayerAction {
  readonly tick: number;
  readonly kind: 'move' | 'shoot' | 'idle';
  readonly x: number;
  readonly y: number;
}
```

**Why this specific shape:**

- **Branded types for `PatternId`, `EmitterId`, `PayloadCategory`** —
  string IDs are easy to mix up at call sites. Brands are zero-cost
  at runtime and load-bearing in code review. `PayloadCategory`
  joins the brand club because it shares the same property: the
  values are content-defined and the type system should reject
  arbitrary strings.
- **`declare` on class fields** — Phaser's Sprite uses prototype-
  initialized fields; using `declare` avoids re-initializing them
  in the constructor, which matters in the `recycle()` path where
  every cycle through the pool must not allocate. **Footgun
  acknowledged:** with `useDefineForClassFields: true` (section 4),
  `declare`-only fields emit no runtime initialization, which is
  the intent. But Phaser's `Sprite` superclass does prototype-time
  initialization; if a `declare` field name collides with a
  superclass-initialized field, the subclass declaration silently
  shadows the superclass initializer at runtime. Mitigation: a
  Tier-2 (browser-mode) Vitest smoke test on day one asserts that
  a freshly-spawned `Bullet` has `body`, `scene`, `texture`, and
  `frame` populated. Naming the interaction so the test isn't
  optional.
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
- **`playerActionLog: PlayerActionLogReader`, not `ReadonlyArray`** —
  passing the reader interface (a) hides the underlying retention
  strategy from every bullet (Open Question 4 picks "whole prior
  run" or "current floor only" without rippling), (b) prevents the
  defensive-copy footgun where a future contributor turns
  `[...log]` into an O(active_bullets × log_length) per-tick cost,
  and (c) gives Floor 5's recursive variant exactly the access it
  needs (`getActionAtTick(t)`, `getRecent(n)`) without exposing
  internals.

**Split resolution semantics (variant `kind: 'split'`):**

- The split resolution lives in the **`BulletSpawner`'s deferred
  spawn queue**, not in `Bullet.tick()`. When a bullet's `tick()`
  reaches `behavior.afterTicks`, the bullet calls
  `spawner.requestSplit(this, behavior.intoSpec, behavior.onSaturation)`
  and then calls `recycle()` on itself. The spawner drains its
  deferred queue once per frame, after all bullet `tick()` calls
  have resolved.
- This keeps the bullet `tick()` path stateless with respect to
  the pool: bullets do not call `spawn()` from inside their own
  `tick()`. The "spawned this frame" accounting lives in one
  place, in the spawner's frame-end drain.
- **At pool saturation**, behavior depends on `onSaturation`:
  - `'best-effort'`: spawn what fits (drain in `intoSpec` order),
    drop the rest, emit a `pool-saturation` event with `{patternId,
    emitterId, requested, fulfilled, dropped}`. Used when partial
    cascade is visually acceptable (Floor 3 margin-call cascade
    that thins out at high density).
  - `'all-or-nothing'`: if any bullet would be dropped, none
    spawn, emit `pool-saturation` with `{requested, fulfilled: 0}`.
    Used when partial fulfilment breaks the visual semantics
    (a 5-pointed-star burst that becomes a 3-pointed-star is
    worse than no burst).

**Near-miss is an event, not just a styling input.** The `severity`
field on `BulletPayload` drives the *visual* treatment of a
near-miss (color, glyph weight, screen-shake amplitude). The
*event* — "the player just dodged a Q3 PERFORMANCE REVIEW by 4
pixels" — is emitted by `RunController` per the section 1 event
bus, not by the bullet itself. The bullet doesn't know what a
near-miss is; the run controller does, because it's tracking the
player's hitbox against active bullets and it owns the proximity
threshold. Achievement triggers ("VESTED: AVOIDED Q3 PERFORMANCE
REVIEW") subscribe to the event, not to bullet styling. Naming
this distinction so a future contributor doesn't wire achievement
triggers off `severity` directly, which would be the wrong
gradient.

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

**Commitment:** the contract above. Bullets use Phaser 4's Arcade
physics (AABB, no inter-bullet rigid body); Matter is out of scope.
The `behavior` discriminated union lives on the base `Bullet`
class with `linear` as a free default. `BulletTickContext` is the
read-only view bullets get of the world; `playerActionLog` is the
`PlayerActionLogReader` interface, not a raw array. Split resolution
goes through `BulletSpawner`'s deferred queue with explicit
`onSaturation` semantics. Near-miss is a `RunController` event;
the bullet's `severity` field drives only the *visual* near-miss
treatment. Designer owns `PayloadCategory` content (lives in
`assets/data/payload-categories.json5`) and the `severity` curve;
architect owns the `BulletBehavior` union (additions are
architecture decisions following the variant-addition request flow
above). Hazard entities (area-denial, lingering effects) are out
of scope for the bullet contract and get their own future
proposal.

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

- Runs in `BootScene` — specifically, *after* `GameState` is
  hydrated from localStorage and *before* `PreloadScene` kicks off.
  The splash screen visible during this window is a solid-color
  background owned by `BootScene`, so the user never sees a
  "benchmarking" beat. (Section 1 previously said the benchmark
  hides "under loading time" in PreloadScene; this section is
  authoritative — the benchmark runs in BootScene, the splash
  screen continuity hides it.)
- The benchmark texture is **procedurally generated** in
  `BootScene` itself, not preloaded. A 32×32 RGBA `RenderTexture`
  is created with `scene.add.renderTexture()`, filled with a
  radial gradient via canvas operations, and used as the texture
  for every benchmark sprite. This avoids a preload dependency
  and means BootScene needs zero asset-loader machinery. The
  procedural texture exercises the same fragment-shader path as
  real sprites, which is what the benchmark needs to measure.
- Spawns 2,000 textured sprites at random positions, runs for ~250ms
  (measured frame-time), reads back median/p95 frame time.
- Maps the result to `'capable' | 'mid' | 'weak'` via thresholds
  the engineer tunes once on real devices (iPhone 12 = boundary
  between mid and capable on the low end of capable; iPhone 8 =
  mid; sub-2020 Android with PowerVR = weak).
- Writes the result + the input hints + a timestamp into
  localStorage (under `GameState.deviceProfile`) and tears down
  the benchmark sprites + render texture before transitioning to
  `PreloadScene`.

**Boot ordering with cache fast-path:**

```
BootScene.create():
  1. Hydrate GameState from localStorage (sync, ~5ms)
  2. Read GameState.deviceProfile
  3. If profile exists AND fresher than 30 days AND appVersion matches:
       -> use cached profile (zero benchmark frames; ~5ms total)
  4. Else:
       -> generate procedural benchmark texture
       -> run 250ms benchmark
       -> compute DeviceProfile, write to GameState, persist to localStorage
       -> tear down benchmark resources
  5. scene.start('PreloadScene', { deviceProfile })
```

The user-perceived boot cost on a *returning* session is ~5ms
of localStorage rehydration plus zero benchmark frames — that's
the actual UX, and it's what the cache exists for. First-session
boot pays the 250ms benchmark cost once.

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

**The per-floor density floor, expressed on top of `DeviceClass`
(Commitment 4 of the accepted proposal):**

```ts
// src/core/density.ts

export type FloorDensityMultiplier = number; // 0.5..1.0

/** The MINIMUM density a floor can degrade to on a given device
 *  class. NOT the default applied at scene start. Designer owns
 *  the numerics (deferred per accepted proposal Open Question 2);
 *  the shape is architecture: per-floor, per-class.
 *
 *  Density starts at 1.0 on every floor for every device class.
 *  Degradation is applied at runtime by the per-floor adapter when
 *  the framerate-budget controller can't hold its target through
 *  framerate or fidelity adjustments alone.
 *
 *  Floor 5 exception: floors at 0.75 (not 0.50). On Floor 5
 *  specifically, the degradation order is:
 *    1. framerate first  (60fps -> 30fps locked)
 *    2. fidelity second  (cheaper shaders, lower-res LUT, skip
 *                         post-process passes)
 *    3. density LAST     (only if 1 and 2 haven't held the budget)
 *
 *  Floors 1-4 may degrade through any combination — designer call
 *  per floor. Floor 5's order is non-negotiable because density is
 *  the carrier of "the bullets are *you*" and dropping it first
 *  kills the dramaturgy. */
export const FLOOR_DENSITY_FLOOR: Readonly<
  Record<DeviceClass, Readonly<Record<FloorIndex, FloorDensityMultiplier>>>
> = {
  capable: { 1: 1.00, 2: 1.00, 3: 1.00, 4: 1.00, 5: 1.00 },
  mid:     { 1: 0.75, 2: 0.75, 3: 0.75, 4: 0.75, 5: 0.85 },
  weak:    { 1: 0.50, 2: 0.50, 3: 0.50, 4: 0.50, 5: 0.75 },
};
```

The engineer's per-floor adapter implements the
"framerate → fidelity → density" Floor-5 ordering as a non-default;
Floors 1-4 use the default order designer specifies in the per-floor
pattern-emitter proposals. The architecture commits to the *shape*
(per-floor, per-class minimum density) and the *Floor-5 ordering
constraint*; designer commits to the numbers and the per-floor
order.

**Why I'm picking benchmark over renderer-string parse, given that
parse is "free":**

The privacy-blocking trajectory on `WEBGL_debug_renderer_info` is
clear — it's been deprecated/blocked progressively across browsers
since 2022. Building a load-bearing detection mechanism on a signal
that's degrading is buying tech debt with a known maturation date.
The 250ms benchmark cost hides under the splash; nothing else in
the boot path is faster.

**Commitment:** `detectDeviceClass()` runs in `BootScene` *after*
`GameState` is hydrated and *before* `PreloadScene` starts, using a
procedurally-generated benchmark texture so there's no preload
dependency. The profile caches in localStorage (under
`GameState.deviceProfile`) with a 30-day re-benchmark window and an
app-version invalidation; returning sessions pay zero benchmark
frames. The `FLOOR_DENSITY_FLOOR` table in `src/core/density.ts`
is the *minimum* density a floor can degrade to (NOT the starting
density). Density starts at 1.0 and degrades only when the
framerate-budget controller can't hold target through other levers.
On Floor 5 the degradation order (framerate → fidelity → density)
is architecturally fixed; on Floors 1-4 designer specifies it per
floor. Designer owns the multiplier values; the table shape, the
Floor-5 floor, and the Floor-5 degradation order are architecture.

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
   `tools/pack-atlas.ts` script under Bun (native TS execution),
   no external binary spawn, no install dance for new contributors.
   Bun-compatibility smoke-tested at scaffold time (section 12);
   Node fallback available for this single tool if needed.
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

### 11. Source layout and runtime

The path aliases in section 4 imply a directory structure under
`src/`. Naming it explicitly so ownership routing on PRs is
unambiguous and so engineer doesn't invent the layout at scaffold
time.

```
src/
├── core/         # GameState, RunController, density, device, run-event bus.
│                 # OWNER: architect.
├── scenes/       # Boot, Preload, Menu, Floor1..5, End, Hud, RunScene.
│                 # OWNER: shared (architect for shape, designer for content).
├── bullets/      # Bullet, BulletSpawner, BulletBehavior union, types.ts.
│                 # OWNER: architect (contract); engineer (impl).
├── patterns/     # Pattern emitters per floor.
│                 # OWNER: designer (specs in assets/data/); engineer (runtime).
├── hud/          # rexUI-based HUD components, corporate-jargon glyphs.
│                 # OWNER: shared (architect for shape, designer for content).
├── audio/        # Audio bus, ducking, per-floor bed mixer.
│                 # OWNER: deferred to audio-architecture follow-up.
├── phaser/       # Thin typed facades around Phaser 4 API surfaces
│                 # where exactOptionalPropertyTypes (section 4) or
│                 # Phaser type residue (section 10) needs absorbing.
│                 # OWNER: architect.
└── shaders/      # GLSL pipeline runtime — LUT swap, per-sprite shader,
                  # post-process pass orchestration.
                  # OWNER: architect (pipeline); engineer (impl).
```

The same lint-style check that enforces "no code reads from
`assets/raw/`" (section 2) also enforces this: no cross-import
between `src/bullets/` and `src/patterns/` except through the
`BulletSpawnSpec` contract, no import from `src/scenes/` into
`src/core/` (the dependency runs the other way), and no import
into `src/phaser/` from anywhere except `src/core/` and the
relevant subsystem.

### 12. Runtime — package manager, script executor

**Bun 1.1+ as runtime + package manager + script executor.** Vite
remains the bundler; Vitest remains the test runner. Reasons:

- **Installs are 3-10× faster than `npm`.** On a multi-year solo
  build, that compounds.
- **Native TypeScript execution.** Drops `tsx` from the toolchain
  entirely. `tools/pack-atlas.ts` and `tools/build-data.ts` run
  under Bun directly (`bun tools/pack-atlas.ts`).
- **Single binary** for runtime, package manager, and TS execution.
  Fewer moving parts in the dev environment.
- **LLM-corpus tax is narrower than the original `npm` framing
  suggested.** Most Phaser/Vite/Vitest snippets are runtime-agnostic.
  The Bun-specific surface is small: lockfile (`bun.lockb`), the
  `bun:` prefix for built-ins if we use any, and the occasional
  npm package that depends on Node-specific behavior Bun hasn't
  fully matched.

**What stays on Vite / Vitest (load-bearing, not preference):**

- **Vite is the bundler.** Bun's bundler is fine for libraries, but
  the Phaser 4 corpus is on Vite, and Vite's HMR + plugin ecosystem
  is what `vite-tsconfig-paths` and the dev-loop ergonomics in
  section 4 lean on. Bun runs Vite (`bun --bun vite dev`); it
  does not replace it.
- **Vitest is the test runner**, not `bun:test`. Reason:
  `@vitest/browser` (the renderer-touching tier from section 5) is
  Vitest-specific and gives us the Playwright integration the
  determinism harness assumes. `bun:test` is fast but doesn't have
  an equivalent browser-mode story yet. Run Vitest under Bun
  (`bun --bun vitest`).

**Risks named:**

- **Bun moves faster than Node.** API surface is still settling.
  Mitigation: pin Bun version in `package.json` `engines` and in
  `.bun-version`; upgrade deliberately, not automatically.
- **`free-tex-packer-core` is the riskiest dependency for Bun
  compatibility** — pure Node, but image-processing libraries
  sometimes assume specific Node Buffer or fs behavior. Engineer
  smoke-tests it on day one of scaffolding. If it breaks, fall
  back to running `tools/pack-atlas.ts` under Node (Bun and Node
  can coexist in a single repo); this does not block adoption.

**Commitment:** Bun 1.1+ as runtime + package manager + TS executor.
Vite as bundler, Vitest as test runner, both run under Bun. Bun
version pinned in `package.json` `engines` and `.bun-version`.
`tsx` dropped from the toolchain.

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
     action log via the `PlayerActionLogReader` interface. How long
     is the retained window? Is it the whole run? Just the current
     floor? The whole prior run, so Floor 5 is haunted by the
     player you were before? The architecture supports any of these
     — the `PlayerActionLogReader` interface hides the underlying
     ring buffer, so changing retention does not ripple through
     bullet code. **Designer's round-1 intuition (recorded, not
     yet committed): whole prior run.** Cost estimate ~150KB at
     10 actions/sec × 600s × 24 bytes. Formal commitment lives
     in the Floor-5 pattern-emitter proposal.

5. **Visual-regression golden image strategy on a multi-month
   build.** — owner: engineer.
   - Goldens go stale as the visual register evolves. The engineer
     needs a clear ritual for re-baselining golden images that
     doesn't degrade into "just run `update-goldens` whenever
     tests fail." Probably looks like a per-PR review of golden
     diffs, with explicit acceptance. Doesn't gate scaffolding;
     names the cost so it doesn't get discovered later.

6. **Hazard entity contract (area-denial, lingering effects).** —
   owner: designer + architect.
   - The bullet contract (section 6) explicitly excludes hazards
     ("a foreclosure zone you can't enter for 5 seconds", "a
     performance-review aura that drains capital"). When Floor 3
     or Floor 4 pattern designs first demand a hazard, that
     spawns a `Hazard` entity proposal (designer-surfaced,
     architect-shaped) that lives parallel to the bullet contract.
     Doesn't gate scaffolding; flagging so it doesn't get
     absorbed into `BulletBehavior` by accident.

7. **Schema-versioning for `assets/data/*.json5` files.** — owner:
   designer + architect.
   - Designer authors content schemas (Zod) that `build:data`
     validates against. As schemas evolve, existing JSON5 content
     needs migration. This is the same family of problem as the
     localStorage save-state schema-versioning question (OQ3 of
     the parent), but it's content-side and probably gets a
     simpler answer (regenerate-from-source vs. migrate). Defers
     to the first time a schema-breaking change ships.

---
# Review: engineer

**Date**: 2026-05-10
**Decision**: Request for Comment

**Comments**

The proposal is genuinely strong — significantly easier to plan against
than the parent. The round 1 → round 2 maturation on the parent
proposal is showing here, and section 6 (bullet entity) and section 7
(device-class detection) read like they were written by someone who
has actually built games in Phaser. I appreciate that.

Decision is **Request for Comment** rather than Aligned because there
are a handful of specific gaps that would force me to invent answers
at scaffold time — which is exactly what this proposal exists to
prevent. None require relitigating any of the architectural decisions.
All are sharpenings of decisions that are mostly already there.

Concerns are organized by section. I've called out blocking gaps
(things I'd need answered before scaffolding) versus non-blocking
notes for the record.

### Section 6 — Bullet entity contract (most concerns here)

The contract is largely buildable, and I support the discriminated-
union approach over a subclass tree. Three specific friction points,
in descending order of importance:

**6a. `BulletSpawnSpec` recursion in `BulletBehavior.split` needs an
explicit pool-pressure story.** The `split` variant carries
`intoSpec: BulletSpawnSpec[]`, each of which can itself have
`behavior: { kind: 'split', intoSpec: ... }` recursively. Type-wise
fine. At runtime, "resolved at split time" (per the comment) leaves
two questions open:

- Who calls back into `BulletSpawner.spawn(spec)` for each split-
  child — the splitting bullet itself in `tick()`, or a deferred
  queue the spawner drains? The split bullet calling spawn directly
  during its own `tick()` makes the `tick()` path stateful in a way
  that complicates the pool's "spawned this frame" accounting.
- What happens when a split would exceed `maxSize`? The proposal
  says "the spawner refuses to allocate above `maxSize` and emits
  a `pool-saturation` event" — good. But for `split` specifically,
  partial fulfilment (3 of 5 splits succeed, 2 are dropped) may
  break the visual semantics of the cascade. Engineer needs to know
  whether the contract is "all-or-nothing" or "best-effort with
  saturation event."

Resolution would be one paragraph in section 6: who resolves the
split, when, and what the saturation behavior is. **Blocking.**

**6b. Physics system is assumed but not committed.**
`Bullet extends Phaser.Physics.Arcade.Sprite` makes the call —
implicitly, Arcade physics. Phaser 4 has Arcade (lightweight, AABB,
right for bullet hell) and Matter (full rigid body, wrong for this
game). The choice is correct but should be explicit in the
commitment, because:

- It's a real architectural commitment with downstream consequences
  (collision groups, body sizing, velocity contracts).
- Designer reads section 6 to understand what pattern emitters
  produce; "Arcade" affects what kinds of motion are cheap vs.
  expensive (constant velocity = free; curved paths = per-tick
  velocity updates; rigid-body collisions between bullets = not a
  thing in Arcade).

One sentence in section 6: "Bullets use Phaser 4's Arcade physics
(AABB collision, no inter-bullet rigid body); Matter is out of
scope." **Blocking** — quick to fix.

**6c. `declare` on class fields + `useDefineForClassFields: true` is
a known footgun against Phaser's prototype-initialized state.** The
contract uses `declare` for every field on `Bullet` to "avoid
re-initializing them in the constructor." With `useDefineForClassFields`
enabled (section 4), `declare`-only fields don't emit any runtime
initialization, which is the intent. But Phaser's `Sprite` superclass
does a lot of prototype-time field initialization; if any of *those*
fields collide with a name we add via `declare`, the subclass
declarations can shadow superclass initializers in a way that's
silent at compile time and broken at runtime.

Not a blocker — this just means I'll write a smoke test on day one
that verifies a freshly-spawned `Bullet` has all the Phaser fields
populated correctly (body, scene reference, texture, frame). But the
proposal should acknowledge the interaction so I'm not surprised by
it. **Non-blocking** — I'll catch it; just naming it for the record.

**6d. `BulletTickContext.playerActionLog` on the hot path will not
scale.** The context is passed every tick to every active bullet.
Even though `playerActionLog` is a `ReadonlyArray<PlayerAction>`,
it's being passed by reference (free) — but the *intent* in section
6 is that recursive bullets sample from it. If `playerActionLog`
grows unbounded across a Floor 5 run (which Open Question 4 leaves
unresolved), then every bullet's tick context is carrying a
reference to a growing array. Cheap in JS, but the moment someone
copies it (defensively, accidentally, in a future contributor's PR)
it becomes O(active_bullets × log_length) per tick.

Cleaner shape: pass a `PlayerActionLogReader` interface — a small
read-only handle exposing `getActionAtTick(t)` and `length` — rather
than the full array. The recursive variant pulls what it needs;
non-recursive variants pay nothing. This also lets the log
implementation be a ring buffer without leaking that detail to
every bullet. **Non-blocking** but worth a note in section 6 that
the array form is provisional and will tighten when Open Question 4
resolves.

### Section 4 — TypeScript baseline

Mostly realistic. Two specific notes:

**4a. `exactOptionalPropertyTypes: true` against Phaser 4's API
surface.** `exactOptionalPropertyTypes` is correct for our internal
types (the bullet payload genuinely cares about absent vs.
undefined). But it interacts painfully with Phaser 4's many config
objects that accept optional fields where `undefined` is a valid
"use the default" signal. I'll be writing `Partial<...>` and
`Omit<...>` adapters at the Phaser boundary regularly. Not a
blocker — this is the price of the flag — but worth one sentence
acknowledging the boundary cost so it doesn't read as scaffold
breakage when the first config object errors. **Non-blocking.**

**4b. Path aliases need `vite-tsconfig-paths`, not `resolve.alias`.**
The proposal mentions both as options. Stating one — preferably
`vite-tsconfig-paths` — avoids drift. With `resolve.alias`, the
alias list lives in two places (tsconfig + vite.config) and they
will diverge eventually. With the plugin, tsconfig is the single
source of truth. Recommend committing to the plugin in section 4.
**Non-blocking** but a real foot-gun if not pinned.

**4c. ESLint baseline is missing.** `strict: true` catches type
errors; lint catches style and gotcha errors (`no-floating-promises`,
`prefer-readonly`, `no-non-null-assertion`, `import/order`). For a
multi-year solo build the lint discipline is as important as the
type discipline. The proposal should either commit to a lint config
(typescript-eslint with strict-type-checked) or explicitly defer it.
Currently it's silent, which means it'll get added by whoever
scaffolds without architectural input. **Non-blocking but should
not stay silent.**

### Section 5 — Test framework

Vitest + Playwright is the right split and matches my standing
preference. Three gaps:

**5a. Determinism harness for visual-regression is unspecified.**
"Floor 1 at tick 600 with a fixed seed" requires controlling *every*
source of non-determinism: the seedable RNG (committed), but also
`Date.now()`, `performance.now()`, `Math.random()` (Phaser uses it
internally in some places), the `requestAnimationFrame` clock, and
whatever Phaser uses for tween timing. Without a deterministic clock
harness wrapped around Playwright, the visual-regression suite will
be flaky from week one and we'll learn the lesson the hard way.

The proposal commits to "fixed seed" but the seed is just one input.
A real determinism harness includes (a) a fake clock injected into
Phaser's game config, (b) a `Math.random` override or a Phaser-RNG
substitution everywhere, (c) a fixed `pixelRatio` so DPR doesn't
shift the rendered output. This is a real scaffolding decision and
I'd want it named or explicitly deferred. **Blocking** — it's not
work I can defer past scaffold without paying for it.

**5b. The Vitest WebGL stub strategy isn't picked.** Section 5 says
"stateful logic with stub renderers" but doesn't commit to *what*
the stub is. Vitest defaults to jsdom, which has no WebGL. Real
choices include: `@vitest/browser` with Playwright as the runner
(real WebGL, slower); `webgl-mock` or similar (synthetic, faster,
catches less); or test only logic that doesn't touch the renderer
(narrow scope, but clear). Each has different friction.

This affects what unit-testable code looks like — if the stub is
narrow, I'll write a lot of code that wraps Phaser rendering calls
behind small testable surfaces. If the stub is real WebGL via
browser mode, I can test scene logic more directly. The choice
shapes the codebase. **Blocking.**

**5c. Real-device profiling deferral is correct but the trip-wire
isn't named.** Section 5 says real-device mobile profiling is "a
separate task with its own infrastructure decisions." Fine — but
when does that task spawn? After scaffolding? After the shader
prototype? Before pre-Alpha? Without a soft trigger, this stays
deferred indefinitely. Recommend: "spawned when the shader
prototype's per-sprite shader test is being measured against the
iPhone 12-class budget — which is the first time real-device
profiling becomes load-bearing." **Non-blocking** but worth one
sentence.

### Section 7 — Device-class detection

Mechanism choice (benchmark + hint pre-filter + cache) is sound. The
boot ordering needs a sharpening pass:

**7a. Where exactly does the benchmark run, and in what order
relative to `GameState` rehydration?** Section 7 says "Runs in
`BootScene` (or earlier, before `PreloadScene`)." Section 1 says
PreloadScene "hides the first-frame benchmark (~250ms) under loading
time." These are inconsistent.

If the benchmark runs in `BootScene`, it needs textured sprites,
which means a benchmark texture has to be loaded before the
benchmark runs — which `BootScene` doesn't do (`PreloadScene` does).
Three resolutions:

- Procedurally generate a benchmark texture in `BootScene` (cheap,
  but tests a different render path than real game rendering)
- Load a tiny benchmark texture in `BootScene` itself before
  benchmarking (1-2 frames extra, but tests the real path)
- Move the benchmark into `PreloadScene` after a benchmark texture
  loads but before the main asset load (couples preload timing to
  benchmarking)

Whichever is correct, sections 1 and 7 should agree. **Blocking.**

**7b. Cached `DeviceProfile` lives in `GameState`, which is hydrated
in `BootScene` — what's the read order?** Pseudocode I'd want stated:

```
BootScene.create():
  hydrate GameState from localStorage
  read GameState.deviceProfile
  if (profile && fresh && version-match): use cached profile
  else: run benchmark → write to GameState → persist
  transition to PreloadScene
```

The cost on returning sessions should be zero benchmark frames.
Section 7 implies this but doesn't say it. Worth stating as a
commitment because the user-perceived boot cost is the actual UX,
not the worst-case cost. **Non-blocking** but a clarity win.

### Section 3 — Bundler / build pipeline

Vite + atlas-as-pre-step is the right initial shape. One real
dev-loop concern and two minor ones:

**3a. Mid-session art changes break the dev loop.** `npm run dev`
runs `pack:atlas` once, then `vite dev`. If a new asset arrives mid-
session (which will happen — AI-generated art is bursty in batches
of related sprites), the atlas does NOT regenerate. The engineer
has to: kill `vite dev`, re-run `pack:atlas`, restart `vite dev`.
For a multi-year build this is real friction.

The proposal mentions migration to a Vite plugin as future work,
but no trip-wire. Suggest naming a soft trigger ("when art-iteration
restart count exceeds N per week, the plugin earns its complexity")
so we don't normalize the friction. **Non-blocking** but the
ergonomics deserve at least a tagged trip-wire.

**3b. `free-tex-packer-core` cache scope needs verification.** The
proposal says it skips unchanged inputs via hash check. The cache
scope (per-file, per-atlas-group, in-memory only, on-disk) affects
whether `npm run dev` is fast on a cold start. Worth a one-line
verification in scaffolding ("confirm cache lives on-disk and
survives node process restart") — not because it changes the
commitment, but because if the cache is in-memory, the cold-start
cost is the worst case every time and we'd want a manual cache
layer. **Non-blocking** — engineer task at scaffold time.

**3c. `build:data` (JSON5 → JSON + validate) is a tool we have to
write.** Listed as a pipeline step but not as scope. Validation
needs a schema (Zod, ajv, JSONSchema); the schema needs an owner
(designer's pattern format — designer? me? joint?). Worth either
naming the validator or deferring it explicitly. **Non-blocking**
but a missing scope item.

**3d. `posttest:visual` inside `npm run build` is semantically
confused.** Visual-regression is verification, not build. Putting
it in the `build` chain means CI runs the build twice if it also
runs verification separately. Suggest: `npm run build` produces
dist/, `npm run verify` runs Vitest + Playwright, `npm run ci`
runs both. **Non-blocking** — naming nit.

### Cross-cutting gaps

A few small things that don't fit a section:

- **Source layout under `src/` is implied but not stated.** Path
  aliases imply `src/core`, `src/scenes`, `src/bullets`, `src/hud`,
  `src/patterns`, `src/audio`, but there's no directory contract
  the way `assets/` has one in section 2. Worth one paragraph
  mirroring the assets treatment, especially since the boundaries
  (architect-owned vs designer-owned vs engineer-owned) matter for
  ownership routing on PRs. **Non-blocking.**
- **No commitment on package manager or Node version.** Section 3
  uses `npm` implicitly. A `.nvmrc` and `engines` field are routine
  but worth a one-line commitment so I don't reach for `pnpm` out
  of habit. **Non-blocking.**
- **`RunScene` as a "long-lived non-rendered scene" (section 1)
  is a discipline, not a flag.** The pattern works (skip `add.*`
  calls, set `cameras.main.setVisible(false)`), but calling out
  that "non-rendered" is enforced by what we don't do — not by
  Phaser API — would prevent a future contributor from accidentally
  rendering into it. **Non-blocking** clarity note.

### What I support without reservation

So my decision lands as feedback rather than a list of complaints —
the things in this proposal I'd want preserved as-is:

- Each floor as a separate `Scene` subclass (not a parameterized
  `RunScene`). The renderer-state-reset argument is right.
- `HudScene` as a parallel scene. Standard Phaser idiom and gives
  us the visual continuity the corporate-jargon HUD needs.
- Three-layer state hierarchy (Game / Run / Scene-local) with
  explicit owners. Clean separation that I can actually plan
  against.
- The `BulletBehavior` discriminated union over a subclass tree.
  Single `classType` for the Group, free `linear` default, additive
  variants. Right shape.
- `free-tex-packer-core`. License, Node-native, Phaser-native
  output. No further conversation needed.
- rexUI under Phaser 4 with the `phaser4-rex-plugins` import path.
  Audit is concrete and the shim story (grep-and-replace) is
  honest about the residual risk.
- `strict: true` + `skipLibCheck: true` + tagged `// @ts-expect-error`
  convention for Phaser type residue. Pragmatic and right-sized.

### Summary

The proposal is ~85% scaffolding-ready from my side. The blocking
gaps are: bullet split-spec pool semantics (6a), physics system
commitment (6b), determinism harness (5a), Vitest WebGL stub strategy
(5b), and benchmark-vs-preload ordering (7a). Five sentences to
several paragraphs, depending — none require rethinking the
architecture, all require making implicit decisions explicit.

Once those land I'm Aligned and ready to plan against this.

---
# Review: designer

**Date**: 2026-05-10
**Decision**: Request for Comment

**Comments**

The proposal does what a Round-2 follow-up should do — picks up Open
Question 6 of the parent and resolves the specific deferrals that were
gating scaffolding. Sections 6 and 7 in particular read like they were
written by someone who actually thought about how a designer would
consume the contract, not just how an engineer would build against it.
That matters and it lands.

I'm filing **Request for Comment** rather than Aligned because three
specific design-facing parts are either too narrow or read in a way I'd
want clarified before scaffolding. None ask the architect to relitigate
shape; all ask for tightening or one-line clarifications. I also have
an immediate intuition on Open Question 4 I want on the record.

I'm not re-raising what the engineer raised. Their 6a/6b/5a/5b/7a are
all real and need to land; I'm aligned with their ask, particularly on
6d (the `PlayerActionLogReader` interface), because that interface is
the right shape for the Floor 5 retention question I'm about to flag.

### Section 6 — Bullet entity contract

**6.D1. `PayloadCategory` as a closed four-value union is too narrow
for the per-floor jargon registers.** The current union is
`'deliverable' | 'instrument' | 'directive' | 'datum'`. The README
specifies five floors with distinct material registers — Mercantile
(whips, gears, smoke, coins), Industrial (mechanical/repetitive),
Financial (contracts, foreclosures, margin calls), Platform (deadlines,
KPIs, notifications, performance metrics), and AI (the bullets are
*you*). The proposal collapses Mercantile and Industrial into one
`'deliverable'` bucket, which erases a tonal distinction that's
load-bearing for the historical-stage progression.

This is a category mistake about what `PayloadCategory` is for. Closed
unions are correct when the consumer (HUD styling, audio cue
selection) needs exhaustive switching. They are wrong when the values
themselves are designer-authored content that will grow as the floors
get fleshed out. The corporate-jargon vocabulary is content; it
shouldn't require an architecture proposal to add a category for
"REORGANIZATION OUTPUT" or "DUE DILIGENCE NOTICE."

Two ways out, both acceptable to me:

- **(A) Make `PayloadCategory` a branded string** (`type PayloadCategory
  = string & { readonly __brand: 'PayloadCategory' }`) and have the
  closed enumeration live in `assets/data/payload-categories.json5`
  alongside the labels table. The HUD styling and audio cue selection
  switch on the string, with a fallback styling for unknown categories.
  This is the same pattern as `PatternId` and `EmitterId` already in
  this section.
- **(B) Expand the union to one entry per floor** —
  `'mercantile' | 'industrial' | 'financial' | 'platform' | 'ai'` — and
  let the `label` field carry the within-floor variation. This keeps
  exhaustive switching but stops the Mercantile/Industrial collapse.

I lean toward (A) because it gives me an authoring surface I can iterate
on without architecture review for every new corporate-jargon category.
But (B) preserves more compile-time safety. Architect picks. **Blocking
in the sense that I'd want one of these landed before scaffolding** —
the difference between "categories are content" and "categories are
architecture" propagates into how I structure `assets/data/`.

**6.D2. Near-miss is implied as a styling input, not as an event.**
The `severity` comment says it drives "color, glyph weight, screen-shake
on near-miss." Screen-shake-on-near-miss is fine as a styling
consequence. But near-miss is *also* an achievement-trigger surface —
"VESTED: AVOIDED Q3 PERFORMANCE REVIEW BY 4 PIXELS" is exactly the kind
of corporate-jargon achievement the README anchors. That requires
near-miss-as-event, not near-miss-as-styling-input.

Not a blocker on this proposal — the achievement system is downstream
and probably its own designer-owned proposal — but worth one sentence
in section 6 acknowledging that "near-miss-as-event" lives outside the
bullet entity contract and will hook into the run-state event bus
(`RunController` emits `near-miss` per the section 1 pattern). Otherwise
a future contributor will see `severity` driving near-miss styling and
wire achievements off it directly, which is the wrong gradient.
**Non-blocking** but a clarity win.

**6.D3. `BulletBehavior` union is sufficient for what I currently
imagine, with one caveat.** The four variants (`linear | homing | split
| recursive`) cover the patterns I have in mind for the five floors:

- Floor 1 (Mercantile): `linear` covers most. Arc-trajectory coins
  could be a `parametric` variant later, but it's additive.
- Floor 2 (Industrial): `linear` plus pattern-emitter repetition.
- Floor 3 (Financial): `split` for margin-call cascades. `homing` for
  foreclosure notices.
- Floor 4 (Platform): `homing` for notifications. KPI-buildup-detonate
  is pattern-emitter behavior, not bullet behavior.
- Floor 5 (AI): `recursive`.

What it doesn't cover: **area-denial / lingering hazards** (a contract
that creates a no-go zone for N seconds, or a "performance review" zone
where standing inside it drains capital). These are arguably not
bullets — they're hazards — and probably belong in a separate entity
type, not as a `BulletBehavior` variant. I'm flagging this as a future
question, not a blocker on this proposal. The contract is right for
*bullets*; I'd want a separate `Hazard` entity proposal when Floor 3
or 4 patterns demand it.

The proposal says "additions to the union are architecture decisions."
Good. It doesn't name the request flow — designer surfaces a need,
architect proposes the addition. Worth one sentence so the gradient is
explicit. **Non-blocking.**

### Section 7 — Density curve

**7.D1. The `FLOOR_DENSITY_DEFAULT` table reads as a *default*
multiplier applied at scene start, but my Round-1 commitment was that
Floor 5 density is the *last* lever, not the first.** The mid-tier
row says Floor 5 = 0.85 — which reads as "Floor 5 on a mid device
takes a 15% density cut at scene start." That's the wrong order. The
designer commitment (in my Round-1 review of the parent, and now in my
memory) is: on Floor 5, framerate drops first (60 → 30fps), visual
fidelity drops next (cheaper shaders, lower-res LUT, skip post-process
passes), and density is cut *only* if those two haven't been enough.

The numbers themselves are fine — 0.85 mid, 0.75 weak — as the **floor**
that density can fall to. They're not fine as a default applied at
scene start. The table needs a comment, or better, a different name —
something like `FLOOR_DENSITY_FLOOR` or `FLOOR_DENSITY_FALLBACK_FLOOR`
— that makes it semantically explicit this is the floor density falls
*to* after framerate and fidelity have already been degraded, not what
density starts at.

The mechanism question (whose responsibility is it to drive the
"framerate first → fidelity second → density last" ordering on Floor 5
specifically?) is engineer's at implementation time. The architecture
needs to make the *intent* explicit so the engineer doesn't read the
table and implement "multiply density by `FLOOR_DENSITY_DEFAULT[class]
[floor]` at scene start" — which is what the table currently invites.

Resolution: rename the constant, or add a comment making the
"this is the floor, not the default" reading explicit. Plus one
sentence in the section 7 prose stating the Floor-5 degradation order
(framerate → fidelity → density) is a Floor-5-specific commitment that
the engineer's per-floor adapter implements, not a global rule.
**Blocking** — small fix, real semantic clarification.

### Section 1 — Scene topology

**1.D1. EndScene as a single scene with two voices is fine *if* the
voices are designed as distinct experiences.** Section 1 names
"separation paperwork on death, performance review on victory." Both
register as corporate-jargon, but they're not the same register —
death is the cruel-deadpan ("YOUR FY24 PERFORMANCE DID NOT MEET
EXPECTATIONS"), victory is the colder, more institutional ("CONGRATS
ON YOUR Q4 EXIT — PLEASE COMPLETE THE OFFBOARDING SURVEY"). Both are
deadpan; the cruelty texture differs.

A single `EndScene` that switches voice on a victory/death flag is
architecturally correct, but content-wise these are two scenes' worth
of writing. A future contributor reading section 1 might collapse them
into one parameterized template that's neither register cleanly. Worth
one sentence acknowledging EndScene is a single scene with two
deliberately-distinct content paths — the architecture is shared; the
content is not. **Non-blocking** clarity note for designer-facing
documentation.

**1.D2. Audio transition shape across floor swaps is an unmentioned
seam.** Scene swap is the only moment we get to set up the next
floor's audio bed before the player is in it. The proposal mentions
audio-in-scope (inherited from the parent) but doesn't acknowledge
that floor-to-floor audio transitions are a designer concern that
needs the scene-swap seam to be available. This is genuinely
designer's domain, not architecture's, but the architecture has to
*permit* a fade-out-on-old-floor / fade-in-on-new-floor pattern, which
the parallel-HudScene-with-shared-audio-context might or might not
support cleanly. **Non-blocking** — flagging for the audio-architecture
follow-up Open Question 2 names.

### Section 2 — `assets/data/`

**2.D1. JSON5 with hand-notes fits how I want to work. Confirmed.**
The split (tooling reads JSON5; runtime reads pre-stripped JSON
generated as a build pre-step) is clean and it lets me leave inline
prose like `// "PERFORMANCE METRIC" — boss says this aloud during BOARD
REVIEW intro` without breaking parse. Good.

**2.D2. Schema for `assets/data/*.json5` files is unowned in this
proposal.** The engineer flagged this in their 3c. From my side: the
schemas for `payload-labels.json5` and (eventually) `pattern-
definitions.json5` are mine to author, but they don't exist yet
because the per-floor jargon hasn't been finalized. The proposal
should acknowledge "schema for `assets/data/*.json5` is designer-owned
and defers to designer's pattern-emitter / labels-table proposals."
That makes the gradient explicit and stops a future scaffolding-task
from inventing a schema before designer is ready. **Non-blocking** —
one-sentence acknowledgement.

### Open Question 4 — Floor 5's `PlayerActionLog` retention

Not formally resolving in this review. Immediate intuition on the
record so it doesn't get lost:

**The whole prior run.** Floor 5 should be haunted by the player
you were across all four prior floors, not just by the player you've
been for the last 90 seconds. "The bullets are *you*" is hollow if
"you" is only "you in the immediate past." It needs to be "you across
the run" — every dodge, every move, every shot, sampled back at you
in Floor 5.

Cost estimate: ~10 player-action-events per second × 60s × ~10 minutes
of typical run = ~6,000 entries × ~24 bytes = ~150KB. Memory is fine.
The performance concern is exactly what the engineer's 6d flagged —
passing the full array as a reference in `BulletTickContext` is cheap
in JS but a foot-gun the moment someone copies it. The
`PlayerActionLogReader` interface the engineer recommended is the
right shape for *both* performance and this design call: the reader
can implement "whole prior run" without leaking the ring-buffer
implementation to every bullet, and it can also be swapped to "current
floor only" or "last N seconds" if I'm wrong about the dramaturgy.

I'll commit to "whole prior run" formally in the Floor-5
pattern-emitter proposal. For now: the architecture should support
it (the proposal's `PlayerActionLog` ring-buffer language already
does), and the engineer's 6d should land so I have the right interface
to consume.

### Cross-cutting

**Scene-local state ownership for designer-authored content.** The
section 1 state hierarchy is clean (Game / Run / Scene-local). Worth
naming explicitly: pattern-emitter timers, pattern-progression state,
and floor-specific dialogue state are scene-local. This is implicit in
the table but I want it on the record so the pattern-emitter proposal
inherits this commitment without re-litigating it. **Non-blocking.**

**`PayloadCategory` per-floor coupling.** If we go with resolution
6.D1(B) (one category per floor), there's a temptation to make
`PayloadCategory` and `FloorIndex` derivable from each other. They
shouldn't be. Some patterns will cross-pollinate categories from prior
floors as a tonal callback (Floor 5 should be allowed to emit a
`'directive'`-categorized bullet labeled "LEGACY KPI" as a haunting).
The category is not a function of the floor. Worth flagging in
whatever resolution lands. **Non-blocking.**

### What I support without reservation

- The Boot → Preload → Menu → Floor1..5 → End scene topology with
  parallel HudScene + RunScene. The HUD-continuity argument is right
  and matches the deadpan-continuity the README demands.
- Each floor as a distinct `Scene` subclass. The renderer-state-reset
  argument from the architect is correct, and it gives me a clean
  boundary for per-floor visual-language shifts.
- Three-layer state hierarchy (Game / Run / Scene-local) with explicit
  owners. Clean, and I can plan content authoring against it.
- The `BulletBehavior` discriminated union over a subclass tree. Free
  `linear` default, additive variants. Right shape.
- `BulletTickContext` as a read-only view. Bullets-don't-write-to-the-
  world is exactly the invariant I want for predictable pattern
  semantics.
- JSON5 in `assets/data/` with build-time strip to JSON. Right
  authoring affordance.
- The Floor-5 density curve commitment carrying through from my Round-1
  ask on the parent — the *shape* (per-floor, Floor 5 as exception) is
  in the architecture. Modulo the 7.D1 reading-semantics fix, this is
  what I asked for.

### Summary

Three blocking asks (6.D1, 7.D1; the rest are clarity notes), one
intuition on the record for Open Question 4. None require rethinking
the architecture; all are tightening of decisions that are mostly
already there. The proposal is conceptually intact end-to-end and the
designer-facing surfaces (bullet payload, density curve, JSON5 data
authoring) are good faith attempts to give designer real ownership
without forcing architecture review for every content change.

Once 6.D1 and 7.D1 land, I'm Aligned.

---
# Architect response (round 1 → round 2)

**Date**: 2026-05-10
**Author**: architect

Folding both reviews in. Each reviewer's RFC items are addressed
inline in the body; this section is the index of what changed and
where, so round-2 reviewers don't have to re-read the whole document
to find what moved.

### Engineer's blockers

- **6a (split pool semantics)** — section 6, new "Split resolution
  semantics" block plus `onSaturation: 'best-effort' | 'all-or-nothing'`
  field on `BulletBehavior.split`. Resolution lives in `BulletSpawner`'s
  deferred queue, drained once per frame after `tick()` calls.
- **6b (Arcade physics commitment)** — section 6, new "Physics:
  Arcade, not Matter" paragraph before the contract; reflected in
  the section commitment.
- **5a (determinism harness)** — section 5, new "Determinism harness"
  block with the source-of-non-determinism table and the
  `runner.advanceToTick(N)` API. Reflected in the section commitment.
- **5b (Vitest WebGL stub strategy)** — section 5, "Vitest scope"
  rewritten as two-tier: jsdom for pure logic, `@vitest/browser`
  with Playwright runner for renderer-touching tests, opted into
  via `*.browser.test.ts` filename suffix.
- **7a (benchmark vs preload ordering)** — section 7, "The benchmark
  itself" rewritten to commit benchmark to BootScene with a
  procedurally-generated 32×32 RGBA RenderTexture (no preload
  dependency). Section 1 EndScene block unchanged but the
  "PreloadScene hides the benchmark" language in section 1 has been
  superseded by section 7's authoritative ordering.

### Engineer's non-blockers folded in

- **6c (`declare` + `useDefineForClassFields` Phaser superclass
  interaction)** — section 6, "Why this specific shape" / `declare`
  bullet now names the footgun and commits to a Tier-2 smoke test.
- **6d (`PlayerActionLogReader` interface)** — section 6 contract,
  new `PlayerActionLogReader` interface; `BulletTickContext.playerActionLog`
  changed from `ReadonlyArray<PlayerAction>` to `PlayerActionLogReader`.
  Designer's OQ4 intuition rides on this.
- **4a (`exactOptionalPropertyTypes` boundary cost)** — section 4,
  the `exactOptionalPropertyTypes` rationale now names the
  `Partial<...>` / `Omit<...>` adapter convention at the Phaser
  boundary (lives under `src/phaser/`).
- **4b (`vite-tsconfig-paths` over `resolve.alias`)** — section 4,
  path-aliases paragraph commits to `vite-tsconfig-paths` with
  `tsconfig.json` as single source of truth.
- **4c (ESLint baseline)** — section 4, new "ESLint baseline"
  paragraph commits to typescript-eslint strict-type-checked plus
  named overrides; runs in `verify` and pre-commit.
- **5c (real-device profiling trip-wire)** — section 5, "Out of
  scope" block names the trip-wire (shader-prototype iPhone-12
  measurement spawns the task).
- **3a (atlas-as-Vite-plugin trip-wire)** — section 3, decision
  block names the trip-wire (>3 art-iteration restarts/week × 2
  weeks).
- **3b (free-tex-packer-core cache scope)** — section 3, named as
  an engineer task at scaffold time with the on-disk-cache
  fallback path stated.
- **3c (build:data validator)** — section 3, new "build:data is a
  tool we have to write" paragraph. Engineer owns the tool, designer
  owns the schemas; pass-through-with-strip until schemas exist.
- **3d (posttest:visual semantics)** — section 3, build pipeline
  split into `build` / `verify` / `ci`.
- **7b (cache fast-path)** — section 7, new "Boot ordering with
  cache fast-path" pseudocode block making the zero-benchmark-frame
  return-session UX explicit.
- **Cross-cutting (`src/` layout)** — new section 11.
- **Cross-cutting (package manager + Node version)** — new section 12.
- **Cross-cutting (RunScene non-rendered as discipline)** — section 1,
  new paragraph naming the discipline and the contract test.

### Designer's blockers

- **6.D1 (`PayloadCategory` too narrow)** — went with resolution (A):
  `PayloadCategory` is now a branded string, content lives in
  `assets/data/payload-categories.json5`. Reasons: keeps content
  as content, matches existing `PatternId`/`EmitterId` brand
  pattern, gives designer real authoring surface without
  architecture review per category. Section 6 commitment updated;
  the "category is NOT a function of FloorIndex" flag from
  designer's cross-cutting note is in the type doc-comment.
- **7.D1 (density table reads with wrong semantics)** — renamed
  `FLOOR_DENSITY_DEFAULT` → `FLOOR_DENSITY_FLOOR`. Doc-comment now
  says "the MINIMUM density a floor can degrade to, NOT the default
  applied at scene start." Floor-5 degradation order
  (framerate → fidelity → density) is named as architecturally fixed
  and reflected in the section commitment.

### Designer's non-blockers folded in

- **6.D2 (near-miss as event)** — section 6, new "Near-miss is an
  event, not just a styling input" paragraph. `severity` drives
  visual treatment; `RunController` emits the event; achievements
  subscribe to the event.
- **6.D3 (area-denial / Hazard entity)** — section 6, "What this
  contract is not for" paragraph names hazards as structurally
  distinct from bullets and reserves a future `Hazard` entity
  proposal. New OQ6 added.
- **1.D1 (EndScene two voices)** — section 1, EndScene block in
  topology diagram now names death = cruel-deadpan and victory =
  institutional-deadpan as deliberately distinct content paths.
- **1.D2 (audio transition seam)** — section 1, new paragraph
  before commitment naming the seam as deferred to the audio-
  architecture follow-up (OQ2).
- **2.D2 (assets/data/ schema ownership)** — section 2, new bullet
  in ownership-boundaries naming designer as schema owner;
  commitment reflects the designer-owned deferral.
- **OQ4 designer intuition** — recorded in OQ4 itself (cost
  estimate, "whole prior run" lean, formal commitment in Floor-5
  pattern-emitter proposal).
- **Cross-cutting (variant-addition request flow)** — section 6,
  new paragraph in the "Resolved" block names the flow: designer
  surfaces, architect proposes, engineer implements.
- **Cross-cutting (scene-local content state)** — section 1, new
  paragraph naming pattern-emitter timers, pattern-progression
  state, and floor-specific dialogue state as scene-local.

### What I did NOT do

- Did not relitigate per-floor scene subclasses, parallel HudScene,
  three-layer state, `BulletBehavior` union over subclass tree,
  `free-tex-packer-core`, rexUI, strict TS + skipLibCheck,
  `BulletTickContext` read-only, or JSON5 data format. All of these
  were explicitly supported by both reviewers and are unchanged.
- Did not commit to OQ4's "whole prior run" formally. Designer
  recorded the intuition; the formal commitment lives in the
  Floor-5 pattern-emitter proposal where it belongs.

### What round-2 review needs to confirm

- Engineer: are 6a, 6b, 5a, 5b, 7a now buildable without inventing
  answers? And does the ESLint commitment match what you want as
  the rule-set baseline?
- Designer: does the branded `PayloadCategory` + content-in-`assets/data/`
  resolution give you the authoring surface you wanted, and does
  `FLOOR_DENSITY_FLOOR` (with the doc-comment + the named
  Floor-5 degradation order) read with the right semantics now?

If both are Aligned, this is ready for matt and acceptance.

---

# Architect response (round 2 → matt)

**Date**: 2026-05-10
**Author**: architect

Matt asked: *can we use Bun?* Yes. Section 12 has been rewritten to
commit Bun 1.1+ as the runtime + package manager + TS executor.
What changed and what stayed:

**Section 12 — runtime commitment.** Was `npm` + Node 22 LTS;
is now Bun 1.1+ pinned in `engines` and `.bun-version`. Wins:
3-10× faster installs, native TS execution (no `tsx`), single
binary for runtime + PM + TS. Cost: smaller LLM corpus than
Node/npm but the surface area where it matters is narrow
(lockfile, `bun:` prefix for built-ins, occasional Node-API
edge cases) — most Phaser/Vite/Vitest snippets are runtime-
agnostic. The original `npm`-because-corpus framing was
overweighted.

**Section 12 — what stays load-bearing.** Vite remains the
bundler (run under Bun via `bun --bun vite`); Vitest remains
the test runner (`bun --bun vitest`). `bun:test` is fast but
doesn't have the `@vitest/browser` Playwright integration the
determinism harness assumes. These are the structural commitments;
the runtime swap leaves them intact.

**Section 3 — script invocations updated.** All `npm run …`
references in the build pipeline diagram became `bun run …`.
`tools/pack-atlas.ts` and `tools/build-data.ts` now invoked
directly by Bun (no `tsx`). Section 8 `free-tex-packer-core`
rationale updated to name the Bun-compatibility smoke-test as
the gate, with Node fallback for that single tool if it trips.

**Section 12 — risks named.** Bun moves faster than Node;
mitigation is pinning the version and upgrading deliberately.
`free-tex-packer-core` is the single dependency most likely
to trip on Bun (image-processing libraries sometimes assume
Node-specific Buffer/fs behavior); engineer smoke-tests at
scaffold day one and falls back to Node for `pack:atlas` only
if needed. This does not block adoption.

**What I did NOT do.** Did not change the bundler (Vite stays).
Did not change the test runner (Vitest stays). Did not rewrite
the round-1 reviewer feedback that mentions `npm run dev` —
those are historical snapshots of the engineer's review at the
time, and rewriting them would make the document dishonest about
how the decision evolved.

**No re-review per matt's instruction.** Engineer + designer
already Aligned at the structural level (bundler, test runner,
data format, type baseline, scene topology, bullet contract,
BootScene benchmark). The runtime swap is an ergonomics call
matt owns, doesn't move any of those structural seams, and
re-running the loop for the seam that didn't change would be
ceremony.

Ready for acceptance.
