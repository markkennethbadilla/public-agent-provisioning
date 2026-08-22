// Process helper shared by every test in this directory. One job. Run a
// command, capture the exit code and both output streams as plain strings, and
// never throw on a non-zero exit. "The guard refused this" is a result to
// assert on, not an error to catch.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, ...opts });
  if (r.error) return { code: -1, out: "", err: String(r.error.message || r.error) };
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

// Every git call in this suite runs with both the global and the system config
// scope pointed at an empty file, so no test can read or write the real
// ~/.gitconfig of whoever runs it. Without this, a guard that reads
// core.hooksPath or credential.* would silently inherit the host machine's
// settings, and the suite would give a different answer per laptop. An empty
// file is valid, empty git config, which is exactly the blindfold wanted here.
// The file is created on first use and removed when the process exits, so
// nothing has to remember to set it up first.
let emptyConfig;
function emptyGitConfig() {
  if (emptyConfig) return emptyConfig;
  const dir = mkdtempSync(join(tmpdir(), "agent-provisioning-gitcfg-"));
  emptyConfig = join(dir, "empty.gitconfig");
  writeFileSync(emptyConfig, "");
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return emptyConfig;
}

export function isolatedEnv(extra = {}) {
  const empty = emptyGitConfig();
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: empty,
    GIT_CONFIG_SYSTEM: empty,
    GIT_AUTHOR_NAME: "Guard Selftest",
    GIT_AUTHOR_EMAIL: "guard-selftest@example.invalid",
    GIT_COMMITTER_NAME: "Guard Selftest",
    GIT_COMMITTER_EMAIL: "guard-selftest@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

export function git(args, opts = {}) {
  return sh("git", args, { ...opts, env: isolatedEnv(opts.env) });
}
