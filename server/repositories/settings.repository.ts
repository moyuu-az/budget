import type { PoolClient } from '../db/pool';
import type { LedgerSettings } from '../../shared/types';
import { ledgerSettingsToRows, parseLedgerSettings } from '../../shared/ledger-settings';

// ---------------------------------------------------------------------------
// The `settings` table, given a reader again.
//
// It has existed since migration 001 and lost its only key in 004, when the
// balance became the sum of the cash holdings. The table shape was kept
// deliberately -- key/value means adding a setting is not a migration -- and
// this is what makes that true in practice.
//
// NOTHING HERE KNOWS WHAT A SETTING MEANS. The keys, the defaults, and how a
// stored string becomes a number all live in shared/ledger-settings.ts, so the
// client's form and this repository cannot disagree about them. What this file
// owns is only the storage.
// ---------------------------------------------------------------------------

interface SettingRow {
  key: string;
  value: string;
}

export interface SettingsRepository {
  get(): Promise<LedgerSettings>;
  /** Applies a patch and returns the FULL settings as they now stand. */
  update(patch: Partial<LedgerSettings>): Promise<LedgerSettings>;
}

export function createSettingsRepository(
  client: PoolClient,
  ledgerId: number,
): SettingsRepository {
  // No `WHERE ledger_id = ...` anywhere below: the predicate is row-level
  // security's, and writing it by hand would make it impossible to tell whether
  // the policy is still doing its job. See CLAUDE.md.
  const read = async (): Promise<LedgerSettings> => {
    const { rows } = await client.query<SettingRow>('SELECT key, value FROM settings');
    return parseLedgerSettings(new Map(rows.map((row) => [row.key, row.value])));
  };

  return {
    get: read,

    async update(patch) {
      const rows = ledgerSettingsToRows(patch);

      // One statement per key rather than a multi-row VALUES list. There is at
      // most a handful of settings, and the loop keeps the parameterisation
      // trivial -- a hand-built VALUES list is where a column count and a
      // parameter count start disagreeing.
      for (const [key, value] of rows) {
        await client.query(
          `INSERT INTO settings (ledger_id, key, value, updated_at)
             VALUES ($1, $2, $3, now())
           ON CONFLICT (ledger_id, key) DO UPDATE
             SET value = excluded.value, updated_at = now()`,
          [ledgerId, key, value],
        );
      }

      // Read back rather than merging the patch onto what was read before.
      //
      // The patch is what the caller ASKED for; this returns what is STORED, and
      // the two differ whenever parseLedgerSettings clamps a value. Returning
      // the merge would let a form show a figure the database does not hold --
      // and the next reload would silently change it.
      return read();
    },
  };
}
