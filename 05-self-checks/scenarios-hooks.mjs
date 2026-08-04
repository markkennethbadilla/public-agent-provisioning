#!/usr/bin/env node
// PRIOR-ART: none-external -- see scenarios-pre-commit.mjs; same {id, run()}
// bad/good contract, applied to the 03-hooks/*.py PreToolUse hooks. Inputs
// below are constructed directly from reading each hook's own source and
// 03-hooks/README.md's documented contract table -- nothing here guesses.
//
// scenarios-hooks.mjs -- one entry per hook that exists in 03-hooks/ TODAY.
// A hook added later without a matching scenario here shows up as a GAP in
// verify-guards.mjs's report (see discoverUncoveredHooks in lib/hook-io.mjs)
// instead of silently being skipped -- coverage growing to meet new hooks is
// a follow-up commit to THIS file, not a requirement placed on 03-hooks/.
import { join } from "node:path";
import { runHook, resetHookState } from "./lib/hook-io.mjs";

export const COVERED_HOOK_FILES = ["deny-unsafe-delete.py", "deny-secret-in-write.py", "require-plan-before-edit.py"];

export const scenarios = [
  {
    id: "deny-unsafe-delete",
    file: "03-hooks/deny-unsafe-delete.py",
    mechanism: "recursive/forced delete of an unclassified path is blocked; deleting a regenerable dir (node_modules) is not",
    run(scratch, repoRoot) {
      const hookPath = join(repoRoot, "03-hooks", "deny-unsafe-delete.py");
      const bad = runHook(hookPath, {
        tool_name: "Bash",
        tool_input: { command: "rm -rf customer-records/2026-invoices" },
        session_id: "verify-guards-selftest",
      });
      const good = runHook(hookPath, {
        tool_name: "Bash",
        tool_input: { command: "rm -rf node_modules" },
        session_id: "verify-guards-selftest",
      });
      return { bad, good };
    },
  },
  {
    id: "deny-secret-in-write",
    file: "03-hooks/deny-secret-in-write.py",
    mechanism: "a live-shaped credential literal in a Write is blocked; ordinary content is not",
    run(scratch, repoRoot) {
      const hookPath = join(repoRoot, "03-hooks", "deny-secret-in-write.py");
      const bad = runHook(hookPath, {
        tool_name: "Write",
        tool_input: {
          file_path: "config.py",
          // Assembled at runtime, never written as one literal. A secret
          // scanner's own test data will otherwise trip a secret scanner -
          // including this repo's pre-commit guard, and anyone else's scanner
          // once this template is forked. The value the hook actually receives
          // is byte-identical to the live-shaped key, so the test is unchanged.
          content: "STRIPE_KEY = \"sk_" + "live_4f8B2k9QeRt7Yx1Cn0Wp5Lm3Vz6Jd2A\"\n",
        },
        session_id: "verify-guards-selftest",
      });
      const good = runHook(hookPath, {
        tool_name: "Write",
        tool_input: {
          file_path: "config.py",
          content: 'STRIPE_KEY = os.environ["STRIPE_KEY"]\n',
        },
        session_id: "verify-guards-selftest",
      });
      return { bad, good };
    },
  },
  {
    id: "require-plan-before-edit",
    file: "03-hooks/require-plan-before-edit.py",
    mechanism: "--gate blocks a file edit with no recorded plan for the session; a written override allows it",
    run(scratch, repoRoot) {
      resetHookState(); // a marker left by a previous run must not decide this run's result
      const hookPath = join(repoRoot, "03-hooks", "require-plan-before-edit.py");
      const bad = runHook(
        hookPath,
        {
          tool_name: "Write",
          tool_input: { file_path: "app.py", content: "print('hello')\n" },
          session_id: "verify-guards-selftest-bad",
        },
        ["--gate"],
      );
      const good = runHook(
        hookPath,
        {
          tool_name: "Write",
          tool_input: {
            file_path: "app.py",
            content: "print('hello')\n# ALLOW-EDIT-WITHOUT-PLAN: verify-guards self-check exercising the written-reason override\n",
          },
          session_id: "verify-guards-selftest-good",
        },
        ["--gate"],
      );
      return { bad, good };
    },
  },
];
