// The PreToolUse hook layer.
//
// rulesync declares the hook in .rulesync/hooks.jsonc and writes the per-agent
// registration. The hook is not a script this repository owns: the declared
// command is gitleaks itself, scanning the tool call's JSON payload from
// stdin. These tests read the command out of hooks.jsonc and run it exactly as
// an agent host would — through a shell, payload on stdin — and assert on the
// real exit code, because exit code 2 is the only thing that stops a tool
// call.
//
// Nothing about the coverage here is typed out by hand. The commands and the
// matcher both come from hooks.jsonc. A tool a fork adds to the matcher
// tomorrow is exercised the moment its declaration lands, or the suite fails
// telling you to add its payload shape.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sh } from "./lib/proc.mjs";
import { CLEAN_CONTENT, LEAKY_CONTENT, REPO_ROOT } from "./lib/scratch.mjs";

const HOOKS_JSONC = join(REPO_ROOT, ".rulesync", "hooks.jsonc");
const hooksSource = existsSync(HOOKS_JSONC) ? readFileSync(HOOKS_JSONC, "utf8") : "";

// Every distinct command hooks.jsonc declares. The main entry and the
// copilot/cline overrides deliberately share one command string, so this is
// normally a set of one, but the suite exercises whatever is actually
// declared rather than assuming.
//
// hooks.jsonc is JSONC, and this reads it with a regex rather than adding a
// parser dependency for one field. A regex that stops matching fails loudly on
// the first test below instead of quietly covering nothing.
// Only the gitleaks guard commands: hooks.jsonc also wires the
// planning-with-files hooks (vendor scripts that inject and gate the plan),
// and those are not secret scanners, so the exit-code assertions below do not
// apply to them. The "hook wiring" suite at the bottom covers them instead.
const COMMANDS = [...new Set([...hooksSource.matchAll(/"command"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))].filter(
  (c) => c.includes("gitleaks stdin"),
);

// The tools under test, read out of the matcher in hooks.jsonc rather than
// listed here. When a hand-picked array said "Write" and the matcher said
// "Write|Edit|MultiEdit|NotebookEdit", an earlier version of this layer was
// registered for NotebookEdit while reading a payload key NotebookEdit does
// not carry, and allowed every notebook write through. The suite stayed green
// because it had never once asked the matcher what it covered.
// Read matchers paired with their command, and keep only the gitleaks
// entries: hooks.jsonc also declares the todo-tool block and the planning
// hooks, whose matchers (TodoWrite and friends, Write|Edit on postToolUse,
// * on preCompact) must not be fed secret payloads here.
const MATCHED_TOOLS = [
  ...new Set(
    [...hooksSource.matchAll(/"matcher"\s*:\s*"([^"]+)"[^{]*?"command"\s*:\s*"([^"]+)"/gs)]
      .filter((m) => m[2].includes("gitleaks stdin"))
      .flatMap((m) => m[1].split("|")),
  ),
];

// The payload key each tool carries its text in. They deliberately do not
// share a name. The declared command scans the whole JSON payload, so no
// per-key extraction exists to get wrong any more — these shapes exist so the
// suite proves that claim against every registered tool's real shape. From the
// agent hook contracts: https://code.claude.com/docs/en/hooks
const TOOL_INPUT = {
  Write: (text) => ({ file_path: "deploy-notes.md", content: text }),
  Edit: (text) => ({ file_path: "deploy-notes.md", old_string: "placeholder", new_string: text }),
  MultiEdit: (text) => ({
    file_path: "deploy-notes.md",
    edits: [{ old_string: "placeholder", new_string: text }],
  }),
  NotebookEdit: (text) => ({ notebook_path: "deploy-notes.ipynb", cell_id: "cell-1", new_source: text }),
};

const TESTABLE_TOOLS = MATCHED_TOOLS.filter((tool) => tool in TOOL_INPUT);

// Claude Code and Codex CLI send this shape and block on exit 2.
function payload(tool, text) {
  return JSON.stringify({
    session_id: "guard-selftest",
    hook_event_name: "PreToolUse",
    tool_name: tool,
    tool_input: TOOL_INPUT[tool](text),
  });
}

// Run a declared hook command the way an agent host does: one command string,
// through a shell, payload on stdin. `shell: true` resolves to /bin/sh on
// POSIX and cmd.exe on Windows; the declared command sticks to syntax both
// accept (`1>&2` included), and this test is what holds it to that.
function runCommand(command, input) {
  const r = spawnSync(command, { shell: true, input, encoding: "utf8", windowsHide: true, cwd: REPO_ROOT });
  if (r.error) return { code: -1, out: "", err: String(r.error.message || r.error) };
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

describe("PreToolUse hook command", () => {
  it("hooks.jsonc declares at least one command", () => {
    assert.ok(
      COMMANDS.length > 0,
      `no "command" value could be read out of ${HOOKS_JSONC}. The rules and skills layers can be read past, but a hook is the only layer that can refuse a tool call, so an empty declaration means nothing is enforced at all.`,
    );
  });

  // The declared command fails OPEN when its binary is missing: a shell that
  // cannot find gitleaks exits 127, and the agent host reads any exit other
  // than 2 as "allow". This test is the named mitigation for that trade — a
  // machine without gitleaks cannot pass `npm run verify`, and CI installs it
  // before running this suite.
  it("gitleaks is on PATH, because the hook fails open without it", () => {
    const r = sh("gitleaks", ["version"]);
    assert.equal(
      r.code,
      0,
      `\`gitleaks version\` did not run (${r.err.trim() || "not found"}). The hook command exits 127 without it and every agent write goes through unscanned. Install it: winget install Gitleaks.Gitleaks / brew install gitleaks / https://github.com/gitleaks/gitleaks/releases`,
    );
  });

  // Without this, a matcher that stops being readable turns every test below
  // into a loop over an empty list, and an empty loop passes.
  it("the matcher in hooks.jsonc names at least one tool", () => {
    assert.ok(
      MATCHED_TOOLS.length > 0,
      `no "matcher" value could be read out of ${HOOKS_JSONC}, so this suite would go on to exercise no tools at all and pass by doing nothing. Either the file declares no matcher, or its shape changed and the pattern in this file has to follow it.`,
    );
  });

  // The test that would have caught the NotebookEdit hole on the day the tool
  // was added to the matcher.
  it("every tool the matcher registers has a payload shape to exercise it with", () => {
    const missing = MATCHED_TOOLS.filter((tool) => !(tool in TOOL_INPUT));
    assert.deepEqual(
      missing,
      [],
      `the matcher in hooks.jsonc registers the hook for ${missing.join(", ")}, and this suite has no payload shape for that tool, so nothing here has ever run the hook against one. Add its tool_input shape to TOOL_INPUT in this file.`,
    );
  });

  // The bad half of the pair, once per tool the matcher claims to cover and
  // once per declared command. A guard that never fires is theatre, and it is
  // theatre per tool.
  for (const tool of TESTABLE_TOOLS) {
    it(`${tool}: blocks a call carrying a credential, with exit code 2`, () => {
      for (const command of COMMANDS) {
        const r = runCommand(command, payload(tool, LEAKY_CONTENT));
        assert.equal(
          r.code,
          2,
          `a ${tool} payload containing a live-shaped AWS key ID reached the tool unblocked (exit ${r.code}). hooks.jsonc registers this command for ${tool}: ${command}\nstderr: ${r.err}`,
        );
      }
    });
  }

  // The good half. A guard that also refuses ordinary work is the guard people
  // learn to switch off, which is worse than no guard at all.
  for (const tool of TESTABLE_TOOLS) {
    it(`${tool}: allows an ordinary call`, () => {
      for (const command of COMMANDS) {
        const r = runCommand(command, payload(tool, CLEAN_CONTENT));
        assert.equal(
          r.code,
          0,
          `the hook blocked a benign ${tool}. That is a false positive, and a false positive is what teaches people to disable the hook.\ncommand: ${command}\nstderr: ${r.err}`,
        );
      }
    });
  }

  it("the redacted refusal names the rule that fired, never the secret", () => {
    for (const command of COMMANDS) {
      const r = runCommand(command, payload(TESTABLE_TOOLS[0] ?? "Write", LEAKY_CONTENT));
      const text = r.out + r.err;
      assert.ok(
        !text.includes(LEAKY_CONTENT.match(/AKIA\w+/)[0]),
        `the refusal printed the planted secret itself. The --redact flag is missing or broken in: ${command}`,
      );
    }
  });

  it("ignores a payload it does not understand instead of blocking it", () => {
    for (const command of COMMANDS) {
      const r = runCommand(command, "not json at all");
      assert.equal(r.code, 0, `the hook blocked on unparseable input. Every tool call would fail.\ncommand: ${command}\nstderr: ${r.err}`);
    }
  });
});

// The invariant this version of the repository added: the hook layer owns no
// code. The command in hooks.jsonc is the vendor's own binary, so there is no
// script here whose field-extraction, exit-code mapping, or JSON parsing can
// rot. This test is what turns that from a README claim into something CI
// enforces.
describe("hook wiring", () => {
  it("hooks.jsonc exists", () => {
    assert.ok(existsSync(HOOKS_JSONC), `${HOOKS_JSONC} is missing, so nothing registers any hook with any agent.`);
  });

  it("no owned hook script exists — the declared commands run maintained binaries only", () => {
    const hookDir = join(REPO_ROOT, ".rulesync", "hooks");
    const stray = existsSync(hookDir) ? readdirSync(hookDir) : [];
    assert.deepEqual(
      stray,
      [],
      `.rulesync/hooks/ holds ${stray.join(", ")}. This repository's hook layer is configuration only; a script there is owned guard code, which is the thing this template exists to avoid. Wire a maintained binary in hooks.jsonc instead.`,
    );
    const allCommands = [...new Set([...hooksSource.matchAll(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]))];
    for (const command of allCommands) {
      // Vendor scripts shipped inside the pinned planning-with-files skill
      // are maintained code, hash-locked by rulesync.lock — the ban is on
      // scripts this repository would own.
      const scriptRefs = [...command.matchAll(/[\w./~$-]+\.(?:mjs|cjs|js|py|sh|ps1)\b/g)].map((m) => m[0]);
      const owned = scriptRefs.filter((p) => !p.includes("skills/planning-with-files/"));
      assert.deepEqual(
        owned,
        [],
        `hooks.jsonc declares "${command}", which runs script file(s) ${owned.join(", ")} that no pinned skill ships. The hook layer is configuration pointing at maintained binaries or pinned vendor skill scripts; anything else is owned code.`,
      );
    }
  });

  // The planning hooks exist because the skill's own frontmatter hooks are
  // stripped by rulesync on publish — the skill installs everywhere and fires
  // nothing, invisibly. This pins the wiring so that silent downgrade cannot
  // come back.
  it("the planning-with-files hooks are wired: inject on prompt, gate on stop", () => {
    assert.ok(
      hooksSource.includes("inject-plan.sh"),
      "hooks.jsonc no longer runs inject-plan.sh, so the plan is never re-injected and the agent forgets it.",
    );
    assert.ok(
      hooksSource.includes("gate-stop.sh"),
      "hooks.jsonc no longer runs gate-stop.sh, so the completion gate is off and a turn can end mid-phase.",
    );
    assert.ok(
      hooksSource.includes("init-session.sh"),
      "hooks.jsonc no longer runs init-session.sh, so no first plan is ever created and the other two hooks stay silent forever.",
    );
  });
});
