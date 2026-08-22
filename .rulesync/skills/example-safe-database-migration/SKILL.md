---
name: example-safe-database-migration
description: "Before writing, running, reviewing, or approving any database migration, meaning adding, dropping, renaming, or altering a table, column, index, or constraint; backfilling or transforming existing data; or changing a schema in any way. Also fires whenever someone asks to migrate a database, write a migration, alter a schema, rename a column, drop a table, or asks whether a migration is safe to run. Covers the additive-only rule, the expand and contract pattern for a rename or a type change, and proving that a backup restores before any step that could lose data actually runs."
targets: ["*"]
---

# Safe database migrations

Worked example skill. It is real advice and it is also the shape a skill in
this template should take. Replace it with your own once you have one.

Every migration either only adds to the schema, or it follows a three-phase
expand and contract path that never has a moment where old code and new code
disagree about what the data looks like. Nothing destructive runs until a
backup of the affected data has been restored somewhere else and proven to
match, row for row, not merely copied.

## Why this matters

Schema migrations are one of the few kinds of change that can destroy
production data in a single statement, and the failure is often silent until
the destroyed data is needed. Two concrete ways this goes wrong.

`ALTER TABLE users DROP COLUMN full_name;` runs in under a second and the data
is gone. There is no undo. If the only backup anyone has is a `pg_dump` from
last week, that backup may not contain the rows written since, and nobody finds
out until somebody asks for that data.

`ALTER TABLE users RENAME COLUMN full_name TO display_name;` looks harmless,
because nothing is deleted. But any code path still deployed and still reading
`full_name` starts throwing the instant the rename commits. During a rolling
deploy that is guaranteed to include some in-flight requests.

Both failures share a root cause. The migration collapsed a change that needed
to happen in stages into one irreversible step.

## The core doctrine

### 1. Additive only, so never drop or rewrite in place

Every migration in the forward direction adds a column, table, or index rather
than destroying an old one. The old one might still be read by code that has
not finished deploying, and "we stopped using it" is a different claim from "we
can prove nothing reads it."

When a column or table genuinely stops being used by live code, mark it instead
of dropping it, in the schema itself, so the schema becomes the registry of
what is pending cleanup.

```sql
COMMENT ON COLUMN users.full_name IS
  'DEPRECATED 2026-08-04: superseded by display_name; safe to drop after 2026-09-01';
```

The eventual `DROP` is its own separate, deliberate, backed-up migration. It is
never bundled into the same deploy that stops using the column. Give it at
least one full release cycle of soak time first, so that a rollback of the
"stop using it" deploy never lands on a schema already missing the column it
expects.

### 2. Expand and contract for a breaking change

A rename, a type change, or a column split cannot land in one atomic step
without a moment where deployed code and the schema disagree. Expand and
contract is the standard three-phase answer, and it applies to any breaking
schema change, not only renames.

1. **Expand.** Add the new column or table alongside the old one. Both exist at
   once. Backfill the new one from the old one, and dual-write to both if live
   code is still writing during the transition.
2. **Migrate.** Deploy the code that reads the new column instead of the old
   one. Let it run in production long enough to prove out, at minimum a full
   release cycle, long enough that rolling back the previous deploy is no
   longer a live concern.
3. **Contract.** Once nothing reads the old column, mark it deprecated as
   above, and drop it in its own later migration.

Worked example, renaming `users.full_name` to `users.display_name`.

```sql
-- Migration 1 (expand): add the new column, backfill it, keep both live
ALTER TABLE users ADD COLUMN display_name text;
UPDATE users SET display_name = full_name WHERE display_name IS NULL;
-- application code now dual-writes full_name AND display_name

-- (separate deploy, no schema change): switch reads to display_name,
-- keep the dual write for one more release cycle in case of rollback

-- Migration 2 (contract), only after reads have moved and soaked:
-- verify nothing is null before marking it safe to drop
--   SELECT count(*) FROM users WHERE display_name IS NULL;  -- must be 0
COMMENT ON COLUMN users.full_name IS
  'DEPRECATED 2026-08-04: superseded by display_name; safe to drop after 2026-09-01';

-- Migration 3 (the actual drop), its own migration, after the soak window:
ALTER TABLE users DROP COLUMN full_name;
```

Three migrations, not one, each separated by real production time. This feels
slow next to a single `RENAME COLUMN`. The slowness is the point. It is the
difference between a rename a rollback can survive and one it cannot.

### 3. Back up and prove the restore before any step that can lose data

A backup nobody has restored is a hope, not a backup. Before any migration step
that deletes or overwrites data, meaning a `DROP`, a `TRUNCATE`, a destructive
`UPDATE`, or a type-narrowing `ALTER` that can lose precision, do two things in
order, never only the first.

1. **Dump** the affected table, or the whole database if that is practical, to
   a location outside the database itself.
2. **Prove the dump restores.** Load it into a disposable, clearly named
   scratch database and confirm the row counts match the source, ideally with a
   spot check of specific rows. Do not stop at "the dump command exited zero."
   That proves the dump process ran, not that the bytes it produced are a
   usable restore point. A truncated or partially written dump can exit cleanly
   and still be worthless.

Only after step 2 succeeds does the destructive statement run. Worked example
in PostgreSQL.

```bash
# 1. dump the affected table's data
pg_dump -d mydb -t affected_table --data-only > backups/affected_table_2026-08-04.sql

# 2. prove it restores, into a disposable database with an unmistakable name
createdb scratch_migration_check
psql -d scratch_migration_check -c "CREATE TABLE affected_table (LIKE mydb.affected_table INCLUDING ALL);"
psql -d scratch_migration_check < backups/affected_table_2026-08-04.sql

# 3. compare. This is the step that proves the restore, not step 1
psql -d mydb -c "SELECT count(*) FROM affected_table"
psql -d scratch_migration_check -c "SELECT count(*) FROM affected_table"
# counts must match before the destructive statement is allowed to run

# 4. tear down the scratch database once satisfied
dropdb scratch_migration_check
```

Name every disposable verification database with the unmistakable prefix
`scratch_` and nothing else. A teardown script that requires the name to be
typed twice and aborts on any mismatch makes it structurally impossible for a
typo to drop the wrong database. That is worth the extra keystroke every time.

## Checklist

1. Classify the change as additive (new column, table, or index) or as
   destructive and breaking (drop, rename, narrow a type, remove a constraint).
2. If additive, write it, review it, ship it. No special backup gate beyond
   your normal backup cadence.
3. If it renames or restructures something already in use, use expand and
   contract. Do not attempt it in a single migration.
4. If any step deletes or overwrites data, dump the affected data, restore the
   dump into a scratch database, and confirm the row counts match before the
   destructive statement runs.
5. Never combine "stop writing to this column" with "drop this column" in one
   deploy. Ship them as separate migrations at least one release cycle apart.
6. If the destructive step is on a live production system under time pressure,
   treat proving the restore as the one step you do not skip. A migration
   process too slow to prove-restore under pressure is a defect in the tooling
   to fix, never a reason to skip the proof.

## Enforcement tier

Tiers name how strong the enforcement actually is. Tier A is physically
blocked, Tier B is a deterministic check that gets run, Tier C is a convention
with nothing stopping you.

- **Tier B** where an automated migration runner applies changes inside a
  transaction, so a failed migration rolls back cleanly, and a scripted
  restore-verification step runs before any destructive statement. That
  combination is a real deterministic check.
- **Tier C** otherwise, a convention with no technical block. Say so plainly
  rather than imply a stronger guarantee than exists. The highest-leverage
  upgrade from C to A is a pre-deploy hook that refuses to apply any migration
  containing `DROP`, `TRUNCATE`, or a column rename unless a matching
  restore-proof artifact exists for that exact migration. At that point the
  wrong action is blocked, not discouraged.

## Non-negotiables

- Never `DROP` or `TRUNCATE` in the same migration that stops using the data.
  Deprecate first, drop later, in its own migration.
- Never treat a successful dump command as proof of a working restore.
  Restore it into a scratch database and compare.
- Never skip the restore proof because the deploy is time-pressured. Slow proof
  tooling is a problem to fix, not a step to route around.
