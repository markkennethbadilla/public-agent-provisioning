---
root: true
targets: ["*"]
description: "Always-on operating rules for every AI coding agent working in this repository."
globs: ["**/*"]
---

# Always-on rules

This file is generated. Edit `.rulesync/rules/overview.md` and run
`npx rulesync generate`. Editing `AGENTS.md`, `CLAUDE.md`, or
`.github/copilot-instructions.md` directly means your change disappears at the
next generate.

Every value marked **default** below is a starting position, not a law of
nature. A fork should read each one once and change it to fit its own stack.

## Governing law

This file loads on every turn, of every task, forever. There is no way to load
it only when it is relevant, because relevance is not known in advance. Every
line is therefore a recurring cost, and a rule earns its place only when all
three of these hold.

- **It changes an outcome.** If following it and ignoring it produce the same
  result, it is not a rule. It is a mood.
- **No guard already enforces it.** When a hook, a git guard, or a build gate
  already makes the mistake impossible, this file gets one line pointing at
  that guard, never a paragraph re-explaining what the guard does for free,
  every time, without being read.
- **It applies to nearly every task.** A rule that only matters inside one
  subsystem belongs in a skill under `.rulesync/skills/`, which loads when that
  topic comes up. Put it here and it taxes every unrelated task forever.

Those three are a test, not rules 1 to 3. The numbered list below starts its
own count.

Soft budget for the whole file is 200 lines, roughly 2,500 tokens (**default**).
When a rule needs more than a sentence plus one concrete example to justify
itself, that is the file telling you it wants to be a skill.

## Who enforces what

Prose is the weakest layer here. It can be skimmed, misread, or reasoned around
under pressure. These four layers cannot.

| Layer | Loaded | Owner | Source |
|---|---|---|---|
| Rules | Every turn | rulesync | `.rulesync/rules/` |
| Skills | On demand, by topic | rulesync, Anthropic Agent Skills format | `.rulesync/skills/` |
| Tool-call hooks | Before a tool runs | rulesync hook registration, gitleaks detection | `.rulesync/hooks.jsonc` |
| Git guards | On commit and push | Trunk running gitleaks, osv-scanner, actionlint, shellcheck, git-diff-check | `.trunk/trunk.yaml` |
| Self-checks | On demand and in CI | `node:test` from the Node standard library | `tests/` |

A "hook" is a script the agent runs before it is allowed to use a tool. It can
refuse the tool call outright. A "git guard" is the same idea at commit and
push time, installed by `trunk git-hooks sync` rather than written by hand.

## How to work

1. **Reuse a maintained tool before building one.** Check `PRIOR-ART.md` in
   this repository, then npm, PyPI, and crates.io, before writing anything
   (**default** search order). A hand-rolled retry wrapper, date parser, or
   auth check is a bug factory that a maintained library already debugged for
   you.
2. **After two failed attempts at the clever fix, take the dumb one.** Reuse is
   not a licence to keep polishing an elegant approach that is not landing. A
   working `if/else` beats a broken abstraction every time somebody has to
   debug it at 2 AM.
3. **Push back before changing something that already works.** State the case
   for the standing design out loud first, including when the instruction to
   replace it came from a person. A silent improvement to working code is how a
   fix introduces a second bug next to the first one.

4. **Plan in files, not in a todo tool.** For any task that takes more than a
   few tool calls, keep the plan in `task_plan.md` (with `findings.md` and
   `progress.md`) as the `planning-with-files` skill describes, and update it
   as phases change. Do not use a built-in todo or plan tool—each agent
   names its own differently and none of them survive a crash, a compaction,
   or a hand-off to another agent, while a file does. The hooks re-inject the
   plan every turn and refuse to end a turn while a phase is still marked
   `in_progress`, so keep the statuses honest: mark a phase complete when it
   is, and record a genuine blocker in the plan rather than abandoning it.

## Writing code

5. **Short files.** Soft target 150 lines, hard cap 400 (**default**). Past the
   cap nobody, human or agent, reliably notices that the function they are
   about to add already exists forty lines up.
6. **Delete dead code. Never comment it out for reference.** Git is the
   reference. A commented-out block gets copy-pasted into the next branch,
   drifts from the live version, and now two implementations exist with no way
   to tell which one is real.
7. **Never hardcode an environment, host, port, key, or path.** Read them from
   environment variables in development and from a secrets manager in
   production (**default**). A value baked into source ships to the wrong
   environment the first time the code runs somewhere else, and if it is a
   credential it becomes a public leak the moment the repository does.
8. **Validate every input and guard every route.** Every request body and
   external payload gets a schema, using zod in TypeScript or pydantic in
   Python (**default**). Unvalidated input is how malformed data reaches
   business logic and a malicious payload reaches a database.
9. **No vague errors.** Every failure names its cause where it surfaces, never
   a bare "something went wrong." Carry the real message, or a correlation ID
   whose cause is logged somewhere findable. A vague error costs the next
   person an hour re-deriving what the code already knew and threw away.

## Gates

10. **Every gate green before anything ships.** Order is lint, typecheck, test,
   build (**default**). The mechanism is `trunk check` plus the `node:test`
   suite, not this sentence.
11. **Never weaken or skip a gate. Fix the check instead.** A red gate blocks.
    It never downgrades to a warning that lets the change through anyway. A
    check that can be softened under deadline pressure was never a check. Do
    not reach for `git commit --no-verify`.
12. **Do not self-grade.** Route a success claim to a deterministic check when
    one exists, such as a test, a build, or a restore that was actually diffed.
    Never "I re-read my own diff and it looks right." The blind spot that
    produced the bug is the blind spot doing the re-reading.
    See the `example-verify-before-claiming-done` skill.

## Git

13. **Forward-only history on anything already pushed.** No amend, rebase, or
    force-push of a shared branch. GitHub branch protection blocks force-push
    and branch deletion on the default branch. Rewriting shared history
    silently deletes a commit a collaborator already pulled and built on.
14. **One focused commit per unit of work, and the message says why.** A bisect
    that lands on a commit touching six unrelated things buries the real cause
    in a diff nobody can skim under pressure.

## Safety

15. **Back up and prove the restore before any destructive, overwriting, or
    migrating operation** on anything you cannot regenerate. Proving means
    restoring the backup somewhere else and comparing the result, not
    confirming that a backup file exists. A backup nobody has ever restored is
    a hope wearing a safeguard's name, and it fails exactly when it is needed.
    See the `example-safe-database-migration` skill.
16. **A rule binds everywhere, and an exception costs a written reason.** Every
    gate either admits exceptions through one documented `token: <reason>`
    escape hatch, or states plainly that it admits none. Reserve "none" for
    irreversible production data loss, credential leakage, and an irreversible
    outward send such as a payment or a customer email (**default**). Quietly
    editing the rule, or the gate's own code, to carve out a special case for
    whatever you are doing right now is the banned third option. That silent
    edit is how a guardrail rots into theatre, one "just this once" at a time.
17. **When you have to ask, ask plainly.** State the risk in one sentence
    before the question. A wall of hedged reasoning in front of a yes or no
    only delays the answer.

## Keeping this file honest

18. **Anything you were corrected on twice gets written down.** As a skill
    under `.rulesync/skills/` when it is topic-specific, or here when it truly
    applies to every task. An unrecorded correction gets repeated next session,
    because nothing surfaced it again when it mattered.
