// The OpenCode parity layer.
//
// OpenCode reads the same rules, skills, hooks, permissions and MCP servers
// as every other target, but it has no orchestrator, no background subagents
// and no Stop hook that can keep a turn going. oh-my-openagent is the
// maintained plugin that adds those. This repository pins it in
// opencode.jsonc and configures it from .omo/omo.jsonc, where every plugin
// feature that duplicates a layer this repository already owns is switched
// off. These tests pin both halves: the plugin stays pinned to an exact
// version, and the duplicate hooks stay disabled.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { REPO_ROOT } from "./lib/scratch.mjs";

// Hooks the plugin ships that this repository already provides through a
// different owner. Each one, left on, runs the job twice or fights the file
// plan. The comments in .omo/omo.jsonc say which owner replaces each.
const DUPLICATE_HOOKS = [
  "claude-code-hooks",
  "auto-update-checker",
  "startup-toast",
  "tasks-todowrite-disabler",
  "todo-continuation-enforcer",
  "compaction-todo-preserver",
  "todo-description-override",
  "rules-injector",
];

// .omo/omo.jsonc carries comments, and only the line-comment form, so a
// parser dependency for one file is not worth adding. Full-line comments
// come out; everything else is JSON.
function readJsonc(path) {
  const text = readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(text);
}

describe("OpenCode parity layer", () => {
  it("opencode.jsonc pins oh-my-openagent to an exact version", () => {
    const config = readJsonc(join(REPO_ROOT, "opencode.jsonc"));
    const pins = (config.plugin ?? []).filter((p) => p.startsWith("oh-my-openagent"));
    assert.equal(pins.length, 1, `expected exactly one oh-my-openagent entry in opencode.jsonc plugin, found: ${JSON.stringify(config.plugin)}`);
    assert.match(
      pins[0],
      /^oh-my-openagent@\d+\.\d+\.\d+$/,
      `${pins[0]} is not an exact pin. A bare name or @latest runs whatever npm serves next, unread.`,
    );
  });

  it(".omo/omo.jsonc disables every hook this repository already owns", () => {
    const config = readJsonc(join(REPO_ROOT, ".omo", "omo.jsonc"));
    const disabled = config["[opencode]"]?.disabled_hooks ?? [];
    for (const hook of DUPLICATE_HOOKS) {
      assert.ok(disabled.includes(hook), `${hook} is not in disabled_hooks. It duplicates a layer this repository already runs.`);
    }
    assert.equal(config["[opencode]"]?.telemetry, false, "telemetry must be off in a template a stranger clones");
    assert.equal(config["[opencode]"]?.hashline_edit, true, "hashline_edit is the edit-safety feature the layer exists for");
  });

  it("the rulesync hook runner is still the one hook source for OpenCode", () => {
    // If claude-code-hooks is disabled and this file is missing, OpenCode
    // runs no hooks at all. Both halves have to hold.
    const runner = join(REPO_ROOT, ".opencode", "plugins", "rulesync-hooks.js");
    assert.doesNotThrow(() => readFileSync(runner), `${runner} is missing. Run npx rulesync generate.`);
  });
});
