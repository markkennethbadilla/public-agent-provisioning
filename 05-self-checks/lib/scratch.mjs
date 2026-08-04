#!/usr/bin/env node
// PRIOR-ART: none-external -- a scratch-git-repo factory for testing shell
// hooks end to end. No general test runner ships this (it is specific to
// "exercise a real pre-commit/pre-push against a throwaway repo"); bespoke
// glue over plain git plumbing.
// scratch.mjs -- builds a throwaway, self-consistent copy of the guard layer
// (04-git-guards-that-block-commits-and-pushes + its sibling self-checks) in
// the OS temp dir, plus a factory for scratch repos that point at it. Every
// repo this creates lives under <tmproot> and is deleted by cleanup(); the
// real repo this template ships in is never touched, never committed to,
// never pushed to.
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { git, setEmptyConfigPath } from "./proc.mjs";

const ACCOUNT_FRAGMENT = "guard-selftest-owned"; // must appear in a repo's path to be "owned"
const ACCOUNT_OWNER = "selftest-owner"; // must appear in the remote URL for the same repo

export function makeScratch(publicRepoRoot) {
  const root = mkdtempSync(join(tmpdir(), "verify-guards-"));
  const emptyConfig = join(root, "empty.gitconfig");
  writeFileSync(emptyConfig, "");
  setEmptyConfigPath(emptyConfig);

  // The self-consistent guard root: a byte-for-byte copy of the real
  // 04-git-guards-.../ and 05-checks-.../ directories, turned into its own
  // tiny git repo whose LOCAL core.hooksPath points at its OWN copied hooks.
  // That self-reference is what lets pre-commit's section 7 (which always
  // re-checks "is the guard layer that PROTECTS THIS COMMIT itself intact")
  // pass cleanly for every ordinary scenario: reviewed copy and live copy
  // are, by construction, the same bytes.
  const guardRoot = join(root, "_guardroot");
  mkdirSync(guardRoot, { recursive: true });
  cpSync(
    join(publicRepoRoot, "04-git-guards-that-block-commits-and-pushes"),
    join(guardRoot, "04-git-guards-that-block-commits-and-pushes"),
    { recursive: true },
  );
  cpSync(
    join(publicRepoRoot, "05-self-checks"),
    join(guardRoot, "05-self-checks"),
    { recursive: true },
  );
  const guardHooksDir = join(guardRoot, "04-git-guards-that-block-commits-and-pushes");
  git(["init", "-q", "-b", "main"], { cwd: guardRoot });
  git(["config", "core.hooksPath", posix(guardHooksDir)], { cwd: guardRoot });

  return { root, emptyConfig, guardRoot, guardHooksDir };
}

export function posix(p) {
  return p.replace(/\\/g, "/");
}

let repoCounter = 0;
export function newRepo(scratch, { owned = false, name } = {}) {
  repoCounter += 1;
  const dirName = name || `repo-${repoCounter}`;
  const fragment = owned ? ACCOUNT_FRAGMENT : "guard-selftest-external";
  const repoDir = join(scratch.root, fragment, dirName);
  mkdirSync(repoDir, { recursive: true });
  git(["init", "-q", "-b", "main"], { cwd: repoDir });
  git(["config", "core.hooksPath", posix(scratch.guardHooksDir)], { cwd: repoDir });
  return repoDir;
}

export function pointHooksAt(repoDir, hooksDir) {
  git(["config", "core.hooksPath", posix(hooksDir)], { cwd: repoDir });
}

export function writeGuardrc(repoDir, lines) {
  const body = Object.entries(lines)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join("\n");
  writeFileSync(join(repoDir, ".guardrc"), body + "\n", "utf8");
}

export function ownedGuardrc(extra = {}) {
  return { ACCOUNT_MAP: `${ACCOUNT_FRAGMENT}=${ACCOUNT_OWNER}`, ...extra };
}

export function bareRemote(scratch, { owned = false, name } = {}) {
  repoCounter += 1;
  const dirName = name || `remote-${repoCounter}`;
  // The remote's OWN path must contain ACCOUNT_OWNER for the "owned" side of
  // pre-push's ownership classifier (it matches the remote URL, not the
  // repo path) to resolve is_owned=1 when a caller wants that.
  const parent = owned ? join(scratch.root, `${ACCOUNT_OWNER}-remotes`) : join(scratch.root, "external-remotes");
  mkdirSync(parent, { recursive: true });
  const bareDir = join(parent, `${dirName}.git`);
  git(["init", "-q", "--bare", "-b", "main", bareDir]);
  return bareDir;
}

export function writeFiles(repoDir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(repoDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf8");
  }
}

export function stage(repoDir) {
  git(["add", "-A"], { cwd: repoDir });
}

export function commit(repoDir, message, env = {}) {
  return git(["commit", "-q", "-m", message], { cwd: repoDir, env });
}

// A setup step (seeding a repo before the actual scenario) that MUST
// succeed -- if it doesn't, the scenario's fixture is broken, not the guard
// under test, so this throws loudly instead of silently mis-scoring a row.
export function seed(repoDir, files, message, env = {}) {
  writeFiles(repoDir, files);
  stage(repoDir);
  const r = commit(repoDir, message, env);
  if (r.code !== 0) {
    throw new Error(`fixture setup commit failed in ${basename(repoDir)} (this is a bug in the scenario, not the guard):\n${r.out}${r.err}`);
  }
  return r;
}

// Stage + commit WITHOUT throwing on a nonzero exit -- for a scenario, a
// blocked commit is an expected, inspectable result, not a bug.
export function attemptCommit(repoDir, files, message, env = {}) {
  writeFiles(repoDir, files);
  stage(repoDir);
  const r = commit(repoDir, message, env);
  return { blocked: r.code !== 0, code: r.code, out: r.out, err: r.err };
}

export function push(repoDir, args, env = {}) {
  return git(["push", ...args], { cwd: repoDir, env });
}

// A baseline push a scenario needs to establish remote state before the
// actual test -- if THIS fails, the scenario's fixture is broken, not the
// guard, so it throws instead of silently mis-scoring the real assertion.
export function mustPush(repoDir, args, env = {}) {
  const r = push(repoDir, args, env);
  if (r.code !== 0) {
    throw new Error(`fixture baseline push failed in ${basename(repoDir)} (this is a bug in the scenario, not the guard):\n${r.out}${r.err}`);
  }
  return r;
}

export function cleanup(scratch) {
  rmSync(scratch.root, { recursive: true, force: true });
}

export { ACCOUNT_FRAGMENT, ACCOUNT_OWNER };
