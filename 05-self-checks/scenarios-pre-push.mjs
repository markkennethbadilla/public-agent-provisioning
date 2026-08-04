#!/usr/bin/env node
// PRIOR-ART: none-external -- see scenarios-pre-commit.mjs; same {id, run()}
// bad/good contract, applied to pre-push instead.
//
// scenarios-pre-push.mjs -- one entry per pre-push MECHANISM. Every scenario
// pushes to a local BARE repo created for that scenario alone (never a real
// remote, never the network) so "should pass" scenarios can go all the way
// through a real `git push` and land, not just "the hook exited 0".
import { git } from "./lib/proc.mjs";
import {
  newRepo,
  bareRemote,
  seed,
  push,
  mustPush,
  writeGuardrc,
  ownedGuardrc,
  posix,
} from "./lib/scratch.mjs";

const FOREIGN = { GIT_GUARD_ALLOW_FOREIGN: "1" }; // silence A4 for scenarios not testing A4 itself

function ownedPair(scratch, name) {
  const repo = newRepo(scratch, { owned: true, name });
  writeGuardrc(repo, ownedGuardrc());
  // Same basename on both sides -- these scenarios are not testing A1
  // (wrong-repo-name), so the local folder and remote repo names must match
  // or A1 would block every push here for the wrong reason.
  const remote = bareRemote(scratch, { owned: true, name });
  git(["remote", "add", "origin", posix(remote)], { cwd: repo });
  return repo;
}

export const scenarios = [
  {
    id: "forward-only-history",
    file: "pre-push",
    mechanism: "C1: a --force push that REWRITES already-pushed history is rejected; a fast-forward push is not",
    run(scratch) {
      const badRepo = ownedPair(scratch, "forward-bad");
      seed(badRepo, { "README.md": "# seed\n" }, "commit 1");
      mustPush(badRepo, ["-u", "origin", "main"], FOREIGN);
      seed(badRepo, { "advance.txt": "commit 2\n" }, "commit 2 (fast-forward)");
      mustPush(badRepo, ["origin", "main"], FOREIGN);
      git(["reset", "--hard", "HEAD~1"], { cwd: badRepo });
      seed(badRepo, { "divergent.txt": "commit 2b, a sibling of commit 2\n" }, "commit 2b (diverges from pushed commit 2)");
      const bad = push(badRepo, ["--force", "origin", "main"], FOREIGN);

      const goodRepo = ownedPair(scratch, "forward-good");
      seed(goodRepo, { "README.md": "# seed\n" }, "commit 1");
      mustPush(goodRepo, ["-u", "origin", "main"], FOREIGN);
      seed(goodRepo, { "advance.txt": "commit 2\n" }, "commit 2 (fast-forward)");
      const good = push(goodRepo, ["origin", "main"], FOREIGN);

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
  {
    id: "remote-branch-deletion",
    file: "pre-push",
    mechanism: "C2: deleting a remote branch is rejected unless GIT_GUARD_ALLOW_BRANCH_DELETE=1",
    run(scratch) {
      function setup(name) {
        const repo = ownedPair(scratch, name);
        seed(repo, { "README.md": "# seed\n" }, "commit 1");
        mustPush(repo, ["-u", "origin", "main"], FOREIGN);
        git(["checkout", "-b", "throwaway"], { cwd: repo });
        seed(repo, { "t.txt": "throwaway work\n" }, "throwaway commit");
        mustPush(repo, ["-u", "origin", "throwaway"], FOREIGN);
        return repo;
      }
      const badRepo = setup("branchdel-bad");
      const bad = push(badRepo, ["origin", "--delete", "throwaway"], FOREIGN);

      const goodRepo = setup("branchdel-good");
      const good = push(goodRepo, ["origin", "--delete", "throwaway"], { ...FOREIGN, GIT_GUARD_ALLOW_BRANCH_DELETE: "1" });

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
  {
    id: "external-protected-branch",
    file: "pre-push",
    mechanism: "EXTERNAL-PR: a repo with no ACCOUNT_MAP entry (not yours) cannot push straight to main; a feature branch is fine",
    run(scratch) {
      function unowned(name) {
        const repo = newRepo(scratch, { owned: false, name });
        const remote = bareRemote(scratch, { owned: false, name: `${name}-remote` });
        git(["remote", "add", "origin", posix(remote)], { cwd: repo });
        return repo;
      }
      const badRepo = unowned("external-bad");
      seed(badRepo, { "README.md": "# seed\n" }, "commit 1");
      const bad = push(badRepo, ["-u", "origin", "main"], FOREIGN);

      const goodRepo = unowned("external-good");
      git(["checkout", "-b", "feature-x"], { cwd: goodRepo });
      seed(goodRepo, { "README.md": "# seed\n" }, "commit 1 on a feature branch");
      const good = push(goodRepo, ["-u", "origin", "feature-x"], FOREIGN);

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
  {
    id: "wrong-repo-name",
    file: "pre-push",
    mechanism: "A1: local folder name must match the remote repo's name for a repo you own",
    run(scratch) {
      function setup(localName, remoteName) {
        const repo = newRepo(scratch, { owned: true, name: localName });
        writeGuardrc(repo, ownedGuardrc());
        const remote = bareRemote(scratch, { owned: true, name: remoteName });
        git(["remote", "add", "origin", posix(remote)], { cwd: repo });
        seed(repo, { "README.md": "# seed\n" }, "commit 1");
        return repo;
      }
      const badRepo = setup("myrepo-local", "myrepo-remote");
      const bad = push(badRepo, ["-u", "origin", "main"], FOREIGN);

      const goodRepo = setup("myrepo-match", "myrepo-match");
      const good = push(goodRepo, ["-u", "origin", "main"], FOREIGN);

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
  {
    id: "unrecognised-origin-host",
    file: "pre-push",
    mechanism: "A4: origin must look like github/gitlab/bitbucket unless GIT_GUARD_ALLOW_FOREIGN=1 -- a local path origin needs the override",
    run(scratch) {
      function setup(name) {
        const repo = newRepo(scratch, { owned: false, name });
        const remote = bareRemote(scratch, { owned: false, name: `${name}-remote` });
        git(["remote", "add", "origin", posix(remote)], { cwd: repo });
        git(["checkout", "-b", "feature-x"], { cwd: repo });
        seed(repo, { "README.md": "# seed\n" }, "commit 1");
        return repo;
      }
      const badRepo = setup("a4-bad");
      const bad = push(badRepo, ["-u", "origin", "feature-x"], {});

      const goodRepo = setup("a4-good");
      const good = push(goodRepo, ["-u", "origin", "feature-x"], FOREIGN);

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
  {
    id: "build-gate-command",
    file: "pre-push",
    mechanism: "D: a configured GATE_CMD must exit 0 before the push leaves the machine",
    run(scratch) {
      function setup(name, gateCmd) {
        const repo = newRepo(scratch, { owned: true, name });
        writeGuardrc(repo, ownedGuardrc({ GATE_CMD: gateCmd }));
        const remote = bareRemote(scratch, { owned: true, name }); // matching basename -- not testing A1 here
        git(["remote", "add", "origin", posix(remote)], { cwd: repo });
        seed(repo, { "README.md": "# seed\n" }, "commit 1");
        return repo;
      }
      const badRepo = setup("gate-bad", 'node -e "process.exit(1)"');
      const bad = push(badRepo, ["-u", "origin", "main"], FOREIGN);

      const goodRepo = setup("gate-good", 'node -e "process.exit(0)"');
      const good = push(goodRepo, ["-u", "origin", "main"], FOREIGN);

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
  {
    id: "deploy-marker-needs-gate",
    file: "pre-push",
    mechanism: "D0: a Dockerfile marks a repo deployable -- pushing it with no GATE_CMD configured is a hard block, not a warning",
    run(scratch) {
      function setup(name, gateCmd) {
        const repo = newRepo(scratch, { owned: true, name });
        const overrides = gateCmd ? { GATE_CMD: gateCmd } : {};
        writeGuardrc(repo, ownedGuardrc(overrides));
        const remote = bareRemote(scratch, { owned: true, name }); // matching basename -- not testing A1 here
        git(["remote", "add", "origin", posix(remote)], { cwd: repo });
        seed(repo, { "README.md": "# seed\n", Dockerfile: "FROM scratch\n" }, "commit 1 with a Dockerfile");
        return repo;
      }
      const badRepo = setup("marker-bad", null);
      const bad = push(badRepo, ["-u", "origin", "main"], FOREIGN);

      const goodRepo = setup("marker-good", 'node -e "process.exit(0)"');
      const good = push(goodRepo, ["-u", "origin", "main"], FOREIGN);

      return { bad: { blocked: bad.code !== 0, out: bad.out, err: bad.err }, good: { blocked: good.code !== 0, out: good.out, err: good.err } };
    },
  },
];
