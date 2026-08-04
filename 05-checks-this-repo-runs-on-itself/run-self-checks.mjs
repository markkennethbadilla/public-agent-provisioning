#!/usr/bin/env node
// PRIOR-ART: none-external -- a ~15-line convenience runner over this
// template's own two self-checks; not a general test runner, just a loop.
// run-self-checks.mjs -- convenience runner: everything in this folder, one
// command, non-zero exit if anything failed. pre-commit's section 7 calls
// verify-git-guards.mjs and verify-gates-can-fail.mjs directly (so it gets a
// precise per-check exit code); this file is for humans running the same
// suite by hand, e.g. in CI or right after installing the guards.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const checks = ["verify-git-guards.mjs", "verify-gates-can-fail.mjs"];

let failed = false;
for (const c of checks) {
  console.log(`\n--- ${c} ---`);
  const res = spawnSync(process.execPath, [join(HERE, c)], { stdio: "inherit" });
  if (res.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
