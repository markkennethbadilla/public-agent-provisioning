// Process helper shared by every test in this directory. One job. Run a
// command, capture the exit code and both output streams as plain strings, and
// never throw on a non-zero exit. "The guard refused this" is a result to
// assert on, not an error to catch.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Trunk's git-hook callback goes non-blocking when it detects a CI
// environment: it still runs the check and prints the finding ("Check run
// skipped by user"), but exits 0 and lets the commit or push through, on the
// theory that CI re-runs the same check anyway. Reasonable for a real
// pipeline, fatal for this suite, whose whole subject is whether the hook
// blocks. The detection reaches the hook two ways — the environment of the
// git process that fires it, and the long-lived trunk daemon, which keeps the
// environment it was first spawned with — so BOTH the git calls and every
// trunk invocation (which is what starts the daemon) must run with the CI
// markers removed. That is why this lives here, in the one place both spawn
// paths share, and not in the git helper alone.
export function ciBlindEnv() {
  const env = { ...process.env };
  for (const v of ["CI", "GITHUB_ACTIONS", "GITHUB_RUN_ID", "GITHUB_WORKFLOW", "GITHUB_EVENT_NAME"]) delete env[v];
  return env;
}

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
    ...ciBlindEnv(),
    GIT_CONFIG_GLOBAL: empty,
    GIT_CONFIG_SYSTEM: empty,
    GIT_AUTHOR_NAME: "Guard Selftest",
    GIT_AUTHOR_EMAIL: "guard-selftest@example.invalid",
    GIT_COMMITTER_NAME: "Guard Selftest",
    GIT_COMMITTER_EMAIL: "guard-selftest@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
    // Trunk skips a pre-push check when it believes no terminal exists
    // ("Check run skipped by user") — true on the Linux CI runner, where
    // stderr is a pipe. The commit hook runs headless regardless; only the
    // push hook consults the TTY. TRUNK_STDIN_IS_TTY is the hook wrapper's own flag
    // — it sets it when it finds a terminal and passes an inherited value through untouched, so exporting it here makes the callback treat the run as attended.
    TRUNK_STDIN_IS_TTY: "1",
    ...extra,
  };
}

export function git(args, opts = {}) {
  return sh("git", args, { ...opts, env: isolatedEnv(opts.env) });
}
