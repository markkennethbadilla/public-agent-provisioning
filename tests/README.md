# Self-checks

A guard that has never been seen to fail is theatre. It prints the same
reassuring nothing whether it works or not, and nobody finds out until the day
it was supposed to fire.

These tests run each guard for real and read what it returns. Every test is a
pair. One half feeds the guard the thing it exists to catch and fails if that
gets through. The other half feeds it ordinary work and fails if that gets
blocked. Both halves are load-bearing. A guard that never fires protects
nothing, and a guard that fires on legitimate work is the one people learn to
switch off.

## Run them

```bash
npm test          # node --test
```

Node 22 or later. No test framework is installed, because `node:test` has
shipped in Node since version 18 and Node is already the runtime.

The suite needs `git`, `trunk` and `gitleaks` on `PATH`, plus `npm install` for
the `rulesync` command-line tool. A missing tool is reported as a failure, never
skipped. A guard nobody on this machine can run is the failure, not a reason to
look away.

## What is covered

Nothing here tests gitleaks, Trunk, or rulesync. Those are maintained by other
people and already have their own suites. What is tested is this repository's
wiring, meaning whether a refusal actually reaches the person or the agent
trying to do the thing.

| Guard | Maintained owner | Bad input, must be blocked | Good input, must pass |
|---|---|---|---|
| PreToolUse hook | rulesync declares it, gitleaks detects | A call to every tool the matcher names, carrying a live-shaped AWS key ID. Exit code must be 2 | The same call carrying an ordinary note. Exit code must be 0 |
| Hook wiring | rulesync `.rulesync/hooks.jsonc` | A hook file no registration names, or a registration naming a file that is gone | Every hook on disk registered, every registration backed by a file |
| Commit guard | Trunk running gitleaks | `git commit` of a file holding the same key. Must exit non-zero and leave the change uncommitted | `git commit` of a clean file. Must exit 0 and move `HEAD` |
| Push guard | Trunk running gitleaks | `git push` of a commit holding the same key, both to a remote with no refs at all and to one that already has the branch. Must exit non-zero and leave the remote ref where it was | `git push` of a clean commit. Must exit 0 and land the commit on the remote |
| Generated file drift | `rulesync generate --check` | A generated `CLAUDE.md` edited by hand. Must exit 1 | Untouched output. Must exit 0 |

The push guard is checked against an empty remote on purpose, and it is the
half that failed when it was first written. A pre-push hook receives an
all-zero remote SHA-1 for a ref the remote does not have yet, and the earlier
push action turned that into an empty commit range, checked nothing, and
exited 0. The first `git push` into a newly created empty repository is the
push anybody forking this template makes, so the case with the least coverage
was the case most likely to leak. Read `.trunk/trunk.yaml` for what replaced it.

Exit code 2 is the number that matters for the hook. It is the only value an
agent host reads as "stop, do not run this tool call." Any other value lets the
write through, which is why the test asserts the number rather than the message.

```mermaid
flowchart LR
    A["Agent asks to write a file"] --> B["PreToolUse hook"]
    B --> C["gitleaks"]
    C -->|finding| D["exit 2, write refused"]
    C -->|clean| E["exit 0, write proceeds"]
    F["Developer runs git commit"] --> G["Trunk pre-commit hook"]
    G --> C
    C -->|finding| H["non-zero exit, commit refused"]
    C -->|clean| I["commit lands"]
    J["Developer runs git push"] --> K["Trunk pre-push hook"]
    K --> C
    C -->|finding| L["non-zero exit, remote ref stays put"]
    C -->|clean| M["commit reaches the remote"]
```

## Coverage is read, not typed

Every list in this suite comes out of the file that declares the thing, never
out of an array somebody keeps up to date by hand.

`hooks.test.mjs` reads `.rulesync/hooks/` for the hooks and the `matcher` in
`.rulesync/hooks.jsonc` for the tools. Add either to a fork and it is exercised
on the next run with no edit here. The suite also fails when the matcher names
a tool it has no payload shape for, which is the only way to notice that the
hook is registered for a tool whose text it never reads.

That last case is not hypothetical. `NotebookEdit` carries its text in
`new_source`, and it sat in the matcher while the hook script read `content`,
`new_string` and `edits[].new_string`. Every notebook write was handed an empty
string and allowed. Nothing caught it, because the test payload said `Write`
and always had.

The same shape is the worst bug this repository ever shipped: a pre-push check
described in three separate documents that, in the script, evaluated a variable
and did nothing with it. It survived because coverage was a list somebody
maintained by hand, and the list said the check was covered. A list that agrees
with the documentation instead of the code always agrees with the
documentation.

So the wiring tests assert both directions between the hook directory and the
registration file. A hook nothing registers never runs. A registration pointing
at a missing file fails open on some agent hosts and hard on others. Neither is
visible from reading either file alone.

## The git guards share one file on purpose

The commit guard and the push guard both live in `git-guards.test.mjs`, and
both build the fixture in `lib/trunk.mjs`.

`node --test` runs separate test files in parallel, and Trunk is not safe to
drive from two processes against one tool cache at the same time. Split across
two files, the two suites fail each other about half the time, with a Trunk
filesystem error that reads like a guard bug and is not one. Suites inside a
single file run in order, which is the property this needs. Keep new git guard
pairs in this file rather than starting another one.

## What the suite never touches

Every guard runs against a throwaway git repository under the operating system
temporary directory, rebuilt at the start of each run and deleted at the end.
This repository's history, working tree and remotes are never read or written.

Every `git` call runs with `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` pointed
at an empty file, so no test can see the `~/.gitconfig` of whoever runs it. An
empty file is valid, empty git configuration. Without that blindfold a guard
that reads `core.hooksPath` would inherit whatever the host machine happens to
have set, and the same suite would give different answers on different laptops.

## Proving the suite can go red

On 2026-08-22 the suite passed 23 of 23 against a fully wired guard set, and
each new pair was then made to fail on purpose.

The push action in `.trunk/trunk.yaml` went back to
`--commit-ref-from-pre-push`, the flag that produced the empty range. The
empty-remote test failed with the message it was written to print, that
`git push` returned 0 for a commit holding a live-shaped AWS key ID against a
remote holding no refs at all. Restoring `--all` returned the suite to green.

`ApplyPatch` was then added to the matcher in `.rulesync/hooks.jsonc` without a
payload shape to match. The suite came back 14 passed and 1 failed, naming the
tool and both files that have to change. Removing it returned the suite to
green.

Earlier the same day, `process.exit(0)` was inserted into the secret hook just
before its `process.exit(2)`, reproducing the shape of the historical bug where
a guard computes a finding and then does nothing with it. The bad half of the
hook pair failed, as it should.

Do the same for any pair you add. A test you have only ever seen pass is a test
you have not finished writing.

## Files

| File | Contents |
|---|---|
| `hooks.test.mjs` | PreToolUse hook pairs, one per tool in the matcher, and the wiring assertions |
| `git-guards.test.mjs` | Real `git commit` and real `git push` against a Trunk-managed scratch repository |
| `rulesync.test.mjs` | Drift detection, green on this repository, and red on a hand edit |
| `lib/proc.mjs` | Spawn helper, plus the git configuration blindfold |
| `lib/scratch.mjs` | Scratch repository factory and the two fixture strings |
| `lib/trunk.mjs` | The Trunk fixture, a scratch repository with real hooks installed |

The planted credential is synthetic and was never issued by anyone. It is
deliberately not `AKIAIOSFODNN7EXAMPLE`, the key from the AWS documentation,
because gitleaks 8.30.1 treats that one as a published placeholder and reports
nothing for it. A fixture built on it would pass forever for the wrong reason.
The token is assembled from fragments at runtime so that the file holding it
does not trip this repository's own secret scanner.
