# Skills — Knowledge Loaded On Demand, Not On Every Turn

## The problem this layer solves

An AI agent's context window is a shared, finite budget spent fresh on every
single turn of every session. Anything you keep permanently loaded — a giant
rulebook, every playbook you own, every domain's edge cases — gets paid for
on every message, whether or not that message has anything to do with it.
That is not a minor inefficiency: it is a recurring tax that slows the model
down, burns cost, and — the part that actually breaks things — dilutes
attention. When forty rarely-relevant paragraphs sit next to the five that
matter to literally every task, the important five get lost in the crowd and
are more likely to be silently skipped.

The fix used throughout this template is a two-layer split:

- **Layer 1 — always-on rules.** One compact instructions file, loaded on
  every turn, forever. Nothing in it is optional reading. Because every token
  in it is paid on every turn, the governing law for that file is ruthless
  minimalism: a rule earns a place there only if it changes an outcome,
  nothing already enforces it automatically, and it applies to nearly every
  task rather than one narrow domain.
- **Layer 2 — skills (this folder).** A library of independent,
  topic-scoped guides. Each skill is inert until its topic actually comes
  up. Only a tiny header — its `name` and one-paragraph `description`, on
  the order of 30-100 tokens — stays resident in context at all times,
  purely so the agent can recognize "this topic applies right now." The
  full body of instructions, and any deeper reference material or scripts a
  skill carries, loads into working context only at the moment that topic
  is actually triggered by the conversation. Once the task moves on, that
  content stops being paid for.

This is what makes the system scale. A one-file rulebook has to choose
between being short (and therefore incomplete) or being complete (and
therefore bloated and skimmed). A rules-plus-skills split lets the always-on
file stay small enough to actually be read and followed every time, while
the skill library grows to dozens or hundreds of topics at effectively zero
ongoing cost — each one is free until the moment it is relevant, at which
point it is the only thing that matters.

## Why the `description` field is the entire discovery mechanism

There is no separate router, no keyword index, no menu the agent consults.
The `name` + `description` pair is the *only* thing that stays loaded for
every skill, all the time — so that description is the single signal that
decides whether a skill fires at the moment it is needed. Get it wrong and
the skill might as well not exist: a perfectly-written body of instructions
that never loads has zero effect on behavior.

That single constraint drives every authoring rule below:

- **Write the description in third person, and state both what the skill
  covers and when it should fire.** "Guidance on database migrations" names
  a topic, not a trigger — it under-specifies the moment the skill should
  activate. "Before writing, running, or reviewing any database migration
  ... also fires when the user asks whether a migration is safe" gives the
  matcher concrete situations to recognize.
- **Write it deliberately over-inclusive, not terse or clinical.** The
  observed failure mode is agents *under*-triggering a skill because its
  description undersold its own relevance, not over-triggering. Cover
  near-miss phrasings explicitly — the way a user might ask for the same
  thing without using your exact words.
- **First- or second-person phrasing, or a description that names a topic
  without stating a trigger condition, measurably breaks discovery.** Nobody
  reviews these at match time; the string either matches the situation or it
  doesn't.

If you fork this template and start writing your own skills, spend real
editing time on the description before you write a single word of the body.
It is worth more than the body, because it is the only part of the skill
that is ever guaranteed to be read.

## The file-format contract

Every `SKILL.md` in this folder (and every one you add) follows the same
shape:

```
---
name: descriptive-name-matching-the-folder
description: "Third person. States what this covers and when it should fire."
---

# Title

Ordinary Markdown from here down.
```

**Frontmatter — exactly two required fields:**

| Field | Rule |
|---|---|
| `name` | Must exactly match the folder the `SKILL.md` file lives in. This template's naming convention is `NN-[scope-]descriptive-name` — a two-digit prefix that sorts the skill into a logical chapter order, an optional scope tag, then a hyphenated slug, lowercase, hyphens only. The two worked examples in this folder skip the numeric prefix on purpose, so they read as portable, drop-in single skills rather than chapter N of a specific book — apply the numbering scheme once you have enough skills that ordering starts to matter. |
| `description` | A single string, roughly 1000 characters or fewer, third person, stating what the skill covers and when it should trigger. This is the whole discovery mechanism — see above. |

Two optional fields you will see in more advanced skills:

- `allowed-tools` — restricts which tools a skill may invoke, for
  least-privilege scoping.
- `disable-model-invocation: true` — turns off automatic triggering
  entirely, so the skill can only be invoked explicitly rather than
  auto-matched. Use this for a skill that is genuinely risky to fire without
  a direct ask.

**Body structure — orchestrator, not encyclopedia.** A `SKILL.md` file is a
table of contents and a set of short, high-signal directives. It must not
inline long procedures, full code listings, or exhaustive reference
catalogs — that content belongs in a `reference/` (or `scripts/`) subfolder
next to the `SKILL.md` file, linked directly by path. Keep `SKILL.md` itself
under a few hundred lines; if it wants to grow past that, the excess is a
sign something belongs in a reference file instead.

**References stay one hop deep.** A `reference/*.md` file should not itself
link onward to a second reference file. A tool that only partially reads a
file (a skim of the first portion instead of the whole thing) can silently
miss information hidden behind that second hop, so every reference stays
directly reachable from the `SKILL.md` that names it.

**Style conventions baked into the format:**

- Explain the *why* behind a rule rather than issuing a bare capitalized
  command. Reserve ALL-CAPS or MUST-style imperatives for the genuinely
  hard-blocked cases — where the reason really is "a gate physically stops
  this" — not as a substitute for a clear explanation.
- Use one consistent term per concept throughout the file. Don't alternate
  between "backup," "snapshot," and "restore point" for the same thing.
- Avoid time-stamped prose that goes stale ("as of last month..."). If an
  approach was superseded, collapse the old one into a labeled aside instead
  of leaving dated claims scattered through the current instructions.
- Calibrate how much freedom you give the agent to how fragile the task is:
  exact, literal, do-not-deviate steps for irreversible or fragile
  operations (a production migration, a credential rotation); open,
  judgment-based prose for flexible or heuristic ones (how to structure a
  refactor).

## What's in this folder

| Path | What it is |
|---|---|
| `_TEMPLATE/SKILL.md` | A blank skeleton with every section stubbed out and commented. Copy this folder, rename it, fill it in. |
| `example-safe-database-migration/SKILL.md` | A complete, standalone skill: additive-only migrations, the expand/contract pattern, and proving a backup restores before anything destructive runs. |
| `example-verify-before-claiming-done/SKILL.md` | A complete, standalone skill: routing a "this works now" claim to a deterministic check instead of re-reading your own edit and calling that verification. |

## Adding a new skill

1. Copy `_TEMPLATE/` to a new folder. Name the folder for what the skill
   covers.
2. Set `name:` to exactly match the new folder name.
3. Write the `description` first, and write it pushy — third person, states
   the trigger, covers the near-miss phrasings a real user would actually
   say.
4. Fill in the body. If any section wants a full script, a long table, or a
   worked walkthrough longer than a screen, put it in `reference/` and link
   to it instead of inlining it.
5. Read it back as a stranger would: does the description alone tell you
   when this fires, without reading the body? If not, the description isn't
   done yet.
