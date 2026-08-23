# Prior art

Every layer of this repository is owned by somebody else's tool. This file names
them, says what each one is for, and separates the ones this repository now
depends on from the ones it looked at and did not adopt.

Star counts, last-push dates, and licences were read from the GitHub REST API
on 2026-08-22 and refreshed for the new rows on 2026-08-23, not from memory.
The previous version of this file was dated 2026-08-04 and its verdicts were
written to justify building something. This repository now adopts rather than
builds, so the verdicts changed.

## Dependencies

These are wired in. Removing one removes a layer.

| Project | Stars | Last push | Licence | What it is for here |
|---|---|---|---|---|
| [`dyoshikawa/rulesync`](https://github.com/dyoshikawa/rulesync) | 1,334 | 2026-08-21 | `MIT` | Writes rules, skills, hook registrations, permissions, and MCP server entries for 7 agents from one source directory, and fetches the pinned skill sources into `rulesync.lock`. Owns the rules, skills, hook, and MCP layers |
| [Trunk](https://docs.trunk.io/cli) | plugin catalogue at [`trunk-io/plugins`](https://github.com/trunk-io/plugins), 166 stars | 2026-08-21 | `MIT` for the plugins | Installs the git hooks, pins every linter, and runs them. Owns layer 4 |
| [`gitleaks/gitleaks`](https://github.com/gitleaks/gitleaks) | 28,900 | 2026-08-19 | `MIT` | 222 secret-detection rules in version 8.30.1 with entropy scoring. It IS the tool-call hook—the declared command, not a library behind a wrapper—and does the detecting for the commit guard |
| [`ChromeDevTools/chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | 49,597 | 2026-08-23 | `Apache-2.0` | The Chrome team's own MCP server. Gives every agent a real browser: navigate, click, screenshot, console, network |
| [`iOfficeAI/OfficeCLI`](https://github.com/iOfficeAI/OfficeCLI) | 29,072 | 2026-08-13 | `Apache-2.0` | Reads and edits `.docx`, `.xlsx`, and `.pptx` with no Office installed, and ships its own MCP server (`officecli mcp`). The npm package is the scoped `@officecli/officecli` |
| [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) | 89,206 | 2026-08-21 | `MIT` | 24 of the 34 pinned community skills, general software engineering discipline |
| [`anthropics/skills`](https://github.com/anthropics/skills) | 171,113 | 2026-08-21 | `Apache-2.0` per skill | 5 pinned skills: `skill-creator`, `mcp-builder`, `claude-api`, `webapp-testing`, `frontend-design`. No repository-level licence, so check each skill's own `LICENSE.txt` before adding more |
| [`vale-cli/agent-tools`](https://github.com/vale-cli/agent-tools) | 0 | 2026-08-05 | `MIT` | Vale's own agent skills for setting up and running Vale. Zero stars and vendor-official are not a contradiction; it is simply new |
| [`google/osv-scanner`](https://github.com/google/osv-scanner) | 10,904 | 2026-08-21 | `Apache-2.0` | Reads the lockfile and flags dependencies with a known vulnerability |
| [`rhysd/actionlint`](https://github.com/rhysd/actionlint) | 4,162 | 2026-07-16 | `MIT` | Catches a broken workflow file locally instead of on push |
| [`errata-ai/vale`](https://github.com/errata-ai/vale) | 5,990 | 2026-08-21 | `MIT` | Google style prose linting, blocking on error-level alerts |
| [`renovatebot/renovate`](https://github.com/renovatebot/renovate) | 22,312 | 2026-08-22 | `AGPL-3.0` | Keeps every pinned version in this table current, and merges patch and minor updates itself once CI is green |

`node:test` from the Node standard library owns layer 5. It has no repository of
its own because it ships with the runtime, which is the entire reason it was
picked over a test framework.

## Considered and not adopted

| Project | Stars | Last push | What it is for | Why not here |
|---|---|---|---|---|
| [`pre-commit/pre-commit`](https://github.com/pre-commit/pre-commit) | 15,521 | 2026-08-17 | Multi-language git hook manager, the default choice in Python repositories | Manages hooks only. Every linter still has to be installed and pinned separately. See the comparison below |
| [`evilmartians/lefthook`](https://github.com/evilmartians/lefthook) | 8,702 | 2026-08-21 | Fast parallel git hook manager, single Go binary | Same reason. Fast and clean, still leaves you sourcing the linters |
| [`nizos/probity`](https://github.com/nizos/probity) | 173 | 2026-08-16 | Test-driven-development enforcement and guardrails for Claude Code, Codex, and Copilot CLI | The closest neighbour, actively maintained, and worth reading. Narrower on purpose. It enforces one discipline rather than provisioning every layer |
| [`lucapohl-angel/ATLAS_OS`](https://github.com/lucapohl-angel/ATLAS_OS) | 68 | 2026-05-15 | Hook-driven multi-agent pipeline, one prompt to a shipped release | Different goal. An opinionated pipeline, not a guardrail set you fork into your own repository |
| [`wangbooth/Claude-Code-Guardrails`](https://github.com/wangbooth/Claude-Code-Guardrails) | 55 | 2025-09-15 | Protective hooks that stop an agent losing code, through branch protection | The branch-protection idea is good. Last pushed 11 months ago, so it is effectively unmaintained and adopting it would put the maintenance back on you |
| [`tcort/markdown-link-check`](https://github.com/tcort/markdown-link-check) | 712 | 2026-07-28 | Checks that every link in a Markdown file resolves | Not adopted yet, and it should be. It is already in Trunk's plugin catalogue, switched off. See "Known gaps" in `SPEC.md` |
| [`coo-quack/sensitive-canary`](https://github.com/coo-quack/sensitive-canary) | 22 | 2026-08-22 | Prebuilt secret-guarding hooks for agent tool calls | The closest thing to this repository's hook layer, and it re-implements gitleaks-style patterns in its own TypeScript. Owned detection code under someone else's name is still detection code that drifts; the hook here is the `gitleaks` binary itself |
| [`carlrannaberg/claudekit`](https://github.com/carlrannaberg/claudekit) | 760 | 2026-03-31 | Hook and command toolkit for Claude Code, including a file-guard | Its guard is ignore-path based rather than content scanning, it covers one agent, and it was last pushed five months ago |

## Why Trunk won the git-guard layer

`pre-commit` and `lefthook` were the other two candidates, and both are better
maintained than anything this repository could write. The difference is what
each one leaves for you.

A hook manager runs hooks. Trunk also carries `gitleaks`, `osv-scanner`,
`actionlint`, and `shellcheck`, downloads them itself, and pins the version of
each in `.trunk/trunk.yaml`. A fork gets the same linter versions on Windows,
macOS, and Linux with nothing on `PATH` and no install script.

That is the whole argument. The 502-line dual-platform installer this repository
used to ship existed to source those tools, and `trunk git-hooks sync` replaced
it.

## The exit route

The Trunk command-line tool is closed source, and the free tier is what this
template uses. Only the plugin catalogue at `trunk-io/plugins` is `MIT`, so the
lock-in is real and worth naming.

Leaving costs one afternoon. The linters are ordinary binaries with their own
command-line interfaces, `.trunk/trunk.yaml` lists the pinned version of each,
and `lefthook` or `pre-commit` would run them from a config file of roughly the
same size. Nothing in this repository calls a Trunk API.

Review that call when Trunk changes its free-tier terms, or by 2027-08-22,
whichever comes first.

## Verdict

The layered arrangement is the only part that is this repository's own idea, and
the arrangement is a config problem, not a coding problem. Rules read every
turn, skills read on demand, a hook that intercepts a tool call, git guards that
block the commit, and a self-check tier that proves the guards still fire.

The self-check tier is the piece none of the neighbours ship, and it earned its
place twice during this rebuild. It caught a stock Trunk action that found a
secret and let it through, then a hook registered for `NotebookEdit` that read
none of that tool's payload. See "A maintained tool is not automatically a gate"
in `README.md`.
