---
name: Risk-posture calibration for scaffold-vs-validate sequencing
description: With AI-assisted dev, prefer scaffold-first-then-validate when stack confidence is high; the throwaway cost is lower than human-team intuition suggests.
metadata:
  type: feedback
---

When sequencing foundation work against a gating validation prototype
(e.g., "shader-pipeline prototype gates the library choice"), do not
default to "minimum-viable-scaffold-then-validate" framings on
solo+AI-assisted projects unless the stack confidence is genuinely
low.

**Why:** On the ROI foundation epic, I offered Matt two shapes —
(A) full scaffold then prototype, (B) minimum scaffold then prototype
then expand. I recommended B on a "save days of scaffold work if the
prototype fails" basis. Matt picked A and named the reason directly:
agents work fast enough that the scaffold cost is low, and the tech
stack already went through two thorough proposal rounds with both
designer and engineer Aligned. The throwaway risk is small in
expectation (low prob × low cost). The "save days" framing was
calibrated for a human team where each day of scaffolding is
genuinely a day of staff time; with an AI agent the unit-of-work
math is different.

This sits next to [[feedback_solo_dev_calibration]] — same root
(human context matters in architectural recommendations), different
corollary. The earlier memory covered *tech choices*; this one
covers *sequencing decisions about validated tech*.

**How to apply:** Before recommending a "validate before invest"
sequencing, check two things:
1. **Stack confidence.** Has the stack already been through a
   reviewed proposal with multiple Aligned reviewers? If yes, the
   "what if we have to pivot" weight drops sharply.
2. **Who pays the scaffold cost.** Solo human eng = days of real
   time. AI agent = hours of compute, parallelizable. The expected
   regret on a thrown-away scaffold is lower than the human-team
   intuition suggests.

If both favor "just build it," default to the scaffold-first shape
and let the prototype validate against the real environment. Offer
the minimum-viable shape only when stack confidence is actually
shaky or the validation gate is genuinely a coin-flip.
