#!/usr/bin/env node
// PRIOR-ART: none-external -- see README.md in this directory for the full
// argument. In short: pre-commit/pre-push frameworks (pre-commit.com, husky,
// lefthook) install and RUN hooks; none of them ship a harness that proves a
// hook actually blocks a bad input AND actually passes a benign one. That is
// the specific, narrow thing this file exists to do, over hooks this
// template itself wrote -- there is nothing generic to adopt.
//
// verify-guards.mjs -- THE PROOF THAT THE GUARDRAILS FIRE.
//
// For every hook in 03-hooks/ and every git guard in
// 04-git-guards-that-block-commits-and-pushes/, this constructs a REAL input
// that must be BLOCKED and a REAL benign input that must PASS, runs the real
// (unmodified, shipped) guard against both, and fails the whole run if
// either direction is wrong. Blocking a bad input and not blocking a good
// one are both load-bearing: a guard that never fires is theatre, and a
// guard with false positives is the guard people learn to `--no-verify`
// around. Neither failure mode is visible from reading the guard's source --
// only running it proves it.
//
// Everything happens in throwaway git repos under the OS temp dir (see
// lib/scratch.mjs). Nothing here ever touches this repo's own git state,
// commits, or remotes.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { makeScratch, cleanup } from "./lib/scratch.mjs";
import { scenarios as preCommitScenarios } from "./scenarios-pre-commit.mjs";
import { scenarios as prePushScenarios } from "./scenarios-pre-push.mjs";
import { scenarios as hookScenarios, COVERED_HOOK_FILES } from "./scenarios-hooks.mjs";
import { listHookFiles } from "./lib/hook-io.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function gitleaksOnPath() {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["gitleaks"], { stdio: "ignore" });
  return !r.error && r.status === 0;
}

function grade(expectBlocked, result) {
  if (result.skipped) return "SKIP";
  return result.blocked === expectBlocked ? "PASS" : "FAIL";
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printRow(status, file, id, kind, expected, got, detail) {
  const line = `${pad(status, 6)} ${pad(file, 10)} ${pad(id, 32)} ${pad(kind, 5)} expected ${pad(expected, 6)} got ${pad(got, 6)}`;
  console.log(line);
  if (status === "FAIL" && detail) {
    console.log(`       ${detail.slice(0, 300).replace(/\n/g, "\n       ")}`);
  }
}

async function main() {
  console.log("verify-guards -- exercising every git guard (and every 03-hooks fixture) with a real bad input and a real good input.\n");

  const scratch = makeScratch(REPO_ROOT);
  const rows = []; // { status, file, id, kind, expected, got, detail }
  const setupErrors = [];
  const skipGitleaks = !gitleaksOnPath();
  if (skipGitleaks) {
    console.log("NOTE: gitleaks not found on PATH -- the secrets-scan scenario is SKIPPED, not faked green.\n");
  }

  try {
    for (const scenario of [...preCommitScenarios, ...prePushScenarios, ...hookScenarios]) {
      if (skipGitleaks && scenario.id === "secrets-scan") {
        rows.push({ status: "SKIP", file: scenario.file, id: scenario.id, kind: "bad", expected: "BLOCK", got: "-", detail: "" });
        rows.push({ status: "SKIP", file: scenario.file, id: scenario.id, kind: "good", expected: "PASS", got: "-", detail: "" });
        continue;
      }
      let result;
      try {
        result = scenario.run(scratch, REPO_ROOT);
      } catch (e) {
        setupErrors.push(`${scenario.file}/${scenario.id}: fixture setup threw -- ${e.message}`);
        rows.push({ status: "ERROR", file: scenario.file, id: scenario.id, kind: "bad", expected: "BLOCK", got: "n/a", detail: e.message });
        rows.push({ status: "ERROR", file: scenario.file, id: scenario.id, kind: "good", expected: "PASS", got: "n/a", detail: e.message });
        continue;
      }
      const badStatus = grade(true, result.bad);
      rows.push({
        status: badStatus,
        file: scenario.file,
        id: scenario.id,
        kind: "bad",
        expected: "BLOCK",
        got: result.bad.blocked ? "BLOCK" : "PASS",
        detail: badStatus === "FAIL" ? `guard did NOT block a bad input (${scenario.mechanism}). stderr: ${result.bad.err}` : "",
      });
      const goodStatus = grade(false, result.good);
      rows.push({
        status: goodStatus,
        file: scenario.file,
        id: scenario.id,
        kind: "good",
        expected: "PASS",
        got: result.good.blocked ? "BLOCK" : "PASS",
        detail: goodStatus === "FAIL" ? `guard BLOCKED a benign input (false positive) (${scenario.mechanism}). stderr: ${result.good.err}` : "",
      });
    }

    console.log("--- git guards (04-git-guards-that-block-commits-and-pushes) + 03-hooks ---\n");
    for (const row of rows) printRow(row.status, row.file, row.id, row.kind, row.expected, row.got, row.detail);

    // 03-hooks/ coverage: anything present there that this file has NO
    // scenario for yet is a visible GAP, not a silent pass and not a
    // failure -- same rule verify-gates-can-fail.mjs uses for checks/ with
    // no fixtures/<id>/bad/ yet.
    console.log(`\n--- 03-hooks/ coverage ---`);
    if (!existsSync(join(REPO_ROOT, "03-hooks"))) {
      console.log("  03-hooks/ does not exist in this checkout -- nothing to discover.");
    } else {
      const present = listHookFiles(REPO_ROOT);
      const gaps = present.filter((f) => !COVERED_HOOK_FILES.includes(f));
      if (present.length === 0) {
        console.log("  03-hooks/ has no hook scripts yet -- nothing to discover.");
      } else {
        console.log(`  ${hookScenarios.length} of ${present.length} hook script(s) have a scenario in scenarios-hooks.mjs and were exercised above.`);
      }
      if (gaps.length) {
        console.log(`  ${gaps.length} hook(s) have NO scenario yet and were NOT exercised (reported, not failed):`);
        for (const g of gaps) console.log(`    - ${g}`);
      }
    }

    const failed = rows.filter((r) => r.status === "FAIL" || r.status === "ERROR");
    const passed = rows.filter((r) => r.status === "PASS").length;
    const skipped = rows.filter((r) => r.status === "SKIP").length;
    console.log(`\n=== ${passed} passed, ${failed.length} failed, ${skipped} skipped, ${rows.length} total assertions ===`);
    if (setupErrors.length) {
      console.log("\nFixture setup errors (bugs in this test suite, not necessarily the guard):");
      for (const e of setupErrors) console.log(`  - ${e}`);
    }

    if (failed.length > 0) {
      console.log("\n[FAIL] verify-guards -- at least one guard either let a bad input through or blocked a benign one.");
      process.exitCode = 1;
      return;
    }
    console.log("\n[OK] verify-guards GREEN -- every exercised guard blocked its bad input and passed its good one.");
  } finally {
    cleanup(scratch);
  }
}

main();
