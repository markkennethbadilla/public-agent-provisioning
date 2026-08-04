# git guards — physical checks on every commit and push

Two ordinary git hooks. Git requires the filenames `pre-commit` and `pre-push`
exactly, so those can't change. They **block** (exit 1) instead of warning,
and every block prints what was wrong plus a concrete fix — never a bare "no".

| File | Runs when you… | Blocks on… |
|---|---|---|
| `pre-commit` | save a change (`git commit`) | a leaked secret, a giant file, leftover debug code, an unpinned/floating dependency, a stray or nested repo, committing in a shared checkout another worktree is using, or a broken guard (see `05-checks-this-repo-runs-on-itself/`) |
| `pre-push` | upload changes (`git push`) | the wrong repo/account, a rewritten (force-pushed/rebased/amended) published history, a deleted remote branch, a direct push to `main` on a repo you don't own, or your own project's build gates failing |

## Install

Point git's hooks path at this directory. No copying required:

```
git config core.hooksPath /path/to/04-git-guards-that-block-commits-and-pushes          # this repo only
git config --global core.hooksPath /path/to/04-git-guards-that-block-commits-and-pushes # every repo on this machine
```

If you'd rather copy `pre-commit`/`pre-push` to a stable central location
instead of pointing at this folder directly, drop a file named `.guard-root`
next to the copies, containing the absolute path back to this template repo.
`pre-commit` section 7 (and `05-checks-this-repo-runs-on-itself/verify-git-guards.mjs`)
use it to find the self-check suite from any repo on the machine.

## Configure

Copy `guardrc.example` to `.guardrc` (at your repo root, or beside the hook
files) and fill in your own values — account mapping, max file size, which
package manager is allowed, and the command your own build gates run as.
**Every setting is optional and fails toward "not enforced", never toward
"blocks everything"** — an unconfigured clone still gets the checks that need
no configuration: secret scanning, the mega-file cap, the debug-code ban,
forward-only history, and dependency pinning.

## Never bypass with `--no-verify`

If a check is wrong, fix the check. Routing around a red gate is how a
guardrail becomes theatre — see `05-checks-this-repo-runs-on-itself/` for how
this template proves its own guards are still live and still capable of
firing, not just present.

## Escape hatches

A handful of checks accept a narrow, named, single-use override instead of a
blanket bypass — each one is logged to stderr when used:

| Variable | Unblocks |
|---|---|
| `WORKTREE_OK=1` | committing in a primary checkout that has other worktrees |
| `GIT_GUARD_ALLOW_FOREIGN=1` | a repo root outside every mapped account root |
| `GIT_GUARD_ALLOW_BRANCH_DELETE=1` | deleting a remote branch |
| `GIT_GUARD_ALLOW_EXTERNAL_MAIN=1` | pushing straight to `main` on a repo you don't own |
| `GIT_GUARD_ALLOW_FORCE=1` | a non-fast-forward push |

These exist because an escape hatch with no way to say yes gets bypassed
entirely (`--no-verify`), which teaches the habit of skipping the guard
instead of fixing the cause. A named variable keeps the override *inside*
the guard: still off by default, still visible in the command that used it.
