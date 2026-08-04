#!/usr/bin/env python3
"""
deny-unsafe-delete.py -- PreToolUse guard against permanent recursive/forced
deletes of anything that is not obviously regenerable.

Failure this prevents: an agent runs `rm -rf`, `Remove-Item -Recurse -Force`,
`rmdir /s`, etc. against a path that turns out to hold source code, a
database file, or documents nobody can get back -- turning a one-line
command into unrecoverable data loss.

Scope, on purpose: this hook only looks at RECURSIVE or FORCED delete
invocations (the "-rf" shape). A plain `rm one-file.txt` is not blocked --
that blast radius does not justify the friction. It also never blocks
deletion of build/dependency/cache output (node_modules, dist, .next,
__pycache__, ...): re-running the build regenerates those, so blocking them
is friction with no safety payoff.

Register this hook on the "Bash" and "PowerShell" (or equivalent shell)
tool matchers only -- see settings.example.json.

Fail-CLOSED, unlike the other hooks in this directory: if the payload can't
be parsed, or a delete-shaped command's arguments can't be tokenized, this
hook denies rather than allows. A wrongly blocked delete costs a retry; a
wrongly allowed one is gone. Every other hook here fails open instead,
because their failure mode is only extra friction, not data loss.
"""
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_hookio as hookio

SHELL_TOOL_NAMES = ("Bash", "PowerShell")

# Delete verbs across POSIX shells, Windows cmd, and PowerShell (PowerShell
# aliases rm/ri/rd/del/erase to Remove-Item, so the same short verb can mean
# either dialect -- we don't need to know which, just recognize the verb).
DELETE_VERBS = {"rm", "rmdir", "rd", "del", "erase", "remove-item", "ri"}

# A statement boundary: a run of ; & | characters, a newline, or a bare
# "then"/"do" keyword (so `for f in *; do rm -rf "$f"; done` is still seen
# as containing a delete statement). This is a heuristic splitter, not a
# real shell parser -- good enough to find delete-verb statements, not
# intended to fully understand control flow.
STATEMENT_SPLIT_RE = re.compile(r"[;&|\n]+|\bthen\b|\bdo\b")

RECURSIVE_FLAG_RE = re.compile(r"^-\w*r\w*$|^--recursive$|^-?recurse$|^/s$", re.IGNORECASE)
FORCE_FLAG_RE = re.compile(r"^-\w*f\w*$|^--force$|^-?force$|^/f$|^/y$|^/q$", re.IGNORECASE)

# Directory names that are safe to force-delete because a normal build/test
# run regenerates them. Extend this list for your own stack -- it is meant
# to be edited, not treated as exhaustive.
REGENERABLE_DIR_NAMES = {
    "node_modules", "dist", "build", "out", "target", "venv", ".venv",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox",
    "coverage", ".nyc_output", ".turbo", ".cache", ".parcel-cache",
    ".next", ".nuxt", ".output", ".angular", ".svelte-kit", ".vercel",
    ".netlify", ".gradle",
}

POSIX_EPHEMERAL_ROOTS = ("/tmp", "/private/tmp", "/var/tmp", "/var/folders")


def tokenize(text):
    """Whitespace-split `text` into tokens, keeping content inside matching
    single/double quotes together and stripping the quote characters.
    Deliberately NOT a full shell parser (no backslash-escape handling --
    that would mangle Windows paths like C:\\Users\\name) -- good enough to
    tell a flag apart from a path argument, which is all this guard needs.
    """
    tokens = []
    buf = []
    quote = None
    for ch in text:
        if quote:
            if ch == quote:
                quote = None
            else:
                buf.append(ch)
            continue
        if ch in ("'", '"'):
            quote = ch
            continue
        if ch.isspace():
            if buf:
                tokens.append("".join(buf))
                buf = []
            continue
        buf.append(ch)
    if buf:
        tokens.append("".join(buf))
    return tokens


def is_flag_token(tok):
    if not tok:
        return False
    if tok[0] == "-":
        return True
    # Short DOS-style switch: "/" plus 1-3 letters (/s, /q, /f, /y). An
    # absolute POSIX path also starts with "/", so this stays narrow on
    # purpose -- "/home" (5 letters) will not match.
    return bool(re.match(r"^/[A-Za-z]{1,3}$", tok))


def is_redirect_token(tok):
    return tok in (">", ">>", "<", "|", ";") or any(c in tok for c in "><|")


def is_ephemeral_root(path):
    lowered = path.replace("\\", "/").lower().rstrip("/")
    if any(lowered == r or lowered.startswith(r + "/") for r in POSIX_EPHEMERAL_ROOTS):
        return True
    if "/appdata/local/temp" in lowered:
        return True
    try:
        sys_tmp = os.path.normcase(os.path.normpath(tempfile.gettempdir()))
        norm = os.path.normcase(os.path.normpath(path))
        if norm.startswith(sys_tmp):
            return True
    except Exception:
        pass
    return False


def classify_target(path):
    """True if `path` is safe to force-delete: a regenerable build/cache
    artifact, or something already living under an OS temp root."""
    if is_ephemeral_root(path):
        return True
    segments = [s for s in re.split(r"[\\/]+", path) if s not in ("", ".", "..")]
    lowered = {s.lower() for s in segments}
    return bool(lowered & REGENERABLE_DIR_NAMES)


def find_risky_statements(command):
    """Return a list of (statement_text, risky_targets) for every delete
    statement in `command` that is recursive/forced AND names at least one
    target this guard cannot classify as safe. Returns None (not []) if a
    delete-shaped statement could not be tokenized at all -- the fail-closed
    signal, distinct from "checked and found nothing risky"."""
    risky = []
    for chunk in STATEMENT_SPLIT_RE.split(command):
        chunk = chunk.strip()
        if not chunk:
            continue
        tokens = tokenize(chunk)
        if not tokens:
            continue
        idx = 0
        if tokens[0].lower() == "sudo" and len(tokens) > 1:
            idx = 1
        verb = tokens[idx].lower()
        if verb not in DELETE_VERBS:
            continue
        args = tokens[idx + 1:]
        if not args:
            continue  # delete verb with no arguments: nothing to classify
        flags = [t for t in args if is_flag_token(t)]
        targets = [t for t in args if not is_flag_token(t) and not is_redirect_token(t)]
        recursive = any(RECURSIVE_FLAG_RE.match(f) for f in flags)
        forced = any(FORCE_FLAG_RE.match(f) for f in flags)
        if not (recursive or forced):
            continue  # a plain, non-recursive, non-forced delete: in scope elsewhere, not here
        risky_targets = [t for t in targets if not classify_target(t)]
        if risky_targets:
            risky.append((chunk, risky_targets))
    return risky


def main():
    payload, err = hookio.read_payload()
    if err:
        hookio.block(
            "could not read/parse the tool-call payload (%s)" % err,
            "this guard fails CLOSED on a broken payload, because silently "
            "ALLOWING an unparsed delete command is the one mistake here "
            "that cannot be undone. Retry once the harness sends a "
            "well-formed PreToolUse payload, or if you are certain no "
            "delete is involved, override with a written reason: "
            "ALLOW_UNSAFE_DELETE=<reason>."
        )
        return

    name = hookio.tool_name(payload)
    if name not in SHELL_TOOL_NAMES:
        hookio.allow()
        return

    ti = hookio.tool_input(payload)
    command = ti.get("command")
    if not isinstance(command, str) or not command.strip():
        hookio.allow()
        return

    risky = find_risky_statements(command)
    if not risky:
        hookio.allow()
        return

    reason = hookio.find_override(command, "ALLOW_UNSAFE_DELETE", "ALLOW-UNSAFE-DELETE")
    if reason:
        sys.stderr.write("deny-unsafe-delete.py: override used -- reason: %s\n" % reason)
        hookio.allow()
        return

    statement, targets = risky[0]
    hookio.block(
        "recursive/forced delete of a path this guard cannot classify as "
        "regenerable: `%s` (target(s): %s)" % (statement, ", ".join(targets)),
        "move the path out of the way instead of deleting it permanently, "
        "then remove it later once you're sure it's not needed -- e.g. "
        "`mkdir -p .trash && mv <path> .trash/$(basename <path>)-$(date +%%s)` "
        "on POSIX, or `Move-Item <path> \"$env:TEMP\\$(Split-Path <path> -Leaf)-$(Get-Date -Format o)\"` "
        "in PowerShell. If the target really is disposable (a directory "
        "this guard's regenerable-name list doesn't know about yet), "
        "override with a written reason: ALLOW_UNSAFE_DELETE=<reason>, or "
        "put a comment `# ALLOW-UNSAFE-DELETE: <reason>` in the command."
    )


if __name__ == "__main__":
    main()
