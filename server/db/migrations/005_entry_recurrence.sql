-- ============================================================================
-- 005: A planned entry has a RECURRENCE, not a day of the month.
--
-- WHAT CHANGED, AND WHY IT HAD TO
--   `entry_templates.day_of_month` made every planned entry implicitly monthly.
--   That covers rent and salary. It does not cover the expenses a household is
--   actually caught out by -- 車検 every two years, 固定資産税 four times a
--   year, a year-paid insurance premium, a trip booked for November -- and those
--   are precisely the ones a balance forecast exists to warn about.
--
--   The only way to express them before was a monthly template toggled on and
--   off by hand each month. Nobody does that reliably, and a forecast built from
--   a list somebody has to remember to curate is a forecast that quietly stops
--   being true.
--
--   So timing becomes four explicit shapes:
--
--     monthly   -- every month on day D                (unchanged behaviour)
--     yearly    -- every year in month M on day D
--     interval  -- every N months from an anchor month, on day D
--     once      -- one calendar date and then never again
--
-- WHY COLUMNS AND NOT A JSONB BLOB
--   The database can only defend an invariant it can see. Structured columns let
--   a CHECK admit exactly the fields each shape needs and forbid the rest, so a
--   row claiming to be yearly without a month cannot exist -- in production, not
--   merely in the code path that happened to write it. A JSONB column would have
--   moved that guarantee into the application and left the table accepting
--   anything shaped like an object.
--
-- WHY day_of_month LOSES ITS NOT NULL
--   'once' carries a real calendar date, so a separate day would be a second
--   copy of information the date already holds -- and two copies is one chance
--   for them to disagree. The per-shape CHECK below re-establishes the guarantee
--   the NOT NULL used to give: every shape that needs a day is required to carry
--   one, and the one that does not is required not to.
--
-- BACKFILL
--   Every existing row becomes `monthly` on the day it already had, which is
--   exactly what it already meant. No amount moves and no entry changes date.
--   This migration is therefore safe to run before the new revision is deployed
--   (and must be -- see DEPLOY.md 4 章).
--
-- REMINDER
--   Applied migrations are never edited: the runner skips them, so an edit would
--   only ever reach a fresh database and would silently disagree with
--   production. Change means a new numbered file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The discriminant.
--
-- DEFAULT 'monthly' does double duty: it backfills every existing row with the
-- meaning it already had, and it keeps any INSERT written against the old shape
-- (the import script, a hand-written fixture) producing a valid row rather than
-- a NOT NULL violation.
-- ---------------------------------------------------------------------------
ALTER TABLE entry_templates
  ADD COLUMN IF NOT EXISTS recurrence_kind TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE entry_templates
  ADD COLUMN IF NOT EXISTS month_of_year INTEGER;

ALTER TABLE entry_templates
  ADD COLUMN IF NOT EXISTS interval_months INTEGER;

-- 'YYYY-MM'. TEXT with a pattern CHECK rather than DATE: the value is a MONTH,
-- and a DATE would force a meaningless day onto it that some later reader would
-- eventually treat as significant. Matches how `monthly_amounts.year_month` is
-- already stored, so the two are comparable without conversion.
ALTER TABLE entry_templates
  ADD COLUMN IF NOT EXISTS anchor_month TEXT;

-- A real DATE for 'once': it IS a calendar date, the database can validate it,
-- and 2026-02-31 is rejected at the column rather than becoming an entry that
-- sits in the list, enabled, and never occurs.
ALTER TABLE entry_templates
  ADD COLUMN IF NOT EXISTS on_date DATE;

-- ---------------------------------------------------------------------------
-- day_of_month becomes optional, and the CHECK below makes it mandatory again
-- for the three shapes that need it.
-- ---------------------------------------------------------------------------
ALTER TABLE entry_templates
  ALTER COLUMN day_of_month DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- One CHECK per column set, so an invalid combination cannot be stored.
--
-- Written as a CASE over the discriminant rather than as a pile of OR'd
-- conditions: this way every shape states BOTH what it requires and what it
-- forbids, and adding a fifth shape is a compile-time-visible edit here rather
-- than a silently permissive gap.
--
-- The ELSE arm is unreachable while the kind CHECK holds, but CASE without it
-- yields NULL -- and a CHECK evaluating to NULL PASSES in PostgreSQL. Omitting
-- it would turn this constraint off for exactly the rows it should reject.
-- ---------------------------------------------------------------------------
ALTER TABLE entry_templates
  DROP CONSTRAINT IF EXISTS entry_templates_recurrence_kind_chk;
ALTER TABLE entry_templates
  ADD CONSTRAINT entry_templates_recurrence_kind_chk
  CHECK (recurrence_kind IN ('monthly', 'yearly', 'interval', 'once'));

ALTER TABLE entry_templates
  DROP CONSTRAINT IF EXISTS entry_templates_recurrence_shape_chk;
ALTER TABLE entry_templates
  ADD CONSTRAINT entry_templates_recurrence_shape_chk
  CHECK (
    CASE recurrence_kind
      WHEN 'monthly' THEN
        day_of_month IS NOT NULL
        AND month_of_year IS NULL
        AND interval_months IS NULL
        AND anchor_month IS NULL
        AND on_date IS NULL
      WHEN 'yearly' THEN
        day_of_month IS NOT NULL
        AND month_of_year IS NOT NULL
        AND interval_months IS NULL
        AND anchor_month IS NULL
        AND on_date IS NULL
      WHEN 'interval' THEN
        day_of_month IS NOT NULL
        AND month_of_year IS NULL
        AND interval_months IS NOT NULL
        AND anchor_month IS NOT NULL
        AND on_date IS NULL
      WHEN 'once' THEN
        on_date IS NOT NULL
        AND day_of_month IS NULL
        AND month_of_year IS NULL
        AND interval_months IS NULL
        AND anchor_month IS NULL
      ELSE FALSE
    END
  );

-- Ranges. Kept in step with shared/recurrence.ts -- where they disagree the
-- database wins and the user gets a CONFLICT instead of a readable message.
--
-- interval_months starts at 2 because `interval` with 1 is `monthly` spelled a
-- second way, and two representations of one meaning is one more thing every
-- reader has to normalise.
ALTER TABLE entry_templates
  DROP CONSTRAINT IF EXISTS entry_templates_month_of_year_chk;
ALTER TABLE entry_templates
  ADD CONSTRAINT entry_templates_month_of_year_chk
  CHECK (month_of_year IS NULL OR month_of_year BETWEEN 1 AND 12);

ALTER TABLE entry_templates
  DROP CONSTRAINT IF EXISTS entry_templates_interval_months_chk;
ALTER TABLE entry_templates
  ADD CONSTRAINT entry_templates_interval_months_chk
  CHECK (interval_months IS NULL OR interval_months BETWEEN 2 AND 60);

ALTER TABLE entry_templates
  DROP CONSTRAINT IF EXISTS entry_templates_anchor_month_chk;
ALTER TABLE entry_templates
  ADD CONSTRAINT entry_templates_anchor_month_chk
  CHECK (anchor_month IS NULL OR anchor_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ---------------------------------------------------------------------------
-- entry_templates_ledger_idx (ledger_id, sort_order, day_of_month) IS LEFT
-- ALONE, deliberately.
--
-- The first instinct was to rebuild it: day_of_month is now NULL for one-offs,
-- and an index naming a column that is sometimes absent looks wrong. It is not.
-- A btree indexes NULLs like any other value, so the index stays valid and its
-- (ledger_id, sort_order) prefix -- the part that actually serves the
-- repository's read -- is unaffected.
--
-- Leaving it alone buys nothing in LOCKING terms, and it would be wrong to
-- claim otherwise: the ADD CONSTRAINT statements above already hold ACCESS
-- EXCLUSIVE on this table for the whole transaction, existing-row validation
-- included. A DROP INDEX here would take a lock this migration is holding
-- anyway.
--
-- The reason is simpler. No query's plan depends on the third column, so a
-- rebuild buys nothing at all -- and a migration statement that buys nothing is
-- one more thing that can fail against a production table.
--
-- (The third column does not serve the ORDER BY either way. getAll() orders by
-- COALESCE(day_of_month, day of on_date), which no plain-column index can
-- satisfy -- so if this ever becomes a measured problem, the answer is an
-- expression index, not a reshuffle of these three columns.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- THERE IS NOTHING LEFT TO VERIFY HERE, AND AN EARLIER VERSION OF THIS FILE
-- TRIED ANYWAY -- WITH A CHECK THAT COULD NOT WORK.
--
-- The backfill cannot miss a row. `ADD COLUMN ... NOT NULL DEFAULT 'monthly'`
-- gives EVERY existing row the value, and day_of_month is never touched. There
-- is no partial outcome for a check to find.
--
-- The version that looked for one counted rows with a plain SELECT. That could
-- never return anything: entry_templates is FORCE ROW LEVEL SECURITY with a
-- policy of `ledger_id = app_current_ledger_id()`, and that function returns
-- NULL when no scope has been opened (002, "FAIL-CLOSED BY DEFAULT").
-- Migrations open no scope, so the count was structurally always zero -- the
-- check reported success by being BLIND, and the test asserting "warns about
-- nothing" passed for exactly the same reason. Two things agreeing because
-- neither can see is the worst shape a verification can take.
--
-- THE RULE THIS LEAVES BEHIND
--   A migration that READS data across ledgers has to loop and
--   `set_config('app.current_ledger_id', ..., true)` per ledger, as 004 does.
--   DDL does not: ALTER TABLE, and a CHECK constraint's validation of existing
--   rows, both bypass row-level security -- which is why the constraints above
--   genuinely do examine every row in every ledger.
-- ---------------------------------------------------------------------------
