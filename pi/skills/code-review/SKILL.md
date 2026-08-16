---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Code smells (Fowler smell heuristics in the diff) and Spec (does the code match what the originating issue/spec asked for?). Runs one review sub-agent and reports both axes side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Code smells** — does the diff introduce Fowler code-smell heuristics?
- **Spec** — does the code faithfully implement the originating issue / spec?

Both axes run inside **one review sub-agent**, then this skill presents its findings.

The issue tracker should have been provided to you — run `/setup-matt-pocock-skills` if `docs/agents/issue-tracker.md` is missing.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here — not inside the review sub-agent.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Use the code-smell baseline

The Code smells axis uses this fixed set of Fowler code smells (_Refactoring_, ch.3). Each smell is a labelled heuristic, not a hard violation. Skip anything tooling already enforces.

Each smell reads *what it is*; *how to fix*. Match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds; rename it, and if no honest name comes, the design is murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change; extract the shared shape, call it from both.
- **Feature Envy** — a method reaches into another object's data more than its own; move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together; bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string stands in for a domain concept that deserves its own type; give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change; replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff; gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons; split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks are added for needs the spec doesn't have; delete it, inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation that the caller shouldn't depend on; hide the walk behind one method on the first object.
- **Middle Man** — a class or function mostly delegates onward; cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer ignores or overrides most of what it inherits; drop the inheritance, use composition.

### 4. Spawn one review sub-agent

**Review sub-agent prompt** — include:

- The full diff command and commit list.
- The smell baseline from step 3 pasted in full — the sub-agent has no other access to it.
- The path or fetched contents of the spec, or an explicit note that no spec is available.
- The Code smells brief: "Report — per file/hunk where relevant — any baseline smell you spot: name it and quote the hunk. Treat every smell as a judgement call, not a hard violation. Skip anything tooling enforces. Under 400 words."
- The Spec brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words. If no spec is available, report `no spec available`."
- The output shape: two headings, exactly `## Code smells` and `## Spec`. Keep findings under their axis. Do not merge or rerank findings across axes.

### 5. Present

Present the review sub-agent's two sections under `## Code smells` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code with no notable smell but wrong behaviour: **Code smells pass, Spec fail.**
- Code that does exactly what the issue asked but introduces a smell: **Spec pass, Code smells fail.**

Reporting them separately stops one axis from masking the other.
