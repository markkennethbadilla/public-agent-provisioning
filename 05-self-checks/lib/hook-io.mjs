#!/usr/bin/env node
// PRIOR-ART: none-external -- see README.md in this directory. No off-the-
// shelf harness knows the PreToolUse stdin/exit-code contract; bespoke.
//
// hook-io.mjs -- runs a 03-hooks/*.py PreToolUse hook exactly the way the
// agent harness does: spawn python, feed a JSON payload on stdin, read the
// exit code. Per 03-hooks/README.md the contract for every hook in that
// directory is plain: exit 0 = allow, exit 2 = block, stderr = reason.
// (A JSON hookSpecificOutput.permissionDecision on stdout is also accepted,
// for forward-compat with a future hook using Claude Code's native
// structured-decision shape instead of a bare exit code.)
import { readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

let _pythonCmd;
export function pythonCmd() {
  if (_pythonCmd !== undefined) return _pythonCmd;
  for (const candidate of ["python3", "python", "py"]) {
    const r = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!r.error) {
      _pythonCmd = candidate;
      return _pythonCmd;
    }
  }
  _pythonCmd = null;
  return null;
}

function isDenied(stdout, exitCode) {
  if (exitCode === 2) return true;
  const trimmed = (stdout || "").trim();
  if (!trimmed) return false;
  try {
    const obj = JSON.parse(trimmed);
    const perm = obj?.hookSpecificOutput?.permissionDecision;
    if (perm === "deny" || perm === "ask") return true;
    if (obj?.decision === "deny" || obj?.decision === "block") return true;
  } catch {
    // not JSON -- the exit-code check above already covers this hook set
  }
  return false;
}

// Runs `python <hookPath> [...argv]` with `payload` (an object) as its JSON
// stdin, exactly as the harness invokes a PreToolUse hook.
export function runHook(hookPath, payload, argv = []) {
  const cmd = pythonCmd();
  if (!cmd) {
    return { blocked: false, skipped: true, out: "", err: "no python3/python/py interpreter found on PATH" };
  }
  const r = spawnSync(cmd, [hookPath, ...argv], { input: JSON.stringify(payload), encoding: "utf8" });
  if (r.error) {
    return { blocked: false, skipped: true, out: "", err: String(r.error.message || r.error) };
  }
  return { blocked: isDenied(r.stdout, r.status), skipped: false, out: r.stdout || "", err: r.stderr || "", code: r.status };
}

// Every *.py in 03-hooks/ that ISN'T a shared library. This template's own
// hooks name shared, non-executable-as-a-hook modules with a `lib_` prefix
// (03-hooks/lib_hookio.py); that convention, not a hardcoded filename, is
// what this filters on, so it keeps working if more shared modules are added.
export function listHookFiles(repoRoot) {
  const dir = join(repoRoot, "03-hooks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.py$/i.test(e.name) && !/^lib[_-]/i.test(e.name))
    .map((e) => e.name)
    .sort();
}

// lib_hookio.py's state_dir() keys per-session marker files under this OS
// temp folder (used by require-plan-before-edit.py). Wiped before each run
// so a marker left behind by a previous run of THIS suite can never make a
// "should still be blocked" fixture pass for the wrong reason.
export function resetHookState() {
  rmSync(join(tmpdir(), "agent-hook-state"), { recursive: true, force: true });
}
