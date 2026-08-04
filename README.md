# public-agent-provisioning

A prompt asks an AI coding agent to behave. A gate makes misbehaving physically
impossible — the action fails before it lands, and the failure message says
what to do instead.

This repo is a template for the second kind of thing: a small, layered set of
mechanisms — an always-on rules file, on-demand skills, a tool-call
interceptor, git hooks, and a suite that proves the hooks still work — that
sit around an agent instead of relying on it to remember instructions under
pressure. Two of the five layers ship here as physically enforcing code that
blocks on its own. Two more ship as populated templates — a rules file and
two worked example skills, each carrying `<PLACEHOLDER: …>` markers for your
own thresholds — that you fork and fill in rather than write from nothing.
The fifth is described so you can build it the same way once you need it.

## 60-second quickstart

This clones the template, points git at its guard layer, then tries to commit
a fake AWS key to prove the guard actually blocks something — not just prints
a warning.

```bash
git clone <your-fork-of-this-repo> guardrail-template
cd guardrail-template
git config core.hooksPath 04-git-guards-that-block-commits-and-pushes

echo 'const key = "AKIAIOSFODNN7EXAMPLE";' > leak.js
git add leak.js
git commit -m "test"
```

Expected result: the commit is refused. If you have `gitleaks` on `PATH`, it
catches the fake key by pattern and names the file. If you do not, the guard
refuses anyway — a missing secret scanner is treated as a failure, never a
silent pass, because a check that can be silently skipped is not a check
(see "Locked decisions" in `SPEC.md`). Either way you get a nonzero exit, a
line that says what was wrong, and a line that says the fix.

Clean up the demo before doing anything real:

```bash
git reset
rm leak.js
```

## The layers

The full pattern is five numbered layers, each catching what the one before
it missed. `PRIOR-ART.md` is the honest accounting of which parts are
borrowed; this table is the map.

| Layer | What it is | Fires when | In this template |
|---|---|---|---|
| 01 — rules loaded every turn | a small always-on instruction file, read on every single turn, capped hard so it stays read instead of skimmed | every turn, unconditionally | **template** — `AGENTS.md` (root) + `01-rules/README.md`, placeholders to fill in |
| 02 — skills loaded on demand | topic playbooks; only a name and one-paragraph trigger description stay resident, the full body loads only when the topic actually comes up | whenever a conversation matches a skill's description | **template** — `02-skills/`, two worked examples plus `_TEMPLATE/` |
| 03 — hooks that intercept tool calls | code that runs before an agent's tool call is allowed to execute, with the power to refuse it outright | the instant before a tool call runs | pattern only — bring your own |
| 04 — git guards | plain `pre-commit` / `pre-push` shell hooks, no framework, no install dependency beyond git | every `git commit` / `git push` | **shipped** — `04-git-guards-that-block-commits-and-pushes/` |
| 05 — self-checks | a suite that proves layer 04's hooks are live, byte-identical to what was reviewed, and still capable of going red, not just present | every commit (wired into 04's `pre-commit`), and on demand | **shipped** — `05-self-checks/` |

Rules and skills are what an agent *reads*; hooks, git guards, and
self-checks are what stop it regardless of whether it read them. A rules
file with no gate behind it is a request. A gate with no rules file
explaining the *why* is a wall nobody understands. The layering needs both,
in this order — which is also why layers 01 and 02 ship as templates with
placeholders rather than opinions: your thresholds are not this project's to
guess, but the shape they go in is.

Read `04-git-guards-that-block-commits-and-pushes/README.md` and
`05-self-checks/README.md` for how those two actually
work — the escape-hatch table, the fixture-based proof that a check can go
red, and why a hash compare alone is not enough.

## Fork this and delete two thirds

This is a template, not a dependency — there is nothing to `npm install` and
nothing to keep in sync with upstream. The intended workflow:

1. Clone or use this repo as a starting point, not a subtree or a submodule.
2. Delete whatever does not match your stack. A Python monorepo has no use
   for the npm-lockfile-convention check; a solo project has no use for the
   worktree guard. Nothing here is load-bearing for anything else — read
   each section of `pre-commit` and `pre-push`, keep what applies, cut the
   rest.
3. Rewrite the `<PLACEHOLDER: …>` markers in `AGENTS.md` and `02-skills/`
   with your own thresholds, then delete the demonstration example skills
   once you've replaced them with real ones. Build layer 03 (tool-call
   interception) the same way once you need it — it has no scaffold here yet.
4. Keep the discipline even after you cut the code: a check blocks outright
   or it does not exist: it never degrades to a warning. An exception is a
   named, logged variable that states why, in the open — never a silent edit
   to the check itself. `SPEC.md` states this as a locked decision, not a
   suggestion, for exactly this reason: it is the one property worth keeping
   even after everything else has been rewritten.

If you outgrow plain shell hooks, a hook manager (`pre-commit`, `husky`,
`lefthook`) is a reasonable next step for your fork. Nothing here fights
that — the template stays framework-free only because a guardrail you cannot
trust until you trust its own dependency tree is a worse starting point than
a hundred lines of POSIX shell.

## Prior art

Agent guardrails already exist, and several of them are good. This is one
arrangement of already-known mechanisms — secret scanning, git hooks, TDD
enforcement for agents — not a claim that any single piece is new. See
`PRIOR-ART.md` for the specific projects checked, what each does well, and
what none of them package together: the layering itself, and a self-check
tier that treats an untested guardrail as equivalent to no guardrail at all.

## License

MIT — see `LICENSE`.
