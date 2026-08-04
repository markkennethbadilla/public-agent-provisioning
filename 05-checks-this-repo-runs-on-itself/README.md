# self-checks — proving the guards still work

A guardrail nobody ever tests is theatre: it reports safety whether or not it
is actually doing anything. This folder is the answer — checks that run
*against the guard layer itself*, wired into `pre-commit` so that "the
enforcement layer is broken" becomes a blocked commit, not a silent gap.

Two different failure modes, two different checks:

## 1. Tampering / drift — `verify-git-guards.mjs`

Proves the hooks in `04-git-guards-that-block-commits-and-pushes/` are
**actually live** on this machine, byte-for-byte, right now — not merely
present in the repo.

It checks: `core.hooksPath` is set; the live `pre-commit`/`pre-push` are
SHA-256-identical to the reviewed repo copies; if the hooks were copied
somewhere else, the `.guard-root` pointer next to them resolves back to this
template; `gitleaks` resolves on `PATH`; the credential-popup settings that
keep an unattended push from hanging are set; and if `core.excludesFile` is
configured, the file it points at actually exists.

A hash compare is the right tool for this class of problem: it proves the
running file is the *reviewed* file. It does **not** prove the reviewed file
was ever correct — that's the second check.

## 2. A check that was born unable to fail — `verify-gates-can-fail.mjs`

The more interesting failure. A check can be byte-identical to what a human
reviewed and still be worthless: a regex assembled from a plain string so a
metacharacter silently decayed to a literal, an inverted condition, a rule
tested only against a fixture that had the violation stripped out before
anyone looked, a check that unconditionally returns `[]` and prints "all
clear". Every one of those passes a hash compare forever, because passing
*is* what a no-op check does. Running the suite and seeing green proves
nothing about a check that was never able to go red in the first place.

### How the harness FORCES a check to fire and asserts it blocked

Every check under `checks/` is a small module with one contract:

```js
export default {
  id: "some-check-id",
  run(rootDir, options) {
    // return an array of failure strings.
    // empty array == pass.
  },
};
```

Because `run()` is a pure function over an arbitrary directory — not a
script that inspects the real repo via global state — it can be pointed at a
directory it has never seen before. That's the whole trick:

1. The check's author writes two tiny synthetic trees at authoring time:
   `fixtures/<id>/bad/` — engineered to contain **exactly** the one thing the
   check exists to catch, and nothing else — and `fixtures/<id>/good/` — a
   clean tree that must not trip it.
2. `verify-gates-can-fail.mjs` imports the check module and calls
   `run(fixtures/<id>/bad)` directly, in-process. This is a **real
   invocation of the real check**, not a mock and not a description of what
   it should do.
3. It asserts the return value is **non-empty**. If the array comes back
   empty, the check failed to fire on a tree that is *supposed* to be
   unambiguous — which means either the check's rule is broken, or the
   fixture no longer contains the violation. Either way, that's a hard
   failure of `verify-gates-can-fail.mjs` itself: *"its own bad/ fixture
   produces NO failure, so this check cannot go red."*
4. It then calls `run(fixtures/<id>/good)` and asserts the return value is
   **empty** — proving the check doesn't also cry wolf on legitimate code
   (a check that flags correct code is the one people learn to silence).

This repo demonstrates the mechanism on itself: `checks/no-todo-comments.mjs`
is a working example check, with `fixtures/no-todo-comments/bad/example.js`
(contains a `TODO` comment, must produce a failure) and
`fixtures/no-todo-comments/good/example.js` (does not, must produce none). Run
`node verify-gates-can-fail.mjs` and you will see it actually execute both
fixtures and report the result — not assume it.

A check with no `fixtures/<id>/bad/` directory is **reported, not failed**:
the point is that coverage can grow one fixture at a time on a large
pre-existing suite, instead of needing an all-or-nothing cutover that makes
the whole idea unlandable. The gap count prints on every run, so it stays a
visible, shrinking number rather than a silent assumption.

## Wiring it into pre-commit

`04-git-guards-that-block-commits-and-pushes/pre-commit` (section 7) re-runs
both checks on **every commit, in every repo** that points at these guards —
not just commits to this template. If either check fails, the commit is
blocked with "the guard's own enforcement layer is not intact." That is the
whole point: a guardrail that can silently stop protecting you, and still
let commits through, was never a guardrail.

## Run it by hand

```
node run-self-checks.mjs
```
