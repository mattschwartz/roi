---
name: Calibrate the LLM-corpus argument by surface area
description: The corpus-density argument is real but easy to over-apply; gate it by how much of the surface area actually differs between options.
type: feedback
---

The LLM-corpus-density argument is real (see solo-dev calibration
memory) but easy to over-apply. Calibrate it by **how much of the
surface area actually differs** between the two options before
weighting it heavily.

**Why:** On the Phaser implementation architecture proposal
(2026-05-10), I committed to `npm` over `pnpm` in section 12,
citing "the LLM-corpus-density tax that drove the Phaser 4 choice
cuts the same way for the package manager." Matt then asked
"can we use Bun?" and on examination the corpus argument was
much weaker than I'd framed: most Phaser/Vite/Vitest snippets
are runtime-agnostic. The Bun-specific surface is narrow —
lockfile name, `bun:` prefix for built-ins, occasional npm-package
edge cases. A 2-3% friction tax, not a 20% one. I had reused the
Phaser-vs-PixiJS reasoning shape without re-checking whether the
analogy held; for runtime/package-manager choices the surface that
the LLM has to know is much smaller than for a game framework.

**How to apply:** Before invoking the corpus-density argument,
ask: *what fraction of the code touches the differing layer?*
For framework choices (Phaser vs PixiJS, React vs Svelte) the
answer is "most of the code" — corpus argument is strong. For
runtime/PM/build-tool choices (Bun vs Node, pnpm vs npm) the
answer is usually "a thin command-and-config surface" — corpus
argument is weak. Don't reuse the strong-corpus framing in the
weak-corpus context just because the prior recommendation went
well.
