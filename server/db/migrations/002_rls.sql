-- ============================================================================
-- 002: Row-level security -- the second of two layers that keep one ledger's
--      rows out of another ledger's responses.
--
-- WHY A SECOND LAYER
--   The first layer is structural: repositories are constructed already bound to
--   a ledger, so there is no way to call a query without a scope. That is enough
--   *when the code is correct*. This layer assumes it is not. Six repositories
--   with roughly 25 methods means roughly 25 chances to forget a predicate, and
--   the failure mode -- one household seeing the other person's private ledger
--   -- is exactly the thing this application must never do.
--
--   With these policies in place, a repository that forgets `WHERE ledger_id`
--   returns nothing instead of returning someone else's rows.
--
-- HOW THE SCOPE IS SET
--   server/db/ledger-scope.ts opens a transaction and calls
--   set_config('app.current_ledger_id', <id>, true). The `true` makes it
--   transaction-local, so a pooled connection handed to the next request never
--   inherits the previous request's ledger.
--
-- FAIL-CLOSED BY DEFAULT
--   app_current_ledger_id() returns NULL when the setting was never set. Every
--   policy then compares `ledger_id = NULL`, which is NULL, which is not TRUE,
--   so no row passes. Forgetting to open a scope yields an empty result, never
--   an unfiltered one.
--
-- TABLES DELIBERATELY *NOT* COVERED
--   users, ledgers and ledger_members are read by the authentication layer to
--   work out who the caller is and which ledgers they may open -- that happens
--   BEFORE a ledger is chosen, so a ledger predicate cannot apply to them.
--   Their protection is that only server/auth/ touches them, and it always
--   filters by the authenticated user id. Do not add domain data to these
--   tables.
-- ============================================================================

-- The isolation predicate, defined once. Every policy below calls it, so the
-- definition of "the current ledger" has a single source of truth.
--
-- NULLIF guards the empty string: set_config(..., '', true) would otherwise
-- raise on the ::BIGINT cast instead of failing closed.
CREATE OR REPLACE FUNCTION app_current_ledger_id() RETURNS BIGINT
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_ledger_id', true), '')::BIGINT
$$;

-- FORCE, not just ENABLE.
--
-- ENABLE alone exempts the table's OWNER from its own policies. Migrations run
-- as the owner, and on Cloud SQL it is easy to end up with the application
-- connecting as that same role -- at which case RLS silently does nothing and
-- this whole file becomes decoration. FORCE removes the exemption, so the
-- policies hold no matter which role connects.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'settings',
    'categories',
    'entry_templates',
    'monthly_amounts',
    'monthly_actuals',
    'balance_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);

    -- CREATE POLICY has no IF NOT EXISTS, so drop first to stay re-runnable.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_ledger_isolation', t);

    -- USING filters what SELECT/UPDATE/DELETE can see; WITH CHECK rejects
    -- INSERT/UPDATE that would write a row into another ledger. Both are
    -- required: USING alone would still let a caller *create* a row elsewhere.
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (ledger_id = app_current_ledger_id()) '
      'WITH CHECK (ledger_id = app_current_ledger_id())',
      t || '_ledger_isolation', t
    );
  END LOOP;
END
$$;
