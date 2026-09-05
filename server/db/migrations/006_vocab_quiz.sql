-- ============================================================================
-- 006: The English vocabulary quiz -- one table, and a SECOND kind of isolation.
--
-- WHY THIS IS NOT LEDGER-SCOPED
--   Everything before this migration belongs to a HOUSEHOLD. A study record does
--   not. Two people share the 家計 ledger and each has a private one; if the
--   quiz record hung off a ledger, switching the ledger switcher would change
--   whose answers you were looking at, 「間違えた問題だけ」 would re-ask
--   questions the other person got wrong, and 正答率 would be an average of two
--   people who never sat the same quiz.
--
--   So the tenant here is the USER. That needs its own predicate, its own GUC,
--   and its own transaction scope (server/db/user-scope.ts) -- deliberately
--   parallel to the ledger machinery rather than reusing it, because a table
--   protected by the WRONG predicate is worse than one protected by none: it
--   looks guarded in every flag-level check.
--
-- WHY THE WORDS THEMSELVES ARE NOT HERE
--   The 80 phrases are a printed book transcribed once. They are identical for
--   every user, never edited from the UI, and they have to be reviewable -- a
--   wrong meaning is a wrong answer marked correct. They live in
--   shared/vocabulary/words.ts, where a change shows up in a diff and is covered
--   by integrity tests. Seeding them here would mean a second copy that can
--   disagree with the first, per database.
--
--   The consequence is that `word_id` has NO foreign key. That is the intended
--   trade, and it is safe in one direction only: a row naming a word the book no
--   longer carries is dropped on read (see `wordById`), never rendered. It is
--   the client's job to ignore it, not the database's to forbid it.
--
-- REMINDER
--   Applied migrations are never edited. Change means a new numbered file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The user isolation predicate, defined once.
--
-- Mirrors app_current_ledger_id() from migration 002, including the two
-- properties that make that one safe:
--
--   FAIL-CLOSED. Returns NULL when the setting was never set, so every policy
--   compares `user_id = NULL` -- which is NULL, which is not TRUE, so no row
--   passes. Forgetting to open a scope yields an empty result, never an
--   unfiltered one.
--
--   NULLIF guards the empty string, which would otherwise raise on the ::BIGINT
--   cast instead of failing closed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS BIGINT
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::BIGINT
$$;

-- ---------------------------------------------------------------------------
-- Reusable isolation helper for user-scoped tables.
--
-- The twin of apply_ledger_isolation() from migration 003, and it exists for
-- the same reason: writing the ENABLE/FORCE/POLICY sequence out per table is how
-- a table eventually ships with ENABLE but no FORCE, or with USING but no WITH
-- CHECK -- both of which leak while every existing test keeps passing.
--
-- NOT security definer: it runs ALTER TABLE, which requires ownership. The
-- application role calling it would simply be refused, which is the intent --
-- and the function can only ever ADD isolation, never remove it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_user_isolation(target_table TEXT) RETURNS VOID
  LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
  -- FORCE, not just ENABLE: without it the table OWNER is exempt from its own
  -- policies, and migrations create these tables as the owner.
  EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', target_table);
  -- CREATE POLICY has no IF NOT EXISTS, so drop first to stay re-runnable.
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target_table || '_user_isolation', target_table);
  -- USING filters what SELECT/UPDATE/DELETE can see; WITH CHECK rejects an
  -- INSERT/UPDATE that would write a row against another person. USING alone
  -- would still let a caller record answers into somebody else's study log.
  EXECUTE format(
    'CREATE POLICY %I ON %I USING (user_id = app_current_user_id()) '
    'WITH CHECK (user_id = app_current_user_id())',
    target_table || '_user_isolation', target_table
  );
END
$$;

REVOKE EXECUTE ON FUNCTION apply_user_isolation(TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- One row per ANSWER, not per word.
--
-- WHY THE HISTORY AND NOT A RUNNING TALLY
--   A `vocab_progress` table holding attempts/correct per word would be smaller
--   and would make every read trivial. It would also be a SECOND place the same
--   fact lives: the moment a tally and the answers behind it can disagree,
--   nothing on screen says which of the two is wrong. Keeping the answers and
--   deriving the tally means the tally cannot be wrong -- it can only be slow,
--   and 80 words times a household is not slow.
--
--   It also buys what a tally cannot express: 「直近の答えが正解だったか」, which
--   is what 「間違えた問題だけ」 actually selects on. A word answered wrong four
--   times and right just now has been learned; a tally says it is 20%.
--
--   THE COST IS THAT THIS TABLE ONLY GROWS. Every other table in this schema is
--   bounded by what a household has -- so many categories, so many holdings --
--   and this one is bounded by how much studying happens. Two people working
--   through 80 words is nothing (a submission is capped at 200 answers, and the
--   aggregate reads one person's rows through an index), so there is no pruning
--   and no archive table to keep in step. If a reader ever accumulates enough
--   history for `getVocabProgress` to be slow, the fix is a materialised tally
--   REFRESHed from these rows -- never a tally written beside them, which is the
--   two-sources-of-truth this design exists to avoid.
--
-- WHY THE PRIMARY KEY IS A SEQUENCE AND NOT (user, word, direction, time)
--   `answered_at` defaults to now(), and in PostgreSQL now() is TRANSACTION
--   start time -- so every answer of one submitted quiz carries the SAME
--   timestamp. Ordering by it alone leaves "the most recent answer" undefined
--   WITHIN a run, which is the case that actually happens: a reader answers the
--   same word twice in one session and the second answer is the one that counts.
--   The id is monotonic in insert order, so `ORDER BY answered_at DESC, id DESC`
--   resolves that tie the way the reader experienced it. Read that ordering as
--   load-bearing, not as tidiness.
--
--   IT IS NOT A TOTAL ORDER ACROSS TRANSACTIONS. Two submissions that overlap
--   can have their timestamps and their ids disagree -- the one that began later
--   may commit its rows first. The window is a single round trip, one person
--   would have to be answering in two tabs at once, and the consequence is that
--   one word's 「直近の正誤」 is taken from the wrong one of two answers they gave
--   seconds apart. Not worth a clock column; worth writing down, so nobody reads
--   the paragraph above as a stronger guarantee than it is.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vocab_attempts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- VocabWord.id from shared/vocabulary/words.ts ('et-481'). No foreign key:
  -- see the header. Bounded so a client cannot store a novel here.
  word_id     TEXT NOT NULL CHECK (length(word_id) BETWEEN 1 AND 64),

  -- QuizDirection. The CHECK is the database's copy of the union in
  -- shared/vocabulary/types.ts; adding a direction there needs a migration here,
  -- which is the point -- a value the statistics do not know how to break down
  -- would otherwise arrive silently.
  direction   TEXT NOT NULL CHECK (direction IN ('en_to_ja', 'ja_to_en')),

  correct     BOOLEAN NOT NULL,

  answered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The shape of every read: one person's rows, grouped by word and direction,
-- most recent first. Covers both the aggregate and the "latest answer" lookup.
CREATE INDEX IF NOT EXISTS vocab_attempts_user_word_idx
  ON vocab_attempts (user_id, word_id, direction, answered_at DESC, id DESC);

SELECT apply_user_isolation('vocab_attempts');
