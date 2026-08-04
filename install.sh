#!/bin/sh
# install.sh -- installs the git guards from
# 04-git-guards-that-block-commits-and-pushes/ into a target git repository.
#
# IDEMPOTENT: re-running this script converges on the same end state. It
# never duplicates a hook, never silently overwrites a DIFFERENT hook someone
# else already put there, and always prints exactly what it did and how to
# check it actually took effect.
#
# Two install modes:
#   link (default) -- points the target repo's `core.hooksPath` directly at
#                      this template's 04-git-guards-that-block-commits-and-pushes/
#                      directory. Nothing is copied; updating this template
#                      (a `git pull` here) updates every repo linked to it.
#                      This is the one-line install documented in README.md,
#                      automated with conflict detection.
#   --copy         -- copies pre-commit / pre-push into the target repo's own
#                      .git/hooks/ instead, and drops a .guard-root pointer
#                      file next to them so 05-self-checks/
#                      can still find this template later. Use this when
#                      something else (CI, an IDE, a packaging step) insists
#                      on real files under .git/hooks and won't honor
#                      core.hooksPath.
#
# USAGE
#   install.sh [--target <repo-dir>] [--copy] [--force] [--help]
#
# Run it from inside the repo you want to protect (no flags needed), or point
# it at another repo with --target. See
# 04-git-guards-that-block-commits-and-pushes/README.md for what the hooks do.
set -u

RED='\033[91m'; YEL='\033[93m'; GRN='\033[92m'; NC='\033[0m'

usage() {
  cat <<'EOF'
Usage: install.sh [--target <repo-dir>] [--copy] [--force] [--help]

  --target <dir>  Git repo to install into (default: current directory)
  --copy          Copy hooks into .git/hooks/ instead of setting
                   core.hooksPath (default mode: link, no copying)
  --force         Overwrite a conflicting existing hook/config after you've
                   reviewed it (see the CONFLICT message for what it replaces)
  --help          Show this message

Re-running with no flags is always safe: an already-installed repo prints
"already installed" and changes nothing.
EOF
}

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
GUARDS_DIR="$SCRIPT_DIR/04-git-guards-that-block-commits-and-pushes"
SELFCHECK="$SCRIPT_DIR/05-self-checks/run-self-checks.mjs"

TARGET_REPO="."
MODE="link"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET_REPO="${2:-}"; shift 2 ;;
    --target=*) TARGET_REPO="${1#--target=}"; shift ;;
    --copy) MODE="copy"; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf "install.sh: unknown argument: %s\n\n" "$1" >&2; usage >&2; exit 2 ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  printf "${RED}install.sh: git is not on PATH -- install git first.${NC}\n" >&2
  exit 1
fi

if [ ! -f "$GUARDS_DIR/pre-commit" ] || [ ! -f "$GUARDS_DIR/pre-push" ]; then
  printf "${RED}install.sh: cannot find pre-commit/pre-push under %s${NC}\n" "$GUARDS_DIR" >&2
  printf "  -> this script must stay next to 04-git-guards-that-block-commits-and-pushes/\n" >&2
  printf "     (don't move install.sh on its own -- copy the whole template)\n" >&2
  exit 1
fi
chmod +x "$GUARDS_DIR/pre-commit" "$GUARDS_DIR/pre-push" 2>/dev/null || true

if [ ! -d "$TARGET_REPO" ]; then
  printf "${RED}install.sh: --target '%s' is not a directory${NC}\n" "$TARGET_REPO" >&2
  exit 1
fi
TARGET_TOP=$(cd "$TARGET_REPO" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$TARGET_TOP" ]; then
  printf "${RED}install.sh: '%s' is not inside a git working tree${NC}\n" "$TARGET_REPO" >&2
  printf "  -> run 'git init' there first, or pass --target <existing-repo>\n" >&2
  exit 1
fi

# Resolve an arbitrary path string (as git config stores it: relative or
# absolute, either slash style) to a real absolute path, for comparison.
resolve_path() {
  p="$1"
  case "$p" in
    /*|[A-Za-z]:[\\/]*) : ;;
    *) p="$TARGET_TOP/$p" ;;
  esac
  (cd "$p" 2>/dev/null && pwd) || printf '%s' "$p"
}

# The real .git/hooks directory (git-common-dir, so linked worktrees share
# the same one) -- needed by both modes: copy-mode writes here, link-mode
# checks whether a legacy hook here would go silently dormant.
COMMON_RAW=$(git -C "$TARGET_TOP" rev-parse --git-common-dir 2>/dev/null)
case "$COMMON_RAW" in
  /*|[A-Za-z]:[\\/]*) COMMON_ABS=$(cd "$COMMON_RAW" 2>/dev/null && pwd) ;;
  *) COMMON_ABS=$(cd "$TARGET_TOP/$COMMON_RAW" 2>/dev/null && pwd) ;;
esac
[ -z "$COMMON_ABS" ] && COMMON_ABS="$TARGET_TOP/.git"
HOOKS_DIR="$COMMON_ABS/hooks"

install_link() {
  current=$(git -C "$TARGET_TOP" config --get core.hooksPath 2>/dev/null || true)
  want="$GUARDS_DIR"

  if [ -z "$current" ]; then
    git -C "$TARGET_TOP" config core.hooksPath "$want"
    printf "${GRN}installed:${NC} core.hooksPath -> %s\n" "$want"
  else
    current_abs=$(resolve_path "$current")
    if [ "$current_abs" = "$want" ]; then
      printf "already installed: core.hooksPath already points at %s (nothing to do)\n" "$want"
    elif [ "$FORCE" = "1" ]; then
      git -C "$TARGET_TOP" config core.hooksPath "$want"
      printf "${YEL}installed (forced):${NC} core.hooksPath -> %s (was: %s)\n" "$want" "$current_abs"
    else
      printf "${RED}CONFLICT${NC}: core.hooksPath is already set to a DIFFERENT directory:\n" >&2
      printf "  current: %s\n" "$current_abs" >&2
      printf "  wanted:  %s\n" "$want" >&2
      printf "  -> this usually means another tool already owns your hooks (Husky, lefthook,\n" >&2
      printf "     a previous manual setup, ...). Overwriting it would silently disable\n" >&2
      printf "     whatever that tool enforces.\n" >&2
      printf "  TO MERGE: keep the other tool as core.hooksPath, and have IT call this\n" >&2
      printf "     template's guards from its own steps, e.g.:\n" >&2
      printf "       \"%s/pre-commit\"\n" "$GUARDS_DIR" >&2
      printf "     (same idea for pre-push). Or, if this template should win outright,\n" >&2
      printf "     re-run with --force once you've confirmed you don't need the other tool.\n" >&2
      exit 1
    fi
  fi

  for hook in pre-commit pre-push; do
    legacy="$HOOKS_DIR/$hook"
    if [ -f "$legacy" ]; then
      printf "${YEL}note:${NC} %s still exists on disk but is now DORMANT -- core.hooksPath\n" "$legacy"
      printf "  takes precedence, so git will not run it. Nothing was touched or deleted;\n"
      printf "  delete it yourself once you're sure you don't need it.\n"
    fi
  done
}

install_copy() {
  mkdir -p "$HOOKS_DIR"

  # core.hooksPath (local, global, or system, merged) must resolve to
  # exactly $HOOKS_DIR or the files we're about to copy there are dead on
  # arrival. `git config --unset` only touches LOCAL scope -- a value
  # inherited purely from --global would silently survive an unset, so we
  # always PIN core.hooksPath locally to $HOOKS_DIR instead of trying to
  # clear it. A local pin overrides global/system unconditionally and is
  # idempotent to re-set.
  current=$(git -C "$TARGET_TOP" config --get core.hooksPath 2>/dev/null || true)
  if [ -n "$current" ]; then
    current_abs=$(resolve_path "$current")
    if [ "$current_abs" != "$HOOKS_DIR" ] && [ "$current_abs" != "$GUARDS_DIR" ] && [ "$FORCE" != "1" ]; then
      printf "${RED}CONFLICT${NC}: core.hooksPath currently resolves to '%s'.\n" "$current_abs" >&2
      printf "  Files copied into %s would be IGNORED by git until that's overridden.\n" "$HOOKS_DIR" >&2
      printf "  -> resolve it the same way as a link-mode conflict (see README.md), or\n" >&2
      printf "     re-run with --force to pin core.hooksPath to %s and continue.\n" "$HOOKS_DIR" >&2
      exit 1
    fi
  fi
  git -C "$TARGET_TOP" config core.hooksPath "$HOOKS_DIR"
  printf "core.hooksPath -> %s (explicit local pin; overrides any global/system default)\n" "$HOOKS_DIR"

  for hook in pre-commit pre-push; do
    src="$GUARDS_DIR/$hook"
    dst="$HOOKS_DIR/$hook"
    if [ -e "$dst" ] && ! cmp -s "$src" "$dst"; then
      if [ "$FORCE" != "1" ]; then
        printf "${RED}CONFLICT${NC}: %s already exists and differs from this template's %s.\n" "$dst" "$hook" >&2
        printf "  -> read it first: %s\n" "$dst" >&2
        if [ "$hook" = "pre-commit" ]; then
          printf "  TO MERGE: move its contents into a repo-local 'guard.local.sh' (or\n" >&2
          printf "     'scripts/guard.local.sh') at the top of %s -- this template's\n" "$TARGET_TOP" >&2
          printf "     pre-commit already runs that file automatically (see section 6 of\n" >&2
          printf "     04-git-guards-that-block-commits-and-pushes/pre-commit).\n" >&2
        else
          printf "  TO MERGE: this template has no plug-in point for pre-push yet. Rename\n" >&2
          printf "     the existing file (e.g. pre-push.local) and call it from the end of\n" >&2
          printf "     this template's pre-push, or keep your own and skip installing this one.\n" >&2
        fi
        printf "  Then re-run this installer, or pass --force to overwrite now (back it up first).\n" >&2
        exit 1
      fi
      printf "${YEL}overwriting (forced):${NC} %s\n" "$dst"
    fi
    cp "$src" "$dst"
    chmod +x "$dst"
    printf "${GRN}installed:${NC} %s\n" "$dst"
  done

  printf '%s\n' "$SCRIPT_DIR" > "$HOOKS_DIR/.guard-root"
  printf "${GRN}wrote:${NC} %s -> %s\n" "$HOOKS_DIR/.guard-root" "$SCRIPT_DIR"
}

case "$MODE" in
  link) install_link ;;
  copy) install_copy ;;
esac

if [ "$TARGET_TOP" != "$SCRIPT_DIR" ]; then
  echo ""
  printf "${YEL}IMPORTANT if this machine's git already had some OTHER core.hooksPath before today${NC}\n"
  echo "(a personal dotfiles setup, another guard system, ...): pre-commit's section 7"
  echo "self-check runs from THIS TEMPLATE's own directory, not from $TARGET_TOP, and it"
  echo "blocks every linked repo's commits if the template's OWN effective core.hooksPath"
  echo "doesn't resolve back to these exact hooks. If commits here start failing with"
  echo "\"the guard's own enforcement layer is not intact\", fix it by installing the"
  echo "template on itself once, from inside this template's own directory:"
  printf "  cd \"%s\" && \"%s/install.sh\"\n" "$SCRIPT_DIR" "$SCRIPT_DIR"
fi

echo ""
echo "Verify it took effect:"
if command -v node >/dev/null 2>&1; then
  printf "  node \"%s\"\n" "$SELFCHECK"
  echo ""
  echo "That prints PASS/FAIL for two things: (1) the installed hooks are byte-identical"
  echo "to the reviewed copies in 04-git-guards-that-block-commits-and-pushes/, and (2)"
  echo "each check module is PROVEN able to go red -- it runs a real check against a"
  echo "fixture built to trip it and asserts the check actually blocks it. That second"
  echo "part is where you SEE a guard block something, printed in the check's own output."
else
  echo "  Node.js is not on PATH here -- install it, then run:"
  printf "    node \"%s\"\n" "$SELFCHECK"
fi
echo ""
echo "To see it block a REAL commit instead: stage anything and run 'git commit' in"
printf "%s right now. If gitleaks is not installed on this machine, that alone is\n" "$TARGET_TOP"
echo "enough -- the very first commit will refuse with 'gitleaks is not installed"
echo "(cannot prove no secrets)'. That refusal is the guard working, not a bug."

exit 0
