# public-agent-provisioning

**Guardrails for AI coding agents, wired to maintained tools instead of scripts you have to keep alive.**

An agent reads its instructions and sometimes works around them anyway. This
repository puts five layers around the agent that refuse the bad action outright,
and every layer is owned by software somebody else maintains.

Nothing here detects a secret, parses a shell command, or installs a git hook.
`gitleaks` detects, Trunk installs, `rulesync` writes the agent config. What
lives in this repository is the wiring between them and the tests that prove the
wiring still refuses things.

## The five layers

| Layer | Maintained owner | Fires | You edit |
|---|---|---|---|
| Rules, read every turn | `rulesync` 16.14.0 | every turn, unconditionally | `.rulesync/rules/overview.md` |
| Skills, read on demand | `rulesync`, Anthropic Agent Skills format | when a conversation matches a skill description | `.rulesync/skills/` |
| Tool-call hook | `rulesync` registers it, `gitleaks` 8.30.1 detects | the instant before a file write runs | `.rulesync/hooks.jsonc` |
| Git guards | Trunk 1.25.0 | on `git commit` and `git push` | `.trunk/trunk.yaml` |
| Self-checks | `node:test`, Node standard library | on demand and on every pull request | `tests/` |

Rules and skills are what an agent reads. The hook, the git guards, and the
self-checks are what stop it whether or not it read them.

```mermaid
flowchart LR
    A["Agent writes a file"] --> B["PreToolUse hook"]
    B -->|gitleaks finds a key| X["exit 2, write refused"]
    B -->|clean| C["File lands on disk"]
    C --> D["git commit"]
    D -->|gitleaks finds a key| Y["exit 1, commit refused"]
    D -->|clean| E["git push"]
    E --> F["CI: Trunk, Vale, drift check, node --test"]
```

## Quickstart

You need `git`, Node 22 or later, and the Trunk launcher. Trunk downloads and
pins `gitleaks`, `osv-scanner`, `actionlint`, and `shellcheck` itself, so the
commit gate needs nothing else on `PATH`.

```bash
git clone https://github.com/<your-fork>/public-agent-provisioning.git
cd public-agent-provisioning
npm install            # rulesync, the only npm dependency
trunk git-hooks sync   # Trunk writes the pre-commit and pre-push hooks
```

Now try to commit a credential. The fake key is assembled from three fragments
at run time, so the twenty character string never sits in this file and this
README does not trip the repository's own scanner.

```bash
printf 'aws_access_key_id = %s%s%s\n' AKIA 3XQZP7RB 2NLKWJ4C > leak.md
git add leak.md
git commit -m "quickstart proof"
```

The commit is refused, `HEAD` does not move, and `leak.md` stays staged so no
work is destroyed.

```text
leak.md:1:21
 1:21  high  aws-access-token has detected secret for file leak.md.

Checked 1 modified file
1 new lint issue
Commit blocked by git hook 'block-commit-on-findings'
```

Clean up before doing anything real.

```bash
git restore --staged leak.md
rm leak.md
```

### Prove the earlier layer as well

The same scanner sits in front of the agent's own file writes, one step before
git ever sees the content. Feed the hook the payload an agent host sends and read
the exit code.

```bash
printf '{"tool_name":"Write","tool_input":{"file_path":"leak.md","content":"aws_access_key_id = %s%s%s"}}' \
  AKIA 3XQZP7RB 2NLKWJ4C | node .rulesync/hooks/deny-secret-in-write.mjs
echo "exit $?"
```

```text
deny-secret-in-write: gitleaks matched aws-access-token in this write. Move the
value to an environment variable or a secrets manager. If it is a false
positive, add a gitleaks:allow comment on that line.
exit 2
```

Exit code 2 is the only value an agent host reads as `stop, do not run this
tool call`. This layer needs `gitleaks` on `PATH` directly, because it runs long
before Trunk is involved. If `gitleaks` is missing the hook exits 2 and refuses
the write rather than waving it through.

## A maintained tool is not automatically a gate

The self-check tier caught a real defect on its first run, in the wiring rather
than in anybody's code.

Trunk's stock pre-commit actions are declared `interactive: optional`. That
includes `trufflehog-pre-commit`, whose own description reads `Don't allow
secrets in commits`. They find the secret, print it, and then ask
`Changes not currently passing checks. Continue anyway? (Y/n)`.

With no terminal attached, the prompt answers itself, and the commit lands. No
terminal attached describes every AI agent, every CI runner, and every editor
that commits on your behalf.

Reproduced on 2026-08-22 in a scratch repository running the stock
`trunk-check-pre-commit` action with `gitleaks` enabled. `gitleaks` reported
`aws-access-token has detected secret for file leak.md`, Trunk printed the
prompt, `git commit` exited 0, `HEAD` moved, and the key is in the committed
blob.

The fix is six lines in `.trunk/trunk.yaml`, a custom action running
`trunk check --ci`, which never prompts and exits non-zero on a finding. Both
stock actions stay off.

Adopting a maintained tool is the start of the job rather than the end of it,
because a good tool's default configuration can still be a warning wearing a
gate's name. The self-check tier is what tells you which one you got.

The same tier then caught a second defect, this time in the 66 lines of guard
code this repository does own. `NotebookEdit` sat in the hook's matcher while
the script read only `content`, `new_string` and `edits[].new_string`, so every
notebook write was handed an empty string and allowed through. It shipped
broken, an adversarial test found it rather than a reading of the code, and the
hook now reads `new_source` and returns exit 2 for a `NotebookEdit` payload
carrying the planted AWS key.

## What you get, and what you fill in

| | Count | Where |
|---|---|---|
| Agent config files written for you | 30, across 7 agents | root `AGENTS.md` and `CLAUDE.md`, plus `.claude/`, `.cursor/`, `.codex/`, `.cline/`, `.clinerules/`, `.opencode/`, `.agents/`, `.github/`, `.vscode/` |
| Source files that produce all 30 | 5 | `.rulesync/` |
| Guard code you own and maintain | 66 lines, one file | `.rulesync/hooks/deny-secret-in-write.mjs` |
| Lines you are expected to change | 7, tagged **default**, carrying 9 values | `.rulesync/rules/overview.md` |
| Example skills to replace with real ones | 2 | `.rulesync/skills/` |
| Self-checks that run on every pull request | 23 | `tests/` |

The seven agents are Claude Code, OpenAI Codex CLI, Cursor, GitHub Copilot,
Cline, `opencode`, and anything that reads the plain `AGENTS.md` standard.

Editing a generated file by hand is the one banned move. The `--check` mode of
`rulesync` regenerates in memory, compares, and exits 1 on any change in
meaning. The `generated-files-match-source` job in `.github/workflows/ci.yml`
runs it on every pull request.

The comparison is semantic rather than byte for byte, so a formatting-only edit
to a generated JSON file can slip past. Nine of the 30 generated files are JSON.
Measured on 2026-08-22, appending a comment to each of those nine exited 0 for
six of them, and re-minifying `.cursor/hooks.json` exited 0 as well.

Every edit that changes meaning is caught. Emptying `PreToolUse`, pointing the
hook command at `true`, moving an entry from `deny` to `allow`, and deleting a
generated file outright each exited 1.

## Fork it

1. Use this repository as a template, not a submodule. There is no upstream to
   track and no version to pin.
2. Rewrite the seven lines tagged **default** in `.rulesync/rules/overview.md`.
   They carry nine values, because two of the lines state a soft figure and a
   hard one. Line budgets, the search order for prior art, and the validation
   libraries are starting positions, not law.
3. Replace the two example skills with your own, then run
   `npx rulesync generate --delete` so the old generated copies go away rather
   than lingering where agents keep reading them.
4. Loosen `.rulesync/permissions.jsonc`. The `bash` catch-all is `ask`, which is
   deliberately annoying on a first run. Add `allow` entries for the commands
   your stack runs constantly instead of flipping the catch-all.
5. Run `npm run verify` before you trust any of it. That is
   `rulesync generate --check`, then `trunk check --all`, then `vale .`, then
   `node --test`.

## What this replaced

The previous version of this repository shipped 3,649 lines of hand-written
enforcement. Every line of it is deleted.

| Layer | Was | Is now |
|---|---|---|
| Rules | one hand-written `AGENTS.md` carrying 8 unresolved `<PLACEHOLDER>` markers | `rulesync` writes 30 files from 5 sources |
| Skills | a folder no agent harness ever read | `rulesync` writes `.claude/skills/` and the five equivalents |
| Tool-call hooks | 690 lines of Python, including 16 hand-written secret patterns and a hand-written shell command parser | 66 lines of Node that shell out to `gitleaks`, which ships 222 rules in 8.30.1 |
| Git guards | 504 lines of bash plus a 502-line installer for two platforms | `trunk git-hooks sync` |
| Self-checks | a 152-line hand-rolled test runner | `node --test` from the Node standard library, zero test dependencies |

Executable guard logic went from 1,194 lines to 66, a 94 percent cut, and the
detection those lines used to attempt is now `gitleaks` and `osv-scanner`
keeping their own rules current.

The old quickstart is worth one line of warning. It told you to commit
`AKIAIOSFODNN7EXAMPLE` and promised `gitleaks` would catch it. `gitleaks` 8.30.1
reports "no leaks found" for that string, because it is a published placeholder
from the AWS documentation, so the demonstration that sold the whole repository
proved nothing.

Every fixture here is checked against the scanner that has to catch it.

## Prior art

Agent guardrails already exist and several are good. `PRIOR-ART.md` lists what
each project is for, which of them this repository now depends on, and the live
star counts and last-push dates behind those calls.

## Design decisions

`SPEC.md` states the four decisions that are locked, the escape hatches that
actually exist, and the things this repository is not.

## License

MIT. See `LICENSE`.
