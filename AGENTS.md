# AGENTS.md — always-on rules (template)

> **Fork this file, don't inherit it.** Everything wrapped in
> `<PLACEHOLDER: …>` is a decision about *your* stack, *your* thresholds,
> *your* highest-stakes failure classes — fill it in or delete the rule
> entirely if it doesn't apply. Everything else is the discipline this file
> exists to demonstrate; keep the shape even if you reword the sentence.
> See `01-rules/README.md` for why this file is structured the way it is,
> and delete this blockquote once you've forked.

## Governing law

This file loads on **every turn, of every task, forever** — there is no way
to read it only "when relevant," because relevance isn't known in advance.
That makes every line here a recurring tax, so a rule earns a place only if
all three of these hold:

- **Changes an outcome.** If following it and ignoring it produce the same
  result, it's not a rule — it's a mood.
- **No guard already enforces it.** If a hook, a git guard, or a build gate
  already makes the mistake physically impossible, this file gets one line
  pointing at that guard (`→ see …`) — never a paragraph re-explaining what
  the guard already does for free, every time, without being read.
- **Applies to nearly every task**, not one language, one folder, or one
  corner of the domain. A rule that only matters when you're touching a
  specific subsystem belongs in a skill (`02-skills/`) that loads *when that
  topic comes up* — not here, where it taxes every unrelated task forever.

(These three are a test, not rules 1–3 — the numbered list below starts its
own count, and nothing later in this file cites this test by number.)

Keep the whole file under
`<PLACEHOLDER: your soft budget, e.g. ~250 lines / ~6k tokens>`. If a rule
needs more than a sentence plus one concrete example to justify itself,
that's the file telling you it wants to be a skill, not a rule.

---

## How to work

1. **Reuse the best pre-built tool before building one.** Check
   `<PLACEHOLDER: your prior-art doc, package registry, or approved-tools
   list>` first. A hand-rolled retry wrapper, date parser, or auth check is a
   bug factory that a maintained library already debugged for you.
2. **After two failed attempts at the clever fix, take the dumb one.** Reuse
   (rule 1) is not licence to keep polishing an elegant approach that isn't
   landing — a working `if/else` beats a broken abstraction every time
   someone has to debug it at 2am.
3. **Push back before changing something that already works.** State the
   case for the standing design out loud before replacing it — including
   when the instruction to replace it comes from a person. A silent
   "improvement" to working code is how a fix introduces a second bug next
   to the first one.

## Writing code

4. **Short files.** Soft target `<PLACEHOLDER: e.g. 150>` lines, hard cap
   `<PLACEHOLDER: e.g. 400>`. Past the cap, nobody — human or agent —
   reliably notices that the function they're about to add already exists
   forty lines up.
5. **Delete dead code; never comment it out "for reference."** Git is the
   reference. A commented-out block gets copy-pasted into the next branch,
   quietly drifts from the live version, and now two implementations exist
   with no way to tell which one is real.
6. **Never hardcode env, hosts, ports, keys, or paths.** Read them from
   `<PLACEHOLDER: your config/env source, e.g. environment variables, a
   secrets manager>`. A value baked into source either ships to the wrong
   environment the first time this code runs somewhere else, or — if it's a
   credential — becomes a public leak the moment the repo does.
7. **Validate every input; guard every route.** Every request body and
   external payload gets a schema
   (`<PLACEHOLDER: your validation library, e.g. zod / pydantic>`).
   Unvalidated input is how malformed data reaches business logic and a
   malicious payload reaches a database.
8. **No vague errors.** Every failure names its cause at the point it
   surfaces — never a bare "something went wrong." Carry the real message,
   or a correlation ID whose cause is logged somewhere findable. A vague
   error is a bug report that costs the next person an hour re-deriving what
   the code already knew and then threw away.

## Gates

9. **All configured gates green before anything ships.**
   `<PLACEHOLDER: your tiers, e.g. lint → typecheck → test → build>`. → see
   `04-git-guards-that-block-commits-and-pushes/` and
   `05-self-checks/` for what actually enforces this —
   this rule is a pointer, not the mechanism.
10. **Never weaken or skip a gate — fix the check, not the workaround.** A
    red gate blocks; it never downgrades to a warning that lets the change
    through anyway. A check that can be silently softened under deadline
    pressure was never a check — it was a suggestion wearing a check's
    clothes. → see `04-git-guards-that-block-commits-and-pushes/README.md`
    ("never bypass with `--no-verify`").
11. **Don't self-grade.** Route a success claim to a deterministic check when
    one exists — a test, a build, a restore that's actually diffed byte for
    byte — never "I re-read my own diff and it looks right." The blind spot
    that produced the bug is the same one that would be doing the re-reading.

## Git

12. **Forward-only history on anything already pushed.** No amend, rebase, or
    force-push of a shared branch. → see
    `04-git-guards-that-block-commits-and-pushes/` (`pre-push` blocks a
    rewritten published history). Rewriting shared history silently deletes
    a commit a collaborator already pulled and built on top of.
13. **One focused commit per unit of work; the message states *why*, not
    just *what*.** A bisect that lands on a commit touching six unrelated
    things buries the actual cause in a diff nobody can skim under pressure.

## Safety

14. **Back up and prove the restore before any destructive, overwriting, or
    migrating operation** on anything you can't regenerate — a database, a
    document, a repo. "Prove" means actually restoring it and checking the
    result, not confirming a backup file exists on disk. A backup nobody has
    ever restored is a hope wearing a safeguard's name, and it fails exactly
    when it's needed.
15. **A rule binds everywhere; an exception costs a written reason, never a
    bare flag.** Every gate either admits exceptions through one documented
    `token: <reason>` escape hatch, or states plainly that it admits none —
    reserve "none" for
    `<PLACEHOLDER: your highest-stakes failure classes, e.g. irreversible
    prod data loss, prod downtime, credential leakage, an irreversible
    outward send>`. Quietly editing the rule — or the gate's own code — to
    carve out a special case for whatever you're doing right now is the
    banned third option: that silent edit is precisely how a guardrail rots
    into permission theatre, one "just this once" at a time.
16. **When you must ask, ask plainly.** State the risk in one sentence before
    asking; don't litigate the alternatives first. A wall of hedged
    reasoning in front of a yes/no question only delays the answer.

## Keeping this file honest

17. **Anything you had to be corrected on twice gets written down** — as a
    skill (`02-skills/`) if it's domain-specific, or right here if it truly
    applies to every task. An unrecorded correction gets repeated next
    session, because nothing surfaced it again when it mattered.

---

*A rule in this file is convention, not enforcement — prose an agent can
misread, skim past, or rationalize around under pressure. The layers that
make a mistake physically impossible instead live in `03-hooks/`,
`04-git-guards-that-block-commits-and-pushes/`, and
`05-self-checks/`. This file should say so about itself
before anyone else has to point it out — see `01-rules/README.md`.*
