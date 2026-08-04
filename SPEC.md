# SPEC — public-agent-provisioning

## Purpose

A template for making an AI coding agent's misbehaviour physically impossible
to ship, not merely discouraged. It is the guardrail *substrate* — the layers
that sit around an agent (an always-on rules file, on-demand skills, a
tool-call interceptor, git hooks, and a suite that proves the hooks still
work) — reduced to a form a stranger can fork, read in one sitting, and adapt
to their own stack. It does not contain any agent, model, or product logic.

## What this is

- A **layered enforcement pattern**: rules loaded every turn → skills loaded
  on demand → hooks that intercept a tool call before it runs → git guards
  that block a commit or push → self-checks that prove the guard layer is
  still live. Each layer catches what the layer before it missed.
- A **working, runnable example** of two of those layers — the git guards
  (`04-git-guards-that-block-commits-and-pushes/`) and the self-check suite
  that proves they still fire (`05-self-checks/`) — with
  real hooks, real checks, and real fixtures, not pseudocode.
- A **fork point**. Every check, threshold, and escape hatch is written to be
  read, argued with, and replaced.

## What this is NOT (non-goals)

- **Not an installable package.** There is no `npm install
  public-agent-provisioning`, no version to pin, no upgrade path to track.
  Copy the files you want into your own repo. See "Locked decisions" below
  for why this is deliberate, not an oversight.
- **Not a finished multi-agent framework.** It does not orchestrate agents,
  route tasks, or manage a fleet. It only constrains what one agent working
  in a git repo is allowed to get past.
- **Not a claim that these mechanisms are novel.** `gitleaks`-style secret
  scanning, `pre-commit`-style hook managers, and TDD-guardrail projects
  already exist and are good. See `PRIOR-ART.md`. The contribution here is
  the layering and the self-check discipline, not any individual check.
- **Not a complete policy set.** Layers 01 and 02 ship as templates —
  `AGENTS.md` plus `01-rules/README.md`, and `02-skills/` with worked example
  skills — carrying `<PLACEHOLDER: …>` markers, not filled-in policy. Your
  thresholds and your skills are not this project's to write for you.
  Layer 03 (tool-call interception) is described in the README but has no
  scaffold in this repo yet. Filling in the placeholders, and building 03
  when you need it, is the fork — not a TODO left for the maintainer.
- **Not silent on missing tooling.** A check that depends on an external
  scanner (for example `gitleaks`) blocks the commit if that scanner is
  absent. It never quietly skips the check it cannot run.

## Locked decisions

- **Plain git hooks, not a hook framework.** `core.hooksPath` plus two
  ordinary POSIX shell scripts (`pre-commit`, `pre-push`) — zero install
  dependency beyond git itself. A framework (`pre-commit`, `husky`, `lefthook`)
  is a fine *consumer-side* choice and nothing here fights it, but the
  template itself must run on a bare git install with nothing else on `PATH`
  except the tools its own checks explicitly require (`node`, optionally
  `gitleaks`). Reasoning: a guardrail template that cannot be trusted until
  its own dependency tree is trusted is a worse starting point than plain
  shell.
- **Template, not package.** Nothing here is published or versioned as a
  dependency. A guardrail policy is a set of judgment calls specific to one
  team, one stack, one risk tolerance — shipping it as a drop-in dependency
  means guessing someone else's policy for them. Forking and deleting the
  parts that do not apply is the intended path, not a workaround.
- **Self-checks are mandatory, not optional tooling.** `05-self-checks/`
  is wired into `pre-commit` itself (section 7), not left as a suite you
  remember to run. A guard that can silently stop enforcing, while still
  letting commits through, is not a guard — it is the appearance of one. Any
  fork that keeps the git-guard layer keeps this layer with it.
- **Blocks, never warns.** Every check in this template either exits nonzero
  and stops the operation, or it does not exist. A failing check that
  degrades to a printed warning and lets the commit through is a rule with
  extra steps, and it is the specific failure mode this project exists to
  rule out. If a check is wrong, the fix is to correct the check — never to
  route around it with `--no-verify` or a config flag that "just this once"
  disables it.
- **An exception is a written reason, never a bare flag.** Where a check
  needs an escape hatch at all, it takes the form of a named environment
  variable that states, in the open, why this instance is legitimate (see
  the escape-hatch table in `04-git-guards-that-block-commits-and-pushes/README.md`).
  Editing the check itself to carve out a case is not an escape hatch; it is
  how a guardrail rots.

## Invariants

- A check that cannot fail is worse than no check: every check this template
  ships as "real" (not merely described) carries a `bad/` fixture that proves
  it fires, and a `good/` fixture that proves it does not cry wolf. This is
  what `verify-gates-can-fail.mjs` enforces on itself, on every commit.
- Nothing in this repository reads or writes a credential, host, IP, or
  account-specific path. A fork wires those in locally, in its own
  `.guardrc` or `guard.local.sh`, never in a file meant to be forked publicly.
