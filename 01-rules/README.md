# 01-rules — the always-on layer

This folder holds the *discipline* for the file that matters:
[`../AGENTS.md`](../AGENTS.md), which lives at the repo root, not in here.

That split is deliberate, not an accident worth flagging as a bug. Most
coding-agent harnesses (Claude Code, Codex, Cursor, and others) auto-load a
rules file from a fixed name at the repo root — `AGENTS.md`, `CLAUDE.md`,
depending on the tool — with no configuration step. If the file lived inside
`01-rules/`, it would need a symlink or a config line pointing at it on every
machine that clones this repo, which is exactly the kind of manual step this
template exists to avoid. So the artifact goes where the tooling looks for
it automatically, and this README stays where a human goes looking for *why*
it's shaped the way it is.

## Why this layer is small on purpose

An agent's context window is a shared, finite budget spent fresh on every
message. A rules file loaded on every turn charges that budget whether or
not any of it is relevant to the task at hand — so a large always-on file
doesn't just cost tokens, it dilutes attention: the handful of rules that
truly apply to everything get lost in a wall of text that's usually
irrelevant, and are more likely to be silently skipped exactly when they
matter.

This template answers that with two layers instead of one:

| Layer | Loads | Cost model | What goes here |
|---|---|---|---|
| `01-rules/` → `AGENTS.md` | Every turn, every task, unconditionally | Full cost, every time | Only what's true for nearly every task and not already enforced by a guard |
| `02-skills/` | On demand, when its topic comes up | A one-line name + description stays resident; the full body loads only when triggered | Everything domain-specific, occasional, or long enough to need worked examples |

A rule that belongs in `02-skills/` but gets left in `AGENTS.md` doesn't just
bloat the file — it's paid for by every unrelated task, forever, to cover a
situation most of those tasks will never hit. That's the whole argument for
keeping this layer ruthless: not tidiness, cost.

## The three-part test before adding a rule to `AGENTS.md`

Before adding a line, all three have to hold — this is the same test stated
inline in `AGENTS.md`'s "Governing law" section, repeated here because it's
the one thing in this folder worth reading twice:

- **Changes an outcome.** Advice that doesn't change what the agent does
  differently is a mood, not a rule.
- **No guard already enforces it.** If `03-hooks/`,
  `04-git-guards-that-block-commits-and-pushes/`, or
  `05-self-checks/` already makes the mistake physically
  impossible, the rule collapses to one line: `→ see <guard>`. Re-explaining
  a guard in prose just gives the agent a second, weaker copy of the same
  instruction that can drift out of sync with the first.
- **Applies to nearly every task.** Domain-specific guidance — a subsystem's
  quirks, a one-off migration playbook, anything that needs a worked example
  to land — goes in `02-skills/` instead, where it's free until the moment
  it's actually relevant.

If a candidate rule fails the guard test, don't delete it — move it down:
turn it into the one-line pointer and let the guard do the enforcing. If it
fails the every-task test, move it sideways into a skill. Only what survives
all three stays in `AGENTS.md`.

## Being honest about what this layer *can't* do

Every safeguard in this template is worth labelling honestly by what
actually backs it, because overstating your own enforcement is how false
confidence gets built into a process:

- **Physical gate** — the bad action is technically impossible to complete.
  That's `03-hooks/` and `04-git-guards-that-block-commits-and-pushes/`.
- **Deterministic check** — not blocked in the moment, but there's a
  verifiable, un-gameable pass/fail test that produces objective proof.
  That's `05-self-checks/`.
- **Convention** — pure behavioral guidance, with no technical block behind
  it, relying entirely on the agent reading and following prose correctly
  under whatever pressure it's under. **That's everything in this layer.**

`AGENTS.md` is Tier C by construction — it cannot enforce anything, only
state it. That's not a flaw to fix; it's the honest description of what a
rules file *is*. The reason this template also ships hooks, git guards, and
self-checks is that Tier C is where you put judgment calls too cheap to
automate — not where you put anything that would be catastrophic if an agent
skimmed past it. Anything at that level of stakes belongs in a guard, with
this layer holding, at most, a one-line pointer to it.

## Forking this layer

1. Open `../AGENTS.md` and fill in every `<PLACEHOLDER: …>` — they're your
   thresholds, your tool names, your highest-stakes failure classes, not
   this template's opinions.
2. Delete every example rule that doesn't hold for your project. A rule that
   isn't true yet is worse than no rule: it teaches the agent (and every
   human reading over its shoulder) that the file can't be trusted.
3. Resist the urge to *add* rules for things that came up once. Run the
   three-part test above first — most one-off corrections belong in
   `02-skills/`, not here.
4. Re-read the whole file after every edit. If it no longer fits comfortably
   in one read, something in it has failed test 3 and is due to move out.
