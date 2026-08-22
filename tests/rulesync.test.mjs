// Drift between the source of the rules and the files the agents actually
// read.
//
// rulesync writes CLAUDE.md, AGENTS.md, .cursor/rules/ and the rest from
// .rulesync/. Those written files are committed, so anyone can edit one
// directly, and the edit survives until the next regenerate silently discards
// it. `rulesync generate --check` is the maintained answer. It regenerates in
// memory, compares, and exits 1 on any difference.
//
// Two tests, because a checker only proves something when both answers have
// been seen. One asserts this repository is in sync right now. One edits a
// generated file out of band, in a scratch project, and asserts the check goes
// red.
import assert from "node:assert/strict";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sh } from "./lib/proc.mjs";
import { REPO_ROOT, scratchDir, writeFiles } from "./lib/scratch.mjs";

// The installed CLI entry point, run through this Node. Going through npx or
// the .bin shim would add a package manager and a shell to something that is
// already a plain script.
const RULESYNC_CLI = join(REPO_ROOT, "node_modules", "rulesync", "dist", "cli", "index.js");

function rulesync(args, cwd) {
  return sh(process.execPath, [RULESYNC_CLI, ...args], { cwd });
}

describe("rulesync generate --check", () => {
  it("the CLI is installed", () => {
    assert.ok(existsSync(RULESYNC_CLI), `${RULESYNC_CLI} is missing. Run npm install first.`);
  });

  it("is green for this repository as committed", () => {
    const r = rulesync(["generate", "--check"], REPO_ROOT);
    assert.equal(
      r.code,
      0,
      `the generated files in this repository no longer match .rulesync/. Run npx rulesync generate and commit the result.\n${r.out}${r.err}`,
    );
  });

  it("goes red when a generated file is edited out of band", () => {
    const dir = scratchDir("rulesync-drift");
    writeFiles(dir, {
      "rulesync.jsonc": '{ "targets": ["claudecode"], "features": ["rules"], "delete": false }\n',
      ".rulesync/rules/scratch.md":
        '---\nroot: true\ntargets: ["*"]\ndescription: "Scratch rule for the drift test"\nglobs: ["**/*"]\n---\n\n# Scratch rule\n\nOne sentence, so the generated file has something in it.\n',
    });

    const generated = rulesync(["generate"], dir);
    assert.equal(generated.code, 0, `fixture setup failed, rulesync could not generate: ${generated.out}${generated.err}`);

    const claudeMd = join(dir, "CLAUDE.md");
    assert.ok(existsSync(claudeMd), "fixture setup failed, rulesync generated no CLAUDE.md to edit.");

    // The good half. Untouched output is in sync.
    const clean = rulesync(["generate", "--check"], dir);
    assert.equal(clean.code, 0, `--check called untouched output out of date: ${clean.out}${clean.err}`);

    // The bad half. This is the edit a person makes when they fix a rule in the
    // generated file instead of in .rulesync/.
    appendFileSync(claudeMd, "\nHand-edited after generation.\n", "utf8");
    const drifted = rulesync(["generate", "--check"], dir);
    assert.equal(
      drifted.code,
      1,
      `--check returned ${drifted.code} for a hand-edited CLAUDE.md. A drift check that cannot see an edit is not a drift check.\n${drifted.out}${drifted.err}`,
    );
  });
});
