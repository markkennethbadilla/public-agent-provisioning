#!/usr/bin/env node
// PRIOR-ART: https://github.com/Tripwire/tripwire-open-source -- Tripwire
// (and AIDE) are the standard file-integrity monitors and own "did this file
// change" properly: signed baselines, scheduled scans, tamper-evident DBs.
// Not adopted here because they are host-wide IDS daemons needing their own
// install and policy language for a large surface; this answers one narrow
// question ("do these hooks match the git-controlled copies right now") with
// a hash compare against git itself, which is already the signed baseline.
// verify-git-guards.mjs -- proves the git guards in
// 04-git-guards-that-block-commits-and-pushes/ are actually LIVE on this
// machine, not merely present in the repo.
//
// WHY THIS EXISTS: an installer that copies pre-commit/pre-push somewhere and
// sets core.hooksPath is a pure SETTER. Nothing asserts afterwards that it
// worked. If core.hooksPath is unset (fresh clone, a `git config --unset`, a
// second git install writing its own value) or the live copies drift from
// the reviewed source, git silently stops running the guards -- no error,
// no warning. Commits carrying secrets or mega-files sail straight through,
// and every later "the guard would have blocked that" assumption is false.
// This check turns that silent failure into a loud, deterministic one.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_HOOKS = join(REPO_ROOT, "04-git-guards-that-block-commits-and-pushes");
const HOOKS = ["pre-commit", "pre-push"];

const failures = [];
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

function gitConfig(key) {
  try {
    return execFileSync("git", ["config", "--get", key], { encoding: "utf8" }).trim();
  } catch {
    return ""; // unset -- git exits 1, which is a real finding, not a crash
  }
}

// 1. core.hooksPath must be set. Where it points is checked as a filesystem
//    fact below (byte-parity), so we don't hardcode an expected path here --
//    this template supports both "point hooksPath directly at this folder"
//    and "copy the hooks to a stable location" installs.
const livePath = gitConfig("core.hooksPath");
if (!livePath) {
  failures.push("core.hooksPath is UNSET -- git is running NO hooks; the pre-commit/pre-push guards are entirely inactive");
} else {
  const liveDir = resolve(livePath.replace(/\//g, process.platform === "win32" ? "\\" : "/"));
  // 2. The live hooks must be byte-identical to the reviewed repo copies.
  for (const h of HOOKS) {
    const src = join(REPO_HOOKS, h);
    const dst = join(liveDir, h);
    if (!existsSync(src)) {
      failures.push(`04-git-guards-that-block-commits-and-pushes/${h} MISSING from the repo -- the source of truth for this guard is gone`);
      continue;
    }
    if (!existsSync(dst)) {
      failures.push(`${dst} MISSING -- core.hooksPath points here but the ${h} guard is not installed, so it blocks nothing`);
      continue;
    }
    if (sha(src) !== sha(dst)) {
      failures.push(`${h}: live copy at ${dst} DIFFERS from the reviewed repo copy -- the running guard is not the reviewed one`);
    }
  }
  // 3. If the live location is NOT this repo's own hook directory (a
  //    "copied elsewhere" install), a .guard-root pointer must sit beside
  //    the live hooks so pre-commit's self-integrity section (7) can find
  //    this repo from any other repo on the machine.
  if (resolve(liveDir) !== resolve(REPO_HOOKS)) {
    const ptr = join(liveDir, ".guard-root");
    if (!existsSync(ptr)) {
      failures.push(`${ptr} MISSING -- pre-commit cannot find this template's self-checks from other repos, so its own self-integrity section silently no-ops`);
    } else {
      const target = readFileSync(ptr, "utf8").trim();
      if (resolve(target) !== resolve(REPO_ROOT)) {
        failures.push(`.guard-root points at "${target}" but this template is at "${REPO_ROOT}" -- the guard being verified elsewhere is a DIFFERENT, likely stale, checkout`);
      }
    }
  }
}

// 4. gitleaks must resolve. pre-commit hard-depends on it for the secret
//    scan; if it is absent the scan is skipped and secrets commit undetected.
try {
  execFileSync(process.platform === "win32" ? "where" : "which", ["gitleaks"], { stdio: "ignore" });
} catch {
  failures.push("gitleaks NOT on PATH -- the pre-commit secrets scan cannot run, so secrets would commit undetected");
}

// 5. Credential-prompt settings. An interactive popup stalls an unattended
//    push forever, which is a hands-free defect, not merely cosmetic.
for (const [key, want] of [
  ["credential.guiPrompt", "false"],
  ["credential.interactive", "false"],
]) {
  const got = gitConfig(key);
  if (got && got !== want) {
    failures.push(`${key} = ${got} (want ${want}) -- a credential popup can stall an unattended push`);
  }
}

// 6. core.excludesFile, if configured, must actually exist -- otherwise git
//    silently applies NO global ignores and the misconfiguration is invisible.
const excludesPath = gitConfig("core.excludesFile");
if (excludesPath && !existsSync(excludesPath)) {
  failures.push(`core.excludesFile = ${excludesPath} but that file does not exist -- git is applying NO global ignores`);
}

if (failures.length > 0) {
  console.error("verify-git-guards: FAIL -- the git guards are not fully live on this machine");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("  FIX: re-run your installer (idempotent) to restore them.");
  console.error("       If a hook changed intentionally, change it IN 04-git-guards-that-block-commits-and-pushes/ and re-run -- never edit the live copy directly.");
  process.exit(1);
}
console.log(`verify-git-guards: PASS -- hooksPath live, ${HOOKS.length} hooks byte-identical, gitleaks resolvable, popups muted, global excludes applied.`);
