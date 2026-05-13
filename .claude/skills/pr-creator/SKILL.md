---
name: pr-creator
description: Use this skill when the user asks to create a PR. DO NOT ATTEMPT TO CREATE A PR WITHOUT THIS SKILL.
user-invocable: true
---

# PR Creator

## What This Skill Is

This skill teaches you how to write a GitHub pull request that a reviewer will actually want to review — and, just as important, how to do it without asking the user questions they shouldn't have to answer. A good PR moves through review quickly because the reviewer has everything they need in the first screen: what this is, why it exists, what changed, and what to look at first. A bad PR makes the reviewer do archaeology.

The user asks for PRs regularly. Treat each one as a synthesis: they know what they want the PR to *accomplish* — that's already in the branch. Your job is to turn the branch into something a reviewer can trust in under two minutes.

---

## The Core Principle

**The PR is for the reviewer, not the author.** Every choice you make while writing the PR body runs through one filter: does this make the reviewer's next decision easier? If yes, keep it. If no, cut it. Flowery language does not serve the reviewer. Exhaustive file-by-file listings do not serve the reviewer. Claims of "comprehensive test coverage" without evidence do not serve the reviewer.

A PR is a promise (the title), a story (the body), and a set of evidence (the diff). The three have to line up. A title that overpromises is worse than a title that's boring. A body that hides a gotcha is worse than one that names it. A diff that contradicts the body is the fastest way to lose reviewer trust.

---

## Anatomy

A PR has two pieces you write — the title and the body — plus a handful of metadata choices (base branch, draft status, reviewers). The anatomy below is what the body looks like for most PRs. Not every PR needs every section; cut what doesn't earn its place.

### Title

One line. Specific. Action-oriented. No emojis unless the project's existing PRs use them.

Good: `Add friction report mechanism to agent coordination`
Good: `Fix flaky scope-lock test caused by race in task queue`
Bad: `Updates` / `WIP` / `Fixes some things` / `Refactor`

The title is the first thing a reviewer reads and often the only thing they remember. Write it like the subject line of an email that needs to land.

If the project has a commit convention that maps to PR titles (for example, `feat(task #12): ...`), follow it. Check a few recent merged PRs to see the pattern before inventing one. In this repo, see `.claude/skills/git-commit/SKILL.md` for the commit format — if the project wants PR titles to match that shape, mirror it.

### Body

The body has a predictable structure. The sections are ordered from most-important-to-reviewer to least. Lead with the summary; never bury it.

```md
## Summary
[One to three sentences. What this PR does, in the plainest possible language.
The reviewer should be able to stop reading here and have a correct mental model.]

## Context
[Why this exists. What problem it solves, what triggered it, what it unblocks.
Link to the issue, proposal, or conversation that motivated it. Skip this section
only if the summary already makes the motivation obvious.]

## Changes
[What actually changed. Group by concern, not by file. A bullet list is fine.
Use prose when the change is too interconnected for bullets.]

## Validation
[What you did to confirm it works. Tests added, manual checks run, scenarios
exercised. Be specific. "Added unit tests" is weak; "Added tests for the three
error paths in parse_plan and verified the happy path against the old fixture"
is strong. Write this like a checklist that the author can check off to let readers
know what was validated]

## Notes
[Anything the reviewer should know that doesn't fit above: gotchas,
follow-ups deliberately deferred, things you considered and rejected,
breaking changes, migration steps. If there's nothing, omit the section.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Every section earns its place or comes out. A PR that only needs Summary and Changes should only have Summary and Changes. Over-structuring a small PR is noise. Under-structuring a large PR is friction.

### What NOT to include in the body

- **Emojis** unless the project's existing PRs use them. Check first. In this repo, do not use emojis.
- **Effort narrative.** "This was harder than expected," "spent a lot of time on X," etc. The reviewer does not care how hard it was. They care whether it works.
- **Exhaustive file lists.** If the diff has 40 files, summarize by concern. The reviewer can read the diff.
- **Marketing language.** "Significantly improves," "massively simplifies," "elegant solution." Cut every adjective that could be on a product page.
- **Unverified claims.** Do not say "comprehensive test coverage" unless you can point at the tests. Do not say "no breaking changes" unless you checked. The moment the reviewer finds one thing that contradicts the body, they stop trusting all of it.

### AI attribution is required

The PR body MUST clearly attribute itself to AI when it was created by an agent. This is not optional, and it is not a watermark for legal reasons — it is an honesty requirement. A reviewer deserves to know whether the PR in front of them was authored by a human who can answer every question about the code or by an agent working under a human's direction. Those are different situations, and the reviewer should be able to calibrate their review accordingly.

This ensures that even if a reviewer lands directly on a commit rather than reading the PR body, the attribution is present. Use the co-author trailer that matches the specific agent — if it's Polly, for example, you can use a Polly-specific trailer, but the default should be the Claude one unless the user has set up something more specific.

**The attribution is the user's work too.** Your user has chosen transparency about AI collaboration deliberately, as a matter of integrity. It reflects on them, not just on you. Do not skip it, do not bury it, and do not frame it apologetically.

---

## Principles

### Right-size the PR

A PR that does three unrelated things is three PRs. If you're writing a body and find yourself saying "this PR also...", stop and ask whether that piece belongs in a separate PR. Unrelated changes share a PR out of laziness, not necessity.

A PR that's too small to explain is still a PR. Tiny fixes deserve tiny descriptions, not artificial padding. "Fixes typo in README" with a one-sentence summary is a complete PR.

The only rule: the PR's scope should match the PR's title. If the title promises one thing and the body delivers five, the title is wrong — or the PR is.

### Surface the gotchas first

If there's something uncomfortable in the PR — a hack, a TODO, a deliberate skip, a known edge case — put it in Notes at the top level of visibility. Do not hide it in the diff and hope the reviewer doesn't notice. They will, and when they do, they will trust the rest of the PR less because you tried to sneak something past them.

A reviewer who finds an unmentioned hack feels ambushed. A reviewer who sees a hack called out explicitly with a reason feels informed. Same code, opposite reactions.

---

## Process

### Before writing the PR

0. **Check if there is an open PR already** If there already exists an open PR, STOP and ask the user whether or not to continue.

1. **Confirm the branch is pushed.** Run `git status` and `git branch -vv` to verify the branch exists on the remote. If it doesn't, stop here and ask the user before attempting to push. You cannot open a PR against a branch that isn't on the remote.

2. **Identify the base branch.** The default base for almost every PR is `main` — this repo uses a single trunk, no integration branch. Feature branches off another feature branch are also valid when stacking (the base is the parent feature branch, not `main`); retarget to `main` once the parent merges. When in doubt, target `main`.

3. **Understand what changed.** Do not skip this step. Run:
   - `git log <base>..HEAD --oneline` — commits in the PR
   - `git diff <base>...HEAD --stat` — files changed and size of each change
   - `git diff <base>...HEAD` — the actual diff, for anything that isn't obvious
   Read the actual code. Do not write a PR body from commit messages alone — commit messages are written for commits, not for reviewers.

3.1. If there are unstaged changes, ask the user if they want to commit them before continuing.

4. **Check for an open PR on this branch.** `gh pr view` will tell you if one already exists. If it does, stop here and ask the user for guidance.

### Writing the PR

5. **Write the title first.** Get it right before writing the body. If you can't write a specific, accurate title, you don't yet understand the PR well enough to describe it.

6. **Draft the body in order.** Summary → Context → Changes → Verification → Notes. Write Summary last if you find it easier; many writers do. But the body must be ordered as above when delivered.

7. **Read it as the reviewer.** Before submitting, read the body top to bottom as if you'd never seen the branch. Ask: would I know what to look at first? Would I understand why this exists? Is anything hidden? If any answer is "no," fix it before posting.

### Creating the PR

8. **Use `gh pr create`** with the body passed as an argument. For multi-line bodies, use the `$(cat <<'EOF' ... EOF)` heredoc pattern to preserve formatting:

```bash
gh pr create \
  --base {BRANCH} \
  --title "Add friction report mechanism to agent coordination" \
  --body "$(cat <<'EOF'
## Summary
Adds a structured channel for agents to surface pain points that humans cannot observe from the outside.
...
EOF
)"
```
10. **Verify the PR after creation.** Run `gh pr view` and check:
    - Title and body rendered correctly
    - Base branch is right
    - Commits list matches what you expected
    - No files are in the diff that shouldn't be

If anything is wrong, fix it with `gh pr edit` immediately. Do not leave a broken PR sitting.

### After creating the PR

11. **Report the URL back to the user.** A single line: the PR URL and the title. Nothing more unless they ask. They asked you to create a PR; the delivery is the URL.

12. **Do not request reviewers unless asked.** Assigning reviewers is a social decision, not a technical one. Let the user do it unless they've told you who to assign.

---

## What NOT to Do

These are the failure modes that will embarrass you or the user. They come up more often than you'd think, which is why they're called out explicitly.

- **Never omit AI attribution when the PR was created by an agent.** This is dishonest to the reviewer and undermines the user, who has chosen transparency about AI collaboration deliberately. The attribution line in the PR body and the co-author trailer in commits are both required.
- **Never create a PR without reading the diff.** Writing a body from commit messages alone will produce a body that is subtly wrong, and the reviewer will notice.
- **Never stage files you didn't intend to commit.** See `.claude/skills/git-commit/SKILL.md` for the discipline. A PR that includes someone else's work-in-progress is a mess that's expensive to untangle.
- **Never skip `gh pr view` after creation.** The one time you skip it is the one time the PR ended up on the wrong base branch or with a mangled body.
- **Never mark a PR as ready to merge on behalf of the user.** Leave merge decisions to the user, always.
- **Never open a PR from a branch that hasn't been pushed.** You'll get an error and look sloppy.
- **Never use `git push --force` without explicit user approval.** If a force push seems necessary (rebase, squash, etc.), ask first.
- **Never include the user's private context in a PR body.** Things from memory, off-the-record conversations, or private strategic framing are not for public repos. The PR body is public-facing artifact.

---

## What This Skill Does Not Cover

- **Branch strategy** — when to cut a branch, when to rebase, when to merge. That's a project-level convention, not a PR-creation concern.
- **Code review responses** — this skill covers creating the PR, not the back-and-forth of the review. Reviewing a PR is its own discipline.
- **Commit message formatting** — see `.claude/skills/git-commit/SKILL.md` for commit conventions. PR title and commit message are related but not identical; the title describes the PR, the commit describes the change.
- **Merge conflicts** — resolving them is a separate craft. If the PR has conflicts, ask the user how to proceed unless the resolution is trivial and obvious.
