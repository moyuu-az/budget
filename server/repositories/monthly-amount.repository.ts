import type { PoolClient } from '../db/pool';
import type { MonthlyAmount } from '../../shared/types';
import type { MonthlyAmountRow } from './row-types';
import { rowToMonthlyAmount } from '../mappers';

export interface MonthlyAmountRepository {
  getForMonth(yearMonth: string): Promise<MonthlyAmount[]>;
  getForRange(startMonth: string, endMonth: string): Promise<MonthlyAmount[]>;
  set(templateId: number, yearMonth: string, amount: number): Promise<void>;
  remove(templateId: number, yearMonth: string): Promise<void>;
  copyMonth(fromMonth: string, toMonth: string, templateIds: readonly number[]): Promise<void>;
}

export function createMonthlyAmountRepository(
  client: PoolClient,
  ledgerId: number,
): MonthlyAmountRepository {
  return {
    async getForMonth(yearMonth) {
      const { rows } = await client.query<MonthlyAmountRow>(
        'SELECT * FROM monthly_amounts WHERE year_month = $1',
        [yearMonth],
      );
      return rows.map(rowToMonthlyAmount);
    },

    async getForRange(startMonth, endMonth) {
      const { rows } = await client.query<MonthlyAmountRow>(
        'SELECT * FROM monthly_amounts WHERE year_month >= $1 AND year_month <= $2',
        [startMonth, endMonth],
      );
      return rows.map(rowToMonthlyAmount);
    },

    // Upsert. Returns void: the renderer discards the row (no wasteful re-SELECT).
    //
    // The conflict target is (template_id, year_month) with no ledger_id, and
    // that is correct rather than an oversight -- template_id already determines
    // the ledger, so the key is transitively scoped.
    async set(templateId, yearMonth, amount) {
      await client.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount)
           VALUES ($1, $2, $3, $4)
         ON CONFLICT (template_id, year_month) DO UPDATE SET amount = excluded.amount`,
        [ledgerId, templateId, yearMonth, amount],
      );
    },

    async remove(templateId, yearMonth) {
      await client.query(
        'DELETE FROM monthly_amounts WHERE template_id = $1 AND year_month = $2',
        [templateId, yearMonth],
      );
    },

    /**
     * Copies the named entries' amounts from one month into another, leaving
     * existing target rows alone (DO NOTHING preserves what is already there).
     *
     * ONLY the ids the caller names. Since migration 005 an entry can skip a
     * month, and an override stored for a month its entry does not occur in is
     * invisible -- no screen shows it, no total reads it -- until someone
     * changes the recurrence to include that month, at which point it silently
     * overrides the amount they expected. The caller filters by occurrence
     * because that predicate lives in TypeScript and must not be re-expressed
     * here; see the note on AppApi.copyMonthlyAmounts.
     *
     * This is a single INSERT ... SELECT rather than the old read-then-loop.
     * Besides being one round trip instead of N, it means the source rows are
     * read and written under the same snapshot, so a concurrent edit cannot land
     * between the read and the write -- which matters now that two people can be
     * in the same ledger at once.
     *
     * The SELECT has no ledger predicate because row-level security supplies it,
     * and the inserted ledger_id is this repository's own -- so a row can only
     * ever be copied within one ledger.
     */
    async copyMonth(fromMonth, toMonth, templateIds) {
      // An empty list copies nothing. Skipping the round trip is not only an
      // optimisation: `= ANY('{}')` is false for every row, so the statement
      // would be a no-op anyway, and running it would suggest otherwise to
      // anyone reading a query log.
      if (templateIds.length === 0) return;

      await client.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount)
           SELECT $1, template_id, $3, amount
             FROM monthly_amounts
            WHERE year_month = $2 AND template_id = ANY($4::BIGINT[])
         ON CONFLICT (template_id, year_month) DO NOTHING`,
        [ledgerId, fromMonth, toMonth, templateIds],
      );
    },
  };
}
