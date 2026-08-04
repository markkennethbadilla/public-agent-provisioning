# install.ps1 -- installs the git guards from
# 04-git-guards-that-block-commits-and-pushes/ into a target git repository.
# This is the Windows path: it never assumes a bash shell is available.
#
# IDEMPOTENT: re-running this script converges on the same end state. It
# never duplicates a hook, never silently overwrites a DIFFERENT hook someone
# else already put there, and always prints exactly what it did and how to
# check it actually took effect.
#
# Two install modes:
#   link (default) -- points the target repo's core.hooksPath directly at
#                      this template's 04-git-guards-that-block-commits-and-pushes/
#                      directory. Nothing is copied; updating this template
#                      (a git pull here) updates every repo linked to it.
#   -Copy          -- copies pre-commit / pre-push into the target repo's own
#                      .git/hooks/ instead, and drops a .guard-root pointer
#                      file next to them so 05-self-checks/
#                      can still find this template later.
#
# The hooks themselves are POSIX shell scripts (#!/bin/bash) -- that is
# normal and supported on Windows: Git for Windows ships its own bash and
# runs hook scripts through it regardless of NTFS file permissions, the same
# way it always has. This installer never touches WSL and never requires it.
#
# USAGE
#   .\install.ps1 [-TargetRepo <dir>] [-Copy] [-Force] [-Help]
#
# Run it from inside the repo you want to protect (no flags needed), or point
# it at another repo with -TargetRepo. See
# 04-git-guards-that-block-commits-and-pushes\README.md for what the hooks do.

param(
    [string]$TargetRepo = ".",
    [switch]$Copy,
    [switch]$Force,
    [switch]$Help
)

function Show-Usage {
    Write-Host "Usage: .\install.ps1 [-TargetRepo <repo-dir>] [-Copy] [-Force] [-Help]"
    Write-Host ""
    Write-Host "  -TargetRepo <dir>  Git repo to install into (default: current directory)"
    Write-Host "  -Copy              Copy hooks into .git\hooks\ instead of setting"
    Write-Host "                     core.hooksPath (default mode: link, no copying)"
    Write-Host "  -Force             Overwrite a conflicting existing hook/config after"
    Write-Host "                     you've reviewed it (see the CONFLICT message for"
    Write-Host "                     what it would replace)"
    Write-Host "  -Help              Show this message"
    Write-Host ""
    Write-Host "Re-running with no flags is always safe: an already-installed repo prints"
    Write-Host "'already installed' and changes nothing."
}

if ($Help) { Show-Usage; exit 0 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "install.ps1: git is not on PATH -- install git first."
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GuardsDir = Join-Path $ScriptDir "04-git-guards-that-block-commits-and-pushes"
$SelfCheck = Join-Path $ScriptDir "05-self-checks\run-self-checks.mjs"

if (-not (Test-Path (Join-Path $GuardsDir "pre-commit")) -or -not (Test-Path (Join-Path $GuardsDir "pre-push"))) {
    Write-Error "install.ps1: cannot find pre-commit/pre-push under $GuardsDir"
    Write-Host "  -> this script must stay next to 04-git-guards-that-block-commits-and-pushes\" -ForegroundColor Yellow
    Write-Host "     (don't move install.ps1 on its own -- copy the whole template)" -ForegroundColor Yellow
    exit 1
}
# NTFS has no POSIX executable bit -- git for Windows runs hook scripts by
# their #! shebang regardless, so there is nothing to chmod here.

if (-not (Test-Path $TargetRepo -PathType Container)) {
    Write-Error "install.ps1: -TargetRepo '$TargetRepo' is not a directory"
    exit 1
}

$topRaw = (& git -C $TargetRepo rev-parse --show-toplevel 2>$null)
if ([string]::IsNullOrWhiteSpace($topRaw)) {
    Write-Error "install.ps1: '$TargetRepo' is not inside a git working tree"
    Write-Host "  -> run 'git init' there first, or pass -TargetRepo <existing-repo>" -ForegroundColor Yellow
    exit 1
}
$TargetTop = (Resolve-Path $topRaw.Trim()).Path

# Resolve an arbitrary path string (as git config stores it: relative or
# absolute, either slash style) to a real absolute path, for comparison.
function Resolve-ConfigPath {
    param([string]$RawPath)
    $candidate = $RawPath
    if (-not [System.IO.Path]::IsPathRooted($candidate)) {
        $candidate = Join-Path $TargetTop $candidate
    }
    try { return (Resolve-Path $candidate -ErrorAction Stop).Path }
    catch { return $candidate }
}

# The real .git\hooks directory (git-common-dir, so linked worktrees share
# the same one) -- needed by both modes.
$commonRaw = (& git -C $TargetTop rev-parse --git-common-dir 2>$null)
if ([string]::IsNullOrWhiteSpace($commonRaw)) { $commonRaw = ".git" }
$commonRaw = $commonRaw.Trim()
if (-not [System.IO.Path]::IsPathRooted($commonRaw)) {
    $commonRaw = Join-Path $TargetTop $commonRaw
}
try { $CommonAbs = (Resolve-Path $commonRaw -ErrorAction Stop).Path }
catch { $CommonAbs = Join-Path $TargetTop ".git" }
$HooksDir = Join-Path $CommonAbs "hooks"

function Install-Link {
    $current = (& git -C $TargetTop config --get core.hooksPath 2>$null)
    if ($current) { $current = $current.Trim() }
    $want = $GuardsDir

    if ([string]::IsNullOrWhiteSpace($current)) {
        & git -C $TargetTop config core.hooksPath $want | Out-Null
        Write-Host "installed: core.hooksPath -> $want" -ForegroundColor Green
    }
    else {
        $currentAbs = Resolve-ConfigPath $current
        if ($currentAbs -eq $want) {
            Write-Host "already installed: core.hooksPath already points at $want (nothing to do)"
        }
        elseif ($Force) {
            & git -C $TargetTop config core.hooksPath $want | Out-Null
            Write-Host "installed (forced): core.hooksPath -> $want (was: $currentAbs)" -ForegroundColor Yellow
        }
        else {
            Write-Host "CONFLICT: core.hooksPath is already set to a DIFFERENT directory:" -ForegroundColor Red
            Write-Host "  current: $currentAbs"
            Write-Host "  wanted:  $want"
            Write-Host "  -> this usually means another tool already owns your hooks (Husky,"
            Write-Host "     lefthook, a previous manual setup, ...). Overwriting it would"
            Write-Host "     silently disable whatever that tool enforces."
            Write-Host "  TO MERGE: keep the other tool as core.hooksPath, and have IT call this"
            Write-Host "     template's guards from its own steps, e.g.:"
            Write-Host "       ""$GuardsDir\pre-commit"""
            Write-Host "     (same idea for pre-push). Or, if this template should win outright,"
            Write-Host "     re-run with -Force once you've confirmed you don't need the other tool."
            exit 1
        }
    }

    foreach ($hook in @("pre-commit", "pre-push")) {
        $legacy = Join-Path $HooksDir $hook
        if (Test-Path $legacy -PathType Leaf) {
            Write-Host "note: $legacy still exists on disk but is now DORMANT -- core.hooksPath" -ForegroundColor Yellow
            Write-Host "  takes precedence, so git will not run it. Nothing was touched or deleted;"
            Write-Host "  delete it yourself once you're sure you don't need it."
        }
    }
}

function Install-Copy {
    New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null

    # core.hooksPath (local, global, or system, merged) must resolve to
    # exactly $HooksDir or the files we're about to copy there are dead on
    # arrival. `git config --unset` only touches LOCAL scope -- a value
    # inherited purely from a global setting would silently survive an
    # unset, so we always PIN core.hooksPath locally to $HooksDir instead of
    # trying to clear it. A local pin overrides global/system unconditionally
    # and is idempotent to re-set.
    $current = (& git -C $TargetTop config --get core.hooksPath 2>$null)
    if ($current) { $current = $current.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($current)) {
        $currentAbs = Resolve-ConfigPath $current
        if (($currentAbs -ne $HooksDir) -and ($currentAbs -ne $GuardsDir) -and (-not $Force)) {
            Write-Host "CONFLICT: core.hooksPath currently resolves to '$currentAbs'." -ForegroundColor Red
            Write-Host "  Files copied into $HooksDir would be IGNORED by git until that's overridden."
            Write-Host "  -> resolve it the same way as a link-mode conflict (see README.md), or"
            Write-Host "     re-run with -Force to pin core.hooksPath to $HooksDir and continue."
            exit 1
        }
    }
    & git -C $TargetTop config core.hooksPath $HooksDir | Out-Null
    Write-Host "core.hooksPath -> $HooksDir (explicit local pin; overrides any global/system default)"

    foreach ($hook in @("pre-commit", "pre-push")) {
        $src = Join-Path $GuardsDir $hook
        $dst = Join-Path $HooksDir $hook
        if (Test-Path $dst -PathType Leaf) {
            $srcHash = (Get-FileHash -Algorithm SHA256 -Path $src).Hash
            $dstHash = (Get-FileHash -Algorithm SHA256 -Path $dst).Hash
            if ($srcHash -ne $dstHash) {
                if (-not $Force) {
                    Write-Host "CONFLICT: $dst already exists and differs from this template's $hook." -ForegroundColor Red
                    Write-Host "  -> read it first: $dst"
                    if ($hook -eq "pre-commit") {
                        Write-Host "  TO MERGE: move its contents into a repo-local 'guard.local.sh' (or"
                        Write-Host "     'scripts\guard.local.sh') at the top of $TargetTop -- this"
                        Write-Host "     template's pre-commit already runs that file automatically (see"
                        Write-Host "     section 6 of 04-git-guards-that-block-commits-and-pushes\pre-commit)."
                    }
                    else {
                        Write-Host "  TO MERGE: this template has no plug-in point for pre-push yet."
                        Write-Host "     Rename the existing file (e.g. pre-push.local) and call it from"
                        Write-Host "     the end of this template's pre-push, or keep your own and skip"
                        Write-Host "     installing this one."
                    }
                    Write-Host "  Then re-run this installer, or pass -Force to overwrite now (back it up first)."
                    exit 1
                }
                Write-Host "overwriting (forced): $dst" -ForegroundColor Yellow
            }
        }
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "installed: $dst" -ForegroundColor Green
    }

    $guardRoot = Join-Path $HooksDir ".guard-root"
    Set-Content -Path $guardRoot -Value $ScriptDir -NoNewline
    Add-Content -Path $guardRoot -Value ""
    Write-Host "wrote: $guardRoot -> $ScriptDir" -ForegroundColor Green
}

if ($Copy) { Install-Copy } else { Install-Link }

if ($TargetTop -ne $ScriptDir) {
    Write-Host ""
    Write-Host "IMPORTANT if this machine's git already had some OTHER core.hooksPath before" -ForegroundColor Yellow
    Write-Host "today (a personal dotfiles setup, another guard system, ...): pre-commit's"
    Write-Host "section 7 self-check runs from THIS TEMPLATE's own directory, not from"
    Write-Host "$TargetTop, and it blocks every linked repo's commits if the template's OWN"
    Write-Host "effective core.hooksPath doesn't resolve back to these exact hooks. If commits"
    Write-Host "here start failing with 'the guard's own enforcement layer is not intact', fix"
    Write-Host "it by installing the template on itself once, from inside this template's own"
    Write-Host "directory:"
    Write-Host "  cd `"$ScriptDir`"; .\install.ps1"
}

Write-Host ""
Write-Host "Verify it took effect:"
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "  node ""$SelfCheck"""
    Write-Host ""
    Write-Host "That prints PASS/FAIL for two things: (1) the installed hooks are byte-identical"
    Write-Host "to the reviewed copies in 04-git-guards-that-block-commits-and-pushes\, and (2)"
    Write-Host "each check module is PROVEN able to go red -- it runs a real check against a"
    Write-Host "fixture built to trip it and asserts the check actually blocks it. That second"
    Write-Host "part is where you SEE a guard block something, printed in the check's own output."
}
else {
    Write-Host "  Node.js is not on PATH here -- install it, then run:"
    Write-Host "    node ""$SelfCheck"""
}
Write-Host ""
Write-Host "To see it block a REAL commit instead: stage anything and run 'git commit' in"
Write-Host "$TargetTop right now. If gitleaks is not installed on this machine, that alone is"
Write-Host "enough -- the very first commit will refuse with 'gitleaks is not installed"
Write-Host "(cannot prove no secrets)'. That refusal is the guard working, not a bug."

exit 0
