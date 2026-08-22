# Prior art

Every layer of this repository is owned by somebody else's tool. This file names
them, says what each one is for, and separates the ones this repository now
depends on from the ones it looked at and did not adopt.

Star counts, last-push dates, and licences were read from the GitHub REST API on
2026-08-22, not from memory. The previous version of this file was dated
2026-08-04 and its verdicts were written to justify building something. This
repository now adopts rather than builds, so the verdicts changed.

## Dependencies

These are wired in. Removing one removes a layer.

| Project | Stars | Last push | Licence | What it is for here |
|---|---|---|---|---|
| [`dyoshikawa/rulesync`](https://github.com/dyoshikawa/rulesync) | 1,334 | 2026-08-21 | `MIT` | Writes rules, skills, hook registrations, and permissions for 7 agents from one source directory. Owns layers 1, 2, and 3 |
| [Trunk](https://docs.trunk.io/cli) | plugin catalogue at [`trunk-io/plugins`](https://github.com/trunk-io/plugins), 166 stars | 2026-08-21 | `MIT` for the plugins | Installs the git hooks, pins every linter, and runs them. Owns layer 4 |
| [`gitleaks/gitleaks`](https://github.com/gitleaks/gitleaks) | 28,900 | 2026-08-19 | `MIT` | 222 secret-detection rules in version 8.30.1 with entropy scoring. Does all the detecting for the tool-call hook and the commit guard |
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
