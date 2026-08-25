-- ============================================================================
-- 004: Cash is an asset, and the balance is the sum of it.
--
-- WHAT CHANGED, AND WHY IT HAD TO
--   Until now a ledger held its cash TWICE. `settings.current_balance` was the
--   figure the forecast started from, and a household that also recorded its
--   wallet or its bank account under a 現金 asset category had the same money in
--   both places. The dashboard added them together and called the result 純資産,
--   which was simply wrong for anyone who used the feature -- and nothing on
--   screen could tell the two situations apart, because nothing in the data
--   could either.
--
--   The fix is not another flag. It is to have one place where cash lives:
--
--     THE BALANCE IS THE SUM OF THE HOLDINGS IN THE CASH CATEGORY.
--
--   There is no separate balance to keep in step, so there is nothing left to
--   double count. 「現在の残高」 answers the same question it always did -- how
--   much money is at hand right now -- and now it answers it from the rows the
--   user can see and edit.
--
-- WHAT THIS COSTS
--   Asset tracking stops being entirely optional: EVERY ledger now has exactly
--   one cash category, because every ledger has a balance. Everything else about
--   the feature stays optional -- a household that ignores 資産 sees one category
--   holding one row, which is exactly what it had before under another name.
--
-- REMINDER
--   Applied migrations are never edited -- the runner skips them, so an edit
--   would only ever reach a fresh database and would silently disagree with
--   production. Change means a new numbered file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Which category holds the cash.
--
-- A dedicated column rather than matching on the name: the user may rename 現金
-- to 手元資金 or to their bank's name, and the forecast must not start reading
-- zero because of it. `kind` is the identity; `name` is a label.
--
-- Nullable, and only ever 'cash'. It is not an open taxonomy: a second special
-- kind would need code that knows what to do with it, and adding the value
-- without that code would be a silent no-op.
-- ---------------------------------------------------------------------------
ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS kind TEXT;

ALTER TABLE asset_categories DROP CONSTRAINT IF EXISTS asset_categories_kind_chk;
ALTER TABLE asset_categories
  ADD CONSTRAINT asset_categories_kind_chk CHECK (kind IS NULL OR kind = 'cash');

-- At most one per ledger. This is what lets every reader say "the cash category"
-- instead of "the first cash category", and it is also the conflict target the
-- application's lazy provisioning relies on (asset-category.repository.ts):
-- two concurrent requests for a ledger that has none both try to insert, and one
-- of them is turned into a no-op here rather than into a 500.
CREATE UNIQUE INDEX IF NOT EXISTS asset_categories_one_cash_per_ledger
  ON asset_categories (ledger_id) WHERE kind = 'cash';

-- ---------------------------------------------------------------------------
-- Carry every existing ledger across.
--
-- Per ledger:
--   1. Find its cash category. A category literally named 現金 is PROMOTED
--      rather than duplicated -- that row is already the household's cash, and
--      creating a second one beside it would recreate the double count this
--      migration exists to remove.
--   2. If the cash category has no holdings, the old `current_balance` becomes
--      one, named 口座残高. Written even when the balance is zero, so the ledger
--      has a row to edit rather than an empty category and no way in.
--   3. If it already has holdings, the old balance is NOT carried in. Those
--      rows ARE the household's cash -- adding the old figure on top would
--      preserve the double count in the new shape, permanently and invisibly.
--
-- The old value is never destroyed: the key is renamed to
-- `legacy_current_balance` below, so a household that finds its cash short
-- after this release has the previous figure to compare against.
--
-- RLS: these tables are FORCE ROW LEVEL SECURITY, which applies to the table
-- owner too -- the role running this migration. So each iteration stamps the
-- transaction with the ledger it is working on, exactly as a request would.
-- Without this every INSERT below would be rejected by the policy's WITH CHECK.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  led           RECORD;
  cash_id       BIGINT;
  legacy        NUMERIC;
  holding_count INTEGER;
BEGIN
  FOR led IN SELECT id FROM ledgers ORDER BY id LOOP
    -- SELECT ... INTO leaves the variable UNTOUCHED when no row matches, so a
    -- value from the previous ledger would otherwise be reused here -- which
    -- would attach one ledger's balance to another ledger's category.
    cash_id := NULL;
    legacy := NULL;

    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);

    SELECT id INTO cash_id
      FROM asset_categories
     WHERE ledger_id = led.id AND kind = 'cash'
     LIMIT 1;

    IF cash_id IS NULL THEN
      SELECT id INTO cash_id
        FROM asset_categories
       WHERE ledger_id = led.id AND name = '現金'
       ORDER BY sort_order, id
       LIMIT 1;
    END IF;

    IF cash_id IS NULL THEN
      INSERT INTO asset_categories (ledger_id, name, color, sort_order, fields, kind)
        VALUES (
          led.id,
          '現金',
          '#38bdf8',
          -- Ahead of whatever else exists: cash is the figure the forecast runs
          -- on, so it belongs at the top of the 資産 screen.
          -1,
          '[{"key":"f1","label":"保管場所","type":"text","required":false,"unit":null}]'::JSONB,
          'cash'
        )
        RETURNING id INTO cash_id;
    ELSE
      UPDATE asset_categories SET kind = 'cash', updated_at = now() WHERE id = cash_id;
    END IF;

    SELECT count(*) INTO holding_count FROM assets WHERE category_id = cash_id;

    IF holding_count = 0 THEN
      SELECT value::NUMERIC INTO legacy
        FROM settings
       WHERE ledger_id = led.id AND key = 'current_balance';

      INSERT INTO assets (ledger_id, category_id, name, value, fields)
        VALUES (led.id, cash_id, '口座残高', COALESCE(legacy, 0), '{}'::JSONB);
    END IF;
  END LOOP;

  -- Leave the transaction unscoped again. The statements after this block run
  -- across every ledger, and settings is ledger-scoped too.
  PERFORM set_config('app.current_ledger_id', '', true);
END
$$;

-- ---------------------------------------------------------------------------
-- Retire the old key without deleting what it held.
--
-- The application no longer reads either name -- settings has no reader left at
-- all after this release. The row survives purely as the answer to "what was my
-- balance before the migration ran", which is the one question a household
-- cannot reconstruct for itself.
--
-- Renamed rather than left in place so that nothing can quietly start reading
-- `current_balance` again and reintroduce a second source of cash.
--
-- RLS is off for this statement's purposes only in the sense that it must span
-- every ledger; the migration role owns these tables, and the policy compares
-- against a NULL scope, which matches nothing. So the scope is set to a
-- wildcard the only way the policy allows: per ledger, again.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  led RECORD;
BEGIN
  FOR led IN SELECT id FROM ledgers ORDER BY id LOOP
    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);
    DELETE FROM settings WHERE ledger_id = led.id AND key = 'legacy_current_balance';
    UPDATE settings
       SET key = 'legacy_current_balance', updated_at = now()
     WHERE ledger_id = led.id AND key = 'current_balance';
  END LOOP;
  PERFORM set_config('app.current_ledger_id', '', true);
END
$$;
