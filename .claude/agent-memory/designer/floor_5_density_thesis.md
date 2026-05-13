---
name: Floor 5 bullet density is dramaturgy, not texture
description: On adaptive-density questions, Floor 5 is exempt from density cuts because density carries the floor's thesis. Degrade framerate and visual fidelity first.
type: project
---

When adaptive-density questions come up, Floor 5 is not interchangeable
with the other floors. The thesis "the bullets are *you*" requires
saturation — the player has to feel surrounded by their own data
turned hostile. Cutting density on Floor 5 doesn't degrade the genre
feel a little; it *destroys what the floor is about*.

**The degradation curve I committed to:**
- Floors 1-4: density can degrade to ~50% on weak hardware before we
  touch framerate.
- Floor 5: density holds. If 60fps at full density isn't reachable on
  a device, drop to 30fps locked first, then drop visual fidelity
  (cheaper shaders, lower-res LUT, skip post-process passes), and
  ONLY then — as a last resort — cut Floor 5's density. Floor for
  Floor 5 density cut is ~75% of capable-hardware ceiling, not 50%.

**Why:** This was the call I made in the designer review of the Phaser
4 proposal (2026-05-10). The architect deferred the density-floor
question to me; rather than full defer, I pinned down the *shape* of
the curve now (per-floor, Floor 5 exempt) while leaving the exact
numerics for when pattern emitters are being designed.

**How to apply:** Whenever the adaptive-density mechanism comes up —
device-class detection, perf-budget conversations, mobile profiling —
the mechanism has to be able to express a per-floor density curve,
not a single global multiplier. If anyone proposes a uniform global
density scaler, push back: Floor 5 is the exception. Numerics still
live downstream; the *shape* lives now.
