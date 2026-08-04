#!/usr/bin/env node
// PRIOR-ART: none-external -- a ~20-line spawnSync wrapper. child_process is
// already the standard library primitive for this; nothing to adopt.
// proc.mjs -- tiny synchronous-process helper shared by every scratch-repo
// scenario. One job: run a command, capture exit code + stdout + stderr as
// plain strings, never throw on a nonzero exit (a "the guard blocked this"
// result is data, not an error).
import { spawnSync } from "node:child_process";

export function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    windowsHide: true,
    ...opts,
  });
  if (r.error) {
    return { code: -1, out: "", err: String(r.error.message || r.error) };
  }
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

// git() always runs through this so every invocation, everywhere in this
// suite, gets the SAME isolation: a config scope that cannot see the host
// machine's real ~/.gitconfig or /etc/gitconfig. Without this, a check that
// reads "core.hooksPath" or "credential.*" (pre-commit section 7 does,
// nested) would silently pick up whatever the machine running this suite
// happens to have configured -- making the result depend on WHO runs it and
// WHERE, which is the opposite of a self-check.
export function git(args, opts = {}) {
  return sh("git", args, { ...opts, env: { ...isolatedEnv(), ...opts.env } });
}

let _emptyConfigPath;
export function isolatedEnv(extra = {}) {
  return {
    ...process.env,
    // Point BOTH global and system config scopes at a file that is never
    // written to. A missing/empty file is valid git config (empty), so this
    // fully blinds every git call in this suite to the host's real config --
    // proven once at the top of verify-guards.mjs by setEmptyConfigPath().
    GIT_CONFIG_GLOBAL: _emptyConfigPath,
    GIT_CONFIG_SYSTEM: _emptyConfigPath,
    GIT_AUTHOR_NAME: "Guard Selftest",
    GIT_AUTHOR_EMAIL: "guard-selftest@example.invalid",
    GIT_COMMITTER_NAME: "Guard Selftest",
    GIT_COMMITTER_EMAIL: "guard-selftest@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

export function setEmptyConfigPath(p) {
  _emptyConfigPath = p;
}
