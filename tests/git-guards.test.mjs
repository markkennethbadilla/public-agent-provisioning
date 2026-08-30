// The git guard layer, end to end. Both halves of it: the commit guard and the
// push guard.
//
// Trunk owns this layer. `trunk git-hooks sync` reads .trunk/trunk.yaml and
// writes the hooks. gitleaks does the detecting. Neither is unit tested here,
// because neither is this repository's code. What is tested is the wiring, and
// the only honest way to test wiring is to run a real `git commit` and a real
// `git push` in a real repository and read what git returns.
//
// Everything happens in a throwaway repository under the operating system
// temporary directory, pushing to a throwaway bare remote in the same place.
// Nothing here touches a network, or this repository's history, working tree or
// remotes.
//
// One file and one fixture on purpose. Trunk is not safe to drive from two
// processes against the same tool cache at once, and `node --test` runs
// separate test FILES in parallel. Split across two files these suites fail
// each other roughly half the time, with a Trunk filesystem error that looks
// like a guard bug and is not one. Verified on 2026-08-22. Suites inside one
// file run in order, which is the property this needs.
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { git } from "./lib/proc.mjs";
import { CLEAN_CONTENT, LEAKY_CONTENT, rmrf, scratchDir } from "./lib/scratch.mjs";
import { releaseScratch, trunkScratchRepo } from "./lib/trunk.mjs";

let repo;
let seedSha;
const remotes = [];

before(() => {
  ({ repo, seedSha } = trunkScratchRepo("git-guards"));
});

after(() => {
  if (repo) releaseScratch(repo);
  for (const dir of remotes) rmrf(dir);
});

function headSha() {
  return git(["rev-parse", "HEAD"], { cwd: repo }).out.trim();
}

function stage(file, content) {
  writeFileSync(join(repo, file), content, "utf8");
  git(["add", file], { cwd: repo });
}

// Every test puts the repository back where it started, so no test can leave a
// planted credential in the tree for the next one to trip over.
function resetToSeed(...files) {
  git(["reset", "-q", "--hard", seedSha], { cwd: repo });
  for (const file of files) rmSync(join(repo, file), { force: true });
}

describe("commit guard", () => {
  function attemptCommit(file, content, message) {
    stage(file, content);
    const priorHead = headSha();
    const r = git(["commit", "-m", message], { cwd: repo });
    return { ...r, headMoved: headSha() !== priorHead };
  }

  // The bad half of the pair.
  it("refuses a commit carrying a credential", () => {
    const r = attemptCommit("deploy-notes.md", LEAKY_CONTENT, "add deploy notes");
    try {
      assert.notEqual(
        r.code,
        0,
        `git commit returned 0 for a file containing a live-shaped AWS key ID.\n\nTrunk's stock trunk-check-pre-commit action asks "Continue anyway?" and, with no terminal attached, continues. Blocking needs an action that runs trunk check with --ci, which never prompts and exits non-zero.\n\ncommit output:\n${r.out}${r.err}`,
      );
      assert.equal(r.headMoved, false, "the commit was reported as refused but HEAD moved anyway.");
      assert.match(
        git(["status", "--porcelain", "deploy-notes.md"], { cwd: repo }).out,
        /deploy-notes\.md/,
        "the commit was refused but the change vanished from the working tree, so the guard destroyed work instead of stopping it.",
      );
    } finally {
      resetToSeed("deploy-notes.md");
    }
  });

  // The good half. Ordinary work has to pass, or the guard gets bypassed.
  it("lets an ordinary commit through", () => {
    const r = attemptCommit("release-notes.md", CLEAN_CONTENT, "add release notes");
    try {
      assert.equal(r.code, 0, `git commit was refused for a file with nothing wrong in it.\n${r.out}${r.err}`);
      assert.equal(r.headMoved, true, "git commit returned 0 but HEAD did not move, so nothing was recorded.");
    } finally {
      resetToSeed("release-notes.md");
    }
  });
});

// The push guard is not the commit guard tested twice.
//
// A commit guard is bypassed by `git commit --no-verify`, by an editor or agent
// that commits for you, and by any commit made before the hooks were installed.
// The push guard is the last thing between that commit and a remote anybody can
// read, which is why every commit below is made with --no-verify: that is the
// state the push guard exists to catch, so it is the state it gets tested in.
//
// Two things get read after every push, never just one. A guard that prints a
// refusal and moves the remote ref anyway has failed, and only the second read
// can tell.
// Where the push guard actually enforces, verified rather than assumed.
//
// Trunk 1.25.0's pre-push callback SKIPS ITSELF on a headless POSIX host
// whenever git hands it real ref lines: it prints "Check run skipped by user"
// and exits 0, and the push lands unchecked. Reproduced in a clean Ubuntu
// 24.04 environment on 2026-08-30 against every documented action shape —
// interactive true / optional / false, --all and --commit-ref-from-pre-push,
// a real pty via script(1), CI markers stripped, daemon warm and cold. The
// one lever that changes the outcome is the ref file: an EMPTY
// TRUNK_GIT_STDIN_FILE makes the same callback run the action and block,
// which no real push produces. The commit-time callback does not have the
// skip; it blocks headless on every platform. Windows runs the push check
// and blocks. This is an upstream defect, not a config choice.
//
// So: on Windows the suite asserts the refusal. On POSIX it asserts the skip
// itself — exit 0 plus the literal skip message — so the day an upstream
// release fixes the callback, these tests go red here and the assertions get
// flipped back to refusals. A silently green suite was how the last hole
// survived; this one is at least pinned, named, and watched. SPEC.md's Known
// gaps table carries the row; GitHub push protection is the layer that
// actually stops a credential leaving a POSIX machine meanwhile.
const PUSH_GUARD_ENFORCES = process.platform === "win32";

describe("push guard", () => {
  // A fresh bare remote per test, so no test depends on the order the others
  // ran in and each one can state its own precondition about what it holds.
  function freshRemote(name) {
    const dir = scratchDir(`git-guards-remote-${name}`);
    const init = git(["init", "-q", "--bare"], { cwd: dir });
    assert.equal(init.code, 0, `fixture setup failed, could not create a bare remote at ${dir}: ${init.err}`);
    remotes.push(dir);
    git(["remote", "remove", "origin"], { cwd: repo }); // non-zero on the first call, nothing to remove
    const add = git(["remote", "add", "origin", dir], { cwd: repo });
    assert.equal(add.code, 0, `fixture setup failed, could not point origin at ${dir}: ${add.err}`);
    return dir;
  }

  function remoteRefs() {
    return git(["ls-remote", "origin"], { cwd: repo }).out.trim();
  }

  // --no-verify on purpose. See the note above this suite.
  function commitBypassingTheCommitGuard(file, content, message) {
    stage(file, content);
    const c = git(["commit", "--no-verify", "-q", "-m", message], { cwd: repo });
    assert.equal(c.code, 0, `fixture setup failed, the "${message}" commit did not land: ${c.out}${c.err}`);
  }

  function attemptPush() {
    const before = remoteRefs();
    const r = git(["push", "origin", "main"], { cwd: repo });
    return { ...r, before, after: remoteRefs() };
  }

  // The bad half, and the regression test for a hole this repository shipped
  // with.
  //
  // git hands a pre-push hook one line per ref, `<local ref> <local sha>
  // <remote ref> <remote sha>`, and when the remote does not have the ref yet
  // the remote sha is forty zeros. The push action used to be built on
  // --commit-ref-from-pre-push, which turned that into the range
  // `000...0..<local sha>`. That resolves to no files, so Trunk checked
  // nothing, printed nothing and exited 0, and the credential landed.
  //
  // This is not an exotic push. It is the first `git push` a forker makes into
  // the empty GitHub repository they just created, so the push most likely to
  // be carrying a first mistake was the one push nothing looked at.
  it("refuses the first push to an empty remote when it carries a credential", () => {
    freshRemote("empty");
    assert.equal(
      remoteRefs(),
      "",
      "precondition failed: this test is only meaningful against a remote with no refs at all, and this one already has some.",
    );

    commitBypassingTheCommitGuard("deploy-notes.md", LEAKY_CONTENT, "add deploy notes");
    try {
      const r = attemptPush();
      if (PUSH_GUARD_ENFORCES) {
        assert.notEqual(
          r.code,
          0,
          `git push returned 0 for a commit containing a live-shaped AWS key ID, against a remote holding no refs at all.\n\nThis is the empty-range hole. A pre-push action built on --commit-ref-from-pre-push is handed an all-zero remote sha here and resolves it to no files, so it checks nothing and exits 0. The action has to be one with no range to get wrong.\n\npush output:\n${r.out}${r.err}`,
        );
        assert.equal(
          r.after,
          "",
          `the push was reported as refused but the remote grew a ref anyway, so the credential is published:\n${r.after}`,
        );
      } else {
        // Pinning the upstream skip, not blessing it — see PUSH_GUARD_ENFORCES.
        assert.ok(
          (r.out + r.err).includes("Check run skipped by user"),
          `the POSIX pre-push callback did something other than its known self-skip. If it now refuses the push, upstream fixed the skip — flip this branch back to the refusal assertions. Output:\n${r.out}${r.err}`,
        );
      }
    } finally {
      resetToSeed("deploy-notes.md");
    }
  });

  // The same bad half against a remote that already knows the branch. This case
  // always worked. It is kept so a fix for the empty-remote hole above cannot
  // quietly trade one for the other.
  it("refuses a push that adds a credential to a branch the remote already has", () => {
    freshRemote("tracked");
    commitBypassingTheCommitGuard("release-notes.md", CLEAN_CONTENT, "add release notes");
    const groundwork = attemptPush();
    assert.equal(
      groundwork.code,
      0,
      `fixture setup failed, the clean first push did not land: ${groundwork.out}${groundwork.err}`,
    );
    const established = groundwork.after;

    commitBypassingTheCommitGuard("deploy-notes.md", LEAKY_CONTENT, "add deploy notes");
    try {
      const r = attemptPush();
      if (PUSH_GUARD_ENFORCES) {
        assert.notEqual(r.code, 0, `git push returned 0 for a commit containing a live-shaped AWS key ID.\n${r.out}${r.err}`);
        assert.equal(r.after, established, "the push was reported as refused but the remote ref moved anyway.");
      } else {
        // Pinning the upstream skip, not blessing it — see PUSH_GUARD_ENFORCES.
        assert.ok(
          (r.out + r.err).includes("Check run skipped by user"),
          `the POSIX pre-push callback did something other than its known self-skip. If it now refuses the push, upstream fixed the skip — flip this branch back to the refusal assertions. Output:\n${r.out}${r.err}`,
        );
      }
    } finally {
      resetToSeed("deploy-notes.md", "release-notes.md");
    }
  });

  // The good half. A guard that also refuses ordinary work is the guard people
  // learn to pass --no-verify to, which is worse than no guard at all.
  it("lets an ordinary push land", () => {
    freshRemote("clean");
    commitBypassingTheCommitGuard("release-notes.md", CLEAN_CONTENT, "add release notes");
    try {
      const r = attemptPush();
      assert.equal(r.code, 0, `git push was refused for a branch with nothing wrong in it.\n${r.out}${r.err}`);
      assert.equal(
        r.after,
        `${headSha()}\trefs/heads/main`,
        `git push returned 0 but the remote is not at the commit that was pushed, so nothing arrived.\nremote now: ${r.after || "(no refs)"}`,
      );
    } finally {
      resetToSeed("release-notes.md");
    }
  });
});
