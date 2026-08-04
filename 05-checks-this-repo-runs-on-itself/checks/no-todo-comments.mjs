#!/usr/bin/env node
// PRIOR-ART: none-external -- a ~25-line fixture-provable example check,
// included only so verify-gates-can-fail.mjs has something real to run
// against in this template. Not a general-purpose TODO linter (those exist,
// e.g. eslint-plugin-no-warning-comments); this exists to demonstrate the
// {id, run()} contract end to end, not to replace one.
//
// no-todo-comments.mjs -- a minimal example check: a checked-in TODO/FIXME
// comment is a task someone meant to track, not code that should ship silently.
//
// This is the CONTRACT every check under checks/ must implement:
//   default export { id, run(rootDir, options) => string[] }
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export default {
  id: "no-todo-comments",
  run(rootDir) {
    const failures = [];
    for (const file of walk(rootDir)) {
      if (![".js", ".mjs", ".cjs", ".ts", ".tsx"].includes(extname(file))) continue;
      const content = readFileSync(file, "utf8");
      if (/\b(TODO|FIXME)\b/.test(content)) {
        failures.push(`${file}: contains a TODO/FIXME comment`);
      }
    }
    return failures;
  },
};
