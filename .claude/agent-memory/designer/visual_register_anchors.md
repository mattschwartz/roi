---
name: ROI visual register anchors and what they mean for shaders
description: The visual-register anchors for Return on Investment, what category of shader work they imply, and what they explicitly are NOT.
type: project
---

ROI's tonal anchors are **Cruelty Squad** and **NORCO**, per README. The
visual register that follows from these is *deliberately ugly*, not
*stylized*. They are different shader requirements.

**What this means in shader terms:**
- Hostile-color, oversaturated-to-clipping palettes
- Posterization and dithering (cheap on mobile, anchor-faithful)
- Per-floor LUT-driven color grading (the floor structure is a
  historical-stage progression — Mercantile / Industrial / Financial /
  Platform / AI — each needs its own visual-language shift, not just
  different sprites)
- Per-sprite shader work, especially for Floor 5's "the bullets are
  *you*" thesis (datamosh, glitch, recursive distortion on individual
  bullets)
- Shader work as the seam that unifies AI-generated assets that don't
  quite agree with each other into one coherent visual identity

**What this register is NOT:**
- CRT-pastiche (scanlines, raster lines) — that's Hotline-Miami-coded,
  off-anchor
- "Stylized but clean" (Slay-the-Spire-coded) — that's a different game
- CSS-filter territory

**Why:** When reviewing the Phaser 4 proposal (2026-05-10), the
architect proposed validating Phaser's filter pipeline with "scanline +
chromatic aberration + color grading" as the prototype trio. That trio
tests CRT-pastiche, not the visual register ROI actually wants. I
asked for it to be replaced with a trio that stresses the real
register: per-floor LUT swap, per-sprite fragment shader, and
dithering/posterization screen-space pass.

**How to apply:** When any future proposal mentions "visual register"
or "shader work" without naming Cruelty Squad / NORCO / "deliberately
ugly," push back — the framing has drifted. Stylized is cheap;
deliberately-ugly-with-a-coherence-seam-across-AI-assets is what we
need. Also: any post-process choice that pulls toward "retro" rather
than "broken/hostile" is off-anchor.
