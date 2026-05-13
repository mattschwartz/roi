---
name: address-pr-comments
description: Use this skill when addressing PR comments
disable-model-invocation: true
---

# Address PR Comments

## Overview

When a pull request receives review comments, the engineer reads all of them before touching any code, categorizes each one, surfaces anything requiring a human decision, then resolves the remaining items, verifies each fix, and closes the loop on the PR. The goal is a clean, complete response to the review — not a sequence of reactive patches.

This SOP is for the engineer agent. It applies any time a PR has open review comments that need to be addressed.

## Parameters

- **pr_identifier** (required): The PR number or URL to address (e.g. `9` or `https://github.com/org/repo/pull/9`)

**Constraints for parameter acquisition:**
- If all required parameters are already provided, You MUST proceed to the Steps
- If any required parameters are missing, You MUST ask for them before proceeding
- When asking for parameters, You MUST request all parameters in a single prompt
- When asking for parameters, You MUST use the exact parameter names as defined

## Steps

### 1. Fetch All Review Comments

Retrieve every open review comment on the PR before taking any action.

**Constraints:**
- You MUST fetch open inline review comments using the GraphQL query below before reading any individual file or writing any code. This is the canonical command — it filters to unresolved threads only and returns exactly the fields needed for categorization.
- You MUST NOT begin addressing comments until you have read all of them, because a later comment may change how an earlier one should be handled
- You MUST note the total number of open comments so you can confirm all are addressed at the end
- You MUST NOT change the owner or name in the query, because the values will always be static

```bash
gh api graphql -f query='
{
  repository(owner: "mattschwartz", name: "systemos") {
    pullRequest(number: NUMBER) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 1) {
            nodes {
              databaseId
              path
              line
              author { login }
              body
            }
          }
        }
      }
    }
  }
}' | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .comments.nodes[0] | {id: .databaseId, path: .path, line: .line, author: .author.login, body: .body}]'
```

Substitute `NUMBER` from the `pr_identifier`. If `pr_identifier` is a full PR URL, extract only the PR number; the `owner` and `name` values in the canonical query above remain static and must not be changed. The `select(.isResolved == false)` filter ensures resolved threads are never surfaced.

### 2. Categorize Every Comment

Assign each comment to exactly one of these categories before proceeding:

| Category | Description |
|---|---|
| **Fix** | Clear, unambiguous implementation change. The engineer can resolve it without a design decision. |
| **Decision needed** | The comment surfaces an ambiguity, design question, or tradeoff the engineer cannot resolve unilaterally. Requires human input before work can proceed. Example feedback: "Consider updating the documentation **or** changing the code". |
| **Clarification** | The reviewer is asking a question or requesting explanation — the response is a reply, not a code change. |
| **Duplicate** | Covered by another comment already being addressed. Note which comment it duplicates. |

**Constraints:**
- You MUST assign every comment to a category — do not leave any uncategorized
- You MUST NOT treat a comment as a Fix if it contains unresolved ambiguity about intended behavior, because guessing on behavior produces code that silently violates design intent
- You SHOULD look for comments that share a root cause and group them, because fixing them independently can produce inconsistent results

### 3. Surface Blockers Before Acting

Report any **Decision needed** comments to the user and wait for resolution before proceeding with any code changes.

**Constraints:**
- You MUST stop and report all **Decision needed** comments as a grouped list before writing any code, because proceeding without these answers risks implementing the wrong behavior and producing rework
- You MUST include for each blocker: the comment text, why it requires a decision (not just a fix), and what the specific question is that needs answering
- You MUST NOT make a design call unilaterally in order to avoid surfacing a blocker — if something is ambiguous, it is a blocker
- If there are no **Decision needed** comments, You MUST skip this step and continue to Step 4

### 4. Address Fixes

Implement all **Fix** category changes. Where grouped comments share a root cause, address them together.

**Constraints:**
- You MUST read the relevant files before editing them because the current state may differ from what the diff showed at review time
- You MUST address all **Fix** comments before moving on — do not partially resolve and commit
- You MUST NOT expand scope while fixing — a PR comment response is not an opportunity to refactor adjacent code or add features, because unrequested changes obscure what was actually addressed and complicate re-review
- You SHOULD address grouped comments (same root cause) with a single coordinated change rather than sequential patches, because it produces cleaner diffs and avoids intermediate broken states
- You MUST skip resolved comments
- You MUST NOT skip a Fix comment because it seems minor — all open comments must be resolved

### 5. Respond to Clarification Comments

For each **Clarification** comment, reply directly on the PR. No code changes needed unless the clarification reveals a misunderstanding that warrants a fix.

**Constraints:**
- You MUST reply to each **Clarification** comment on the PR using `gh api` or `gh pr comment`
- If a clarification response reveals the code is actually wrong, You MUST reclassify that comment as a Fix and return to Step 4
- You MUST keep replies concise — one to three sentences, directly answering what was asked

### 6. Verify Each Fix

Before committing, verify that each addressed comment is actually resolved — not just that something changed nearby.

**Constraints:**
- You MUST re-read each original comment and confirm the change directly addresses what was asked, because mechanical edits sometimes satisfy the surface request while missing the underlying concern
- You MUST NOT mark a comment as resolved
- If a fix reveals additional problems in adjacent code, You SHOULD note them but MUST NOT expand the current PR's scope to address them — ask the user if they want to open a follow up task instead

### 7. Commit and Push

Commit all changes with a message that makes the PR comment response traceable.

**Constraints:**
- You MUST stage only the files that were changed in response to PR comments, because staging unrelated files obscures the review response and can accidentally include unreviewed work
- You MUST write a commit message that summarizes what was addressed (e.g. "Address PR #9 review comments: fix X, clarify Y, resolve Z")
- You MUST push to the same branch the PR is open against
- You MUST NOT force-push unless the reviewer explicitly requested a rebase, because force-pushing rewrites history the reviewer has already read

## Examples

### Example 1: All comments are clear fixes

**Input:**
- pr_identifier: `9`

**Expected behavior:**
Engineer fetches all comments, categorizes all as Fix, addresses them in one pass (grouping related changes), verifies each, commits with a descriptive message, resolves all threads, and leaves a summary comment on the PR.

### Example 2: One comment requires a design decision

**Input:**
- pr_identifier: `9`

**Expected behavior:**
Engineer fetches all comments. One comment asks whether stop-loss should fire on exact price match or only on crossings — this is a design question, not a Fix. Engineer reports the blocker to the user with the exact comment text and the specific question. Engineer does not write any code. Once the human answers, engineer re-enters at Step 4 and addresses remaining fixes.

### Example 3: Comment reveals a deeper problem

**Input:**
- pr_identifier: `9`

**Expected behavior:**
During Step 6 verification, engineer notices the fix for one comment exposes a related bug in adjacent code. Engineer does not expand scope to fix it. Engineer opens a follow-up task, notes it in the PR summary comment, and resolves only what was in scope for this review.

## Troubleshooting

### Comment intent is ambiguous

If a comment could be read as either a Fix or a Decision needed, default to **Decision needed** and surface it. It is faster to get a quick answer than to implement the wrong thing and revisit.

### Multiple comments point at the same underlying issue

Group them. Fix the root cause once, then verify that all grouped comments are satisfied by the single change. Note the grouping in your commit message.

### Reviewer left a comment that is already fixed by another comment's resolution

Mark it as **Duplicate**, note which comment resolves it, and resolve the thread with a short explanation.

### PR has too many comments to track in one pass

Work through Step 2 (categorization) completely before starting Step 4. The categorized list is your checklist — do not begin fixing until every comment has a category. Ask the user which tasks in the list to address in this session.
