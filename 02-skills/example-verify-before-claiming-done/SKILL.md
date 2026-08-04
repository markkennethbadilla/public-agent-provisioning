---
name: example-verify-before-claiming-done
description: "Whenever about to tell someone a fix works, a test passes, a bug is resolved, code is done, or any other claim of correctness — before making that claim, route it to a deterministic check instead of asserting it from memory, from re-reading your own edit, or from how plausible the change looks. Fires on the instinct to say 'this should work now,' 'fixed,' 'done,' 'that resolves it,' or 'verified,' and on any point where a change is about to be reported as working with no check actually run. Covers why self-review is not evidence, what counts as a real check across different kinds of work, and how to build the smallest possible check when no automated one exists yet."
---

# Verify Before Claiming Done: Route Every Success Claim to a Deterministic Check

Every claim of "this is fixed," "this works," or "this is done" is a bet.
The only way to know whether it is a winning bet is to run something outside
your own judgment that can independently say pass or fail. Re-reading the
change you just made and deciding it looks right is not that thing — it is
the same reasoning that produced the change, checking its own output, using
the same blind spots that let the original mistake happen.

## Why this matters

Concrete failure scenario, in code: a null-pointer error gets "fixed" by
adding a null check at the line where it surfaced. The diff is re-read,
looks correct, and gets reported as fixed. The actual bug was a race
condition three call sites away that happens to usually manifest as a null
— the null check silences the symptom in the common case and the failure
now resurfaces intermittently, harder to reproduce than before. Self-review
could not catch this, because the mental model that misdiagnosed the bug is
the same one that reviewed the fix. It agrees with itself every time, which
is exactly why agreement is not evidence.

The same shape shows up outside code: a drafted reply to a billing complaint
gets reread, reads as complete and correct, and gets sent — except the
account number it references belonged to a closed account, something
re-reading the prose could never catch because the prose itself is
internally consistent. Only checking the claim against the actual account
record would have caught it.

## The core doctrine

### Self-review is not verification

Three separate reasons re-reading your own work fails as a check:

1. **Same blind spots.** Whatever reasoning produced the mistake is the
   reasoning doing the reviewing. It cannot see what it could not see the
   first time.
2. **A structural pull toward "it's done."** Finishing reads as the goal, so
   a self-review has a thumb on the scale toward concluding success rather
   than continuing to look for a problem.
3. **Re-reading only checks local plausibility.** It confirms the code
   exists and looks reasonable in isolation. It does not execute it, does
   not check the parts outside the diff, and cannot see an interaction with
   something the diff never touched.

### What counts as a real check

A deterministic check is something outside your own judgment that:

- actually runs, executes, or queries the real thing — not a description of
  what it should do,
- produces a pass/fail, or a concrete measurable value, that was not chosen
  or worded after the fact to fit the desired answer,
- would genuinely say "fail" if the fix were wrong, not only "fail" if the
  fix were entirely absent.

Examples across different kinds of work, each paired with the
looks-like-verification trap it replaces:

| Domain | Not verification | Actual verification |
|---|---|---|
| A code fix | Re-reading the diff | Running the failing case (or reproducing the original bug) and watching it now pass |
| "Tests pass" | Remembering that the last run was green | Re-running the suite after the latest change and reading the fresh output |
| A data migration | The dump command exited zero | Restoring the dump into a scratch database and comparing row counts |
| A deployed fix | The deploy pipeline finished with no errors | Hitting the actual affected page or endpoint and confirming the behavior changed |
| A drafted message | Reading it back and it sounds right | Checking the specific facts it claims — an account number, a date, an amount — against the source record |
| A config change | The file now contains the new value | Restarting or reloading the service and confirming it actually picked the new value up |

### If no automated check exists yet, build the smallest one that would catch this specific failure

A full test suite is not a prerequisite for verifying one fix. What's needed
is one check narrow enough to catch the specific failure in question, and no
more. In roughly increasing order of effort:

1. **Reproduce the original failure, then confirm it no longer reproduces.**
   This is almost always available and is the most commonly skipped option
   — it requires no new tooling, only actually doing it.
2. **Write one targeted assertion that fails on the old behavior and passes
   on the new one.** Actually run it against the old code first to confirm
   it would have failed there — a check that was never proven capable of
   failing is not evidence when it passes.
3. **Query the real system state directly** — a database row, an API
   response, a log line — instead of reasoning about what it should
   contain.

If nothing can check the claim at all — a genuine matter of subjective
judgment or taste — say so plainly instead of dressing a guess up as a
verified fact. "I made this change; I was not able to verify it against a
running check" is honest. "This is fixed," stated with nothing having been
run, is not.

## Step-by-step

This is closer to a judgment-based habit than a rigid procedure, but the
shape holds every time:

1. Before writing the words "fixed," "done," "resolved," or "verified" —
   or their equivalents — ask: what did I just run, execute, or query that
   was actually capable of saying no?
2. If the honest answer is nothing, stop and run something first.
   Reproduce the original failure and confirm it's gone; run the relevant
   test; query the actual system; hit the actual endpoint.
3. If nothing exists to run and nothing can be cheaply built, say plainly
   what was and was not verified. Don't let the phrasing imply a check
   happened when it didn't.
4. Report what the check actually said, not an interpretation dressed up as
   the check's own output. "The suite is green, 12 of 12 passing" is a
   check result. "I'm confident this works" is not a check result, even
   when it happens to be true.

## Enforcement tier

- **Tier B** wherever a real deterministic check exists and actually gets
  run — a test suite, a restore-and-compare, a live endpoint hit. This is
  the target state for any claim that can be attached to a check at all.
- **Tier C** everywhere a check genuinely cannot exist — a taste call, a
  subjective judgment with no ground truth to check against. The discipline
  there is to say so honestly rather than imply Tier B confidence that
  isn't real.
- There is no Tier A for this one. Nothing physically stops the words "this
  is fixed" from being typed with no check having run. The entire mechanism
  is the habit of routing through a check before making the claim — which
  is exactly why it has to be practiced deliberately rather than relied on
  as something a gate will catch for you.

## Non-negotiables

- Never claim a fix works because the code compiled or ran without an
  error. Absence of an error is not presence of correctness.
- Never re-read your own edit and call that verification. Re-reading is
  proofreading, not proof.
- Never report "tests pass" from memory of an earlier run. Re-run, then
  report the fresh result.
- If nothing can verify the claim, say that plainly instead of implying a
  check happened when it didn't.
