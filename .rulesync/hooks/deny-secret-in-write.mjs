#!/usr/bin/env node
// PreToolUse guard. Blocks a file write whose content contains a credential.
//
// This file contains zero detection logic on purpose. gitleaks ships roughly
// 200 maintained rules with entropy scoring and an allowlist; a hand-written
// regex list is a worse copy of it that nobody updates. All this script does is
// unwrap the hook payload, hand the text to gitleaks, and turn a finding into
// exit code 2.
//
// Contract (https://code.claude.com/docs/en/hooks):
//   stdin  = JSON with tool_name and tool_input
//   exit 0 = allow, exit 2 = deny and show stderr to the agent
import { spawnSync } from "node:child_process";

const raw = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (buf += chunk));
  process.stdin.on("end", () => resolve(buf));
});

let input;
try {
  input = JSON.parse(raw).tool_input ?? {};
} catch {
  process.exit(0); // not a payload we understand, not ours to block
}

// One key per tool the matcher registers, and they do not share a name.
//   Write        content
//   Edit         new_string
//   MultiEdit    edits[].new_string
//   NotebookEdit new_source
//
// new_source is the one that bites. NotebookEdit was in the matcher while this
// list read only the first three, so every notebook write was handed an empty
// string, hit the blank-input exit below, and was allowed. A guard registered
// for a tool it silently ignores is the exact defect this repository exists to
// catch, and it took an adversarial test to find it rather than a reading.
// Adding a tool to the matcher means adding its payload key here.
const text = [
  input.content,
  input.new_string,
  input.new_source,
  ...(input.edits ?? []).map((e) => e?.new_string ?? e?.new_source),
]
  .filter((v) => typeof v === "string")
  .join("\n");
if (!text.trim()) process.exit(0);

const scan = spawnSync("gitleaks", ["stdin", "--no-banner", "--redact", "--report-format", "json", "--report-path", "-"], {
  input: text,
  encoding: "utf8",
});

if (scan.error) {
  // Fail closed. A secret guard that silently disables itself when its detector
  // is missing is worse than no guard, because it still reads like protection.
  console.error("deny-secret-in-write: gitleaks is not on PATH. Install it (https://github.com/gitleaks/gitleaks) or remove this hook from .rulesync/hooks.jsonc.");
  process.exit(2);
}
if (scan.status === 0) process.exit(0);

const rules = [...new Set(JSON.parse(scan.stdout || "[]").map((f) => f.RuleID))].join(", ");
console.error(`deny-secret-in-write: gitleaks matched ${rules || "a secret"} in this write. Move the value to an environment variable or a secrets manager. If it is a false positive, add a gitleaks:allow comment on that line.`);
process.exit(2);
