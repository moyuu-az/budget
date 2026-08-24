-- ============================================================================
-- 003: Asset tracking, and the fixed/variable classification of expense
--      categories.
--
-- TWO FEATURES, ONE MIGRATION
--   They ship together and neither is useful without the other half of the
--   release. Splitting them would mean two files that must be applied in the
--   same deployment anyway.
--
-- REMINDER
--   Applied migrations are never edited -- the runner skips them, so an edit
--   would only ever reach a fresh database and would silently disagree with
--   production. Change means a new numbered file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reusable isolation helper.
--
-- Migration 002 spells the ENABLE/FORCE/POLICY sequence out inline. Repeating
-- those eight lines for every new ledger-scoped table is how a table eventually
-- ships with ENABLE but no FORCE, or with USING but no WITH CHECK -- both of
-- which leak while every existing test keeps passing.
--
-- So the sequence is written once here and called per table. Later migrations
-- adding a ledger-scoped table should call this and nothing else.
--
-- NOT security definer: it runs ALTER TABLE, which requires ownership. The
-- application role calling it would simply be refused, which is the intent --
-- and the function can only ever ADD isolation, never remove it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_ledger_isolation(target_table TEXT) RETURNS VOID
  LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
  -- FORCE, not just ENABLE: without it the table OWNER is exempt from its own
  -- policies, and migrations create these tables as the owner.
  EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', target_table);
  -- CREATE POLICY has no IF NOT EXISTS, so drop first to stay re-runnable.
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_ledger_isolation', target_table);
  -- USING filters what SELECT/UPDATE/DELETE can see; WITH CHECK rejects an
  -- INSERT/UPDATE that would write a row into another ledger. USING alone would
  -- still let a caller create a row elsewhere.
  EXECUTE format(
    'CREATE POLICY %I ON %I USING (ledger_id = app_current_ledger_id()) '
    'WITH CHECK (ledger_id = app_current_ledger_id())',
    target_table || '_ledger_isolation', target_table
  );
END
$$;

-- Schema surgery is for the owner only; the application role has no business
-- calling this even though it can do no harm.
REVOKE EXECUTE ON FUNCTION apply_ledger_isolation(TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Fixed / variable expenses
--
-- The classification lives on the CATEGORY, not on the template or the monthly
-- amount. A household decides once that 家賃 is a fixed cost; recording it per
-- entry would mean re-deciding every month and would let the same category be
-- fixed in January and variable in February -- a distinction with no meaning
-- that every report would then have to resolve.
-- ---------------------------------------------------------------------------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS cost_type TEXT;

-- Two rules in one constraint, deliberately:
--   1. only the two known values, and
--   2. only on expense categories -- 固定費/変動費 is meaningless for income,
--      and allowing it would put a value on screen that no report can use.
--
-- NULL stays legal on expense categories: it means "not classified yet", which
-- is what every category that already exists is.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_cost_type_chk;
ALTER TABLE categories ADD CONSTRAINT categories_cost_type_chk
  CHECK (cost_type IS NULL OR (cost_type IN ('fixed', 'variable') AND type = 'expense'));

-- ---------------------------------------------------------------------------
-- Assets
--
-- WHY A `fields` SCHEMA INSTEAD OF ONE TABLE PER ASSET KIND
--   What must be recorded depends on the kind of holding: a NISA position needs
--   its 銘柄 and 取得単価, cash needs neither. Modelling that as columns means a
--   migration -- and a deployment -- every time a household starts tracking
--   something new, which is not a reasonable price for adding a row.
--
--   So the CATEGORY carries the shape (an array of field definitions) and each
--   asset carries values matching it. shared/asset-fields.ts holds the one
--   validator both the browser and the server run, because JSONB itself
--   enforces nothing beyond "is valid JSON".
--
-- The CHECK constraints below are the floor under that validator: even a bug in
-- the server cannot store an object where the code will iterate an array.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id  BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- AssetFieldDef[] -- see shared/asset-fields.ts.
  fields     JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Target of the composite foreign key below: what stops an asset in one
  -- ledger from being attached to another ledger's category.
  UNIQUE (ledger_id, id)
);

CREATE INDEX IF NOT EXISTS asset_categories_ledger_idx
  ON asset_categories (ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS assets (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id   BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,

  -- Required, unlike entry_templates.category_id. An asset's parameters are
  -- defined by its category, so a category-less asset would have values with
  -- nothing to interpret them.
  category_id BIGINT NOT NULL,

  name        TEXT NOT NULL,

  -- NUMERIC for the same reason money is NUMERIC everywhere else: exact
  -- arithmetic, so a portfolio total does not drift.
  --
  -- No `CHECK (value >= 0)`, unlike monthly_amounts. A household that tracks a
  -- loan balance as an asset category has to enter it negative for the total to
  -- mean anything.
  value       NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- AssetFieldValues -- an object keyed by AssetFieldDef.key.
  fields      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ledger_id, id),

  -- Cross-ledger integrity, and the reason deleting a category takes its
  -- holdings with it: an orphaned holding would carry parameter values with no
  -- definitions to read them by. The UI states this before it deletes.
  FOREIGN KEY (ledger_id, category_id)
    REFERENCES asset_categories (ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assets_ledger_category_idx
  ON assets (ledger_id, category_id);

SELECT apply_ledger_isolation('asset_categories');
SELECT apply_ledger_isolation('assets');
