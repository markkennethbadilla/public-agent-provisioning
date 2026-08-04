# verify-guards.mjs — proof that the guardrails actually fire

**The thesis:** an untested guardrail is theatre. It reports safety whether
or not it is doing anything — a block message that never triggers is
indistinguishable, from the outside, from one that works. And a guard that
*does* fire, but also fires on legitimate work, is worse than none: a false
positive is exactly what teaches people to reach for `--no-verify` and stop
reading the output at all. So this file asserts **both directions, for every
guard**:

1. Build an input the guard's own documentation says it exists to catch.
   Run the real, unmodified, shipped guard against it. **Fail the whole
   suite if it was allowed through.**
2. Build a benign input shaped like ordinary, legitimate work. Run the same
   guard against it. **Fail the whole suite if it was blocked.**

Neither direction is optional, and neither can be inferred from reading the
guard's source — a regex that looks right can still be inverted, over-broad,
or dead code behind a condition that never evaluates true. Only running it
proves it.

## Run it

```
node 05-self-checks/verify-guards.mjs
```

Node 18+, zero npm dependencies. It also wants `git` (required), `gitleaks`
(optional — see below), and one of `python3` / `python` / `py` on `PATH`
(needed to exercise `03-hooks/`; skipped, not faked, if none is found).
Exit code is `0` only if every exercised assertion — every "bad input was
blocked" and every "good input passed" — came back correct.

## What it does NOT touch

Every git guard scenario runs inside a **throwaway repo under the OS temp
directory**, created fresh per scenario and deleted when the run finishes
(`finally` block — cleanup runs even on failure). Every one of those scratch
repos also runs with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` pointed at an
empty file for the duration of the run, so the result can never depend on
what happens to be in the machine's own `~/.gitconfig` — the same suite gives
the same answer on a fresh clone, in CI, or on a laptop with a fully
customised git setup. This repo's own git history, working tree, and remotes
are never read from or written to. See `lib/scratch.mjs`.

## The two "self-check" directories, and why there are two

`05-self-checks/` answers **"is the reviewed guard the
one actually running, byte for byte, right now, on this machine?"** — a
tamper/drift question, answered with a hash compare, plus "can the `checks/`
fixture harness itself go red?"

This directory answers a different question: **"if you feed the guard
exactly what it claims to block, does it actually block it — and does it
leave ordinary work alone?"** That's a behavioural question, only answerable
by really running the guard, which is why this exists as a second file
instead of a section bolted onto the first. A guard can pass the hash
compare (nobody tampered with it) while having been logically broken from
the day it was written; this is the check that would have caught that.

## Coverage today

| Guard file | Mechanisms exercised (bad + good pair each) |
|---|---|
| `04-git-guards-that-block-commits-and-pushes/pre-commit` | secrets scan (gitleaks), mega-file cap, debug-code ban, primary-checkout worktree isolation, repo-local `guard.local.sh` plug-in, section 7 self-integrity (drifted "copied elsewhere" install), dependency floating-range pin |
| `04-git-guards-that-block-commits-and-pushes/pre-push` | forward-only history (force-push rewrite), remote branch deletion, `EXTERNAL-PR` protected-branch push, wrong-repo-name (A1), unrecognised origin host (A4), `GATE_CMD` red/green, `DEPLOY_MARKER` without a configured gate |
| `03-hooks/deny-unsafe-delete.py` | recursive/forced delete of an unclassified path vs. a known regenerable dir |
| `03-hooks/deny-secret-in-write.py` | a live-shaped credential literal vs. ordinary content |
| `03-hooks/require-plan-before-edit.py --gate` | an edit with no recorded plan vs. the written-reason override |

This is not every single branch inside every guard (`pre-commit` alone has
nine numbered sections, some with sub-cases) — it is the representative
mechanism classes, chosen so the file stays readable. Extending it is cheap:
each scenario is a self-contained `{ id, file, mechanism, run() }` object;
copy the nearest existing one and change the fixture.

### `03-hooks/` is a fork point — coverage there is discovered, not hardcoded

Contributors add and remove hooks in `03-hooks/`. This file never assumes
which ones exist. `verify-guards.mjs` lists every `*.py` in `03-hooks/`
(skipping `lib_`-prefixed shared modules, same convention the hooks
themselves use for `lib_hookio.py`) and prints, every run, how many have a
matching scenario in `scenarios-hooks.mjs` and which ones don't yet — a
**visible, counted gap**, never a silent pass. This mirrors the rule
`05-self-checks/verify-gates-can-fail.mjs` already
applies to `checks/` fixtures: coverage is allowed to grow one hook at a
time instead of needing an all-or-nothing cutover, and the gap stays on
screen instead of being silently assumed closed. Adding coverage for a new
hook is a new entry in `scenarios-hooks.mjs`, following the pattern of the
three already there.

## Graceful, honest degradation — never a faked green

- **No `gitleaks` on `PATH`:** the secrets-scan pair is reported as
  `SKIP`, with a note printed up front. It is not counted as a pass.
- **No `python3`/`python`/`py` on `PATH`:** any `03-hooks/` scenario that
  needs it reports `SKIP` the same way.
- **A scenario's own setup fails** (a bug in this suite, not the guard under
  test — e.g. a fixture commit that should have been clean got blocked by an
  unrelated section): reported as `ERROR`, counted as a failure, and printed
  separately so it reads as "this test is broken," not "the guard is
  broken."

A skip is never silently treated as a pass in the final tally, and the run
still exits non-zero on any real `FAIL`/`ERROR` even if some assertions were
skipped.

## Proving the harness itself can go red

A test suite that always prints green is exactly the theatre this whole
template argues against. This one was deliberately broken once during
authoring — a bad-input fixture was swapped for a benign one — and confirmed
to report `FAIL` with a non-zero exit before being reverted; see the commit
history of this directory. If you extend this file, do the same sanity check
on your new scenario before trusting it: make it fail on purpose once, then
fix it back.

## Files

- `verify-guards.mjs` — entry point: runs every scenario, prints the table, exits.
- `scenarios-pre-commit.mjs`, `scenarios-pre-push.mjs` — one scenario per git-guard mechanism.
- `scenarios-hooks.mjs` — one scenario per `03-hooks/*.py` hook that exists today.
- `lib/scratch.mjs` — throwaway git repo / bare remote factory, config isolation.
- `lib/proc.mjs` — process-spawn + isolated-git-env helper shared by everything above.
- `lib/hook-io.mjs` — runs a `03-hooks/*.py` hook with a JSON payload on stdin, reads its exit code.
