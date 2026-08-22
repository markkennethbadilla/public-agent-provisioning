// Throwaway git repositories and the two fixture strings every guard test
// feeds its guard. Everything here lives under the operating system temporary
// directory. This repository's own git history, working tree and remotes are
// never read from or written to.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { git } from "./proc.mjs";

export const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// A fixed directory rather than a fresh mkdtemp per run. Trunk caches its
// downloaded linters per repository path, so a stable path means the second run
// reuses the first run's cache instead of paying the download again. The
// directory is deleted and rebuilt at the start of every run, so a stale path
// can never leak state from one run into the next.
const SELFTEST_ROOT = join(tmpdir(), "agent-provisioning-selftest");

// Windows note. A single recursive rmSync on a directory that holds the
// symlinks Trunk drops into .trunk/ fails with EPERM, and the retry setting
// Node documents for EPERM does not clear it. Removing the entries one level
// down first, then the directory itself, does work. Verified on Windows 11 with
// Node 24.19.0. On Linux and macOS both forms behave the same.
export function rmrf(dir) {
  if (!existsSync(dir)) return;
  const opts = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 };
  for (const entry of readdirSync(dir)) rmSync(join(dir, entry), opts);
  rmSync(dir, opts);
}

export function scratchPath(name) {
  return join(SELFTEST_ROOT, name);
}

export function scratchDir(name) {
  const dir = scratchPath(name);
  rmrf(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function scratchRepo(name) {
  const dir = scratchDir(name);
  git(["init", "-q", "-b", "main"], { cwd: dir });
  return dir;
}

export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf8");
  }
}

// The planted credential.
//
// Two constraints pull against each other here. The string handed to a guard
// has to be one gitleaks really matches, otherwise the test proves nothing. The
// same string sitting in this file must not match, otherwise the repository
// cannot commit its own test suite past its own secret scanner.
//
// Splitting the token into fragments satisfies both. gitleaks scans file text,
// so the twenty character AWS key ID exists only at runtime, after join(), and
// no fragment on its own carries enough entropy to trip the generic rule.
//
// The value is synthetic and was never issued by any provider. It is
// deliberately NOT the AKIAIOSFODNN7EXAMPLE key from the AWS documentation.
// gitleaks 8.30.1 treats that one as a published placeholder and reports no
// finding for it, verified on this machine, so a fixture built on it would have
// been a test that always passed for the wrong reason.
const FAKE_AWS_KEY_ID = ["AKIA", "3XQZP7RB", "2NLKWJ4C"].join("");

export const LEAKY_CONTENT = `# deploy notes\naws_access_key_id = ${FAKE_AWS_KEY_ID}\n`;

export const CLEAN_CONTENT = "# deploy notes\nRead the key from the environment at startup.\n";
