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
--
--      When there is MORE THAN ONE such category (nothing stops it: asset
--      categories have no unique name, and applying the 現金 template twice was
--      an ordinary thing to do), the one HOLDING THE MONEY is promoted, not the
--      first by sort order. Promoting an empty one and then carrying the old
--      balance into it would leave the real cash sitting beside it as "some
--      other asset" -- the same money, counted twice, in the new shape.
--
--   2. Decide whether the old balance still needs a home, by looking at what
--      the household's cash categories ACTUALLY HOLD -- summed across every
--      category named 現金, not just the promoted one:
--
--        total = 0  ->  the old `current_balance` becomes a holding named
--                       口座残高. Written even when the balance is zero, so the
--                       ledger has a row to edit rather than an empty category
--                       and no way in. A ledger whose only cash row is itself
--                       ¥0 also lands here, which is deliberate: adding X to 0
--                       cannot double count, while dropping X loses money.
--
--        total ≠ 0  ->  NOT carried in. Those rows ARE the household's cash;
--                       adding the old figure on top would preserve the double
--                       count permanently and invisibly, because the result
--                       still looks like a balance.
--
-- The old value is never destroyed: the key is renamed to
-- `legacy_current_balance` below, so a household that finds its cash short
-- after this release has the previous figure to compare against.
--
-- RLS: these tables are FORCE ROW LEVEL SECURITY, which applies to the table
-- owner too -- the role running this migration. (On Cloud SQL the owner is
-- `postgres`, which is NOT a real superuser, so the policies genuinely apply.)
-- Each iteration therefore stamps the transaction with the ledger it is working
-- on, exactly as a request would. Without this every INSERT below would be
-- rejected by the policy's WITH CHECK.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  led         RECORD;
  cash_id     BIGINT;
  raw_balance TEXT;
  legacy      NUMERIC;
  cash_total  NUMERIC;
BEGIN
  -- NOTE for whoever edits this: PL/pgSQL's SELECT ... INTO assigns NULL when no
  -- row matches -- it does NOT leave the variable holding the previous
  -- iteration's value. So the loop needs no manual resets, and adding some
  -- "to be safe" would suggest a hazard that does not exist.
  FOR led IN SELECT id FROM ledgers ORDER BY id LOOP
    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);

    -- 1. The cash category ------------------------------------------------
    SELECT id INTO cash_id
      FROM asset_categories
     WHERE ledger_id = led.id AND kind = 'cash'
     LIMIT 1;

    IF cash_id IS NULL THEN
      -- Ordered by holdings first: see the note above on duplicate 現金.
      --
      -- Then by VALUE, which decides the tie the row count cannot. Two
      -- categories holding one row each are level on the first key, and picking
      -- by sort_order there would make ¥100,000 the balance while ¥200,000 sat
      -- beside it as an ordinary asset -- net worth right, forecast starting
      -- from the smaller half. The count stays the first key because what B1
      -- needed was "the one that holds anything at all".
      SELECT c.id INTO cash_id
        FROM asset_categories c
       WHERE c.ledger_id = led.id AND c.name = '現金'
       ORDER BY (SELECT count(*) FROM assets a WHERE a.category_id = c.id) DESC,
                (SELECT coalesce(sum(a.value), 0) FROM assets a WHERE a.category_id = c.id) DESC,
                c.sort_order,
                c.id
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

      -- Worth saying out loud: the ledger keeps a second category called 現金
      -- that is now an ordinary asset. Nothing is lost and net worth is right,
      -- but 現在の残高 no longer includes it, so the household will see the
      -- balance drop unless someone merges the rows by hand.
      IF (SELECT count(*) FROM asset_categories
           WHERE ledger_id = led.id AND name = '現金') > 1 THEN
        RAISE WARNING
          'ledger %: more than one category is named 現金. The one holding the most was promoted; the rest are ordinary assets now.',
          led.id;
      END IF;
    END IF;

    -- 2. Does the old balance still need a home? ---------------------------
    SELECT coalesce(sum(a.value), 0) INTO cash_total
      FROM assets a
      JOIN asset_categories c ON c.id = a.category_id
     WHERE c.ledger_id = led.id AND (c.id = cash_id OR c.name = '現金');

    -- `AND NOT EXISTS ...` keeps this block re-runnable. The zero-sum case above
    -- deliberately ADDS a row rather than replacing one, so without the guard a
    -- second run (a hand-applied migration, a dump restored without
    -- schema_migrations) would stack another 口座残高 on top of the first.
    IF cash_total = 0
       AND NOT EXISTS (
         SELECT 1 FROM assets WHERE category_id = cash_id AND name = '口座残高'
       )
    THEN
      SELECT s.value INTO raw_balance
        FROM settings s
       WHERE s.ledger_id = led.id AND s.key = 'current_balance';

      -- The old value is TEXT and NOTHING EVER VALIDATED IT. setBalance took any
      -- finite JS number, the column has no CHECK, and the SQLite import copied
      -- whatever was there. A value that will not parse, or that overflows
      -- NUMERIC(14,2), would abort this migration and block the deployment --
      -- so it is read defensively and the problem is reported rather than
      -- thrown. The original survives as legacy_current_balance either way.
      IF raw_balance IS NULL THEN
        legacy := 0;
      ELSIF btrim(raw_balance) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        -- Rounded: every holding is a whole number of yen now
        -- (server/http/input-schemas.ts), and a fractional one could not be
        -- saved again without the user retyping it.
        legacy := round(btrim(raw_balance)::NUMERIC);
      ELSE
        RAISE WARNING
          'ledger %: current_balance % is not a number; carrying 0. The original is kept as legacy_current_balance.',
          led.id, raw_balance;
        legacy := 0;
      END IF;

      -- NUMERIC(14,2) tops out below 10^12.
      IF legacy > 999999999999 OR legacy < -999999999999 THEN
        RAISE WARNING
          'ledger %: current_balance % exceeds what an asset value can hold; clamped. The original is kept as legacy_current_balance.',
          led.id, raw_balance;
        legacy := LEAST(GREATEST(legacy, -999999999999), 999999999999);
      END IF;

      INSERT INTO assets (ledger_id, category_id, name, value, fields)
        VALUES (led.id, cash_id, '口座残高', legacy, '{}'::JSONB);
    END IF;
  END LOOP;

  -- Leave the transaction unscoped again. The block below re-scopes per ledger.
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
-- Retired rather than left in place so that nothing can quietly start reading
-- `current_balance` again and reintroduce a second source of cash.
--
-- COPY-THEN-DELETE, NOT UPDATE ... SET key. The obvious form was
--   DELETE the old legacy row; UPDATE current_balance -> legacy_current_balance
-- which is destructive if it ever runs twice: the DELETE removes the value the
-- first run saved and the UPDATE then finds nothing to replace it with, leaving
-- the ledger with no record of its previous balance -- the exact promise this
-- block exists to keep. The runner skips applied migrations, but a hand-run or a
-- dump restored without schema_migrations would not, and a promise that only
-- holds while nobody makes a mistake is not worth writing down.
--
-- ON CONFLICT DO NOTHING keeps an existing legacy value as the older, and
-- therefore more useful, one.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  led RECORD;
BEGIN
  FOR led IN SELECT id FROM ledgers ORDER BY id LOOP
    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);

    INSERT INTO settings (ledger_id, key, value, updated_at)
      SELECT s.ledger_id, 'legacy_current_balance', s.value, now()
        FROM settings s
       WHERE s.ledger_id = led.id AND s.key = 'current_balance'
      ON CONFLICT (ledger_id, key) DO NOTHING;

    DELETE FROM settings WHERE ledger_id = led.id AND key = 'current_balance';
  END LOOP;
  PERFORM set_config('app.current_ledger_id', '', true);
END
$$;
