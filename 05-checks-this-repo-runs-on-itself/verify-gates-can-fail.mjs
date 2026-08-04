#!/usr/bin/env node
// PRIOR-ART: none-external -- this runs THIS repo's own check descriptors
// against their own fixtures. A general test runner (Jest, Vitest, etc.) has
// nothing to say about that shape; the bad/good fixture pairing per check-id
// IS the contract, and no off-the-shelf harness enforces "your linter can
// actually go red" as a build gate. Bespoke governance glue, ported from an
// already-vetted internal guard system.
// verify-gates-can-fail.mjs -- a gate that has never been proven able to go
// RED is not a gate, it is a decoration that reports safety.
//
// WHY THIS EXISTS
// Hash-binding (verify-git-guards.mjs) and count floors catch a guard that
// was TAMPERED WITH after being written correctly. They cannot catch a guard
// that was BORN unable to fail: a regex built from a plain string so a
// metacharacter silently decayed to a literal, an inverted condition, a
// check that always returns "no findings", a rule tested only against text
// that never contained the violation in the first place. None of those are
// caught by running the suite and seeing green, because passing IS what a
// no-op check does. Only a fixture can catch it: a small tree the check MUST
// go red on, and a clean tree it must STAY green on.
//
// CONTRACT for anything under checks/:
//   export default { id: "some-id", run(rootDir, options) => string[] }
//   returns an array of failure strings; empty array = pass.
//   fixtures/<id>/bad/   must produce >= 1 failure   (proves it CAN go red)
//   fixtures/<id>/good/  must produce 0 failures     (proves it is not stuck red)
// A check with no fixtures/<id>/bad/ directory is REPORTED, not failed -- so
// this check is landable on a large pre-existing suite without an
// all-or-nothing cutover; coverage grows one fixture at a time and the gap
// stays visible on every run instead of being silently assumed closed.
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKS = join(HERE, "checks");
const FIXTURES = join(HERE, "fixtures");

const failures = [];
let proven = 0;
const unfixtured = [];

const checkFiles = existsSync(CHECKS)
  ? readdirSync(CHECKS).filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
  : [];
if (!checkFiles.length) {
  console.log("[FAIL] verify-gates-can-fail: no check modules found under checks/ -- cannot verify anything.");
  process.exit(1);
}

for (const file of checkFiles) {
  let mod;
  try {
    mod = await import(pathToFileURL(join(CHECKS, file)).href);
  } catch (e) {
    failures.push(`${file}: will not load (${e.message}) -- a check that cannot load cannot fail either.`);
    continue;
  }
  const d = mod.default;
  if (!d || typeof d.run !== "function" || !d.id) continue;

  const dir = join(FIXTURES, d.id);
  const bad = join(dir, "bad");
  const good = join(dir, "good");
  if (!existsSync(bad)) { unfixtured.push(d.id); continue; }

  const run = (root) => {
    try { return d.run(root, {}) || []; }
    catch (e) { return [`__threw__ ${e.message}`]; }
  };

  const badResult = run(bad);
  if (badResult.length === 0) {
    failures.push(
      `${d.id}: its own bad/ fixture produces NO failure, so this check cannot go red. ` +
      `FIX: either the check's rule is broken (read it against the fixture), ` +
      `or the fixture no longer contains the thing it is meant to trip. One of the two is wrong.`,
    );
  } else if (badResult.some((f) => String(f).startsWith("__threw__"))) {
    failures.push(`${d.id}: threw on its bad/ fixture -- ${badResult[0]}. A check must report, not crash.`);
  } else {
    proven++;
  }

  if (existsSync(good)) {
    const goodResult = run(good);
    if (goodResult.length) {
      failures.push(
        `${d.id}: its own good/ fixture FAILS (${String(goodResult[0]).slice(0, 120)}). ` +
        `A check that flags correct code gets switched off. FIX: narrow the rule, or fix the fixture.`,
      );
    }
  }
}

console.log(`\n=== gates-can-fail: ${proven} check(s) proven able to go red ===`);
if (unfixtured.length) {
  console.log(
    `  ${unfixtured.length} of ${checkFiles.length} check(s) have NO fixture yet and were not verified.\n` +
    `  They are reported, not failed. Add fixtures/<id>/bad (and good) to move one off this list.`,
  );
}
if (failures.length) {
  console.log(`\n[FAIL] ${failures.length} check(s) could not be proven:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("[OK] verify-gates-can-fail GREEN -- every fixtured check goes red on its bad tree and green on its good one.");
