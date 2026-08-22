// The Trunk-managed git hook fixture, built once and used by every git guard
// suite in this directory.
//
// Both suites need the identical thing: a throwaway repository holding this
// repository's real .trunk/trunk.yaml, with real hooks written by
// `trunk git-hooks sync`. Building it in one place is what keeps the commit
// suite and the push suite testing the same wiring instead of two lookalikes
// that drift apart.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, sh } from "./proc.mjs";
import { REPO_ROOT, rmrf, scratchPath, scratchRepo } from "./scratch.mjs";

// Trunk ships as a launcher script, which on Windows is a .cmd that Node will
// not spawn without a shell. Every argument any caller passes is a fixed
// literal, so there is nothing here for a shell to interpolate.
export function trunk(args, cwd) {
  return sh(["trunk", ...args].join(" "), [], { cwd, shell: true });
}

// Trunk leaves a daemon running that watches the repository it was invoked in,
// and on Windows that open handle makes the directory undeletable. Shutting the
// daemon down first is what releases it. Harmless if none is running, and
// harmless to the daemon for the real repository, which restarts on demand.
export function releaseScratch(dir) {
  if (existsSync(join(dir, ".trunk", "trunk.yaml"))) trunk(["daemon", "shutdown"], dir);
  rmrf(dir);
}

// Returns { repo, seedSha }. The repository has one commit, the copied
// trunk.yaml, and both git hooks installed and pointed at by core.hooksPath.
export function trunkScratchRepo(name) {
  const version = trunk(["--version"], REPO_ROOT);
  assert.equal(
    version.code,
    0,
    "trunk is not runnable on this machine, so the git guard layer cannot be exercised. Install it from https://docs.trunk.io/cli. This is reported as a failure, not skipped, because a guard nobody can run is the failure.",
  );

  const trunkYaml = join(REPO_ROOT, ".trunk", "trunk.yaml");
  assert.ok(existsSync(trunkYaml), `${trunkYaml} is missing, so no git guard is configured at all.`);

  releaseScratch(scratchPath(name)); // in case an earlier run died before its own cleanup
  const repo = scratchRepo(name);
  mkdirSync(join(repo, ".trunk"), { recursive: true });
  copyFileSync(trunkYaml, join(repo, ".trunk", "trunk.yaml"));

  // Trunk drops symlinks to its cache next to trunk.yaml. They are not part of
  // the fixture and staging them would confuse the checks that read the staged
  // file list. info/exclude keeps them out without adding a file the scratch
  // repository would then have to commit.
  writeFileSync(
    join(repo, ".git", "info", "exclude"),
    ".trunk/actions\n.trunk/logs\n.trunk/notifications\n.trunk/out\n.trunk/plugins\n.trunk/tools\n",
    "utf8",
  );

  // Trunk's commit-time check compares the staged tree against HEAD, so the
  // repository needs one commit before any of this means anything. The seed is
  // committed with --no-verify because the guards are not installed yet.
  git(["add", ".trunk/trunk.yaml"], { cwd: repo });
  const seed = git(["commit", "--no-verify", "-q", "-m", "seed"], { cwd: repo });
  assert.equal(seed.code, 0, `fixture setup failed, the seed commit did not land: ${seed.out}${seed.err}`);

  const sync = trunk(["git-hooks", "sync", "--no-progress"], repo);
  assert.equal(sync.code, 0, `trunk git-hooks sync failed in the scratch repository: ${sync.out}${sync.err}`);
  assert.notEqual(
    git(["config", "core.hooksPath"], { cwd: repo }).out.trim(),
    "",
    "trunk git-hooks sync reported success but set no core.hooksPath, so git would still run no hook.",
  );

  return { repo, seedSha: git(["rev-parse", "HEAD"], { cwd: repo }).out.trim() };
}
