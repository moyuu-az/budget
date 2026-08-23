-- ============================================================================
-- 001: Initial PostgreSQL schema for the multi-ledger (household + personal)
--      balance forecast app.
--
-- BACKGROUND
--   This replaces the single-user, single-dataset SQLite schema the app used as
--   an Electron desktop app. Two people share one deployment: most data lives in
--   a shared household ledger, but each person also keeps private ledgers.
--
-- WHY "LEDGER" AND NOT "user_id ON EVERY TABLE"
--   A plain owner column cannot express "shared". You would have to encode it as
--   NULL, which forces every query into `WHERE user_id = ? OR user_id IS NULL`
--   and spreads that convention across ~25 repository methods. It also breaks
--   down on `settings`, which holds exactly one `current_balance` per forecast:
--   a shared forecast and a personal forecast need separate balances, and an
--   owner column has nowhere to put the shared one.
--
--   So the tenancy unit is the LEDGER (one self-contained forecast: its own
--   balance, categories, templates and snapshots). Membership -- who may open
--   which ledger -- lives ONLY in `ledger_members`. No domain table carries a
--   user reference, so access control has exactly one source of truth.
--
-- INVARIANT THAT MUST NOT BE BROKEN
--   `ledgers.kind` is a DISPLAY LABEL ONLY. Never branch authorization on it.
--   The moment someone writes `WHERE kind = 'shared'` to decide access, the
--   membership table stops being the single source of truth and adding a third
--   kind of ledger (kids, side business) becomes a schema change instead of a
--   row insert.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- A person who may sign in. Rows are provisioned just-in-time on first
-- successful IAP login (see server/auth/), so no real account identifier is
-- ever committed to this repository.
CREATE TABLE IF NOT EXISTS users (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Google's stable subject identifier from the IAP JWT. This -- NOT the email
  -- address -- is the identity key. Emails are mutable: matching on email means
  -- a person who changes their Google address silently loses access to their
  -- own data and gets re-provisioned as a stranger.
  google_sub   TEXT NOT NULL UNIQUE,

  -- Last-seen email. Refreshed on every login. Used for display and for the
  -- bootstrap allowlist check, never for identity lookup.
  email        TEXT NOT NULL,

  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One self-contained forecast: balance, categories, templates, snapshots.
CREATE TABLE IF NOT EXISTS ledgers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Stable machine identifier used by bootstrap/provisioning code so it can be
  -- idempotent ('shared' for the household ledger, 'personal:<user id>' for a
  -- private one). The app never shows this; it shows `name`.
  slug       TEXT NOT NULL UNIQUE,

  name       TEXT NOT NULL,

  -- Display hint for the ledger switcher (icon/grouping) ONLY. See the
  -- invariant note in the header: authorization never reads this column.
  kind       TEXT NOT NULL CHECK (kind IN ('shared', 'personal')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The ONLY place that answers "may this user open this ledger?".
CREATE TABLE IF NOT EXISTS ledger_members (
  ledger_id  BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_id, user_id)
);

CREATE INDEX IF NOT EXISTS ledger_members_user_idx ON ledger_members (user_id);

-- ---------------------------------------------------------------------------
-- Ledger-scoped domain tables
--
-- Every table below carries `ledger_id NOT NULL`. Two mechanisms keep that
-- column trustworthy:
--   1. Repositories are constructed bound to one ledger, so no query can be
--      issued without a scope (server/repositories/index.ts).
--   2. Row-level security (migration 002), which filters rows at the database
--      even if a repository forgets its WHERE clause.
-- ---------------------------------------------------------------------------

-- Per-ledger key/value settings. Currently holds only 'current_balance', but
-- the key/value shape is kept so adding a setting is not a migration.
-- PRIMARY KEY is (ledger_id, key): the old schema's bare `key` primary key
-- allowed exactly one balance for the whole database.
CREATE TABLE IF NOT EXISTS settings (
  ledger_id  BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_id, key)
);

CREATE TABLE IF NOT EXISTS categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id  BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  color      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Not redundant with the primary key: it is the target of the composite
  -- foreign key on entry_templates, which is what stops a template in one
  -- ledger from pointing at a category in another.
  UNIQUE (ledger_id, id)
);

CREATE INDEX IF NOT EXISTS categories_ledger_idx ON categories (ledger_id, type, sort_order);

CREATE TABLE IF NOT EXISTS entry_templates (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id      BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  day_of_month   INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  type           TEXT NOT NULL CHECK (type IN ('income', 'expense')),

  -- Was INTEGER 0/1 under SQLite.
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,

  sort_order     INTEGER NOT NULL DEFAULT 0,
  category_id    BIGINT,

  -- Money is NUMERIC, not the REAL (binary float) the SQLite schema used.
  -- Floats cannot represent every decimal amount exactly, so long-running sums
  -- in a ledger drift. NUMERIC(14,2) is exact and still fits a JS number
  -- (max 999999999999.99 ~= 1e12, well under Number.MAX_SAFE_INTEGER ~= 9e15),
  -- which is why the API contract can keep using `number`.
  default_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ledger_id, id),

  -- Cross-ledger integrity: a template may only reference a category in its OWN
  -- ledger. MATCH SIMPLE (the default) skips the check when category_id IS
  -- NULL, so "no category" stays legal.
  --
  -- The `(category_id)` column list on ON DELETE SET NULL requires PostgreSQL
  -- 15+. Without it, deleting a category would try to NULL `ledger_id` too and
  -- fail its NOT NULL constraint. Do not deploy this schema on PG 14 or older.
  FOREIGN KEY (ledger_id, category_id)
    REFERENCES categories (ledger_id, id) ON DELETE SET NULL (category_id)
);

CREATE INDEX IF NOT EXISTS entry_templates_ledger_idx
  ON entry_templates (ledger_id, sort_order, day_of_month);

-- Planned amounts per template per month.
--
-- `ledger_id` is denormalised here (it is already implied by template_id). That
-- is deliberate: without it every read would need a JOIN to entry_templates
-- just to scope, and the RLS policy could not be a simple column predicate.
-- The composite foreign key below makes an inconsistent denormalisation
-- structurally impossible -- a row whose ledger_id disagrees with its
-- template's cannot be inserted at all.
CREATE TABLE IF NOT EXISTS monthly_amounts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id   BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL,
  year_month  TEXT NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No ledger_id needed here: template_id already determines the ledger, so
  -- this is transitively scoped and stays correct.
  UNIQUE (template_id, year_month),

  FOREIGN KEY (ledger_id, template_id)
    REFERENCES entry_templates (ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS monthly_amounts_ledger_month_idx
  ON monthly_amounts (ledger_id, year_month);

-- Recorded actuals per template per month. Same shape and rationale as
-- monthly_amounts above.
CREATE TABLE IF NOT EXISTS monthly_actuals (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id     BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  template_id   BIGINT NOT NULL,
  year_month    TEXT NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  actual_amount NUMERIC(14, 2) NOT NULL CHECK (actual_amount >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (template_id, year_month),

  FOREIGN KEY (ledger_id, template_id)
    REFERENCES entry_templates (ledger_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS monthly_actuals_ledger_month_idx
  ON monthly_actuals (ledger_id, year_month);

-- Point-in-time recorded balances.
--
-- The uniqueness key MUST include ledger_id. The old schema had a bare
-- `date TEXT UNIQUE`, and the repository upserts with
-- ON CONFLICT (date) DO UPDATE. Carrying that over unchanged would mean saving
-- a snapshot in your personal ledger silently overwrites the household
-- snapshot for the same day -- a data-loss bug, not just a visibility one.
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id  BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  balance    NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ledger_id, date)
);

CREATE INDEX IF NOT EXISTS balance_snapshots_ledger_date_idx
  ON balance_snapshots (ledger_id, date DESC);
