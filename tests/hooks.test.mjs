// The PreToolUse hook layer.
//
// rulesync declares the hooks in .rulesync/hooks.jsonc and writes the
// per-agent registration. The hook body shells out to gitleaks. These tests
// never look inside the hook and never assert on its message text. They feed it
// a real payload and read the real exit code, because exit code 2 is the only
// thing that stops a tool call.
//
// Nothing about the coverage here is typed out by hand. The hooks come from the
// directory, and the tools come from the matcher in hooks.jsonc. A hook or a
// tool a fork adds tomorrow is exercised the moment its declaration lands.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sh } from "./lib/proc.mjs";
import { CLEAN_CONTENT, LEAKY_CONTENT, REPO_ROOT } from "./lib/scratch.mjs";

const HOOK_DIR = join(REPO_ROOT, ".rulesync", "hooks");
const HOOKS_JSONC = join(REPO_ROOT, ".rulesync", "hooks.jsonc");

const hookFiles = existsSync(HOOK_DIR) ? readdirSync(HOOK_DIR).filter((f) => f.endsWith(".mjs")) : [];
const hooksSource = existsSync(HOOKS_JSONC) ? readFileSync(HOOKS_JSONC, "utf8") : "";

// The tools under test, read out of the matcher in hooks.jsonc rather than
// listed here.
//
// This is the whole point of the file. hooks.jsonc is what decides which tools
// the hook is registered for, so it is the only honest source for which tools
// have to be exercised. When a hand-picked array said "Write" and the matcher
// said "Write|Edit|MultiEdit|NotebookEdit", the hook was registered for
// NotebookEdit while reading a payload key NotebookEdit does not carry, was
// handed an empty string, and allowed every notebook write through. The suite
// stayed green because it had never once asked the matcher what it covered.
// That is the same defect as this repository's old pre-push check, which was
// documented in three places and was a no-op in the shipped script.
//
// hooks.jsonc is JSONC, and this reads it with the same regex approach the
// wiring tests below already use on it rather than adding a parser dependency
// for two fields. A regex that stops matching fails loudly on the first test in
// this suite instead of quietly covering nothing.
const MATCHED_TOOLS = [
  ...new Set([...hooksSource.matchAll(/"matcher"\s*:\s*"([^"]+)"/g)].flatMap((m) => m[1].split("|"))),
];

// The payload key each tool carries its text in. They deliberately do not share
// a name, which is exactly how a hook ends up registered for a tool it reads
// nothing from. Shapes are from the agent hook contracts:
// https://code.claude.com/docs/en/hooks
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

function runHook(file, input) {
  return sh(process.execPath, [join(HOOK_DIR, file)], { input, cwd: REPO_ROOT });
}

describe("PreToolUse hooks", () => {
  it("at least one hook exists to exercise", () => {
    assert.ok(
      hookFiles.length > 0,
      `no *.mjs hook found in ${HOOK_DIR}. The rules and skills layers can be read past, but a hook is the only layer that can refuse a tool call, so an empty hook directory means nothing is enforced at all.`,
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
      `the matcher in hooks.jsonc registers the hook for ${missing.join(", ")}, and this suite has no payload shape for that tool, so nothing here has ever run the hook against one. Add its tool_input shape to TOOL_INPUT in this file, and add the key that shape carries its text in to the key list in .rulesync/hooks/deny-secret-in-write.mjs. A tool in the matcher that the hook script reads no key for is allowed through every time, silently.`,
    );
  });

  // The bad half of the pair, once per tool the matcher claims to cover. A
  // guard that never fires is theatre, and it is theatre per tool.
  for (const tool of TESTABLE_TOOLS) {
    it(`${tool}: blocks a call carrying a credential, with exit code 2`, () => {
      const blocking = hookFiles.filter((f) => runHook(f, payload(tool, LEAKY_CONTENT)).code === 2);
      assert.ok(
        blocking.length > 0,
        `a ${tool} payload containing a live-shaped AWS key ID reached the tool unblocked. hooks.jsonc registers the hook for ${tool}, so this is a registration that reads nothing from the payload it was given. Hooks tried: ${hookFiles.join(", ") || "(none)"}.`,
      );
    });
  }

  // The good half. A guard that also refuses ordinary work is the guard people
  // learn to switch off, which is worse than no guard at all.
  for (const tool of TESTABLE_TOOLS) {
    it(`${tool}: allows an ordinary call`, () => {
      for (const file of hookFiles) {
        const r = runHook(file, payload(tool, CLEAN_CONTENT));
        assert.equal(
          r.code,
          0,
          `${file} blocked a benign ${tool}. That is a false positive, and a false positive is what teaches people to disable the hook.\nstderr: ${r.err}`,
        );
      }
    });
  }

  it("ignores a payload it does not understand instead of blocking it", () => {
    for (const file of hookFiles) {
      const r = runHook(file, "not json at all");
      assert.equal(r.code, 0, `${file} blocked on unparseable input. Every tool call would fail.\nstderr: ${r.err}`);
    }
  });
});

// The regression test for this repository's worst historical bug. A pre-push
// check was described in three separate documents and was, in the shipped
// script, a single line that evaluated a variable and did nothing with it. It
// stayed broken because coverage was a hand-picked list rather than something
// read from the files that declare the guards.
//
// Both directions matter. A hook file nothing registers never runs. A
// registration pointing at a missing file fails open on some agents and hard on
// others.
describe("hook wiring", () => {
  it("hooks.jsonc exists", () => {
    assert.ok(existsSync(HOOKS_JSONC), `${HOOKS_JSONC} is missing, so nothing registers any hook with any agent.`);
  });

  it("every hook file on disk is referenced by hooks.jsonc", () => {
    for (const file of hookFiles) {
      assert.ok(
        hooksSource.includes(file),
        `.rulesync/hooks/${file} exists but hooks.jsonc never names it, so no agent runs it. Dead code that reads like protection.`,
      );
    }
  });

  it("every hook path named in hooks.jsonc exists on disk", () => {
    const referenced = [...hooksSource.matchAll(/[\w./-]*\.rulesync\/hooks\/([\w.-]+\.mjs)/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, "hooks.jsonc names no hook script under .rulesync/hooks/.");
    for (const name of new Set(referenced)) {
      assert.ok(existsSync(join(HOOK_DIR, name)), `hooks.jsonc points at .rulesync/hooks/${name}, which does not exist.`);
    }
  });
});
