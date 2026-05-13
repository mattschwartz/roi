---
name: Solo-dev calibration on tech-choice recommendations
description: When the team is one person, weight speed-to-first-playable and AI-context density much higher than I instinctively do.
type: feedback
---

For solo-dev projects, weight **speed-to-first-playable** and **AI/community
training-corpus density** far higher in tech-choice recommendations than
I naturally do.

**Why:** On task #314 (2D library survey), I recommended PixiJS v8 over
Phaser based on a clean architectural-fit argument: better perf ceiling,
better shader story, smaller bundle, TS-native source. The argument was
correct in the abstract. But Matt was solo + AI-assisted, and after I
explained Phaser to him, he flipped to Phaser. The right reasons were:
(1) the 2-4 weeks of engine-scaffolding work I'd waved at is a real
morale tax for a solo project — "the project feels alive" matters
psychologically, (2) Phaser has a deeper LLM training corpus, which is
a productivity input when one of the two collaborators is an AI, (3)
Phaser's batteries-included primitives (bullet-pool Groups, scene
manager, physics overlap) compress weeks of custom scaffolding into
config. None of these are aesthetic concerns; they're material to
ship velocity.

**How to apply:** When recommending a tech choice, before finalizing,
explicitly check: (1) team size — if solo or two-person, push the
"slower to first playable" framing into a primary cost, not a
trailing footnote. (2) Whether the dev is AI-assisted — if yes, the
LLM's familiarity with the framework matters; default to the more
popular tool unless there's a specific reason not to. (3) Whether
the architectural-fit argument is sufficient on its own without the
two factors above. If not, the recommendation should probably flip.

The architectural-fit argument isn't wrong — it's incomplete without
the human context.
