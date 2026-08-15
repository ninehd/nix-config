# subagent-herdr

Pi extension that delegates work to specialized agents running as visible Herdr panes.

## What it adds

Tool name: `subagent_herdr`

Modes:

- Single: `{ agent, task }`
- Parallel: `{ tasks: [{ agent, task }, ...] }`
- Chain: `{ chain: [{ agent, task }, ...] }`, with `{previous}` placeholder support

Each task:

1. Requires `HERDR_ENV=1`.
2. Creates a visible Herdr location:
   - `single`: sibling pane by default.
   - `parallel` / `chain`: new tab by default, with subagents split inside it.
   - `placement` can force `split`, `tab`, or `workspace`.
3. Starts a Pi agent via `herdr agent start <name> --kind pi --pane <pane>`.
4. Sends task via `herdr agent prompt <name> ... --wait`.
5. Reads final output via `herdr agent read <name> --source recent-unwrapped`.

Default behavior keeps created panes open so you can inspect or continue them.

## Agent files

Agents are Markdown files with YAML frontmatter.

Locations:

- User agents: `~/.pi/agent/agents/*.md`
- Project agents: `.pi/agents/*.md` when `agentScope` is `project` or `both`

Example:

```markdown
---
name: reviewer
description: Code review specialist
tools: read, grep, find, ls, bash
---

You are a senior reviewer. Read-only commands only. Report actionable findings with file paths and line numbers.
```

Optional frontmatter:

- `tools: read, grep, find, ls, bash`
- `model: provider/model-id`

If `model` is omitted, child Pi inherits the parent session model and thinking level.

## Usage examples

Single:

```text
Use subagent_herdr with agent reviewer to review current git diff.
```

Parallel:

```text
Use subagent_herdr in parallel: reviewer checks standards, reviewer checks spec compliance.
```

Chain:

```text
Use subagent_herdr chain: scout finds auth code, planner creates plan from {previous}.
```

## Parameters

- `agent`, `task`: single mode
- `tasks`: parallel mode, max 8 tasks, max 4 concurrent
- `chain`: sequential mode
- `agentScope`: `user` (default), `project`, or `both`
- `kind`: Herdr agent kind, default `pi`
- `placement`: `split`, `tab`, or `workspace`; default `split` for single and `tab` for parallel/chain
- `direction`: pane split direction, `right` (default) or `down`; used only when creating split panes
- `confirmProjectAgents`: prompt before running repo-controlled project agents, default true. In non-UI modes, project agents are blocked unless `confirmProjectAgents=false` is passed deliberately.
- `timeoutMs`: prompt wait timeout, default 300000
- `startTimeoutMs`: startup timeout, default 30000
- `readLines`: lines to read from Herdr, default 500
- `closePanes`: close created panes after reading output, default false

## Notes

This extension differs from Pi's example `subagent` extension:

- Example `subagent` spawns invisible `pi --mode json` subprocesses and parses JSON stdout.
- `subagent-herdr` starts visible Herdr panes and reads terminal output.

Tradeoff: better observability and manual control, less precise structured streaming.
