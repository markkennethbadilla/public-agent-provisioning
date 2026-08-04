#!/usr/bin/env python3
"""
deny-secret-in-write.py -- PreToolUse guard against writing a live-looking
credential literal into a file.

Failure this prevents: an agent pastes a real API key, token, private key,
or password straight into source, a config file, or a scratch note -- where
it can get committed, logged, indexed, or read by the next person/agent to
open the file. The fix is never "type the secret somewhere else instead";
it's "reference it by name and let it come from the environment or a
secrets manager."

Fails OPEN: unlike deny-unsafe-delete.py, a bug in this hook must never
block an unrelated write. Its only job is to catch an obvious mistake
before it lands on disk, not to be a complete secret scanner -- pair it
with a real one (gitleaks, trufflehog) at commit time for the thorough
pass; see 04-git-guards-that-block-commits-and-pushes/.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_hookio as hookio

WRITE_TOOL_NAMES = {"Write", "Edit", "MultiEdit", "NotebookEdit"}

# Keys that carry a file location, not file content -- excluded from the
# scan so a path merely containing a suspicious-looking word never trips
# this hook (only the shapes below, matched against actual content, do).
NON_CONTENT_KEYS = {"file_path", "path", "notebook_path", "filePath", "cell_id"}

# One well-known example key each provider publishes in its own docs (AWS's
# own sample AKIAIOSFODNN7EXAMPLE is the textbook case) contains a giveaway
# word. If the matched text itself contains one of these, treat it as a
# documentation placeholder, not a real secret, and skip it. This checks
# the MATCHED credential-shaped text itself, not merely nearby prose --
# nearby-text exemption would let a real secret be waved through by
# sitting a comment saying "example" next to it.
PLACEHOLDER_MARKER_RE = re.compile(
    r"EXAMPLE|REDACTED|CHANGEME|PLACEHOLDER|DUMMY|YOUR[-_]?KEY|"
    r"x{6,}|X{6,}|0{6,}",
)

# label -> compiled pattern. Each targets one credential SHAPE, not just a
# keyword, to keep false positives low. Extend this table for providers you
# use that aren't covered yet.
SECRET_PATTERNS = [
    ("AWS access key ID", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("AWS secret access key", re.compile(
        r"(?i)aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}['\"]?")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,255}\b")),
    ("GitLab personal access token", re.compile(r"\bglpat-[A-Za-z0-9\-_]{20,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,48}\b")),
    ("Slack incoming webhook URL", re.compile(
        r"hooks\.slack\.com/services/T[0-9A-Za-z]+/B[0-9A-Za-z]+/[0-9A-Za-z]+")),
    ("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9\-_]{20,}\b")),
    ("OpenAI-style API key", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b")),
    ("Stripe live secret key", re.compile(r"\b[sr]k_live_[0-9A-Za-z]{24,}\b")),
    ("npm access token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    ("private key block", re.compile(
        r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")),
    ("JSON Web Token", re.compile(
        r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("credential embedded in a connection URL", re.compile(
        r"\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s:'\"@/]+:[^\s@'\"]{4,}@[^\s/'\"]+")),
    ("bearer token in an Authorization header", re.compile(
        r"(?i)authorization\s*:\s*bearer\s+[A-Za-z0-9\-_.=]{20,}")),
    ("password/secret/token assignment", re.compile(
        r"(?i)\b(api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|"
        r"auth[_-]?token|password|passwd|pwd)\s*[:=]\s*['\"]?[^\s'\"]{12,}['\"]?")),
]


def gather_content(ti):
    filtered = {k: v for k, v in ti.items() if k not in NON_CONTENT_KEYS}
    return "\n".join(hookio.iter_strings(filtered))


def redact(snippet, keep=4):
    if len(snippet) <= keep * 2:
        return "*" * len(snippet)
    return snippet[:keep] + ("*" * (len(snippet) - keep * 2)) + snippet[-keep:]


def find_secrets(text):
    findings = []
    for label, pattern in SECRET_PATTERNS:
        for m in pattern.finditer(text):
            snippet = m.group(0)
            if PLACEHOLDER_MARKER_RE.search(snippet):
                continue
            findings.append((label, redact(snippet)))
    return findings


def main():
    payload, err = hookio.read_payload()
    if err:
        hookio.allow()  # can't tell what's being written; fail open
        return

    if hookio.tool_name(payload) not in WRITE_TOOL_NAMES:
        hookio.allow()
        return

    ti = hookio.tool_input(payload)
    text = gather_content(ti)
    if not text:
        hookio.allow()
        return

    findings = find_secrets(text)
    if not findings:
        hookio.allow()
        return

    reason = hookio.find_override(text, "ALLOW_SECRET_IN_WRITE", "ALLOW-SECRET-IN-WRITE")
    if reason:
        sys.stderr.write("deny-secret-in-write.py: override used -- reason: %s\n" % reason)
        hookio.allow()
        return

    labels = sorted({label for label, _ in findings})
    sample = findings[0][1]
    label_text = labels[0] if len(labels) == 1 else ", ".join(labels)
    article = "an" if label_text[:1].lower() in "aeiou" else "a"
    hookio.block(
        "this write looks like it contains %s %s (redacted sample: %s) -- "
        "writing a real credential into a file an agent can create is how "
        "it ends up committed, logged, or read by the wrong process" % (
            article, label_text, sample),
        "load the value from an environment variable, a secrets manager, "
        "or a gitignored .env file, and reference it by NAME instead of "
        "pasting the literal value. If this is genuinely a documentation "
        "placeholder the pattern misfired on, override with a written "
        "reason: set ALLOW_SECRET_IN_WRITE=<reason>, or include a line "
        "'ALLOW-SECRET-IN-WRITE: <reason>' in the file content."
    )


if __name__ == "__main__":
    main()
