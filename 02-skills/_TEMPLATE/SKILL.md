<!--
PRIOR-ART: this file adopts an existing format rather than inventing one.
The SKILL.md convention - a folder holding a markdown file whose YAML
frontmatter carries `name` and `description`, where the description is the
only part kept permanently in context and therefore does the triggering - is
Anthropic's Agent Skills format:
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
  https://github.com/anthropics/skills
VERDICT: adopt, do not reinvent. Anything bespoke here is the AUTHORING
DISCIPLINE below (name the failure the skill prevents, write the description
over-inclusively because near-miss phrasings are what fail to trigger), not
the file format, which is upstream and should track it.
-->
---
name: NN-scope-descriptive-name-matching-this-folder
description: "Third person. State exactly what this skill covers and exactly when it should fire — the situations, phrases, or tasks that should trigger it, including near-miss phrasings. This is the only part of the skill that stays loaded at all times, so write it deliberately over-inclusive rather than terse."
---

# <Skill Title — Names What It Governs>

<One or two sentences: the core doctrine in plain language. If someone reads
only this line and nothing else, what should they now do differently?>

## Why this matters

<The failure this skill prevents, stated concretely — not "this is best
practice" but "without this, X breaks in situation Y." A rule that can't
name the failure it prevents doesn't earn a place here.>

## When this fires

<Optional. Restate the trigger conditions from the description with more
concrete example situations, if that adds clarity the description alone
didn't have room for. Often the description is enough and this section can
be dropped.>

## The core doctrine

<The actual guidance. Prefer explaining the why over issuing bare
imperatives. Use one consistent term per concept throughout — pick a word
and stick to it rather than varying it for style.>

## Step-by-step / checklist

<For a fragile or irreversible operation, make this exact and literal —
numbered steps, no room for improvisation. For an open-ended or heuristic
task, make this a set of judgment calls instead, and say so plainly rather
than dressing up a heuristic as a rigid procedure.>

1. <step>
2. <step>
3. <step>

## Enforcement tier (only if this doctrine is backed by any kind of check)

<Label honestly which of these applies — never claim more enforcement than
actually exists:

- **Tier A — physical gate.** The wrong action is technically blocked, full
  stop; it cannot proceed no matter what.
- **Tier B — deterministic check.** Not blocked in the moment, but a
  verifiable, un-gameable pass/fail test exists and must be run to produce
  objective proof.
- **Tier C — convention only.** No technical block is possible. Say so
  plainly instead of implying a stronger guarantee — overstating your own
  enforcement manufactures false confidence in something that can quietly
  be skipped.>

## Non-negotiables

<The short list of things this skill never allows an exception to, if any.
Keep this list actually short — if everything on it is "non-negotiable,"
nothing meaningfully is.>

## Reference

<Link out to reference/*.md files here if the skill has any. Do not inline
long content in this file — this file is the table of contents, not the
encyclopedia.>
