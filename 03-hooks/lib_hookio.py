#!/usr/bin/env python3
"""
lib_hookio.py -- shared stdin/stdout plumbing for PreToolUse hooks.

Every hook in this directory is a short-lived process: the agent harness
launches it right before running a tool call, feeds it a JSON payload
describing that call on stdin, and reacts to the process's exit code:

    exit 0   -> allow the tool call to proceed
    exit 2   -> BLOCK the tool call. stderr is read back as the reason and
                shown to the agent, so write a human- (and agent-) readable
                explanation there -- never a stack trace.
    anything
    else     -> treated as "allow, but log a hook-error notice" by most
                harnesses, so a hook that actually means to block must use
                exit 2, not just any non-zero code.

This module has NO third-party imports. Every hook that uses it must run on
a bare `python3` with nothing pip-installed, unmodified on Windows, macOS
and Linux. Stick to the standard library here, always.
"""
import json
import os
import re
import sys
import tempfile

BLOCK_EXIT_CODE = 2


def read_payload(stream=None):
    """Read and parse the PreToolUse JSON payload from stdin (or `stream`).

    Returns (payload, error). On malformed/empty input, `payload` is None
    and `error` is a short string describing what went wrong. This function
    deliberately does NOT decide fail-open vs fail-closed -- that call
    belongs to each hook, because the right answer differs: a hook that
    can silently misclassify an unrecoverable action (permanent delete)
    should fail closed, while a hook that only adds friction (a secret
    scan, a plan-first nag) should fail open so a bug in the guard can
    never block unrelated work.
    """
    stream = stream or sys.stdin
    try:
        raw = stream.read()
    except Exception as exc:
        return None, "could not read stdin: %s" % exc
    if not raw or not raw.strip():
        return None, "empty stdin (no tool-call payload was given)"
    try:
        payload = json.loads(raw)
    except Exception as exc:
        return None, "stdin was not valid JSON: %s" % exc
    if not isinstance(payload, dict):
        return None, "top-level JSON payload was not an object"
    return payload, None


def tool_name(payload):
    return payload.get("tool_name") or payload.get("toolName") or ""


def tool_input(payload):
    ti = payload.get("tool_input")
    if ti is None:
        ti = payload.get("toolInput")
    return ti if isinstance(ti, dict) else {}


def session_id(payload):
    return payload.get("session_id") or payload.get("sessionId") or "unknown-session"


def iter_strings(value):
    """Yield every string leaf found anywhere inside `value`.

    Tool payload shapes differ per tool: Write has "content", Edit has
    "old_string"/"new_string", a multi-edit tool nests an "edits" list,
    Bash and PowerShell have "command". Rather than hardcode a field
    whitelist that silently misses the next tool's shape (and the next
    harness's naming), walk the whole structure and scan every string
    it contains.
    """
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            for s in iter_strings(v):
                yield s
    elif isinstance(value, list):
        for v in value:
            for s in iter_strings(v):
                yield s


_OVERRIDE_PATTERN_CACHE = {}


def find_override(text, env_var, inline_tag):
    """Look for a written-reason override. Returns the reason string, or
    None if no override is present.

    Checked in this order:
      1. Environment variable `env_var` -- its VALUE *is* the reason, e.g.
             ALLOW_UNSAFE_DELETE="clearing a scratch dir this session made"
      2. An inline marker inside `text`, shaped "<inline_tag>: <reason>",
         e.g. a comment placed in the command or file content itself:
             # ALLOW-UNSAFE-DELETE: clearing a scratch dir this session made

    A bare "1" / "true" / "yes" never counts as a reason on its own -- the
    whole point of an override that survives review is that it costs a
    written sentence, not a flag flip (see the repo's escape-hatch rule).
    """
    env_val = os.environ.get(env_var, "").strip()
    if env_val and env_val.lower() not in ("1", "true", "yes"):
        return env_val

    if text:
        pattern = _OVERRIDE_PATTERN_CACHE.get(inline_tag)
        if pattern is None:
            pattern = re.compile(re.escape(inline_tag) + r"\s*:\s*(.+)")
            _OVERRIDE_PATTERN_CACHE[inline_tag] = pattern
        m = pattern.search(text)
        if m:
            reason = m.group(1).strip()
            if reason and reason.lower() not in ("1", "true", "yes"):
                return reason
    return None


def block(why, fix, exit_code=BLOCK_EXIT_CODE):
    """Deny the tool call. Prints WHY it was blocked and WHAT to do instead
    to stderr -- the channel PreToolUse hooks use to hand feedback back to
    the agent on a blocking exit code -- then exits non-zero.

    A bare denial with no fix is a bad guard: every call site passes both.
    """
    sys.stderr.write("BLOCKED: %s\n" % why)
    sys.stderr.write("FIX: %s\n" % fix)
    sys.exit(exit_code)


def allow(note=None):
    """Let the tool call through. `note`, if given, goes to stdout, which
    harnesses log but do not feed back to the agent -- use it for optional
    debug context, never for anything the agent needs to see."""
    if note:
        sys.stdout.write(note + "\n")
    sys.exit(0)


def state_dir():
    """A per-machine scratch directory for hook state (e.g. the plan-gate's
    per-session marker files). Lives under the OS temp dir so it needs no
    repo location, no setup, and is always safe to delete."""
    d = os.path.join(tempfile.gettempdir(), "agent-hook-state")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return d


def state_path(*parts):
    """Build a filesystem-safe path under state_dir() from the given parts
    (e.g. a session id and a marker name)."""
    safe = [re.sub(r"[^A-Za-z0-9_.-]", "_", p) for p in parts if p]
    return os.path.join(state_dir(), "-".join(safe) or "default")
