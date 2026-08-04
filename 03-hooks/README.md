# tool-call hooks -- physical checks before a tool call runs

PreToolUse hooks: the harness launches one of these as a short-lived
process right before it runs a tool call, feeding it a JSON payload on
stdin. Exit `0` lets the call through; exit `2` **blocks** it and shows the
agent whatever this process wrote to stderr. Every hook here follows the
same rule as the git guards in `04-git-guards-that-block-commits-and-pushes/`:
block with a reason AND a fix, never a bare "no".

No third-party dependencies -- pure Python 3 standard library, so these run
unmodified on Windows, macOS and Linux with nothing installed beyond
`python3` itself.

| File | Registers on | Blocks on |
|---|---|---|
| `lib_hookio.py` | n/a (shared library) | -- |
| `deny-unsafe-delete.py` | `Bash`, `PowerShell` | a recursive/forced delete (`rm -rf`, `Remove-Item -Recurse -Force`, `rmdir /s`, ...) whose target isn't a known regenerable build/cache dir or an OS temp path |
| `deny-secret-in-write.py` | `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | content shaped like a live API key, token, private key, or password literal |
| `require-plan-before-edit.py --gate` | `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | the first file edit of a session that has no recorded task list/plan |
| `require-plan-before-edit.py --record` | `TodoWrite`, `ExitPlanMode` (or your harness's planning tool) | nothing -- just remembers a plan now exists |

## Install

Copy `settings.example.json` into your project's `.claude/settings.json`
(merge it if you already have hooks configured), then adjust the tool
names in each `matcher` to whatever your harness actually calls them --
`TodoWrite`/`ExitPlanMode` are Claude Code's own tool names; a different
agent harness will use different ones. `${CLAUDE_PROJECT_DIR}` is expanded
by the harness to your project root; if yours doesn't support that
placeholder, replace it with the absolute path to this directory.

If `python3` isn't the right command on your machine (some Windows Python
installs only register `python`), change the `"command"` value in
`settings.example.json` accordingly -- the scripts themselves don't care
what invokes them.

## Escape hatches

Every hook here fails toward "block", not "ask", so each one accepts a
**written-reason** override instead of a blanket bypass flag -- a bare `1`
never counts, only an actual sentence:

| Hook | Override |
|---|---|
| `deny-unsafe-delete.py` | env var `ALLOW_UNSAFE_DELETE=<reason>`, or a `# ALLOW-UNSAFE-DELETE: <reason>` comment in the command |
| `deny-secret-in-write.py` | env var `ALLOW_SECRET_IN_WRITE=<reason>`, or an `ALLOW-SECRET-IN-WRITE: <reason>` line in the file content |
| `require-plan-before-edit.py` | env var `ALLOW_EDIT_WITHOUT_PLAN=<reason>`, or an `ALLOW-EDIT-WITHOUT-PLAN: <reason>` line in the edit content |

The reason is not logged anywhere durable by these scripts (no network
calls, no repo writes) -- it is printed to stderr for the harness's own
transcript/log, which is the same place every other block message goes.

## Fail-open vs fail-closed

`deny-unsafe-delete.py` is the one hook here that fails **closed**: if it
cannot parse the payload or tokenize a delete command's arguments, it
blocks rather than guesses. A wrongly blocked delete costs a retry; a
wrongly allowed one is unrecoverable. Every other hook fails **open** on
the same kind of error, because their only failure mode is added friction,
and a hook bug must never be why an unrelated write or edit can't land.

## Extending

`deny-unsafe-delete.py`'s `REGENERABLE_DIR_NAMES` and
`deny-secret-in-write.py`'s `SECRET_PATTERNS` are both short, deliberately
incomplete tables meant to be edited for your own stack and providers, not
treated as exhaustive out of the box. Pair `deny-secret-in-write.py` with a
real secret scanner (gitleaks, trufflehog) at commit time -- see
`04-git-guards-that-block-commits-and-pushes/` -- this hook catches the
obvious paste-a-key mistake before it lands on disk, it is not a substitute
for scanning history.
