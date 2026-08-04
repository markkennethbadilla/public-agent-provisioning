#!/usr/bin/env python3
"""
require-plan-before-edit.py -- PreToolUse gate: no file edit before a task
list/plan exists for this session.

Failure this prevents: an agent starts editing files with no recorded plan.
When the session is interrupted or something goes wrong, there is no trace
of what was intended, and a loose end noticed mid-edit gets mentioned once
in passing and then silently dropped instead of tracked anywhere.

This script runs in two modes, both registered on the SAME script in
settings.example.json with a different matcher and a different CLI arg:

  --record   Registered on whatever planning/task-list tool this harness
             exposes (TodoWrite, TaskCreate, ExitPlanMode, ...). Always
             allows; its only job is to drop a per-session marker file
             noting "a plan now exists."

  --gate     Registered on file-edit tools (Write, Edit, MultiEdit,
             NotebookEdit). Blocks unless the marker from --record exists,
             OR a scan of this session's transcript finds an earlier call
             to something plan-shaped, OR a written override is given.

Fails OPEN on anything it can't determine (unreadable payload, unreadable
transcript): a bug in this gate must never be the reason a real edit can't
land. Its power comes from the block message and the low cost of the
override, not from being unconditional.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_hookio as hookio

EDIT_TOOL_NAMES = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
PLAN_TOOL_NAME_RE = re.compile(r"todo|task|plan", re.IGNORECASE)
MAX_TRANSCRIPT_LINES = 20000  # bound the cost of scanning a huge transcript


def touch(path):
    try:
        with open(path, "a", encoding="utf-8"):
            os.utime(path, None)
    except OSError:
        pass


def mentions_plan_tool(node, depth=0):
    """Walk one decoded transcript line looking for a tool call whose name
    looks like a planning/task-list tool. Transcript line shapes differ
    across harnesses, so this is intentionally loose: any nested dict with
    a name-shaped key matching PLAN_TOOL_NAME_RE counts as a hit."""
    if depth > 6:
        return False
    if isinstance(node, dict):
        for key in ("name", "tool_name", "toolName"):
            val = node.get(key)
            if isinstance(val, str) and PLAN_TOOL_NAME_RE.search(val):
                return True
        for v in node.values():
            if mentions_plan_tool(v, depth + 1):
                return True
    elif isinstance(node, list):
        for v in node:
            if mentions_plan_tool(v, depth + 1):
                return True
    return False


def transcript_has_plan(transcript_path):
    if not transcript_path or not os.path.isfile(transcript_path):
        return False
    try:
        with open(transcript_path, "r", encoding="utf-8", errors="replace") as fh:
            for i, line in enumerate(fh):
                if i >= MAX_TRANSCRIPT_LINES:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                if mentions_plan_tool(entry):
                    return True
    except OSError:
        return False
    return False


def main():
    args = sys.argv[1:]
    mode = "record" if "--record" in args else "gate"

    payload, err = hookio.read_payload()
    if err:
        hookio.allow()  # can't gate what we can't read
        return

    sid = hookio.session_id(payload)
    marker = hookio.state_path(sid, "plan-exists")

    if mode == "record":
        # A planning/task-list tool is about to run (or just did): remember
        # it for the rest of this session. This script never decides
        # whether the planning tool ITSELF is allowed -- only whether
        # edits need one.
        touch(marker)
        hookio.allow()
        return

    if hookio.tool_name(payload) not in EDIT_TOOL_NAMES:
        hookio.allow()
        return

    if os.path.exists(marker):
        hookio.allow()
        return

    transcript_path = payload.get("transcript_path") or payload.get("transcriptPath")
    if transcript_has_plan(transcript_path):
        touch(marker)
        hookio.allow()
        return

    ti = hookio.tool_input(payload)
    content_text = "\n".join(hookio.iter_strings(ti))
    reason = hookio.find_override(content_text, "ALLOW_EDIT_WITHOUT_PLAN", "ALLOW-EDIT-WITHOUT-PLAN")
    if reason:
        sys.stderr.write("require-plan-before-edit.py: override used -- reason: %s\n" % reason)
        touch(marker)  # a deliberate override counts as "planned" for the rest of the session too
        hookio.allow()
        return

    hookio.block(
        "this session has no recorded task list/plan yet, and this tool "
        "call is about to edit a file -- an edit with no recorded intent "
        "leaves no trace of what was meant if something goes wrong or the "
        "session gets interrupted partway through",
        "create your task list first with whatever planning/todo tool this "
        "harness exposes, then retry the edit. For a genuinely trivial, "
        "fully reversible one-line change where a task list is pure "
        "ceremony, override once with a written reason: set "
        "ALLOW_EDIT_WITHOUT_PLAN=<reason>, or include a line "
        "'ALLOW-EDIT-WITHOUT-PLAN: <reason>' in the edit content."
    )


if __name__ == "__main__":
    main()
