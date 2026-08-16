---
name: subagent
description: Spawn a Pi subagent in a Herdr pane, observe its work, and wait for its durable assistant result in the JSONL session. Use for independent reviews or delegated repository work when running inside Herdr.
---

# Subagent

Spawn each subagent in a separate Herdr pane with a dedicated JSONL session file. Use `wait.ts` beside this file to wait for completion and read the result. Do not infer the result from pane text.

## Preconditions

Before any Herdr command, verify this agent runs inside Herdr:

```sh
test "${HERDR_ENV:-}" = 1
```

If check fails, say you are not running inside Herdr and stop. Do not inspect or control Herdr from outside Herdr.

Learn installed command syntax when needed:

```sh
herdr --help
herdr agent
herdr pane
```

The installed `herdr` binary is authority.

## Spawn

1. Choose a short unique agent name matching `[a-z][a-z0-9_-]{0,31}`.
2. Create a temporary run directory with `mktemp -d`.
3. Write the complete task to `<run-dir>/prompt.md` with the `write` tool.
4. Create the exact session path before launch:

```sh
touch <run-dir>/session.jsonl
```

5. Create a sibling pane in the current tab, preserve cwd, and keep user focus unchanged:

```sh
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

Use `down` instead of `right` when current pane is narrow or user asked for that direction. Read the new pane ID from `.result.pane.pane_id`.

6. Start Pi in that pane as a Herdr-managed agent:

```sh
herdr agent start <name> --kind pi --pane <pane-id> -- \
  --session <run-dir>/session.jsonl \
  --provider "$PI_PROVIDER" \
  --model "$PI_MODEL" \
  --thinking "$PI_REASONING_LEVEL"
```

Pass native Pi arguments after `--`. Current Pi model settings are available through `PI_PROVIDER`, `PI_MODEL`, and `PI_REASONING_LEVEL` in the bash tool environment.

7. Submit the task through Herdr's agent surface:

```sh
herdr agent prompt <name> "$(cat <run-dir>/prompt.md)" --wait --timeout 120000
```

Use larger `--timeout` for long work. If prompt returns `blocked` or fails, inspect before sending more input:

```sh
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines 120
```

Do not close or kill the pane while the subagent is working.

## Observe

Inspect progress when needed:

```sh
herdr agent read <name> --source recent-unwrapped --lines 120
```

If Herdr cannot classify the agent, use pane output only for progress:

```sh
herdr pane read <pane-id> --source recent-unwrapped --lines 120
```

Terminal text is not authoritative for final result.

## Wait and collect

Run the companion script against the exact session file:

```sh
node ~/.pi/agent/skills/subagent/wait.ts <run-dir>/session.jsonl
```

The script follows the active JSONL branch. It waits until the latest message on that branch is an assistant message with a terminal `stopReason`, then prints the latest assistant entry as JSON.

Options:

```text
--count <n>           Number of latest terminal assistant entries to print (default: 1)
--timeout <seconds>   Maximum wait (default: 1800)
--poll <milliseconds> Poll interval (default: 500)
```

When invoking it through the bash tool, set the bash timeout longer than `--timeout`. A nonzero exit means the session could not be read or did not settle before the deadline.

## Cleanup

After collecting the result, close only the pane you created if cleanup is desired:

```sh
herdr pane close <pane-id>
rm -rf <run-dir>
```

Keep the pane or run directory when transcript or UI state is still needed for review.
