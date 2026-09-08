---
name: implement
description: "Implement work from a spec or tickets on a dedicated branch, then open a pull request."
disable-model-invocation: true
---

# Implement

Implement the work described by the user in the spec or tickets, from a dedicated branch through to a pull request.

## 1. Gather context

Read the full spec or ticket, including comments, and the repository guidance relevant to the work.

Inspect the current branch and working tree before making changes. Preserve unrelated changes. If existing changes cannot be safely separated from this work, stop and ask the user how to proceed rather than stashing, resetting, or committing them.

## 2. Create the branch

Before editing code, create a task-specific branch from the appropriate base branch. Follow the repository's naming convention; otherwise use a short lowercase name such as `feat/<ticket>-<slug>` or `fix/<ticket>-<slug>`, omitting the ticket number when none exists.

Never implement directly on the default branch. If the current branch is already dedicated to this exact work, reuse it instead of creating a nested or duplicate branch. Do not pull, rebase, or overwrite an existing branch without the user's permission.

## 3. Implement and verify

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

## 4. Commit and open the pull request

Review the final diff and include only files belonging to this work. Use /caveman-commit to stage and commit the implementation, then push the branch to its remote with upstream tracking.

Create a pull request against the repository's default branch using the forge CLI configured for the repository (`gh pr create` on GitHub or `glab mr create` on GitLab). Do not create a duplicate if one already exists for the branch.

The pull request must contain:

- a concise title describing the delivered behaviour;
- a summary of the user-visible or architectural changes;
- the exact validation commands run and their outcomes;
- a link to the source spec or ticket, using a closing reference only when the pull request fully resolves it.

Open a normal pull request when all required checks pass. If the implementation is intentionally incomplete or a required check still fails, open it as a draft and state the limitation clearly. Return the pull request URL to the user. If pushing or PR creation is blocked by authentication, permissions, or missing tooling, keep the local branch and commits intact and report the exact blocker and the command the user can retry.
