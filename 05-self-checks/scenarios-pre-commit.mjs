#!/usr/bin/env node
// PRIOR-ART: none-external -- bad/good fixture pairs for a shell git hook,
// mirroring the {id, run()} contract already used by
// 05-self-checks/checks/, applied to pre-commit instead
// of to the checks/ modules. No general test runner ships this shape.
//
// scenarios-pre-commit.mjs -- one entry per pre-commit MECHANISM that can be
// exercised from a throwaway repo. Each `run()` constructs a "should block"
// commit and a "should pass" commit and returns both raw results; verify-guards.mjs
// (the caller) is the only place that judges pass/fail, so a scenario here
// can never mark itself green.
import { mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./lib/proc.mjs";
import {
  newRepo,
  seed,
  attemptCommit,
  pointHooksAt,
  posix,
} from "./lib/scratch.mjs";

function bigFile(lines) {
  return Array.from({ length: lines }, (_, i) => `const line_${i} = ${i};`).join("\n") + "\n";
}

export const scenarios = [
  {
    id: "secrets-scan",
    file: "pre-commit",
    mechanism: "section 2: gitleaks blocks a staged secret",
    run(scratch) {
      const badRepo = newRepo(scratch, { name: "secrets-bad" });
      // A PEM private-key block, not the textbook AWS "...EXAMPLE" key --
      // gitleaks (like this template's own 03-hooks/deny-secret-in-write.py)
      // deliberately allowlists provider-published example/placeholder keys,
      // so a fixture meant to be CAUGHT must not look like a doc sample.
      const bad = attemptCommit(
        badRepo,
        {
          // Header assembled at runtime rather than written as one literal.
          // A secret scanner's own fixtures will otherwise trip a secret
          // scanner - this repo's pre-commit guard included, and any scanner
          // run by whoever forks this template. The bytes handed to the guard
          // are identical, so the assertion is unchanged.
          "config/creds.txt":
            "-----BEGIN RSA " + "PRIVATE KEY-----\n" +
            "MIIEpAIBAAKCAQEA1c7t3z2v9k4Q8m1nR6pJx0FZs8yV2wLh7dK3rTgQeYb5nP4a\n" +
            "-----END RSA " + "PRIVATE KEY-----\n",
        },
        "add credentials file",
      );
      const goodRepo = newRepo(scratch, { name: "secrets-good" });
      const good = attemptCommit(
        goodRepo,
        { "notes/plan.txt": "Ship the widget by Friday. No credentials in this file.\n" },
        "add plain notes",
      );
      return { bad, good };
    },
  },
  {
    id: "mega-file-cap",
    file: "pre-commit",
    mechanism: "section 3: staged source file over MAX_FILE_LINES (400)",
    run(scratch) {
      const badRepo = newRepo(scratch, { name: "megafile-bad" });
      const bad = attemptCommit(badRepo, { "src/bigfile.js": bigFile(450) }, "add a 450-line file");
      const goodRepo = newRepo(scratch, { name: "megafile-good" });
      const good = attemptCommit(goodRepo, { "src/smallfile.js": bigFile(10) }, "add a 10-line file");
      return { bad, good };
    },
  },
  {
    id: "debug-code-ban",
    file: "pre-commit",
    mechanism: "section 3: console.log/debugger left in staged non-CLI source",
    run(scratch) {
      const badRepo = newRepo(scratch, { name: "debugcode-bad" });
      const bad = attemptCommit(
        badRepo,
        { "src/widget.js": 'function run() {\n  console.log("left this in by accident");\n  return 1;\n}\n' },
        "add widget with console.log",
      );
      const goodRepo = newRepo(scratch, { name: "debugcode-good" });
      const good = attemptCommit(
        goodRepo,
        { "src/widget.js": "function run() {\n  return 1;\n}\n" },
        "add clean widget",
      );
      return { bad, good };
    },
  },
  {
    id: "worktree-isolation",
    file: "pre-commit",
    mechanism: "section 1: commit blocked in the PRIMARY checkout while another worktree exists",
    run(scratch) {
      const repoDir = newRepo(scratch, { name: "worktree-repo" });
      seed(repoDir, { "README.md": "# worktree scratch repo\n" }, "seed");
      const linkedDir = join(scratch.root, "guard-selftest-external", "worktree-repo-linked");
      mkdirSync(join(scratch.root, "guard-selftest-external"), { recursive: true });
      git(["worktree", "add", "-b", "wt-branch", linkedDir, "HEAD"], { cwd: repoDir });
      const bad = attemptCommit(repoDir, { "docs/note-a.md": "written from the primary checkout\n" }, "note from primary");
      const good = attemptCommit(linkedDir, { "docs/note-b.md": "written from the linked worktree\n" }, "note from linked worktree");
      return { bad, good };
    },
  },
  {
    id: "repo-local-plugin-gate",
    file: "pre-commit",
    mechanism: "section 6: repo-local guard.local.sh plug-in point",
    run(scratch) {
      const badRepo = newRepo(scratch, { name: "localgate-bad" });
      const bad = attemptCommit(
        badRepo,
        { "guard.local.sh": "#!/bin/bash\necho 'local project rule failed'\nexit 1\n", "src/app.js": "export const ok = true;\n" },
        "add failing repo-local gate",
      );
      const goodRepo = newRepo(scratch, { name: "localgate-good" });
      const good = attemptCommit(
        goodRepo,
        { "guard.local.sh": "#!/bin/bash\necho 'local project rule passed'\nexit 0\n", "src/app.js": "export const ok = true;\n" },
        "add passing repo-local gate",
      );
      return { bad, good };
    },
  },
  {
    id: "self-integrity",
    file: "pre-commit",
    mechanism: "section 7: blocks when the guard layer's OWN live copy has drifted from its reviewed source",
    run(scratch, publicRepoRoot) {
      // BAD: a dedicated guard root whose own core.hooksPath points at an
      // externally-modified copy of pre-commit -- "hooks got copied
      // somewhere and the live file silently drifted from the source".
      const tamperedRoot = join(scratch.root, "_tampered-guardroot");
      mkdirSync(tamperedRoot, { recursive: true });
      cpSync(join(publicRepoRoot, "04-git-guards-that-block-commits-and-pushes"), join(tamperedRoot, "04-git-guards-that-block-commits-and-pushes"), { recursive: true });
      cpSync(join(publicRepoRoot, "05-self-checks"), join(tamperedRoot, "05-self-checks"), { recursive: true });
      git(["init", "-q", "-b", "main"], { cwd: tamperedRoot });

      const driftedHooks = join(scratch.root, "_drifted-live-hooks");
      cpSync(join(publicRepoRoot, "04-git-guards-that-block-commits-and-pushes"), driftedHooks, { recursive: true });
      const pcPath = join(driftedHooks, "pre-commit");
      writeFileSync(pcPath, readFileSync(pcPath, "utf8") + "\n# drifted-by-selftest\n", "utf8");
      git(["config", "core.hooksPath", posix(driftedHooks)], { cwd: tamperedRoot });

      const badRepo = newRepo(scratch, { name: "integrity-bad" });
      pointHooksAt(badRepo, join(tamperedRoot, "04-git-guards-that-block-commits-and-pushes"));
      const bad = attemptCommit(badRepo, { "README.md": "# drift test\n" }, "should be blocked by section 7");

      // GOOD: the shared scratch guard root, whose live copy IS its reviewed
      // source by construction -- proves section 7 does not cry wolf on a
      // correctly self-consistent install.
      const goodRepo = newRepo(scratch, { name: "integrity-good" });
      const good = attemptCommit(goodRepo, { "README.md": "# clean test\n" }, "should pass, guard root self-consistent");

      return { bad, good };
    },
  },
  {
    id: "dependency-pinning",
    file: "pre-commit",
    mechanism: "section 8: a NEW package.json dependency must be an exact pin, not a floating range",
    run(scratch) {
      function build(name, newDepSpec) {
        const repo = newRepo(scratch, { name });
        seed(
          repo,
          {
            "package.json": JSON.stringify({ name: "scratch-pkg", version: "1.0.0", private: true, dependencies: { "left-pad": "1.3.0" } }, null, 2) + "\n",
            "README.md": "# scratch package\n",
          },
          "seed package.json",
        );
        const pkg = { name: "scratch-pkg", version: "1.0.0", private: true, dependencies: { "left-pad": "1.3.0", "is-even": newDepSpec } };
        return attemptCommit(repo, { "package.json": JSON.stringify(pkg, null, 2) + "\n" }, "add is-even dependency");
      }
      const bad = build("deps-bad", "^1.0.0");
      const good = build("deps-good", "1.0.0");
      return { bad, good };
    },
  },
];
