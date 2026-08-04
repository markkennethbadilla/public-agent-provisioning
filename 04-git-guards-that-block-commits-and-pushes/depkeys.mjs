#!/usr/bin/env node
// PRIOR-ART: none-external -- a ~15-line JSON dep-key reader glued to this
// template's own pre-commit floating-range check; no off-the-shelf tool
// reads package.json dep-fields for a git-hook allowlist. Bespoke glue,
// ported from an already-vetted internal guard system.
// depkeys.mjs -- print space-separated dependency KEYS from a package.json.
// Used by pre-commit's floating-range check so a reformatted package.json
// cannot false-flag npm scripts (dev/build/start) as dependencies: only
// names that are ACTUAL keys under a *dependencies/overrides/etc. field
// count, never a denylist trying to enumerate arbitrary script names.
import { readFileSync } from "node:fs";
let p = {};
try { p = JSON.parse(readFileSync(process.argv[2] || process.argv[1], "utf8")); }
catch (e) { console.error(`depkeys: unreadable package.json (${e.message}); treating as no deps`); }
const out = new Set();
const walk = (o) => { if (o && typeof o === "object") for (const k of Object.keys(o)) { out.add(k); const v = o[k]; if (v && typeof v === "object") walk(v); } };
for (const f of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides", "resolutions", "pnpm"]) walk(p[f]);
process.stdout.write([...out].join(" "));
