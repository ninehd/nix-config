---
name: subagent
description: Run a leaf Pi subagent headlessly in an isolated process and collect its result. Use for independent reviews or delegated repository work.
---

# Subagent

Delegate one bounded task to one headless Pi process. The child works in the current directory and writes its final response to a file. No Herdr pane is involved.

## Recursion boundary

When `PI_SUBAGENT_DEPTH` is set, complete the current task directly and return its result. That process is a leaf.

Every child launch must set `PI_SUBAGENT_DEPTH=1`, unset `HERDR_ENV`, and receive the leaf system instruction shown below. Skills, extensions, and normal tools remain available; the system instruction and depth guard reserve delegation for the parent.

## Run

1. Define one standalone task. Include all constraints, relevant paths, checks, and required output shape. The child has no parent conversation.
2. Create a run directory:

```sh
rtk mktemp -d -t pi-subagent.XXXXXX
```

3. Write the task to `<run-dir>/prompt.md` with the `write` tool.
4. Run Pi headlessly with the `bash` tool. Substitute the returned directory and set the tool timeout high enough for the task:

```sh
RUN_DIR="<run-dir>"
rtk env -u HERDR_ENV PI_SUBAGENT_DEPTH=1 \
  pi --print \
  --session "$RUN_DIR/session.jsonl" \
  --provider "$PI_PROVIDER" \
  --model "$PI_MODEL" \
  --thinking "$PI_REASONING_LEVEL" \
  --append-system-prompt "You are a leaf subagent. Complete the assigned task directly with available skills and tools, then return its result. Do not invoke the subagent skill or start, spawn, or delegate to another agent." \
  "Complete the task supplied on stdin. Return only the final result." \
  < "$RUN_DIR/prompt.md" \
  > "$RUN_DIR/result.md" \
  2> "$RUN_DIR/stderr.log"
```

5. On success, read `<run-dir>/result.md` with the `read` tool. Treat that file as the subagent result.
6. On failure or empty output, read `<run-dir>/stderr.log` and report the shortest decisive error. Keep `<run-dir>/session.jsonl` for diagnosis.
7. Remove the run directory after consuming the result unless its transcript is still needed.

For independent tasks, run separate commands in parallel with one run directory per child.
