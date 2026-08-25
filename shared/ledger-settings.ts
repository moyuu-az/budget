// ---------------------------------------------------------------------------
// PER-LEDGER SETTINGS.
//
// The `settings` table has existed since migration 001 as a key/value store, and
// since migration 004 nothing has read it: its only key, `current_balance`, was
// retired when the balance became the sum of the cash holdings. This module is
// what gives it a reader again -- and, more importantly, a SHAPE.
//
// WHY A TYPED FACADE OVER A KEY/VALUE TABLE
//   The table stores TEXT. Left as-is, every caller would parse its own value,
//   pick its own default when the row is missing, and decide for itself what an
//   unparseable value means. Three callers is three answers, and the answers
//   differ exactly when the data is bad -- which is when it matters.
//
//   So the table stays generic (adding a setting is not a migration, which was
//   the point of the shape) and the MEANING lives here: one place that knows the
//   keys, the defaults, and how a stored string becomes a number.
//
// WHY DEFAULTS LIVE HERE AND NOT IN THE DATABASE
//   A DEFAULT on a key/value table cannot be per-key. More importantly, a
//   missing row and a row holding the default are the same thing to every reader
//   here, so there is nothing to keep in step -- a ledger that has never opened
//   the settings screen reads exactly what one that saved the default does.
// ---------------------------------------------------------------------------

/**
 * Everything a ledger can configure.
 *
 * A closed object rather than a `Record<string, string>`: the client renders a
 * form from it, the server validates against it, and both should fail to compile
 * when a setting is added and one of them is not updated.
 */
export interface LedgerSettings {
  /**
   * The balance the household wants to stay above, in yen.
   *
   * WHAT IT IS FOR
   *   Everything the dashboard calls 「安全」/「注意」 is measured against this,
   *   and the projected 使っていい額 is what is left ABOVE it. It was `50000`
   *   hard-coded in KpiHero, which made one household's comfortable floor another
   *   household's rent -- and there was nothing on screen saying where the number
   *   came from or how to change it.
   *
   *   Zero is a legitimate value and means "warn me only when I would go
   *   negative". Negative is not: a floor below zero is an overdraft the
   *   application has no way to model, and accepting it would silence the warning
   *   this application exists to raise.
   */
  minBalanceThreshold: number;
}

/**
 * What every ledger reads before anyone configures anything.
 *
 * 50,000 for the threshold because that is what the dashboard has been treating
 * as the boundary of 「注意」 since before it was configurable -- changing the
 * default in the same release that makes it configurable would move every
 * existing household's warnings for reasons none of them asked for.
 */
export const DEFAULT_LEDGER_SETTINGS: LedgerSettings = {
  minBalanceThreshold: 50_000,
};

/**
 * The upper bound on the threshold.
 *
 * The same ceiling money elsewhere in this application has (NUMERIC(14,2)), for
 * the same reason: a value above it cannot be compared against a balance that
 * cannot reach it, so it would silently mean "always warn".
 */
export const MAX_MIN_BALANCE_THRESHOLD = 999_999_999_999;

/** The stored key for each setting. The ONLY place the string form appears. */
export const SETTING_KEYS: Readonly<Record<keyof LedgerSettings, string>> = {
  minBalanceThreshold: 'min_balance_threshold',
};

/**
 * Turns the stored rows into a complete `LedgerSettings`.
 *
 * MISSING AND UNPARSEABLE BOTH FALL BACK TO THE DEFAULT, deliberately.
 *
 * They are different situations -- one is a ledger that never configured
 * anything, the other is a row somebody wrote by hand -- but the right BEHAVIOUR
 * is the same, and it is the one that keeps the warning working. The alternative
 * for an unparseable value is to throw, which would make the dashboard fail to
 * load over a preference; a household would lose its balance forecast because a
 * comfort threshold is malformed.
 *
 * The value is clamped rather than rejected for the same reason. A stored
 * negative would turn 「安全」 into a claim about an overdraft the app cannot
 * model, and reading it as zero is the conservative half of that mistake.
 */
export function parseLedgerSettings(rows: ReadonlyMap<string, string>): LedgerSettings {
  const raw = rows.get(SETTING_KEYS.minBalanceThreshold);
  const parsed = raw === undefined ? Number.NaN : Number(raw);

  return {
    minBalanceThreshold: Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 0), MAX_MIN_BALANCE_THRESHOLD)
      : DEFAULT_LEDGER_SETTINGS.minBalanceThreshold,
  };
}

/**
 * Turns a patch into the rows to write.
 *
 * Only the keys the patch carries: `undefined` means "leave alone", which is
 * what lets a form save one field without asserting a value for every other
 * setting that will ever exist.
 */
export function ledgerSettingsToRows(patch: Partial<LedgerSettings>): Map<string, string> {
  const rows = new Map<string, string>();
  if (patch.minBalanceThreshold !== undefined) {
    rows.set(SETTING_KEYS.minBalanceThreshold, String(patch.minBalanceThreshold));
  }
  return rows;
}
