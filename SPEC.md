# Specification for public-agent-provisioning

## Purpose

A forkable template that gives an AI coding agent five layers of enforcement,
where every layer is owned by a maintained tool and this repository holds only
the wiring. It contains no agent, no model, and no product logic.

The design goal is a guardrail set that keeps working when nobody is looking
after it. A hand-written check rots quietly. A pinned, renovated, upstream tool
gets patched by people who are paid to patch it.

## What this is

- **A layered enforcement pattern.** Rules read every turn, then skills read on
  demand, then a hook that intercepts a tool call before it runs, then git
  guards that block a commit or a push, then self-checks that prove the guards
  still fire. Each layer catches what the layer before it missed.
- **A working example, not pseudocode.** Every layer is wired and runnable in
  this repository. `npm run verify` runs all of it.
- **A fork point.** Seven lines in `.rulesync/rules/overview.md` are tagged
  **default** because they are starting positions, and two of those lines state
  a soft figure and a hard one, so the seven tags carry nine values between
  them. The two skills under `.rulesync/skills/` are worked examples meant to be
  replaced.

## What this is not

- **Not an installable package.** There is no `npm install
  public-agent-provisioning`, no version to pin and no upgrade path to track, so
  fork it and delete what does not fit your stack. See "Locked decisions" for
  why.
- **Not a multi-agent framework.** It does not orchestrate agents, route tasks,
  or manage a fleet. It constrains what one agent working in one git repository
  can get past.
- **Not a claim that any mechanism here is new.** Secret scanning, hook
  managers, and agent rule generators all existed first, and `PRIOR-ART.md`
  names them with live star counts. What this repository contributes is the
  wiring and the self-check tier.
- **Not a complete policy set.** Your line budgets, your validation libraries,
  and your search order for prior art are not this project's to guess. The seven
  **default** tags mark exactly where to make those calls.
- **Not silent when its tooling is missing.** The tool-call hook exits 2 and
  refuses the write when `gitleaks` is absent from `PATH`. It never skips the
  check it cannot run, because a guard that disables itself quietly still reads
  like protection.
- **Not dependency free.** The previous version of this document claimed "zero
  install dependency beyond git itself" and described the git guards as "two
  ordinary POSIX shell scripts". Both statements were false, and the next
  section says why.

## Real dependencies

| Tool | Needed by | Installed how |
|---|---|---|
| `git` | every layer | already present |
| Node 22 or later | the tool-call hook, the self-checks, `rulesync` | your own package manager |
| Trunk launcher 1.25.0 | the git guards | `@trunkio/launcher` on npm, or Trunk's own installer |
| `gitleaks` 8.30.1 on `PATH` | the tool-call hook only | your own package manager |
| Vale | prose linting | your own package manager locally, `vale-cli/vale-action` in CI |

Trunk downloads and pins `gitleaks`, `osv-scanner`, `actionlint`, and
`shellcheck` for the commit and push guards, so those four need nothing on
`PATH`. The tool-call hook is the exception. It runs inside the agent host,
before Trunk is in the picture, and calls `gitleaks` directly.

The old claim failed on two counts, and both are worth recording so nobody
reinstates them. The scripts began `#!/bin/bash` and used `mapfile -d ''`, which
needs bash 4.4, while stock macOS ships bash 3.2. The commit was also hard
blocked when `gitleaks` was absent, so git alone was never enough to run them.

## Locked decisions

### Every layer has a maintained owner

Adding a hand-rolled layer is the change that needs a written justification, not
the other way round. Search npm, PyPI, crates.io, and the vendor's own docs
first, and record what you adopted.

The bar for writing code here is a constraint no maintained tool covers. Being
unaware of a package is not evidence that none exists.

### A check blocks, or it does not exist

Every check either exits non-zero and stops the operation, or it is deleted. A
failing check that prints a warning and lets the change through is a rule with
extra steps, and it is the exact failure this repository exists to rule out.

This decision survives verbatim from the previous version of this document, and
it now has a first-party example instead of an assertion. Trunk's stock
pre-commit actions are declared `interactive: optional`, including
`trufflehog-pre-commit`, whose description reads `Don't allow secrets in
commits`. They print the finding, ask
`Changes not currently passing checks. Continue anyway? (Y/n)`, and with no
terminal attached the prompt answers itself.

Reproduced on 2026-08-22. `gitleaks` reported `aws-access-token has detected
secret for file leak.md`, `git commit` exited 0, `HEAD` moved, and the key
landed in the committed blob.

The replacement is the `block-commit-on-findings` action in `.trunk/trunk.yaml`,
which runs `trunk check --ci`. The `--ci` flag never prompts and exits non-zero
on a finding.

### Generated files are committed, and CI fails on drift

The 30 files agents actually read are committed rather than generated at clone
time, so a reader can see what an agent sees without installing anything. That
choice makes hand-editing possible, so a job has to catch it.

The job is `generated-files-match-source` in `.github/workflows/ci.yml`. It runs
`npx rulesync generate --check`, which regenerates in memory, compares against
what is on disk, and exits 1 on any change in meaning. `tests/rulesync.test.mjs`
proves the checker can go red by editing a generated `CLAUDE.md` in a scratch
project and asserting the exit code.

The comparison is semantic rather than byte for byte. Appending a comment to
each of the nine generated JSON files exited 0 for six of them, and re-minifying
`.cursor/hooks.json` exited 0 as well. Emptying `PreToolUse`, pointing the hook
command at `true`, moving an entry from `deny` to `allow`, and deleting a
generated file outright each exited 1, so the guard catches every edit that
changes what an agent is told.

### One source of truth for agent config

Five files under `.rulesync/` produce all 30 generated files across 7 agents.
Editing a generated file by hand is the banned move, because the edit survives
only until the next generate and then vanishes with no error.

`.vale.ini` scopes prose linting out of all 30 generated files for the same
reason. A Vale fix applied to `AGENTS.md` would be discarded by the next
generate and the gate would go red again on text nobody hand-writes.

Four sections do that, one per generated shape, and the source files under
`.rulesync/` stay linted. Adding a target to `rulesync.jsonc` writes another
copy of the same prose, so that target's directory has to join the brace list in
`.vale.ini` at the same time.

## Escape hatches

Every escape hatch below belongs to a maintained tool, and none of them force a
written reason. That is worth stating plainly, because the previous version of
this document locked in the decision "an exception is a written reason, never a
bare flag" and then cited a table of five bare environment-variable flags as its
evidence.

| Escape hatch | Layer it opens | Records a reason |
|---|---|---|
| `gitleaks:allow` comment on the line | tool-call hook and commit guard | no, bare marker |
| `.gitleaksignore` holding a finding fingerprint | commit guard | no, fingerprint only |
| `<!-- vale off -->` | prose lint | no |
| An `allow` entry in `.rulesync/permissions.jsonc` | permission boundary | only if you write a comment beside it |
| `git commit --no-verify` | the commit guard only, the push guard still fires on the same content | no, and the permission layer denies it to agents |
| `git push --no-verify` | the push guard | no, and the permission layer denies it separately |

Rule 15 of `.rulesync/rules/overview.md` asks for a reason beside the marker.
Nothing enforces that, and this document does not pretend otherwise. If your
fork needs the reason enforced, that is a check you have to add, and it is one
of the few places where writing code is the honest answer.

## Invariants

- **A check that cannot fail is worse than no check.** Every guard this
  repository can run itself has a test pair. One half feeds it the thing it
  exists to catch and fails if that gets through, and the other half feeds it
  ordinary work and fails if that gets blocked.

  Twenty-three tests cover the tool-call hook, its registration, the commit
  guard, the push guard, and the drift check. The permission entries in
  `.rulesync/permissions.jsonc` are the exception, because the agent host
  enforces those and nothing here can invoke one, which the known gaps below
  record.

  `tests/README.md` records the run where `process.exit(0)` was planted in the
  secret hook. The suite went from green to one failure, and the failure was the
  bad half of the hook pair.
- **The coverage list is read from disk, never typed.** `tests/hooks.test.mjs`
  reads `.rulesync/hooks/` and exercises whatever it finds, then asserts in both
  directions against `.rulesync/hooks.jsonc`. A hand-maintained coverage list
  agrees with the documentation instead of the code, which is how this
  repository once shipped a pre-push check that evaluated a variable and did
  nothing with it.
- **The suite never touches this repository.** Every guard runs against a
  throwaway git repository under the operating system temporary directory, with
  `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` pointed at an empty file so no
  test can read the host machine's git configuration.
- **No credential, host, IP address, or account-specific path is committed
  here.** `.rulesync/permissions.jsonc` denies reads of `.env`, `**/.ssh/**`,
  `**/credentials/**`, and twelve more patterns at the permission boundary,
  where an agent cannot negotiate with it.
- **Every fixture is checked against the scanner that has to catch it.** The
  planted AWS key is synthetic, assembled from fragments at run time, and
  deliberately not `AKIAIOSFODNN7EXAMPLE`. `gitleaks` 8.30.1 reports "no leaks
  found" for the AWS documentation key, so a fixture built on it passes forever
  for the wrong reason, which is what the previous quickstart did.

## Known gaps

| Gap | Why it matters | The maintained fix |
|---|---|---|
| Nothing validates a path or link named in a document | The previous version referenced three filenames across its documents and installers for one script that had a fourth name, and no check noticed | `markdown-link-check` is already in Trunk's plugin catalogue and switched off. Adding it to `lint.enabled` in `.trunk/trunk.yaml` is one line |
| `shellcheck` has no build for Windows at version 0.11.0 | Trunk prints `'shellcheck' has no matching download for current os/cpu` and moves on, so a shell file is linted in CI but not on a Windows laptop | CI runs on `ubuntu-latest`, which covers it. Nothing else to do |
| `delete: false` in `rulesync.jsonc` | Renaming a rule or a skill leaves the old generated copy on disk, and agents keep reading it | Run `npx rulesync generate --delete` after any rename |
| The tool-call hook needs `gitleaks` on `PATH` separately from Trunk's pinned copy | A machine with Trunk but no `gitleaks` has a working commit guard and a hook that refuses every write | Install `gitleaks` directly, or drop the hook from `.rulesync/hooks.jsonc` |
| Neither git guard reads history | A secret committed and then deleted in a later commit still reaches the remote when both are pushed together, verified on 2026-08-22 against both forms of the push action | GitHub push protection is the remote-side backstop, and no local hook can be |
| The push guard runs `trunk check --all` | A finding anywhere in the working tree blocks the push, including one in a file that is not being pushed | Deliberate. `--commit-ref-from-pre-push` resolves an empty range on the first push to an empty remote, so it checked nothing and exited 0 |
| The permission entries in `.rulesync/permissions.jsonc` have no test pair | The agent host enforces them, so nothing in this repository can invoke one and watch it refuse | No maintained runner exists for it. The drift check proves the entries reach all 30 generated files, and the host is what acts on them |

Renovate keeps every pinned version current. Patch, minor, and digest updates
merge themselves once CI is green. A major update opens a pull request for a
person to read.
