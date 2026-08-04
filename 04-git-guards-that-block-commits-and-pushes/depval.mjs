#!/usr/bin/env node
// PRIOR-ART: none-external -- a ~15-line JSON dep-spec reader glued to this
// template's own pre-commit floating-range check; bespoke glue, ported from
// an already-vetted internal guard system, not a general-purpose tool.
// depval.mjs -- print the version SPEC for dependency <name> from a
// package.json read on stdin. Empty output = name absent. Used by
// pre-commit to skip a dependency that is unchanged vs HEAD, so a whole-file
// reformat does not re-trigger the pin/floating-range check on every line.
import { readFileSync } from "node:fs";
const name = process.argv[2];
let p = {};
try { p = JSON.parse(readFileSync(0, "utf8")); }
catch (e) { console.error(`depval: unreadable package.json on stdin (${e.message}); treating as no deps`); }
let found = "";
const walk = (o) => { if (o && typeof o === "object") for (const k of Object.keys(o)) { const v = o[k]; if (k === name && typeof v === "string") found = v; if (v && typeof v === "object") walk(v); } };
for (const f of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides", "resolutions", "pnpm"]) walk(p[f]);
process.stdout.write(found);
