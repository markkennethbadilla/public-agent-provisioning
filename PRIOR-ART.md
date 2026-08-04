# Prior Art

Checked before building, because "nobody has done this" is usually false and always
checkable. Searched GitHub for agent guardrail toolkits, agent rule templates, git hook
frameworks, and secret scanners (2026-08-04).

## The space is not empty

| Project | Stars | What it does | Verdict |
|---|---|---|---|
| [`nizos/probity`](https://github.com/nizos/probity) | 151 | TDD enforcement + guardrails for Claude Code, Codex, Copilot CLI | Closest neighbour. Narrower: TDD is one concern; this template spans rules, skills, tool-call hooks, git guards and self-checks as one layered system. |
| [`wangbooth/Claude-Code-Guardrails`](https://github.com/wangbooth/Claude-Code-Guardrails) | 55 | Protective hooks preventing code loss via branch protection | Single-concern. Its branch-protection idea is good and the git-guard layer here covers the same ground. |
| [`lucapohl-angel/ATLAS_OS`](https://github.com/lucapohl-angel/ATLAS_OS) | 68 | Hook-driven multi-agent CLI, prompt to shipped release | Different goal: an opinionated pipeline, not a guardrail substrate you fork. |
| [`pre-commit/pre-commit`](https://github.com/pre-commit/pre-commit) | 15.4k | Multi-language git hook manager | ADOPT where a consumer already uses it. This template ships plain git hooks so it has zero install dependency, but nothing here fights pre-commit. |

Secret scanning (`gitleaks`, `trufflehog`) and static analysis (`semgrep`) are **adopted, not
reinvented** — the guard layer shells out to them rather than hand-rolling detection.

## Verdict

Agent guardrails exist, and the good ones are worth reading. What none of them package is
the **layered arrangement**: a rules file that is loaded every turn, skills loaded on
demand, hooks that intercept tool calls *before* they run, git guards that block the
commit, and a self-check tier that verifies the guardrails themselves still work.

The individual mechanisms are all borrowed. The contribution is the ordering, and the claim
that a guardrail which cannot page you when it breaks is theatre.

## Why a template and not a product

Every team's rules differ. Shipping this as a drop-in dependency would mean guessing your
policies; shipping it as a template means you fork it, delete two thirds, and keep the
skeleton. The `_TEMPLATE.md` files and the placeholder rules exist to be replaced, not
obeyed.
