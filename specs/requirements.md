# public-agent-provisioning requirements

OpenFastTrace register (coverage register T24): one item per MUST, never and always line, invariant, locked decision and known gap of `SPEC.md`, with the test or gate that holds it. Traced on every push by the Trunk action `trace-on-push` (a fork without the shared tracer skips it). HARD: a test or gate refuses the miss. WATCHED: an outside service reports it. PARTIAL: the `Rationale:` names what is not held. SOFT: history.

### spec:what.1
`req~spec_what.1~1`

> Every layer is wired and runnable in this repository. `npm run verify` runs all of it.

Comment:
source: SPEC.md
enforcer: repo:package.json#"verify": "rulesync install --frozen && rulesync generate --check && trunk check --all
enforcer: repo:.trunk/trunk.yaml#npm run verify

Tags: HARD, beforeHARD

Needs: impl

### spec:hook.1
`req~spec_hook.1~1`

> `tests/hooks.test.mjs` fails the suite in `npm run verify`, the pre-push gate, whenever `gitleaks` is missing.

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#gitleaks is on PATH, because the hook fails open without it

Tags: HARD, beforeHARD

Needs: impl

### spec:deps.1
`req~spec_deps.1~1`

> The override forces `tar` 7, the launcher was smoke-tested against it (`npx trunk --version` runs), and Renovate keeps the override current.

Comment:
source: SPEC.md
enforcer: repo:package.json#"tar": "\^7
enforcer: repo:renovate.json
enforcer: ext:Renovate opens a pull request for each override bump

Tags: HARD, beforeHARD

Needs: impl

### spec:deps.2
`req~spec_deps.2~1`

> Delete the override when the launcher moves to `tar` 7 on its own.

Rationale:
A future step: no check reads the launcher's own `tar` range, so the stale override is found when a Renovate pull request is read.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:locked.1
`req~spec_locked.1~1`

> Adding a hand-rolled layer is the change that needs a written justification, not the other way round.

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#no owned hook script exists

Rationale:
Held for the hook layer by a test; a hand-rolled layer elsewhere (a new script under another folder) is caught only by `knip` dead-file and review.

Tags: PARTIAL, beforePARTIAL

### spec:locked.2
`req~spec_locked.2~1`

> Every check either exits non-zero and stops the operation, or it is deleted.

Comment:
source: SPEC.md
enforcer: repo:.trunk/trunk.yaml#trunk check --ci --no-fix -t git-commit
enforcer: repo:tests/git-guards.test.mjs#refuses a commit carrying a credential

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.3
`req~spec_locked.3~1`

> The replacement is the `block-commit-on-findings` action in `.trunk/trunk.yaml`, which runs `trunk check --ci`. The `--ci` flag never prompts and exits non-zero on a finding.

Comment:
source: SPEC.md
enforcer: repo:.trunk/trunk.yaml#- block-commit-on-findings
enforcer: repo:tests/git-guards.test.mjs#refuses a commit carrying a credential
enforcer: repo:tests/git-guards.test.mjs#lets an ordinary commit through

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.4
`req~spec_locked.4~1`

> The pre-push action `maintainability-on-push` in `.trunk/trunk.yaml` runs `npm run maint`

Comment:
source: SPEC.md
enforcer: repo:.trunk/trunk.yaml#npm run --silent maint
enforcer: repo:package.json#"maint": "depcruise

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.5
`req~spec_locked.5~1`

> runs `rulesync generate --check`, which regenerates in memory, compares against what is on disk, and exits 1 on any change in meaning. `tests/rulesync.test.mjs` proves the checker can go red by editing a generated `CLAUDE.md` in a scratch project and asserting the exit code.

Comment:
source: SPEC.md
enforcer: repo:tests/rulesync.test.mjs#goes red when a generated file is edited out of band
enforcer: repo:tests/rulesync.test.mjs#is green for this repository as committed

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.6
`req~spec_locked.6~1`

> `.gitattributes` forces LF checkouts, because a Windows CRLF checkout of the community skill files otherwise reads as drift and blocks every push.

Comment:
source: SPEC.md
enforcer: repo:.gitattributes#eol=lf

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.7
`req~spec_locked.7~1`

> Editing a generated file by hand is the banned move, because the edit survives only until the next generate and then vanishes with no error.

Comment:
source: SPEC.md
enforcer: repo:tests/rulesync.test.mjs#goes red when a generated file is edited out of band

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.8
`req~spec_locked.8~1`

> The pre-push gate installs with `--frozen`, so a pin change that skipped `install --update` goes red instead of drifting.

Comment:
source: SPEC.md
enforcer: repo:package.json#rulesync install --frozen

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.9
`req~spec_locked.9~1`

> Adding a target to `rulesync.jsonc` writes another copy of the same prose, so that target's directory has to join the brace list in `.vale.ini` at the same time.

Rationale:
No check compares the `rulesync.jsonc` targets with the `.vale.ini` brace list; a missed target shows as Vale findings on generated prose in `npm run verify`, which blocks the push but names the wrong fix.

Comment:
source: SPEC.md
enforcer: repo:.vale.ini#skills/\*\*\]

Tags: PARTIAL, beforePARTIAL

### spec:locked.10
`req~spec_locked.10~1`

> on stop (refuse to end a turn while a phase is `in_progress`, failing open on no plan, `PLANNING_DISABLED=1`, or 20 blocks).

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#the planning-with-files hooks are wired: inject on prompt, gate on stop

Tags: HARD, beforeHARD

Needs: impl

### spec:locked.11
`req~spec_locked.11~1`

> A `preToolUse` entry blocks the native todo tools by name with exit 2.

Rationale:
Declared in `.rulesync/hooks.jsonc` and carried to every target by the drift check; no test feeds a todo-tool call to the entry and reads exit 2.

Comment:
source: SPEC.md
enforcer: repo:.rulesync/hooks.jsonc#TodoWrite\|todowrite

Tags: PARTIAL, beforePARTIAL

### spec:remove.1
`req~spec_remove.1~1`

> The commit that removes a layer, a pinned skill, an MCP server or a script also removes every caller

Rationale:
Generated agent files are held by the drift check and dead code by `knip`; lines in `SPEC.md` and `README.md` naming a removed tool are judged by reading (no link check, see spec:gap.1).

Comment:
source: SPEC.md
enforcer: repo:tests/rulesync.test.mjs#is green for this repository as committed

Tags: PARTIAL, beforePARTIAL

### spec:remove.2
`req~spec_remove.2~1`

> A replacement ships in the same commit as the removal. No second copy is kept for compatibility.

Rationale:
A convention for the person or agent making the change; no check pairs a removal with its replacement.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:remove.3
`req~spec_remove.3~1`

> `PRIOR-ART.md` moves a removed tool from "Dependencies" to the tools looked at and not adopted, with why it left

Rationale:
Judged by reading `PRIOR-ART.md` in the same commit; no check compares its "Dependencies" list with `package.json`.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:escape.1
`req~spec_escape.1~1`

> Rule 15 of `.rulesync/rules/overview.md` asks for a reason beside the marker. Nothing enforces that, and this document does not pretend otherwise.

Rationale:
Known limit stated in the spec: a bare `gitleaks:allow`, `.gitleaksignore` fingerprint or `vale off` passes with no reason.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:escape.2
`req~spec_escape.2~1`

> | `git commit --no-verify` | the commit guard only, the push guard still fires on the same content | no, and the permission layer denies it to agents |

Comment:
source: SPEC.md
enforcer: repo:.rulesync/permissions.jsonc#--no-verify

Rationale:
The permission entry reaches every generated file through the drift check; the agent host enforces it and nothing here can invoke it (spec:gap.8).

Tags: PARTIAL, beforePARTIAL

### spec:inv.1
`req~spec_inv.1~1`

> Every guard this repository can run itself has a test pair. One half feeds it the thing it exists to catch and fails if that gets through, and the other half feeds it ordinary work and fails if that gets blocked.

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#blocks a call carrying a credential, with exit code 2
enforcer: repo:tests/hooks.test.mjs#allows an ordinary call
enforcer: repo:tests/git-guards.test.mjs#refuses a push that adds a credential
enforcer: repo:tests/git-guards.test.mjs#lets an ordinary push land

Tags: HARD, beforeHARD

Needs: impl

### spec:inv.2
`req~spec_inv.2~1`

> one that fails when any hook command points at a script file, because the hook layer owning no code is an invariant now, not a description.

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#no owned hook script exists

Tags: HARD, beforeHARD

Needs: impl

### spec:inv.3
`req~spec_inv.3~1`

> `tests/hooks.test.mjs` reads the commands and the matcher out of `.rulesync/hooks.jsonc` and exercises every declared command against every matched tool.

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#every tool the matcher registers has a payload shape to exercise it with
enforcer: repo:tests/hooks.test.mjs#the matcher in hooks.jsonc names at least one tool

Tags: HARD, beforeHARD

Needs: impl

### spec:inv.4
`req~spec_inv.4~1`

> Every guard runs against a throwaway git repository under the operating system temporary directory, with `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` pointed at an empty file so no test can read the host machine's git configuration.

Comment:
source: SPEC.md
enforcer: repo:tests/lib/proc.mjs#GIT_CONFIG_GLOBAL: empty

Tags: HARD, beforeHARD

Needs: impl

### spec:inv.5
`req~spec_inv.5~1`

> **No credential, host, IP address, or account-specific path is committed here.**

Rationale:
Credentials are refused by the gitleaks commit and push guards. Hosts, IPs and paths are not scanned; the house push actions (`gate-clock-*`, `trace-on-push`) name `A:/personal-markkennethbadilla/mkb-agentops` and skip themselves in a fork where that path is absent.

Comment:
source: SPEC.md
enforcer: repo:tests/git-guards.test.mjs#refuses a commit carrying a credential
enforcer: repo:.rulesync/permissions.jsonc#"\.env": "deny"

Tags: PARTIAL, beforePARTIAL

### spec:inv.6
`req~spec_inv.6~1`

> The planted AWS key is synthetic, assembled from fragments at run time, and deliberately not `AKIAIOSFODNN7EXAMPLE`.

Comment:
source: SPEC.md
enforcer: repo:tests/lib/scratch.mjs#const FAKE_AWS_KEY_ID = \["AKIA"
enforcer: repo:tests/git-guards.test.mjs#refuses a commit carrying a credential

Tags: HARD, beforeHARD

Needs: impl

### spec:gap.1
`req~spec_gap.1~1`

> | Nothing validates a path or link named in a document |

Rationale:
Known gap: `markdown-link-check` is off in `.trunk/trunk.yaml`, so a dead path in a document passes.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.2
`req~spec_gap.2~1`

> | `shellcheck` has no build for Windows at version 0.11.0 |

Rationale:
Known gap: a shell file pushed from Windows is not linted; the template ships none.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.3
`req~spec_gap.3~1`

> | `delete: false` in `rulesync.jsonc` |

Rationale:
Known gap: a renamed rule or skill leaves its old generated copy; the fix is a manual `npx rulesync generate --delete`.

Comment:
source: SPEC.md
enforcer: repo:rulesync.jsonc#"delete": false

Tags: PARTIAL, beforePARTIAL

### spec:gap.4
`req~spec_gap.4~1`

> | The tool-call hook needs `gitleaks` on `PATH` separately from Trunk's pinned copy |

Comment:
source: SPEC.md
enforcer: repo:tests/hooks.test.mjs#gitleaks is on PATH, because the hook fails open without it

Tags: HARD, beforeHARD

Needs: impl

### spec:gap.5
`req~spec_gap.5~1`

> | The hook scans the whole tool-call payload, `old_string` included |

Rationale:
Deliberate limit: an Edit that removes a leaked secret is blocked too.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.6
`req~spec_gap.6~1`

> | Trunk 1.25.0's pre-push callback skips itself on a headless POSIX host |

Rationale:
Known gap upstream: on POSIX the push guard never runs; the commit gate and GitHub push protection hold. The skip itself is pinned by the push-guard tests, so an upstream fix turns the suite red.

Comment:
source: SPEC.md
enforcer: repo:tests/git-guards.test.mjs#Check run skipped by user

Tags: PARTIAL, beforePARTIAL

### spec:gap.7
`req~spec_gap.7~1`

> | Neither git guard reads history |

Rationale:
Known gap: a secret committed then deleted still reaches the remote in one push; GitHub push protection is the backstop.

Comment:
source: SPEC.md
enforcer: ext:GitHub push protection on the remote

Tags: PARTIAL, beforePARTIAL

### spec:gap.8
`req~spec_gap.8~1`

> | The permission entries in `.rulesync/permissions.jsonc` have no test pair |

Rationale:
Known gap: the agent host enforces them and nothing here can invoke one; the drift check only proves they reach every generated file.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.9
`req~spec_gap.9~1`

> | rulesync 16.14.0's generated OpenCode plugin never pipes the payload into the hook command |

Rationale:
Known gap upstream: on OpenCode the hook scans nothing; the commit guard is its real secret gate.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.10
`req~spec_gap.10~1`

> | The planning gate's stop hook runs POSIX `sh` |

Rationale:
Known gap: a host that runs hooks through cmd.exe stops ungated; the skill ships PowerShell twins to wire by hand.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.11
`req~spec_gap.11~1`

> | Antigravity CLI gets a partial planning gate and no project-scope permissions |

Rationale:
Known gap upstream in rulesync target coverage.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:gap.12
`req~spec_gap.12~1`

> | The OpenCode parity layer reaches OpenCode alone |

Comment:
source: SPEC.md
enforcer: repo:tests/opencode-parity.test.mjs#opencode.jsonc pins oh-my-openagent to an exact version
enforcer: repo:tests/opencode-parity.test.mjs#disables every hook this repository already owns

Rationale:
The pin and the disabled hooks are tested; that other targets lack the layer is a stated limit.

Tags: PARTIAL, beforePARTIAL

### spec:gap.13
`req~spec_gap.13~1`

> | rulesync drops hook events a target cannot express |

Rationale:
Known gap upstream: Cline gets no `postToolUse` or `preCompact` registration.

Comment:
source: SPEC.md

Tags: PARTIAL, beforePARTIAL

### spec:renovate.1
`req~spec_renovate.1~1`

> Renovate keeps every pinned version current.

Comment:
source: SPEC.md
enforcer: repo:renovate.json
enforcer: ext:Renovate app on the GitHub repo opens update pull requests

Tags: WATCHED, beforeWATCHED

Needs: impl

### spec:renovate.2
`req~spec_renovate.2~1`

> none merges itself, because no CI runs on pull requests.

Comment:
source: SPEC.md
enforcer: owner:mkb-agentops/.rulesync/hooks/ban-github-actions.mjs

Rationale:
No workflow is refused by the agent hook; that Renovate auto-merge stays off is read in `renovate.json` by hand.

Tags: PARTIAL, beforePARTIAL

### spec:history.1
`req~spec_history.1~1`

> The previous version of this document claimed "zero install dependency beyond git itself" and described the git guards as "two ordinary POSIX shell scripts." Both statements were false

Rationale:
History: the old claims, recorded so nobody reinstates them.

Comment:
source: SPEC.md

Tags: SOFT, beforeSOFT

### spec:history.2
`req~spec_history.2~1`

> Reproduced on 2026-08-22.

Rationale:
History: the reproduction that motivated `block-commit-on-findings`.

Comment:
source: SPEC.md

Tags: SOFT, beforeSOFT
