# pi-review

`pi-review` adds a practical code review workflow to Pi via `/review` and `/end-review`.
Fork of [earendil-works/pi-review](https://github.com/earendil-works/pi-review) with personal modifications.

## Install

```bash
pi install git:github.com/ninehd/pi-review
```

## What It Does

- Review **uncommitted changes**
- Review changes against a **base branch**
- Review a specific **commit**
- Review a GitHub **pull request** or GitLab **merge request** through one PR/MR flow (auto-detects from URL/remote)
- Review one or more **folders/files** as a snapshot (not a diff)
- Produce prioritized findings with a clear verdict and actionable follow-ups
- It separates feedback to the agent from human callouts

It also supports custom shared instructions that are loaded from `REVIEW_GUIDELINES.md`.

## Quick usage

```bash
/review
/review uncommitted
/review branch main
/review commit abc123
/review request 123
/review request https://github.com/owner/repo/pull/123
/review request https://gitlab.com/group/project/-/merge_requests/123
/review pr 123
/review mr 123
/review folder src docs
/review branch main --extra "focus on performance and error handling"
```

Headless/RPC-friendly forms (for clients that cannot render Pi's TUI-only selector):

```bash
/review --base develop
/review --request
/review --request 123
/review --preset base-branch --base develop
/review --current-session --base develop
/review --empty-branch --request
```

When a review session is active, finish it with:

```bash
/end-review
/end-review summarize
/end-review fix
/end-review return-only
```

You can then return only, return + summarize, or return + queue fixing work.
