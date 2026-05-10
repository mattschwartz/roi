---
name: "Phaser 4 as the 2D game library"
description: "Lock Phaser 4 as the rendering and game-engine layer for Return on Investment, with PixiJS v8 named as the documented pivot path."
date_created: 2026-05-10
author: architect
status: accepted
reviewers: []
reviewer_decisions:
  engineer: Aligned
  designer: Aligned
  matt: Aligned
---

# Proposal: Phaser 4 as the 2D game library

## Problem

Return on Investment is a TypeScript browser bullet hell with five
escalating floors, deliberately stylized visuals, and a solo dev + LLM
build model. Before any game code is written, the rendering and
game-engine layer needs to be committed so downstream planning
(scaffolding, asset pipeline, scene/state machine, bullet pool) can
proceed against a fixed substrate.

The full candidate evaluation lives in the survey at
`.frames/sdlc/research/20260510-2d-library-survey.md`. This proposal
records the commitment, not the rationale — the survey carries the
depth.

## Proposal

**Use Phaser 4** as the 2D game library. Specifically Phaser 4
(stable since April 2026), not Phaser 3, not PixiJS v8, not any other
candidate.

The decision was made by Matt during task #314 after the survey's
original PixiJS v8 recommendation was reweighed against solo-dev
realities — speed-to-first-playable, density of LLM training corpus,
built-in bullet-pool primitive (`physics.add.group({ maxSize: ... })`).
The survey's *Decision* section captures that reasoning in full.

### The visual register the choice has to serve

The library has to carry a specific visual register, not a generic
"stylized" one. The tonal anchors are **Cruelty Squad** and **NORCO** —
deliberately ugly, hostile-color, posterized, dithered, readable-as-
broken on purpose. Not Hotline Miami / CRT-pastiche; not Slay the
Spire / clean illustration. The shader work is load-bearing for two
reasons: (1) it carries the per-floor visual shift across the
historical-stage progression (each floor is a different rendering
philosophy, not just a different sprite set), and (2) it unifies AI-
generated source material into a coherent visual identity. Phaser 4
has to be able to do this. Commitment 5 below is the early test that
it can.

### Player-facing seams the library choice affects

Three seams worth naming so they show up in planning rather than
getting discovered later. None are blockers; all are downstream of
this commitment.

- **Text rendering is a headline tonal feature, not solved-by-default.**
  HUD, menus, achievements, boss names, floor titles all speak fluent
  corporate-finance jargon — typography is a tonal carrier. Bitmap
  fonts vs. dynamic Canvas text has UX consequences (bitmap is fast
  and crisp but doesn't scale; Canvas text scales but can fuzz on
  high-DPR mobile). Treat as a planning seam.
- **Audio is in scope of Phaser** — Web Audio + HTML5 fallback, no
  Howler.js or third-party audio layer. Pre-empts a later "should we
  add an audio library" conversation.
- **Per-floor visual-language shift is a planning constraint.** Floors
  are different rendering philosophies (Mercantile = oil-painting;
  Industrial = mechanical/repetitive; Financial = abstract/typographic;
  Platform = UI-chrome / notifications-as-bullets; AI = recursive /
  data-derived). The library has to support real shifts between
  floors — different shaders, color grades, post-process stacks — and
  swap them cheaply mid-game.

### Architectural commitments that fall out of this choice

These are load-bearing for downstream planning. The engineer is
expected to plan against all five.

1. **Texture atlas packing as a build-step requirement.** AI-generated
   assets arrive as individual images; they must be packed into
   atlases at build time. Phaser 4 reads TexturePacker JSON natively
   (`this.load.atlas`), so the integration is one line — but the build
   step itself is non-optional. Without atlasing, draw-call count
   collapses the perf argument on mobile. **Integration point:** the
   atlas build runs as part of the project's build script (whatever
   bundler we land on), not as a manual step. **Directory contract:**
   `assets/raw/` (individual AI-generated images, source of truth) →
   `assets/atlas/` (built atlases, gitignored). Specific tool
   (`free-tex-packer-core`, `texturepacker-cli`, or custom) deferred to
   engineer at scaffolding.

2. **Bullet pooling via Phaser Groups with `maxSize`.** No `new
   Bullet()` on the hot path, ever. Allocate up-front via the Group's
   `maxSize`, recycle on death. This is one line of config, but using
   it correctly is discipline — destroying instead of recycling
   silently re-introduces the allocation. **Bullet entity shape is a
   downstream architecture deliverable**, not part of this proposal.
   Floor 5's "the bullets are *you*" plus the corporate-jargon payload
   layer (bullets-as-deliverables) means a bullet is not just `{x, y,
   vx, vy}` — it carries pattern lineage, payload metadata, and visual
   variant data. The Group's `classType` waits on that spec; engineer
   should not invent it.

3. **Mobile WebGL — not WebGPU — is the perf budget that matters.**
   Delivery is web + PWA ("progressives"). iOS Safari runs the WebGL
   path; WebGPU on Safari is still partial as of May 2026. The
   performance ceiling will be set by mobile GPU + thermal throttling,
   not by Phaser. **Reference device:** iPhone 12-class as the minimum
   target (covers ~2020 hardware as the floor; older devices are
   best-effort, not budgeted). **Frame-time targets:** 16ms median
   (60fps), 33ms p95 (no sustained dips below 30fps under
   representative load). Profile with WebGL forced on, on real
   hardware, before trusting any desktop benchmark.

4. **Adaptive bullet density, with a per-floor degradation curve.**
   Detect device class at startup; scale max simultaneous bullet count
   accordingly. The scaling variable gates the pattern-emitter layer,
   not the renderer. Working ceiling is ~10k bullets on capable
   hardware. The mechanism is **not floor-uniform** — Floor 5's
   density is dramaturgy (the player has to feel surrounded by their
   own data turned hostile), not texture, so the degradation curve is:
   - **Floors 1-4:** density may degrade down to ~50% before we touch
     framerate.
   - **Floor 5 specifically:** density holds. If a device can't hit
     Floor 5's density at 60fps, we drop to 30fps locked first, then
     drop visual fidelity (cheaper shaders, lower-resolution LUT, skip
     post-process passes), and only as a last resort cut Floor 5's
     bullet count — with a hard floor at ~75% of the capable-hardware
     ceiling.

   The exact numerics are deferred to designer at pattern-emitter time.
   The *shape* of the curve, with Floor 5 as a hard exception, is
   architecture and lands now.

   Mechanism for device-class detection is itself an open question
   (see Open Question 3): GPU renderer-string parse, first-frame
   benchmark, and DPR + memory heuristic are not equivalent and the
   choice affects UX and reliability.

5. **Early validation of Phaser 4's filter system.** Phaser 4's
   filter pipeline is new (April 2026 stable). The validation
   prototype's job is to prove the pipeline can carry the visual
   register the proposal commits to — Cruelty Squad / NORCO-coded,
   not CRT-pastiche.

   **Prototype trio** (each piece tests a distinct load-bearing
   capability):
   - **Per-floor LUT swap.** Validates: can Phaser modulate filters
     per-frame / on scene change cheaply? Does swapping a 32×32×32 LUT
     texture at floor transition cost real time? This is the test
     that matters for the floor structure.
   - **One per-sprite fragment shader on a bullet.** Validates: can
     individual GameObjects carry their own filter / shader pipeline
     cleanly, or is the system screen-space-only? If the latter,
     Floor 5's "the bullets are *you*" thesis is harder than this
     proposal acknowledges.
   - **Dithering or ordered-posterization screen-space pass.**
     Validates: Cruelty-Squad-shaped ugliness is reachable (cheap on
     mobile, anchor-faithful). Chromatic aberration may be added
     alongside if useful — it is neutral. Scanlines are explicitly
     out (CRT-pastiche, off-anchor).

   **Success criterion** (all of):
   - All three pieces working in Phaser 4 within a **3 working day
     time-box**, on the iPhone 12-class reference device, at the
     Commitment 3 frame budget.
   - LUT swap costs less than one frame (16ms) at scene transition.
   - Per-sprite shader works cleanly on at least 100 simultaneous
     sprites without dropping below 60fps on the reference device.

   If any of those fail — time-box exceeded, perf budget blown, or a
   piece fundamentally cannot be expressed in Phaser 4's filter system
   without extensive workaround code — escalate to architect. That is
   the trigger for the pivot conversation below, not a problem to
   power through.

### What would cause this decision to be revisited

The survey doesn't expire. **PixiJS v8 remains the documented pivot**
under any of these specific trip-wires. Each is concrete enough to
fire — vague triggers default to powering through.

- **Shader / post-process work hits walls.** Trigger: Commitment 5's
  early prototype fails its success criterion (3-day time-box
  exceeded, perf budget blown, or a piece of the trio fundamentally
  cannot be expressed without extensive workaround code). PixiJS
  treats filters as a primary primitive and is the stronger shader
  story.
- **Bullet count headroom shortfall.** Trigger: profiling on the
  iPhone 12-class reference device caps below **6,000 simultaneous
  bullets** under representative load (full pattern emitter, post-
  process pipeline active) at the Commitment 3 frame budget. PixiJS
  v8's WebGL path has higher ceiling.
- **Phaser 4 ecosystem instability.** Trigger: **two consecutive minor
  releases** introduce breaking changes that each cost **more than
  one working day** of migration, OR a load-bearing plugin equivalent
  to the corporate-finance HUD layer (rexUI-class) does not exist or
  remains unported by Q4 2026. (We don't expect this, but stable-
  since-April is still young.)

If any of those fire, the response is a new proposal that supersedes
this one and routes ROI to PixiJS v8. We don't expect the pivot. We
shouldn't pretend it's impossible.

## References

1. `.frames/sdlc/research/20260510-2d-library-survey.md` — full
   candidate survey, original PixiJS v8 recommendation, and the
   decision section recording the flip to Phaser 4.
2. Task #314 — the survey/decision task this proposal lands on top of.
3. Task #333 — this proposal's authoring task.
4. Project README at repo root — design compass; tonal anchors
   (Cruelty Squad, NORCO) and bullet-hell genre commitments.

## Open Questions

1. **Atlas-build tool selection.** — owner: engineer.
   - The choice between `free-tex-packer-core`, `texturepacker-cli`,
     and a custom packer affects the build pipeline but not this
     proposal's commitments (which fix the integration point and
     directory contract). Defer to engineer's scaffolding round
     unless a constraint surfaces that forces it earlier.

2. **Adaptive density numerics per floor.** — owner: designer.
   - The per-floor degradation curve is in Commitment 4
     (architecture). The *exact density values* per floor (does
     Floor 1 cap at 2k bullets? Floor 5 at 10k? what's the curve
     between them?) is design. Lands when the AI floor's bullet
     patterns are being designed.

3. **Device-class detection mechanism.** — owner: engineer.
   - GPU renderer-string parsing (unreliable, blocked in some
     browsers), first-frame benchmark (reliable but adds startup
     latency), DPR + memory heuristic (cheap but coarse) are not
     equivalent. Resolve at scaffolding. The Commitment 4 per-floor
     curve has to express on top of whatever mechanism is chosen.

4. **Phaser 4 plugin landscape — rexUI-equivalent for the HUD.** —
   owner: engineer.
   - Phaser 3's rexUI plugin is the standard for rich HUD work
     (forms, layouts, scrolling lists for `BOARD REVIEW`-style
     menus). Phaser 4 is new enough that v3 plugins likely don't all
     work yet. Risk: if the HUD vocabulary needs a plugin that
     hasn't been ported, that's scaffolding work we haven't
     accounted for. Engineer scouts the landscape during scaffolding;
     if no port exists by Q4 2026, that fires the ecosystem-
     instability trigger above.

5. **Phaser 4 + TypeScript types maturity.** — owner: engineer.
   - Survey notes Phaser 4 is "in the middle of porting source from
     JS to TS." If type definitions have holes during May 2026, that
     affects how strict our TS config can be without
     `// @ts-expect-error` noise. Resolve at scaffolding.

6. **Scaffolding-adjacent decisions (follow-up proposal).** — owner:
   architect.
   - Scene/state-machine shape (boot → preload → menu → run → floor
     → end), asset directory layout beyond `assets/raw|atlas/`,
     bundler choice (Vite is the obvious default for Phaser 4 + TS
     in 2026; alternatives: esbuild, Rspack, Parcel), TypeScript
     baseline (strict, path aliases), test framework choice (Vitest
     for unit + Playwright for visual-regression is the engineer's
     default). These belong in a **follow-up scaffolding proposal**,
     not inline here — this proposal focuses on the library
     commitment and what falls out of it.

---
# Review: engineer

**Date**: 2026-05-10
**Decision**: Request for Comment

**Comments**

The library choice itself is locked and I support it — speed-to-first-
playable plus the LLM corpus density argument lands cleanly for a solo
build, and Groups + `maxSize` is genuinely the right pool primitive for
this game type. My review is about the proposal's job as a *planning
substrate*: a few of the architectural commitments need a sharpening
pass before I can create tasks against them without inventing answers
the architect should make.

Decision is **Request for Comment** rather than Aligned because the gaps
below are real enough that planning would either stall on them or paper
over them. None require relitigating Phaser-vs-PixiJS.

### Where the commitments need more edge

**Commitment 1 (atlas packing).** The survey said "automated atlas-build
step in CI from day one." This proposal softens that to a build-step
requirement without saying *when* it runs (local-only, pre-commit, CI)
or how atlases are versioned alongside source assets. Open Question 1
defers the *tool*, which is fine — but the *integration point* (where
the build sits in the pipeline) is itself a decision and worth naming as
deferred-but-required, so it doesn't quietly slip past scaffolding.
Recommend: a one-line commitment that the atlas build runs as part of
the project's build script (whatever bundler we land on), and that raw
asset → atlas is a directory contract (e.g., `assets/raw/` →
`assets/atlas/`) the engineer specifies at scaffolding time.

**Commitment 2 (bullet pooling).** `physics.add.group({ maxSize })` is
concrete and right. What's missing: any sketch of the *bullet entity
shape*. Floor 5's "bullets are *you*" plus the corporate-jargon layer
(bullets-as-deliverables) means a bullet is not just `{ x, y, vx, vy }`
— it carries pattern lineage, payload metadata, possibly visual variant
data. The shape ripples through pattern emitters, collision, and the
HUD vocabulary. I'm not asking for a final spec; I'm asking the
proposal to acknowledge "bullet entity shape is a downstream
architecture deliverable" so I know to wait for it rather than invent
one. Without that, the pool's `classType` is up for grabs and I will
guess.

**Commitment 3 (mobile WebGL perf budget).** "Mid-range iPhone" is the
weakest commitment in the document. iPhone 11 vs 14 vs 15 is a 3x
GPU-perf spread. I need a concrete reference device (or a generation
window — "iPhone 12-class minimum") and a frame-time target (e.g., 16ms
median, 33ms p95) before I can write a profiling task with a done-when.
If the answer is "TBD, engineer picks the rig," fine — say that
explicitly so it shows up as my decision, not a hidden assumption.

**Commitment 4 (adaptive bullet density).** The proposal commits to the
*existence* of the mechanism but not its *shape*. Device-class detection
has multiple plausible implementations: GPU renderer-string parsing
(unreliable, blocked in some browsers), first-frame benchmark
(reliable but adds startup latency), DPR + memory heuristic (cheap but
coarse). These are not equivalent — the choice affects UX and
reliability. Flag as an open question owned by engineer, with a note
that the designer's "floor value" question (Open Question 2) sits on
top of whichever mechanism is chosen.

**Commitment 5 (early shader prototype).** Specific in scope (scanline +
chromatic aberration + color grading) — good. Missing: the *success
criterion*. "If that prototype fights the framework, escalate" is
subjective in a way that biases toward powering through, because that's
what engineers do. I'd want one of: (a) a frame-time budget on the
reference device, (b) a "lines of workaround code" smell threshold, or
(c) a rough time-box ("if this isn't running in 3 working days, that's
the signal"). Otherwise the escalation never fires.

### What's missing that I'd want before scaffolding

These are not blockers on this proposal — but they are the next
artifacts I'd need before opening implementation tasks. Naming them
here so the architect can decide whether they belong inline, in a
follow-up scaffolding proposal, or as planning-round questions.

- **Scene/state-machine shape.** Phaser's `Scene` class is the natural
  unit; what's the structure (boot → preload → menu → run → floor → end)?
  Concept-stage, but a sketch unblocks scaffolding.
- **Asset directory layout.** `assets/raw/`, `assets/atlas/`,
  `assets/audio/` — naming and ownership boundary with the atlas build.
- **Bundler / build pipeline.** Vite is the obvious default for a
  Phaser 4 + TS project in 2026; if the architect has a preference
  (esbuild, Rspack, Parcel) it should land before I scaffold, since
  the atlas build hooks into it.
- **TypeScript config baseline.** `strict: true`? Path aliases?
  Engineer call by default — flag if architect wants input.
- **Test framework choice for game code.** Vitest for unit, Playwright
  for visual-regression on rendered scenes is my default. Flag if the
  architect has a different preference; the test discipline (every
  function with branching gets a unit test) is non-negotiable on my
  side regardless.

### Open questions I'd add

- **Phaser 4 plugin landscape.** Phaser 3 has rexUI and a deep plugin
  ecosystem the corporate-finance HUD will lean on (forms, layouts,
  scrolling lists for `BOARD REVIEW` style menus). Phaser 4 is new
  enough that v3 plugins likely don't all work yet. Worth surfacing
  as a risk: if the HUD vocabulary needs a plugin that hasn't been
  ported, that's scaffolding work we haven't accounted for. Owner:
  engineer (to scout the landscape during scaffolding).

- **Phaser 4 + TypeScript types maturity.** Survey notes Phaser 4 is
  "in the middle of porting source from JS to TS." If the type
  definitions have holes during May 2026, that affects how strict our
  TS config can be without `// @ts-expect-error` noise. Owner:
  engineer (resolve at scaffolding).

### "What would cause this to be revisited" — make the triggers fire

The pivot conditions are directionally right but soft enough that I
would not actually escalate — engineer default is to power through.
Sharpening recommendations:

- **Shader walls:** trigger off the early-prototype outcome
  (Commitment 5). Pair this section with whatever success criterion
  Commitment 5 lands on. If the prototype fails its criterion, the
  pivot conversation opens — that's the trigger.
- **Bullet count headroom:** the 10k mobile target is concrete. Good.
  Add: "if profiling on the reference device caps below 6k under
  representative load, escalate." A specific number gives me
  permission to flag rather than optimize indefinitely.
- **Ecosystem instability:** vague today. Suggest a concrete trip-wire
  ("two consecutive minor releases with breaking changes that cost
  >1 day of migration each"). Without a count, I'll absorb the cost
  silently.

### Non-blocking observations

- "Visual fidelity ceiling" was flagged in the survey as needing Matt
  but not surfaced as an open question on this proposal. The
  commitments assume shader/post-process is in scope (Commitment 5
  exists); that assumption is reasonable but worth stating.
- The pivot path (PixiJS v8) is named clearly. I appreciate that. It
  makes the "we're not pretending the choice is irreversible" stance
  legible and gives me a real escalation target rather than a vague
  "talk to the architect."

### Summary

The choice is good. The scaffolding-readiness of the commitments is
about 70% there. Sharpen Commitments 1, 3, 4, and 5 (specific
deferrals, device target, mechanism choice, success criterion), add
the bullet-entity-shape acknowledgement to Commitment 2, and tighten
the pivot triggers, and I'm Aligned and ready to plan against this.

---
# Review: designer

**Date**: 2026-05-10
**Decision**: Request for Comment

**Comments**

The library choice is locked and I'm not relitigating it. My review is
about whether the proposal's framing of the *visual register* — and
the test it proposes for that register — is faithful to the design
compass. It is partly faithful and partly drifted. Two specific
sharpenings and one design call I'll make now rather than defer. The
engineer's review is sound; I'm not re-raising what they raised, just
adding the design-side seams that sit on top of it.

### The shader prototype tests the wrong things (Commitment 5)

The proposed trio — **scanline + chromatic aberration + color grading**
— is a CRT-pastiche bundle. It validates that Phaser 4 can do
retro-television post-process. That is a different question than
"can Phaser 4 carry the visual register ROI actually wants."

The tonal anchors are Cruelty Squad and NORCO. Cruelty Squad's visual
language is not CRT — it is hostile-color, oversaturated-to-clipping,
posterized, dithered, deliberately readable-as-broken. NORCO is
LCD-rot, oil-stain, compression artifacts. Scanlines + chromatic
aberration sit closer to *Hotline Miami* / generic "retro filter" than
to either anchor. We can keep chromatic aberration — it's neutral —
but scanlines specifically pull the register the wrong direction.

More importantly, the trio is **all screen-space post-process.** The
visual register the README implies needs more than that:

1. **Per-floor LUT-driven color grading**, swappable mid-game (the
   floor-as-historical-stage progression means Floor 1 looks like
   sepia/oil-painting Mercantile and Floor 5 looks like hostile data
   smear — that's not a single grading pass, it's at minimum five
   grading passes the engine can swap between). This is the test that
   matters for the floor structure.

2. **Per-sprite shader work.** Floor 5's "the bullets are *you*"
   strongly implies bullets that distort, glitch, datamosh, carry
   recursive visual artifacts — that is a per-instance fragment-shader
   concern, not a screen-space filter. If Phaser 4's filter system
   only does screen-space cleanly and per-instance is a fight, that
   constraint reaches all the way back to Floor 5's dramaturgy. We
   need to know that *now*.

3. **Dithering and posterization.** These are the Cruelty Squad
   anchors more than scanlines are. They are also cheap on mobile,
   which matters.

Recommended replacement trio for the prototype:

- **One per-floor LUT swap** (validates: can Phaser modulate filters
  per-frame / on scene change cheaply? does swapping a 32x32x32 LUT
  texture at floor transition cost real time?)
- **One per-sprite fragment shader on a bullet** (validates: can
  individual GameObjects carry their own filter / shader pipeline
  cleanly, or is it screen-space-only? If the latter, Floor 5's
  visual thesis is harder than the proposal acknowledges.)
- **Dithering or ordered-posterization screen-space pass** (validates:
  Cruelty-Squad-shaped ugliness is reachable, not just CRT-pastiche
  ugliness.)

Chromatic aberration is fine to keep on the screen-space pass if you
want to keep the scope similar — it's the scanlines I'd swap out.

This isn't pedantry about the example. The trio defines the success
criterion the engineer needs to make Commitment 5 testable. Picking a
trio that doesn't stress the actual visual register means the
prototype passes and we still don't know the answer.

### The framing of the visual register has drifted (Commitments 5 + the proposal as a whole)

The proposal says "visual-register decisions that lean on heavy shader
work." It never names *what* visual register. The Cruelty Squad and
NORCO anchors don't appear in the proposal at all — only in the
README and the survey. "Deliberately ugly" doesn't appear either.

That drift matters because **stylized** and **deliberately ugly** are
different shader requirements, and Phaser 4 might support one cleanly
and fight the other. Stylized is CSS-filter territory. Deliberately
ugly is "I need to make hostile color choices, render bullets as
broken-looking glyphs, and unify inconsistent AI-generated source
material under a coherent grade." The latter is the load-bearing
case.

Recommended: add one paragraph to the proposal body (the "Proposal"
section, not Commitment 5) naming the visual register the choice has
to serve. Something like:

> The visual register is shader-driven and deliberately ugly — Cruelty
> Squad / NORCO-coded, not Hotline-Miami-coded. The shader work is
> load-bearing for two reasons: (1) it carries the per-floor visual
> shift across the historical-stage progression, and (2) it unifies
> AI-generated source material into a coherent visual identity. Phaser
> 4 has to be able to do this. Commitment 5 is the early test.

That paragraph re-anchors the rest of the document to the design
compass and gives Commitment 5 something to be testing *for*, rather
than just a generic "shader-heavy effect" smell test.

### Adaptive density floor — pinning down the design call now (Commitment 4 + Open Question 2)

The architect deferred this to me when the time comes. I'll defer the
exact numerics (do not need them for the proposal to land), but one
thing is worth pinning down now because it changes what the engineer
implements rather than what we tune later:

**Floor 5 is the floor where bullet density is dramaturgy, not just
texture.** The thesis "the bullets are *you*" requires saturation —
the player has to feel surrounded by their own data turned hostile.
On Floors 1-4, density is texture: cutting bullet count on weak
hardware degrades the genre feel a little, but doesn't destroy what
the floor is *about*. On Floor 5, dropping density to half breaks the
thesis.

This means the adaptive-density mechanism is **not floor-uniform.**
The degradation order on weak devices should be:

1. **Floors 1-4:** density can degrade down to ~50% before we touch
   framerate.
2. **Floor 5 specifically:** density holds. If we can't hit Floor 5's
   density at 60fps on a given device, we drop to 30fps locked first,
   then drop visual fidelity (cheaper shaders, lower-resolution LUT,
   skip post-process passes), and only then — as a last resort, and
   only if the device truly can't render at 30fps — do we cut Floor
   5's bullet count. The cut floor for Floor 5 is something like 75%
   of capable-hardware ceiling, not 50%.

This matters for Commitment 4's *shape*, not its eventual numerics.
The engineer's question about device-class detection mechanism (their
review) sits on top of this: whatever mechanism they pick has to be
able to express "density curve is per-floor" rather than a single
global multiplier.

I'll re-engage on the actual numerics when pattern emitters are being
designed — but the per-floor degradation curve, with Floor 5 as a
hard exception, should be in the architecture from the start. Not a
defer.

### What's missing from the proposal (player-facing seams the architect didn't surface)

Three things the library choice affects that the proposal doesn't
name. None are blockers; all are worth one sentence each so they show
up in planning rather than getting discovered later.

1. **Text rendering quality is a headline feature.** The README is
   explicit that the HUD, menus, achievements, bosses' names, and
   floor titles all speak fluent corporate-finance jargon. The
   typography is a tonal carrier. Phaser 4's text path needs to render
   crisply at multiple sizes — bitmap fonts vs. dynamic Canvas text
   has UX consequences (bitmap is fast and crisp but doesn't scale
   gracefully; Canvas text scales but can look fuzzy on high-DPR
   mobile). The proposal should acknowledge this is a planning seam
   so the engineer knows to treat it as one. Right now it reads like
   text rendering is solved-by-default; for ROI it isn't.

2. **Audio architecture comes for free with Phaser** — and that's
   actually a tonal win worth claiming. The deadpan corporate-finance
   register leans hard on audio (boring elevator/conference-call
   ambience playing under violent gameplay). Phaser's Web Audio + HTML5
   fallback is sufficient for what we need. Worth one line saying
   "audio is in scope of the library and we're not bringing Howler.js."
   This pre-empts a future "should we add a third-party audio layer"
   conversation.

3. **Per-floor visual-language shift is a planning constraint.** The
   floors are not "different sprite sets" — they're different
   *rendering philosophies* (Mercantile = physical / oil-painting;
   Industrial = mechanical / repetitive; Financial = abstract /
   typographic; Platform = UI-chrome / notifications-as-bullets; AI =
   recursive / data-derived). The library choice has to support real
   visual-language shifts between floors — different shaders, different
   color grades, possibly different post-process stacks. The shader
   prototype (Commitment 5, after sharpening) is the place to validate
   this can swap mid-game cleanly. Without that validation, we discover
   at Floor 3 that the rendering pipeline can't be reconfigured cheaply
   between scenes. Worth surfacing as a planning constraint, not just
   "shaders work."

### On the engineer's review

I'm aligned with the engineer's review. Their points about reference
device, success criterion, atlas-build integration point, and bullet
entity shape are all real and I'd want them addressed before planning.
None of them collide with my points above; they sit alongside them.

One overlap: the engineer asked Commitment 5 to land a success
criterion. My recommended trio replacement *is* a success criterion —
"these three specific things work in Phaser 4 within a time-box, on
the reference device, at the perf budget" is the test. If the
architect picks up both pieces of feedback together, Commitment 5
collapses into a tight, testable spec.

### Decision

**Request for Comment.** The library choice itself is sound and I
support it. The proposal needs three changes before I move to Aligned:

1. Replace Commitment 5's example trio (or add to it) so the
   prototype tests the visual register we actually want — minimum:
   per-floor LUT swap, one per-sprite shader, and a dithering/
   posterization pass. Drop scanlines unless there's a deliberate
   reason to keep them (CRT-pastiche is off-anchor).
2. Add one paragraph to the Proposal section naming the visual
   register the library choice has to serve (Cruelty Squad / NORCO,
   deliberately ugly, shader-driven, per-floor shift), so Commitment 5
   has something to be testing *for*.
3. Update Commitment 4 to acknowledge the per-floor degradation
   curve: Floor 5 is exempt from density cuts down to 75% of ceiling;
   degrade framerate and visual fidelity before density on Floor 5.
   The numerics can stay deferred to me; the *shape* of the curve
   needs to be in the architecture from the start.

The three player-facing seams (text rendering, audio in scope,
per-floor visual shift) are non-blocking but worth one sentence each
in the proposal so they don't get lost.

Once those land, I'm Aligned.

---
# Review: engineer (round 2)

**Date**: 2026-05-10
**Decision**: Aligned

**Comments**

Re-reading the revised body against my round 1 asks. Every one of the
eight points landed cleanly — not paraphrased, not partially absorbed,
addressed at the level of specificity I needed to plan against this
without inventing answers.

Point-by-point, briefly:

1. **Atlas (Commitment 1).** Integration point named ("part of the
   project's build script... not a manual step") and directory contract
   pinned (`assets/raw/` → `assets/atlas/`, atlas dir gitignored). Tool
   choice cleanly deferred to Open Question 1. Good.
2. **Pooling (Commitment 2).** "Bullet entity shape is a downstream
   architecture deliverable" is exactly the acknowledgement I asked
   for, with the *why* (Floor 5 + corporate-jargon payload) preserved
   so I won't be tempted to invent the shape under deadline pressure.
3. **Perf budget (Commitment 3).** iPhone 12-class as the floor + 16ms
   median / 33ms p95 frame-time targets. Concrete enough to write a
   profiling task with a real done-when.
4. **Adaptive density (Commitment 4).** Device-class detection mechanism
   is now flagged as open with the three named alternatives (renderer-
   string parse, first-frame benchmark, DPR + memory heuristic). Open
   Question 3 owns it. The designer's per-floor degradation curve with
   Floor 5 as a hard exception also lands here — that constrains the
   mechanism (it has to express a per-floor curve, not a global
   multiplier), which is the right shape.
5. **Shader prototype (Commitment 5).** 3-day time-box + LUT swap
   <16ms + per-sprite shader on 100 sprites at 60fps + "extensive
   workaround code" as a qualitative escape hatch. All three of my
   suggested forms of success criterion made it in, and the trio is
   now the designer's anchor-faithful trio (LUT swap / per-sprite /
   dithering) rather than the original CRT-pastiche bundle. The
   escalation will actually fire if it needs to.
6. **Pivot triggers.** Shader walls ties to Commitment 5's criterion.
   Bullet count: <6k on reference device. Ecosystem: two consecutive
   minor releases with >1 working day migration each, OR rexUI-class
   plugin unported by Q4 2026. Every trigger has a number.
7. **New open questions.** Plugin landscape (Open Question 4) and TS
   types maturity (Open Question 5) are both present and owned by
   engineer with the right scope (scaffolding round).
8. **Scaffolding bundle.** Open Question 6 captures scene/state shape,
   asset layout, bundler, TS config, and test framework as a follow-up
   scaffolding proposal owned by the architect. Cleanly dispositioned
   — I know it's not landing inline and I know who owns it.

### Remaining concerns

None blocking. Two notes for the record:

- The "extensive workaround code" leg of Commitment 5's escalation is
  qualitative by design and that's correct — the time-box and frame
  budget are the hard tripwires; the workaround clause is a judgment
  call that I'll exercise honestly. I'm calling it out here so it's on
  the record that I understand the intent and won't power through.
- Open Question 6 lists Vitest + Playwright as the engineer's default
  for the scaffolding follow-up. That matches my preference and the
  test discipline (every function with branching gets a unit test) is
  non-negotiable on my side regardless of which test framework lands.

### Decision

**Aligned.** Removing engineer from the `reviewers` list. The proposal
is now scaffolding-ready from my side; remaining gating is the
designer's round 2 plus Matt.

---
# Review: designer (round 2)

**Date**: 2026-05-10
**Decision**: Aligned

**Comments**

Re-reading the revised body against the three blocking changes and three
non-blocking seams I asked for in round 1. All six landed. Specifics:

### Blocking changes

1. **Visual register named in the Proposal section.** New subsection
   "The visual register the choice has to serve" names Cruelty Squad
   and NORCO as the tonal anchors, "deliberately ugly, hostile-color,
   posterized, dithered, readable-as-broken on purpose," and explicitly
   rules out Hotline Miami / CRT-pastiche and Slay the Spire / clean
   illustration. Names the two load-bearing reasons for the shader
   work (per-floor visual shift; unifying AI-generated source under
   one identity). Commitment 5 now has something to be testing *for*.
   Lands.

2. **Commitment 5's prototype trio replaced.** New trio is per-floor
   LUT swap, per-sprite fragment shader on a bullet, and dithering /
   ordered-posterization screen-space pass. Scanlines explicitly out,
   tagged "(CRT-pastiche, off-anchor)" — exactly the framing I wanted.
   Chromatic aberration kept as neutral / optional, which is correct.
   Each piece is annotated with what specifically it validates, so
   the prototype isn't a generic "shader smell test" — it's a test of
   the three load-bearing capabilities. Lands.

3. **Commitment 4 per-floor degradation curve.** Explicitly states the
   mechanism is "not floor-uniform." Floors 1-4 may degrade to ~50%
   before framerate is touched. Floor 5 holds: framerate drops to 30fps
   locked first, then visual fidelity (cheaper shaders, lower-resolution
   LUT, skip post-process passes), and only as last resort cut Floor
   5's density with a hard floor at ~75% of capable-hardware ceiling.
   The shape of the curve is in the architecture; the exact numerics
   stay deferred to me at pattern-emitter time. This is the right
   division — and the engineer's round 2 review confirms the
   device-class-detection mechanism (Open Question 3) will have to
   express a per-floor curve rather than a global multiplier, which
   is the constraint I wanted to make load-bearing on the architecture.
   Lands.

### Non-blocking seams

All three present in the new "Player-facing seams the library choice
affects" subsection:

- **Text rendering as a tonal feature.** Names the HUD, menus,
  achievements, boss names, floor titles. Names the bitmap vs. Canvas
  text trade-off (bitmap fast/crisp but doesn't scale; Canvas scales
  but fuzzes on high-DPR mobile). Tagged as a planning seam.
- **Audio in scope of Phaser.** "No Howler.js or third-party audio
  layer" — pre-empts the conversation cleanly.
- **Per-floor visual-language shift as a planning constraint.** All
  five floors named with their rendering philosophies; the library
  has to support real shifts that swap cheaply mid-game.

### Remaining concerns

None blocking. Two notes for the record:

- The numerics for adaptive density per floor (Open Question 2,
  designer-owned) will land when pattern emitters are being designed.
  That timing is correct — the *shape* of the curve is in this
  proposal; the *values* belong with the patterns themselves. I have
  this in memory; it won't get lost between sessions.
- The proposal now does what a good library-commitment proposal should
  do: it locks the substrate, names the visual register the substrate
  has to serve, and gives the engineer the integration points to plan
  against without baking implementation choices that should stay
  downstream. Conceptual integrity is intact end-to-end.

### Decision

**Aligned.** Removing designer from the `reviewers` list. Remaining
gating is Matt.
